// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package main

import (
	"errors"
	"testing"
)

func TestHDRoomVideo(t *testing.T) {
	found := func() (string, error) { return "/opt/homebrew/bin/ffmpeg", nil }
	missing := func() (string, error) { return "", errors.New("ffmpeg not found") }
	for _, c := range []struct {
		codec, h264, goos string
		kbps, scale       int
		ffmpeg            func() (string, error)
		want              string
		wantKbps          int
		fails             bool
	}{
		{"auto", "x264", "darwin", 0, 3, found, "videotoolbox", 8000, false},
		{"auto", "x264", "darwin", 0, 2, missing, "videotoolbox", 4000, false}, // no ffmpeg needed
		{"h264", "videotoolbox", "linux", 0, 3, found, "", 0, true},
		{"auto", "x264", "linux", 0, 2, found, "", 4000, false},
		{"vp8", "x264", "darwin", 6000, 3, found, "", 6000, false},
		{"h264", "x264", "linux", 0, 3, found, "x264", 8000, false},
		{"h264", "videotoolbox", "darwin", 0, 3, missing, "videotoolbox", 8000, false},
		{"h264", "x264", "darwin", 0, 3, missing, "", 0, true},
		{"h264", "nvenc", "linux", 0, 3, found, "", 0, true},
		{"av1", "x264", "darwin", 0, 3, found, "", 0, true},
	} {
		got, kbps, err := hdRoomVideo(c.codec, c.h264, c.kbps, c.scale, c.goos, c.ffmpeg)
		if (err != nil) != c.fails || got != c.want || kbps != c.wantKbps {
			t.Errorf("%+v: got %q %d %v", c, got, kbps, err)
		}
	}
}
