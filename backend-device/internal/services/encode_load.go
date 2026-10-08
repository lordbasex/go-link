// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"math"
	"sync/atomic"
	"time"
)

// The encode load watch: every second the stream measures how much of it
// went into encoding (every tier together: the quality steps of a
// struggling player add encoders). The encoder probe only checks a room's
// first frames; a computer that gets busy later (another program, more
// players, a heavy scene) would make every frame late for everyone. When
// the share stays at overloadShare or more for overloadSeconds in a row,
// the stream calls its overload handler (the rooms service drops a 2x room
// to its saver quality, or logs that even 1x does not keep up), at most
// once per overloadCooldown.

// overloadShare is the share of the time spent encoding that counts as
// overloaded: past it, a slower frame here and there is already late.
const overloadShare = 0.75

// overloadSeconds is how many seconds in a row it takes.
const overloadSeconds = 5

// overloadCooldown is the least time between two calls of the handler.
const overloadCooldown = 60 * time.Second

type encodeLoad struct {
	busy    time.Duration // encoding since the last second's count
	hot     int           // seconds in a row at overloadShare or more
	lastAct time.Time
	share   atomic.Uint64 // the last second's share (math.Float64bits)
	handler atomic.Pointer[func(share float64)]
}

// SetOverloadHandler sets what the stream calls when encoding keeps it
// busy (nil: nobody). Called from its own goroutine.
func (s *StreamService) SetOverloadHandler(fn func(share float64)) {
	if fn == nil {
		s.load.handler.Store(nil)
		return
	}
	s.load.handler.Store(&fn)
}

// EncodeLoad is the share of the last second spent encoding (0 to 1).
func (s *StreamService) EncodeLoad() float64 {
	return math.Float64frombits(s.load.share.Load())
}

// countLoad closes one second of the watch (VideoFrame's goroutine only).
func (s *StreamService) countLoad(elapsed time.Duration, now time.Time) {
	l := &s.load
	share := 0.0
	if elapsed > 0 {
		share = min(float64(l.busy)/float64(elapsed), 1)
	}
	l.busy = 0
	l.share.Store(math.Float64bits(share))
	if share >= overloadShare {
		l.hot++
	} else {
		l.hot = 0
	}
	if l.hot < overloadSeconds || now.Sub(l.lastAct) < overloadCooldown {
		return
	}
	l.hot, l.lastAct = 0, now
	if fn := l.handler.Load(); fn != nil {
		go (*fn)(share)
	}
}
