// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package input

import "testing"

func TestRoundTrip(t *testing.T) {
	in := Packet{Seq: 0x0102, Player: 1, Pad: Pad{Buttons: State(Up | Button1 | Home | Capture), Axes: Axes{-127, 127, 0, 5}}}
	out, err := Decode(Encode(in))
	if err != nil || out != in {
		t.Fatalf("got %+v %v", out, err)
	}
	if in.Pad.Buttons.String() != "up+b1+home+capture" {
		t.Fatalf("names %q", in.Pad.Buttons.String())
	}
}

func TestDecodeRejectsAndCleans(t *testing.T) {
	if _, err := Decode(make([]byte, 4)); err != ErrBadPacket {
		t.Fatal("short packet accepted")
	}
	bad := Encode(Packet{Player: 0})
	bad[2] = 4
	if _, err := Decode(bad); err != ErrBadPacket {
		t.Fatal("player 4 accepted")
	}
	raw := Encode(Packet{})
	raw[4], raw[5], raw[6], raw[7] = 0xFF, 0xFF, 0xFF, 0xFF
	raw[8] = 0x80 // -128
	p, _ := Decode(raw)
	if p.Pad.Buttons != State(1<<Count-1) || p.Pad.Axes[0] != -127 {
		t.Fatalf("not cleaned: %+v", p)
	}
	if State(0).String() != "none" {
		t.Fatal("empty name")
	}
}

func pkt(seq uint16, player uint8, b Button) []byte {
	return Encode(Packet{Seq: seq, Player: player, Pad: Pad{Buttons: State(b)}})
}

func TestTrackerPerPlayer(t *testing.T) {
	var tr Tracker
	if _, changed, _ := tr.Apply(pkt(10, 0, Left)); !changed {
		t.Fatal("first packet")
	}
	// Player 1 has its own sequence: a low number is fine.
	if _, changed, _ := tr.Apply(pkt(1, 1, Start)); !changed {
		t.Fatal("second local player rejected")
	}
	if _, changed, _ := tr.Apply(pkt(9, 0, Right)); changed || tr.Pads()[0].Buttons != State(Left) {
		t.Fatal("late packet applied")
	}
	if _, changed, _ := tr.Apply(pkt(11, 0, Left)); changed {
		t.Fatal("same state reported as a change")
	}
	if tr.Pads()[1].Buttons != State(Start) {
		t.Fatal("player 1 state lost")
	}
}

func TestTrackerWrapsAround(t *testing.T) {
	var tr Tracker
	tr.Apply(pkt(65534, 0, Up))
	if _, changed, _ := tr.Apply(pkt(1, 0, Down)); !changed {
		t.Fatal("packet after wrap-around rejected")
	}
	if _, changed, _ := tr.Apply(pkt(65535, 0, Start)); changed {
		t.Fatal("packet from before the wrap accepted")
	}
}
