// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"testing"
)

// Room actions carry a text id; the stream must still hand them to the
// linked browser's handler (a numeric-only id used to drop them).
func TestLinkMessagesWithTextIDReachTheHandler(t *testing.T) {
	s, err := NewStreamService(StreamConfig{IncludeLoopback: true}, NewICEStore())
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	s.OnLinkMessage(func(peerID string, data []byte) { got = append(got, peerID+" "+string(data)) })
	link := &viewer{id: "p1", kind: KindLink}
	s.handleControl(link, []byte(`{"type":"room_action","id":"1ddc6811c5fd7b09","action":"favorite"}`))
	s.handleControl(link, []byte(`{"type":"pong","id":7}`)) // latency, not forwarded
	if len(got) != 1 || got[0] != `p1 {"type":"room_action","id":"1ddc6811c5fd7b09","action":"favorite"}` {
		t.Fatalf("forwarded %q", got)
	}
}
