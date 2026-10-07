// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package glhd

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writePackage(t *testing.T, files map[string]string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "game.glhd")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	z := zip.NewWriter(f)
	for name, body := range files {
		w, _ := z.Create(name)
		w.Write([]byte(body))
	}
	z.Close()
	f.Close()
	return path
}

func TestRead(t *testing.T) {
	ok := writePackage(t, map[string]string{
		"manifest.json": `{"format": 1, "title": "Neon Run", "players": 2, "level": "level.json", "extra": {"later": true}}`,
		"level.json":    `{}`,
	})
	m, err := Read(ok)
	if err != nil || m.Title != "Neon Run" || m.Players != 2 {
		t.Fatalf("got %+v, %v", m, err)
	}
	for name, c := range map[string]struct {
		files map[string]string
		want  string
	}{
		"newer":    {map[string]string{"manifest.json": `{"format": 2, "title": "x", "level": "l"}`, "l": ""}, "newer go-link HD"},
		"no title": {map[string]string{"manifest.json": `{"format": 1, "level": "l"}`, "l": ""}, "no title"},
		"no level": {map[string]string{"manifest.json": `{"format": 1, "title": "x", "level": "l"}`}, "no level"},
		"none":     {map[string]string{"level.json": ""}, "no manifest.json"},
	} {
		if _, err := Read(writePackage(t, c.files)); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: got %v, want %q", name, err, c.want)
		}
	}
	bad := filepath.Join(t.TempDir(), "bad.glhd")
	os.WriteFile(bad, []byte("not a zip"), 0o644)
	if _, err := Read(bad); err == nil {
		t.Error("a file that is not a zip was read")
	}
}
