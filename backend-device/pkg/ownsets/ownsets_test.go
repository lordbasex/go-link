// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package ownsets

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func sum(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func writeZip(t *testing.T, path string, files map[string][]byte, stamp time.Time) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	for name, data := range files {
		w, err := zw.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate, Modified: stamp})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestMatchByInnerHashes(t *testing.T) {
	a, b := []byte("program bytes"), []byte("graphics bytes")
	list := []Set{{ID: "ours", Set: "game", Title: "Ours", Files: []File{
		{Name: "a.rom", Size: int64(len(a)), SHA256: sum(a)},
		{Name: "b.rom", Size: int64(len(b)), SHA256: sum(b)},
	}}}
	dir := t.TempDir()
	path := filepath.Join(dir, "game.zip")

	// The same files with other timestamps (a new build): still ours.
	writeZip(t, path, map[string][]byte{"a.rom": a, "B.ROM": b}, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	if s, err := Match(path, list); err != nil || s == nil || s.ID != "ours" {
		t.Fatalf("match %v %v", s, err)
	}
	writeZip(t, path, map[string][]byte{"a.rom": a, "b.rom": b}, time.Date(2027, 5, 1, 0, 0, 0, 0, time.UTC))
	if s, _ := Match(path, list); s == nil {
		t.Fatal("a rebuild with new timestamps is still ours")
	}

	// Same names and sizes, one byte different: the original set, not ours.
	b2 := append([]byte{}, b...)
	b2[0] ^= 1
	writeZip(t, path, map[string][]byte{"a.rom": a, "b.rom": b2}, time.Now())
	if s, _ := Match(path, list); s != nil {
		t.Fatal("a name match must never be trusted")
	}
	// A missing file, or an extra one.
	writeZip(t, path, map[string][]byte{"a.rom": a}, time.Now())
	if s, _ := Match(path, list); s != nil {
		t.Fatal("missing file matched")
	}
	writeZip(t, path, map[string][]byte{"a.rom": a, "b.rom": b, "c.rom": b}, time.Now())
	if s, _ := Match(path, list); s != nil {
		t.Fatal("extra file matched")
	}
	// The right files under another set name are not looked at.
	other := filepath.Join(dir, "other.zip")
	writeZip(t, other, map[string][]byte{"a.rom": a, "b.rom": b}, time.Now())
	if s, _ := Match(other, list); s != nil {
		t.Fatal("matched under another name")
	}
	// Not a zip.
	bad := filepath.Join(dir, "game2.zip")
	if err := os.WriteFile(bad, []byte("nope"), 0o644); err != nil {
		t.Fatal(err)
	}
	if s, _ := Match(bad, []Set{{Set: "game2", Files: list[0].Files}}); s != nil {
		t.Fatal("not a zip matched")
	}
}

func TestMatcherCachesUntilTheFileChanges(t *testing.T) {
	a := []byte("program")
	list := []Set{{ID: "ours", Set: "game", Files: []File{{Name: "a.rom", Size: int64(len(a)), SHA256: sum(a)}}}}
	path := filepath.Join(t.TempDir(), "game.zip")
	writeZip(t, path, map[string][]byte{"a.rom": a}, time.Now())
	m := NewMatcher(list)
	if m.Match(path) == nil {
		t.Fatal("no match")
	}
	writeZip(t, path, map[string][]byte{"a.rom": []byte("PROGRAM")}, time.Now())
	later := time.Now().Add(time.Minute)
	if err := os.Chtimes(path, later, later); err != nil {
		t.Fatal(err)
	}
	if m.Match(path) != nil {
		t.Fatal("a changed file must be checked again")
	}
}

func TestEmbeddedList(t *testing.T) {
	sets := All()
	if len(sets) == 0 {
		t.Fatal("the embedded list is empty")
	}
	for _, s := range sets {
		if s.ID == "" || s.Set == "" || s.Title == "" || len(s.Files) == 0 || s.Buttons < 1 || len(s.Labels) != s.Buttons {
			t.Fatalf("incomplete entry %+v", s)
		}
		for _, f := range s.Files {
			if len(f.SHA256) != 64 || f.Size <= 0 {
				t.Fatalf("%s: bad file %+v", s.ID, f)
			}
		}
		if s.Art != "" {
			if b, ok := s.Picture(); !ok || len(b) < 8 || string(b[1:4]) != "PNG" {
				t.Fatalf("%s: picture %q missing", s.ID, s.Art)
			}
		}
	}
	// The built set, when it is there, is in the list.
	built := filepath.Join("..", "..", "..", "rom", "build", "slammast.zip")
	if _, err := os.Stat(built); err == nil {
		if s, err := Match(built, sets); err != nil || s == nil {
			t.Logf("rom/build/slammast.zip is not the listed build (run rom/tools/build.mjs): %v", err)
		}
	}
}
