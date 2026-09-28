// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMigrateLegacy(t *testing.T) {
	root := t.TempDir()
	old, cur := filepath.Join(root, legacyDataDir), filepath.Join(root, "go-link")
	os.MkdirAll(filepath.Join(old, "cores"), 0o755)
	os.WriteFile(filepath.Join(old, "cores", "core.dylib"), []byte("x"), 0o644)
	if !migrateLegacy(old, cur) {
		t.Fatal("the old folder must move")
	}
	if _, err := os.Stat(filepath.Join(cur, "cores", "core.dylib")); err != nil {
		t.Fatal(err)
	}
	// Once the new folder exists, nothing moves again.
	os.MkdirAll(old, 0o755)
	if migrateLegacy(old, cur) {
		t.Fatal("an existing new folder is never replaced")
	}
}
