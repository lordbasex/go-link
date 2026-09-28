// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package encoder

import "testing"

func grayFrame(w, h int, luma byte) []byte {
	f := make([]byte, FrameSize(w, h))
	for i := range f {
		f[i] = 128
	}
	for i := 0; i < w*h; i++ {
		f[i] = luma
	}
	return f
}

// isVP8Keyframe checks bit 0 of the VP8 frame tag (0 = keyframe).
func isVP8Keyframe(b []byte) bool { return len(b) > 0 && b[0]&1 == 0 }

func TestEncodeAndForceKeyframe(t *testing.T) {
	enc, err := NewVP8(Config{Width: 320, Height: 240, FPS: 30, BitrateKbps: 500})
	if err != nil {
		t.Fatal(err)
	}
	defer enc.Close()

	data, key, err := enc.Encode(grayFrame(320, 240, 60), false)
	if err != nil || len(data) == 0 || !key || !isVP8Keyframe(data) {
		t.Fatalf("first frame must be a keyframe: len=%d key=%v err=%v", len(data), key, err)
	}
	data, key, err = enc.Encode(grayFrame(320, 240, 70), false)
	if err != nil || key || isVP8Keyframe(data) {
		t.Fatalf("second frame should be a delta frame: key=%v err=%v", key, err)
	}
	data, key, err = enc.Encode(grayFrame(320, 240, 80), true)
	if err != nil || !key || !isVP8Keyframe(data) {
		t.Fatalf("forced keyframe missing: key=%v err=%v", key, err)
	}
}

func TestRejectsBadInput(t *testing.T) {
	if _, err := NewVP8(Config{}); err == nil {
		t.Fatal("empty config accepted")
	}
	enc, _ := NewVP8(Config{Width: 64, Height: 48, FPS: 30, BitrateKbps: 100})
	defer enc.Close()
	if _, _, err := enc.Encode(make([]byte, 10), false); err == nil {
		t.Fatal("short frame accepted")
	}
	enc.Close()
	if _, _, err := enc.Encode(grayFrame(64, 48, 0), false); err == nil {
		t.Fatal("encode after close accepted")
	}
}
