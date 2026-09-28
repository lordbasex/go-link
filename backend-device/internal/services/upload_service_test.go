// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestUploadOverFilesChannel(t *testing.T) {
	st := NewStatusService(deviceID, "test", "ws://x", "")
	dir := t.TempDir()
	lib := NewLibraryService(dir, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	var mu sync.Mutex
	var replies []FileReply
	up := NewUploadService(lib, func(_ string, r FileReply) {
		mu.Lock()
		replies = append(replies, r)
		mu.Unlock()
	})
	body := "PK\x03\x04" + strings.Repeat("x", 40000)

	up.Handle("p", true, []byte(`{"type":"begin","id":"1","name":"Robby.zip","size":40004}`))
	for i := 0; i < len(body); i += 16384 {
		up.Handle("p", false, []byte(body[i:min(i+16384, len(body))]))
	}
	up.Handle("p", true, []byte(`{"type":"end","id":"1"}`))
	if b, _ := os.ReadFile(filepath.Join(dir, "robby.zip")); string(b) != body {
		t.Fatalf("file content %d bytes", len(b))
	}

	// Rejected at begin: not a ROM name; its chunks are ignored.
	up.Handle("p", true, []byte(`{"type":"begin","id":"2","name":"notes.txt","size":4}`))
	up.Handle("p", false, []byte("PK\x03\x04"))
	up.Handle("p", true, []byte(`{"type":"end","id":"2"}`))

	// Not a zip.
	up.Handle("p", true, []byte(`{"type":"begin","id":"3","name":"fake.zip","size":5}`))
	up.Handle("p", false, []byte("hello"))
	up.Handle("p", true, []byte(`{"type":"end","id":"3"}`))

	// Incomplete.
	up.Handle("p", true, []byte(`{"type":"begin","id":"4","name":"short.zip","size":100}`))
	up.Handle("p", false, []byte("PK\x03\x04"))
	up.Handle("p", true, []byte(`{"type":"end","id":"4"}`))

	mu.Lock()
	defer mu.Unlock()
	if len(replies) != 4 {
		t.Fatalf("replies %+v", replies)
	}
	if !replies[0].OK || replies[1].OK || replies[2].OK || replies[3].OK {
		t.Fatalf("results %+v", replies)
	}
	for _, name := range []string{"fake.zip", "short.zip"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
			t.Fatalf("%s was written", name)
		}
	}
}
