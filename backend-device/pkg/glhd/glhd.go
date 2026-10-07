// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Package glhd reads the manifest of a go-link HD game package (.glhd): a
// zip with manifest.json, a level and PNG pictures, played by go-link HD's
// own libretro core (github.com/lordbasex/golink-hd, its README documents
// the format). The device only reads what it shows and checks that the
// package is one the core can open; the core validates the rest when it
// loads the game.
package glhd

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

// Format is the newest package format the core reads.
const Format = 1

// MaxBytes is the largest package the core loads.
const MaxBytes = 256 << 20

// CoreName is the core's name in its file: golink_hd_libretro.dylib, .so or .dll.
const CoreName = "golink_hd"

// Ext is a package's file extension.
const Ext = ".glhd"

// Manifest is what the device shows of a game package.
type Manifest struct {
	Format  int    `json:"format"`
	Title   string `json:"title"`
	Version string `json:"version"`
	Genre   string `json:"genre"`
	Players int    `json:"players"`
	Level   string `json:"level"`
}

// Labels names the buttons of format 1 games (the platformer): button 1
// jumps, button 3 runs (the core also takes 2 and 4).
var Labels = []string{"Jump", "Jump", "Run", "Run"}

// Read opens a package and returns its manifest, or why the core cannot
// play it.
func Read(path string) (Manifest, error) {
	var m Manifest
	st, err := os.Stat(path)
	if err != nil {
		return m, err
	}
	if st.Size() > MaxBytes {
		return m, errors.New("the game package is bigger than 256 MB")
	}
	z, err := zip.OpenReader(path)
	if err != nil {
		return m, errors.New("the game package is not a valid zip")
	}
	defer z.Close()
	files := map[string]*zip.File{}
	for _, f := range z.File {
		files[f.Name] = f
	}
	f := files["manifest.json"]
	if f == nil {
		return m, errors.New("the game package has no manifest.json")
	}
	rc, err := f.Open()
	if err != nil {
		return m, err
	}
	data, err := io.ReadAll(io.LimitReader(rc, 1<<20))
	rc.Close()
	if err != nil {
		return m, fmt.Errorf("manifest.json: %w", err)
	}
	if err := json.Unmarshal(data, &m); err != nil {
		return m, fmt.Errorf("manifest.json: %w", err)
	}
	switch {
	case m.Format > Format:
		return m, errors.New("this game was made for a newer go-link HD: update the core")
	case m.Format < 1:
		return m, errors.New("manifest.json has no format number")
	case strings.TrimSpace(m.Title) == "":
		return m, errors.New("manifest.json has no title")
	case m.Level == "" || files[m.Level] == nil:
		return m, errors.New("the game package has no level")
	}
	if m.Players < 1 || m.Players > 4 {
		m.Players = 4
	}
	return m, nil
}
