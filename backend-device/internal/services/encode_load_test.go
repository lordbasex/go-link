// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"testing"
	"time"
)

func TestTheLoadWatchCallsAfterFiveBusySecondsOnce(t *testing.T) {
	s := &StreamService{}
	calls := make(chan float64, 4)
	s.SetOverloadHandler(func(share float64) { calls <- share })
	now := time.Unix(1000, 0)
	second := func(busy time.Duration) {
		s.load.busy = busy
		now = now.Add(time.Second)
		s.countLoad(time.Second, now)
	}
	// Four busy seconds, a calm one: the count starts again.
	for range 4 {
		second(900 * time.Millisecond)
	}
	second(200 * time.Millisecond)
	if s.EncodeLoad() < 0.19 || s.EncodeLoad() > 0.21 {
		t.Fatalf("share %v, want 0.2", s.EncodeLoad())
	}
	for range 4 {
		second(800 * time.Millisecond)
	}
	select {
	case <-calls:
		t.Fatal("called before five busy seconds in a row")
	case <-time.After(50 * time.Millisecond):
	}
	second(800 * time.Millisecond)
	select {
	case share := <-calls:
		if share < 0.79 || share > 0.81 {
			t.Fatalf("share %v", share)
		}
	case <-time.After(time.Second):
		t.Fatal("not called after five busy seconds")
	}
	// Still busy, within the cooldown: no second call.
	for range 10 {
		second(950 * time.Millisecond)
	}
	select {
	case <-calls:
		t.Fatal("called again within the cooldown")
	case <-time.After(50 * time.Millisecond):
	}
	// After it, again.
	for range 55 {
		second(950 * time.Millisecond)
	}
	select {
	case <-calls:
	case <-time.After(time.Second):
		t.Fatal("not called after the cooldown")
	}
}
