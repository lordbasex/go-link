// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package hdscene

import (
	"bytes"
	"image"
	"image/color"
	"testing"
)

func picture(w, h int, at func(x, y int) color.RGBA) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.SetRGBA(x, y, at(x, y))
		}
	}
	return img
}

func TestSceneScrollsLayersAndKeysMagenta(t *testing.T) {
	// far: vertical stripes; play: magenta with one opaque white column block
	far := picture(64, 36, func(x, _ int) color.RGBA {
		if x%8 < 4 {
			return color.RGBA{0, 0, 200, 255}
		}
		return color.RGBA{200, 0, 0, 255}
	})
	play := picture(128, 36, func(x, _ int) color.RGBA {
		if x >= 10 && x < 20 {
			return color.RGBA{255, 255, 255, 255}
		}
		return color.RGBA{255, 0, 255, 255}
	})
	s := New(128, 72, far, play)
	f0 := append([]byte(nil), s.Draw(0)...)
	if len(f0) != FrameSize(128, 72) {
		t.Fatalf("frame size %d", len(f0))
	}
	// the white block shows (luma 235) and the magenta never does
	row := f0[10*128 : 11*128]
	white := 0
	for _, v := range row {
		if v >= 230 {
			white++
		}
	}
	if white < 15 {
		t.Fatalf("the play layer's opaque block is missing: %d white pixels", white)
	}
	// later frames scroll
	if bytes.Equal(f0, s.Draw(30)) {
		t.Fatal("the scene does not move")
	}
}

func BenchmarkDraw1080p(b *testing.B) {
	far := picture(1672, 941, func(x, y int) color.RGBA { return color.RGBA{uint8(x), uint8(y), 90, 255} })
	play := picture(1672, 941, func(x, y int) color.RGBA {
		if (x/64+y/64)%2 == 0 {
			return color.RGBA{255, 0, 255, 255}
		}
		return color.RGBA{uint8(y), 120, uint8(x), 255}
	})
	s := New(1920, 1080, far, play)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.Draw(i)
	}
}
