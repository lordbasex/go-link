// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package libretro

import (
	"math"
	"testing"
)

func TestToI420Colors(t *testing.T) {
	// 2x2 XRGB8888: white, black / red, blue.
	f := Frame{Width: 2, Height: 2, Pitch: 8, Format: FormatXRGB8888, Data: []byte{
		255, 255, 255, 0, 0, 0, 0, 0,
		0, 0, 255, 0, 255, 0, 0, 0,
	}}
	dst := make([]byte, FrameSizeI420(2, 2))
	ToI420(dst, f)
	if dst[0] != 235 || dst[1] != 16 {
		t.Fatalf("luma white/black = %d/%d", dst[0], dst[1])
	}
	if dst[4] != 128 || dst[5] != 128 {
		t.Fatalf("white chroma = %d/%d", dst[4], dst[5])
	}

	// RGB565 pure red.
	f565 := Frame{Width: 1, Height: 1, Pitch: 2, Format: FormatRGB565, Data: []byte{0x00, 0xF8}}
	d := make([]byte, FrameSizeI420(1, 1))
	ToI420(d, f565)
	if d[0] < 75 || d[0] > 85 || d[2] < 235 { // Y≈81, V≈240
		t.Fatalf("red = %v", d)
	}
}

func TestResamplerRateAndContinuity(t *testing.T) {
	r := NewResampler(22050, 48000)
	total := 0
	var last int16
	for block := 0; block < 50; block++ {
		in := make([]int16, 441*2) // 20 ms at 22.05 kHz
		for i := 0; i < 441; i++ {
			v := int16(10000 * math.Sin(2*math.Pi*1000*float64(block*441+i)/22050))
			in[i*2], in[i*2+1] = v, v
		}
		out := r.Process(in)
		if block > 0 && math.Abs(float64(out[0]-last)) > 4000 {
			t.Fatalf("discontinuity at block %d: %d -> %d", block, last, out[0])
		}
		last = out[len(out)-2]
		total += len(out) / 2
	}
	// 1 second of input gives about 48000 output frames.
	if total < 47900 || total > 48100 {
		t.Fatalf("got %d frames for one second", total)
	}
	same := NewResampler(48000, 48000)
	if out := same.Process([]int16{1, 2, 3, 4}); len(out) != 4 {
		t.Fatalf("passthrough %v", out)
	}
}

func TestDefaultOption(t *testing.T) {
	for decl, want := range map[string]string{
		"Gamma correction; 1.0|0.5|1.2":     "1.0",
		"Skip disclaimer; disabled|enabled": "disabled",
		"Brightness; 1.0":                   "1.0",
	} {
		if got, ok := DefaultOption(decl); !ok || got != want {
			t.Errorf("DefaultOption(%q) = %q, %v", decl, got, ok)
		}
	}
	if _, ok := DefaultOption("no values"); ok {
		t.Error("a declaration without values has no default")
	}
}
