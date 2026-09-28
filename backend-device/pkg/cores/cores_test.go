// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package cores

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestURL(t *testing.T) {
	cases := map[[2]string]string{
		{"darwin", "amd64"}:  "https://x/apple/osx/x86_64/latest/mame2003_plus_libretro.dylib.zip",
		{"darwin", "arm64"}:  "https://x/apple/osx/arm64/latest/mame2003_plus_libretro.dylib.zip",
		{"linux", "amd64"}:   "https://x/linux/x86_64/latest/mame2003_plus_libretro.so.zip",
		{"linux", "arm64"}:   "https://x/linux/aarch64/latest/mame2003_plus_libretro.so.zip",
		{"linux", "arm"}:     "https://x/linux/armhf/latest/mame2003_plus_libretro.so.zip",
		{"windows", "amd64"}: "https://x/windows/x86_64/latest/mame2003_plus_libretro.dll.zip",
	}
	for k, want := range cases {
		if got, err := URL("https://x", DefaultCore, k[0], k[1]); err != nil || got != want {
			t.Errorf("%v: %s %v", k, got, err)
		}
	}
	if _, err := URL("https://x", DefaultCore, "plan9", "386"); err == nil {
		t.Error("unsupported platform accepted")
	}
}

func zipWith(files map[string]string) []byte {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	for name, data := range files {
		f, _ := w.Create(name)
		_, _ = f.Write([]byte(data))
	}
	_ = w.Close()
	return buf.Bytes()
}

func TestDownload(t *testing.T) {
	good := zipWith(map[string]string{"../evil": "x", "mame2003_plus_libretro.dylib": "LIB"})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/bad" {
			_, _ = w.Write(zipWith(map[string]string{"other.dylib": "x"}))
			return
		}
		_, _ = w.Write(good)
	}))
	defer srv.Close()
	dir := t.TempDir()
	path, err := Download(context.Background(), srv.Client(), srv.URL+"/core.zip", "mame2003_plus_libretro.dylib", dir)
	if err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(path); string(b) != "LIB" || filepath.Dir(path) != dir {
		t.Fatalf("installed %s = %q", path, b)
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(dir), "evil")); err == nil {
		t.Fatal("archive path escaped the folder")
	}
	if _, err := Download(context.Background(), srv.Client(), srv.URL+"/bad", "mame2003_plus_libretro.dylib", dir); err == nil {
		t.Fatal("archive without the core accepted")
	}
}

func TestAChangedCoreIsNotLoaded(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "core.dylib")
	if err := os.WriteFile(path, []byte("the core"), 0o700); err != nil {
		t.Fatal(err)
	}
	// A core from before hashes were kept: its hash is recorded now.
	if err := Verify(path); err != nil {
		t.Fatalf("first check: %v", err)
	}
	if err := Verify(path); err != nil {
		t.Fatalf("unchanged: %v", err)
	}
	if err := os.WriteFile(path, []byte("tampered"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := Verify(path); !errors.Is(err, ErrCoreChanged) {
		t.Fatalf("tampered: %v", err)
	}
}
