// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Package input decodes the controller packets browsers send on the
// "input" DataChannel.
//
// Wire format (12 bytes, big endian):
//
//	bytes 0-1   sequence number (uint16, wraps around)
//	byte  2     local player (0-3): several people on one browser
//	byte  3     reserved (0)
//	bytes 4-7   button bitmask (uint32, see the Button constants)
//	bytes 8-11  left X, left Y, right X, right Y (int8, -127..127)
//
// The channel is unordered and never retransmits, so a late packet must
// not undo a newer one: Tracker drops packets older than the last one.
package input

import (
	"encoding/binary"
	"errors"
	"strings"
)

// PacketSize is the length of one input packet.
const PacketSize = 12

// MaxLocalPlayers is how many people can play from one browser.
const MaxLocalPlayers = 4

// Button is one bit of the button mask.
type Button uint32

// Buttons, in bit order. Keep in sync with frontend/packages/shared.
const (
	Up Button = 1 << iota
	Down
	Left
	Right
	Button1 // bottom face button (Switch: B)
	Button2 // right face button (Switch: A)
	Button3 // left face button (Switch: Y)
	Button4 // top face button (Switch: X)
	Button5 // L1
	Button6 // R1
	Start
	Coin
	L2
	R2
	L3
	R3
	Home
	Capture
	// Start1 to Start4 press the start button of player 1 to 4, like the
	// row of start buttons on an arcade panel: any seated player can
	// start a two player game or let a friend join.
	Start1
	Start2
	Start3
	Start4
)

// Count is the number of defined buttons.
const Count = 22

var names = [Count]string{"up", "down", "left", "right", "b1", "b2", "b3", "b4", "b5", "b6", "start", "coin", "l2", "r2", "l3", "r3", "home", "capture", "start1", "start2", "start3", "start4"}

// StartOf is the panel start button of a port (1-4), or 0.
func StartOf(port int) Button {
	if port < 1 || port > 4 {
		return 0
	}
	return Start1 << (port - 1)
}

// State is the set of pressed buttons.
type State uint32

// Pressed reports whether b is down.
func (s State) Pressed(b Button) bool { return uint32(s)&uint32(b) != 0 }

// String lists the pressed buttons, e.g. "up+b1", or "none".
func (s State) String() string {
	var parts []string
	for i := 0; i < Count; i++ {
		if uint32(s)&(1<<i) != 0 {
			parts = append(parts, names[i])
		}
	}
	if len(parts) == 0 {
		return "none"
	}
	return strings.Join(parts, "+")
}

// Axes are the analog sticks: LX, LY, RX, RY in -127..127.
type Axes [4]int8

// Pad is the full state of one controller.
type Pad struct {
	Buttons State
	Axes    Axes
}

// Packet is one decoded input packet.
type Packet struct {
	Seq    uint16
	Player uint8
	Pad    Pad
}

// ErrBadPacket is returned for malformed packets.
var ErrBadPacket = errors.New("input: packet must be 12 bytes with player 0-3")

// Decode parses one packet. Undefined button bits are cleared.
func Decode(b []byte) (Packet, error) {
	if len(b) != PacketSize || b[2] >= MaxLocalPlayers {
		return Packet{}, ErrBadPacket
	}
	var p Packet
	p.Seq = binary.BigEndian.Uint16(b[0:2])
	p.Player = b[2]
	p.Pad.Buttons = State(binary.BigEndian.Uint32(b[4:8]) & (1<<Count - 1))
	for i := 0; i < 4; i++ {
		p.Pad.Axes[i] = max(int8(b[8+i]), -127) // -128 is not a valid position
	}
	return p, nil
}

// Encode builds one packet (used by tests and tools).
func Encode(p Packet) []byte {
	b := make([]byte, PacketSize)
	binary.BigEndian.PutUint16(b[0:2], p.Seq)
	b[2] = p.Player
	binary.BigEndian.PutUint32(b[4:8], uint32(p.Pad.Buttons))
	for i, a := range p.Pad.Axes {
		b[8+i] = byte(a)
	}
	return b
}

// Tracker keeps the latest pad of every local player of one browser. It
// is not safe for concurrent use.
type Tracker struct {
	started [MaxLocalPlayers]bool
	seq     [MaxLocalPlayers]uint16
	pads    [MaxLocalPlayers]Pad
}

// Apply feeds one packet. It returns the packet and whether the buttons
// of that player changed. Old or duplicated packets are ignored.
func (t *Tracker) Apply(raw []byte) (Packet, bool, error) {
	p, err := Decode(raw)
	if err != nil {
		return Packet{}, false, err
	}
	i := p.Player
	// Serial number arithmetic: newer when ahead by less than half the
	// space, which survives the wrap from 65535 to 0.
	if t.started[i] && int16(p.Seq-t.seq[i]) <= 0 {
		p.Pad = t.pads[i]
		return p, false, nil
	}
	t.started[i] = true
	t.seq[i] = p.Seq
	changed := p.Pad.Buttons != t.pads[i].Buttons
	t.pads[i] = p.Pad
	return p, changed, nil
}

// Pads returns the latest state of every local player.
func (t *Tracker) Pads() [MaxLocalPlayers]Pad { return t.pads }
