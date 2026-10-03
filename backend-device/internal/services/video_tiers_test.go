// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import "testing"

func TestTierLevelsStopAt360Rows(t *testing.T) {
	for _, c := range []struct{ w, h, want int }{{3840, 2160, 3}, {1920, 1080, 2}, {1280, 720, 2}, {640, 480, 1}, {768, 448, 1}} {
		if got := tierLevels(c.w, c.h); got != c.want {
			t.Errorf("%dx%d: %d tiers, want %d", c.w, c.h, got, c.want)
		}
	}
}

func TestTierForPicksTheSmallestThatFills(t *testing.T) {
	cases := []struct {
		wantW, wantH, tier int
	}{
		{3840, 2160, 0}, // a 4K television: the source
		{1800, 1000, 1}, // a laptop window at 2x: 1920x1080
		{2000, 1100, 1}, // a bit more than 1080p: 1920 is within 90 %, so still 1080p
		{2400, 1300, 0}, // clearly more: 4K
		{780, 440, 2},   // a phone (390 css px at 2x): 960x540
		{100, 60, 2},    // never below the last tier
	}
	for _, c := range cases {
		if got := tierFor(3840, 2160, c.wantW, c.wantH, 3); got != c.tier {
			t.Errorf("want %dx%d: tier %d, want %d", c.wantW, c.wantH, got, c.tier)
		}
	}
}

func TestHalveI420AveragesEachBlock(t *testing.T) {
	w, h := 8, 4
	src := make([]byte, w*h+2*(w/2)*(h/2))
	for i := range src[:w*h] {
		src[i] = byte(i % w * 10) // columns 0, 10, 20, ... 70
	}
	for i := w * h; i < len(src); i++ {
		src[i] = 128
	}
	dst := halveI420(nil, src, w, h)
	if len(dst) != 4*2+2*2*1 {
		t.Fatalf("size %d", len(dst))
	}
	for x, want := range []byte{5, 25, 45, 65} {
		if dst[x] != want || dst[4+x] != want {
			t.Errorf("column %d: %d %d, want %d", x, dst[x], dst[4+x], want)
		}
	}
	for _, c := range dst[8:] {
		if c != 128 {
			t.Fatalf("chroma %d, want 128", c)
		}
	}
	if tierKbps(25000, 1) != 8333 || tierKbps(25000, 2) != 2777 || tierKbps(900, 2) != 300 {
		t.Error("tier bitrates")
	}
}
