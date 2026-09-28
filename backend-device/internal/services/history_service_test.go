// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestHistoryKeepsTheNewestGamesFirst(t *testing.T) {
	path := filepath.Join(t.TempDir(), "history.json")
	h := NewHistoryService(path)
	start := time.Date(2026, 9, 27, 10, 0, 0, 0, time.UTC)
	for i := range MaxHistory + 5 {
		if err := h.Add(HistoryEntry{Name: "game", StartedAt: start.Add(time.Duration(i) * time.Minute)}); err != nil {
			t.Fatal(err)
		}
	}
	list := h.List()
	if len(list) != MaxHistory {
		t.Fatalf("kept %d games, want %d", len(list), MaxHistory)
	}
	if !list[0].StartedAt.After(list[1].StartedAt) {
		t.Fatal("the newest game is not first")
	}
	if fi, err := os.Stat(path); err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("history file %v %v", fi, err)
	}
	if err := h.Clear(); err != nil || len(h.List()) != 0 {
		t.Fatalf("clear: %v", err)
	}
	if len(NewHistoryService(path).List()) != 0 {
		t.Fatal("the cleared history came back")
	}
}
