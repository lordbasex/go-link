// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"bytes"
	"crypto/sha256"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/lordbasex/go-link/backend-device/pkg/input"
)

// TestGoLinkHDCorePlaysItsDemo runs the real go-link HD libretro core (built
// in its own repository, golink-hd) with no content, the way the test room
// does with --hd-core: GOLINK_HD_CORE=/path/golink_hd_libretro.dylib.
func TestGoLinkHDCorePlaysItsDemo(t *testing.T) {
	src := os.Getenv("GOLINK_HD_CORE")
	if src == "" {
		t.Skip("GOLINK_HD_CORE is not set")
	}
	// a copy, so the checksum file next to it stays in the test's folder
	data, err := os.ReadFile(src)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	core := filepath.Join(dir, filepath.Base(src))
	if err := os.WriteFile(core, data, 0o755); err != nil {
		t.Fatal(err)
	}
	var w, h, frames, samples int
	var last [32]byte
	game, err := OpenGameCore(GameCoreConfig{
		CorePath:  core,
		SystemDir: filepath.Join(dir, "system"),
		Upscale:   3,
		Video: func(i420 []byte, fw, fh int, dur time.Duration) {
			w, h = fw, fh
			frames++
			last = sha256.Sum256(i420)
		},
		Audio: func(pcm []int16) { samples += len(pcm) / 2 },
	})
	if err != nil {
		t.Fatal(err)
	}
	defer game.Close()
	if name := game.Info().Name; name != "go-link HD" {
		t.Fatalf("core %q", name)
	}
	if av := game.AV(); av.BaseWidth != 640 || av.BaseHeight != 360 || av.FPS != 60 || av.SampleRate != 48000 {
		t.Fatalf("av %+v", av)
	}
	press := func(f int) (pads [4]input.Pad) {
		switch {
		case f >= 10 && f < 14:
			pads[0].Buttons = input.State(input.Start)
		case f >= 14:
			pads[0].Buttons = input.State(input.Right | input.Button3)
			if f%50 < 18 {
				pads[0].Buttons |= input.State(input.Button1)
			}
		}
		return pads
	}
	for f := 0; f < 240; f++ {
		game.SetPads(press(f))
		game.Run()
	}
	if w != 1920 || h != 1080 || frames != 240 {
		t.Fatalf("got %d frames of %dx%d, want 240 of 1920x1080", frames, w, h)
	}
	if samples != 240*800 {
		t.Fatalf("got %d samples, want %d", samples, 240*800)
	}
	// a save state continues exactly where it was taken
	state, err := game.SaveState()
	if err != nil {
		t.Fatal(err)
	}
	for f := 240; f < 300; f++ {
		game.SetPads(press(f))
		game.Run()
	}
	want := last
	if err := game.LoadState(state); err != nil {
		t.Fatal(err)
	}
	for f := 240; f < 300; f++ {
		game.SetPads(press(f))
		game.Run()
	}
	if !bytes.Equal(last[:], want[:]) {
		t.Fatal("the frames after loading the save state differ")
	}
}
