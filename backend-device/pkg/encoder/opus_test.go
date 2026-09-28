// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package encoder

import "testing"

func TestOpusEncode(t *testing.T) {
	enc, err := NewOpus(1, 64000)
	if err != nil {
		t.Fatal(err)
	}
	defer enc.Close()
	pkt, err := enc.Encode(make([]int16, OpusFrameSamples))
	if err != nil || len(pkt) == 0 {
		t.Fatalf("encode: %d bytes, %v", len(pkt), err)
	}
	if _, err := enc.Encode(make([]int16, 10)); err == nil {
		t.Fatal("short frame accepted")
	}
	if _, err := NewOpus(3, 64000); err == nil {
		t.Fatal("3 channels accepted")
	}
}
