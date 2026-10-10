// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"encoding/json"
	"io"
	"log/slog"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/lordbasex/go-link/backend-device/pkg/signalclient"
)

func TestGroupInvitationLetsInItsPeople(t *testing.T) {
	now := time.Date(2026, 10, 10, 20, 0, 0, 0, time.UTC)
	g := NewPinGate(func() time.Time { return now })
	g.SetPrivate(true)
	gi, _ := g.IssueGroup(2, 6*time.Hour, false)
	if len(gi.Key) < 40 || gi.Uses != 2 || gi.Used != 0 || !gi.ExpiresAt.Equal(now.Add(6*time.Hour)) || gi.Approval {
		t.Fatalf("issued %+v", gi)
	}
	a := g.CheckKey("A", gi.Key, "Ana")
	b := g.CheckKey("B", gi.Key, "Bea")
	if !a.OK || !b.OK || a.Token == "" || a.Token == b.Token {
		t.Fatalf("two places: %+v %+v", a, b)
	}
	if r := g.CheckKey("C", gi.Key, "Cid"); r.OK || r.Reason != "full" {
		t.Fatalf("a third person: %+v", r)
	}
	// Each person comes back with their own token, even with the link full.
	if r := g.Check("A2", "", a.Token); !r.OK || r.Token != a.Token {
		t.Fatalf("token back: %+v", r)
	}
	if got, _ := g.Group(); got == nil || got.Used != 2 {
		t.Fatalf("status %+v", got)
	}
	// A wrong key counts like a wrong PIN.
	if r := g.CheckKey("X", "nope", ""); r.OK || r.Reason != "wrong" || r.Left != pinTriesPerPeer-1 {
		t.Fatalf("wrong key %+v", r)
	}
	// The link dies when it expires; tokens of people in stay good.
	now = now.Add(6 * time.Hour)
	if r := g.CheckKey("D", gi.Key, "Dan"); r.Reason != "expired" {
		t.Fatalf("expired %+v", r)
	}
	if got, _ := g.Group(); got != nil {
		t.Fatal("an expired invitation is not shown")
	}
	if r := g.Check("B2", "", b.Token); !r.OK {
		t.Fatal("token after the link expired")
	}
}

func TestGroupInvitationWaitsForTheHost(t *testing.T) {
	now := time.Date(2026, 10, 10, 20, 0, 0, 0, time.UTC)
	g := NewPinGate(func() time.Time { return now })
	g.SetPrivate(true)
	gi, _ := g.IssueGroup(5, time.Hour, true)
	if r := g.CheckKey("A", gi.Key, "  Ana\n"); r.OK || r.Reason != "waiting" {
		t.Fatalf("waits: %+v", r)
	}
	now = now.Add(time.Second)
	g.CheckKey("B", gi.Key, strings.Repeat("x", 80))
	_, knocks := g.Group()
	if len(knocks) != 2 || knocks[0].Peer != "A" || knocks[0].Name != "Ana" || len([]rune(knocks[1].Name)) != KnockNameMax {
		t.Fatalf("knocks %+v", knocks)
	}
	res, ok := g.Answer("A", true)
	if !ok || !res.OK || res.Token == "" {
		t.Fatalf("let in: %+v %v", res, ok)
	}
	if res, ok := g.Answer("B", false); !ok || res.OK || res.Reason != "declined" {
		t.Fatalf("declined: %+v", res)
	}
	if _, ok := g.Answer("B", true); ok {
		t.Fatal("answered twice")
	}
	if got, knocks := g.Group(); got.Used != 1 || knocks != nil {
		t.Fatalf("after answers %+v %+v", got, knocks)
	}
	// Someone who left stops waiting.
	g.CheckKey("C", gi.Key, "Cid")
	g.Forget("C")
	if _, knocks := g.Group(); knocks != nil {
		t.Fatal("a guest that left still waits")
	}
	// A new link replaces the old one, and those waiting are returned.
	g.CheckKey("D", gi.Key, "Dan")
	gi2, waiting := g.IssueGroup(100, 99*time.Hour, true)
	if gi2.Key == gi.Key || gi2.Uses != GroupMaxUses || !gi2.ExpiresAt.Equal(now.Add(GroupMaxTTL)) || !slices.Equal(waiting, []string{"D"}) {
		t.Fatalf("new link %+v %v", gi2, waiting)
	}
	if r := g.CheckKey("E", gi.Key, "Eve"); r.Reason != "wrong" {
		t.Fatalf("old link %+v", r)
	}
	// Too many people waiting at once.
	for i := range maxKnocks {
		g.CheckKey(string(rune('a'+i)), gi2.Key, "x")
	}
	if r := g.CheckKey("zz", gi2.Key, "x"); r.Reason != "busy" {
		t.Fatalf("busy %+v", r)
	}
	if waiting := g.RevokeGroup(); len(waiting) != maxKnocks {
		t.Fatalf("revoke told %d", len(waiting))
	}
	if r := g.CheckKey("F", gi2.Key, "x"); r.Reason != "wrong" {
		t.Fatalf("after revoke %+v", r)
	}
}

func TestTheHostLetsAGroupGuestIntoTheRoom(t *testing.T) {
	views := &fakeViewers{}
	room := NewTestRoomService(nil, views, "mac", slog.New(slog.NewTextHandler(io.Discard, nil)))
	sender := newFakeSender()
	room.SetSender(sender)
	room.SetPrivate()
	changes := 0
	room.OnAdmission(func() { changes++ })
	room.OnConnect(signalclient.Envelope{PeerID: "A"})
	<-sender.ch // room_open
	room.OnMessage(signalclient.Envelope{Type: signalclient.TypeRoomOpened, RoomID: "R"})
	gi := room.IssueGroup(3, time.Hour, true)

	room.OnMessage(signalclient.Envelope{Type: signalclient.TypePeerJoined, Remote: "G", RoomID: "R"})
	<-sender.ch // pin_required
	room.OnMessage(signalclient.Envelope{Type: signalclient.TypeSignal, From: "G", Payload: json.RawMessage(`{"kind":"pin","key":"` + gi.Key + `","name":"Gus"}`)})
	var res map[string]any
	_ = json.Unmarshal((<-sender.ch).Payload, &res)
	if res["kind"] != "pin_result" || res["reason"] != "waiting" {
		t.Fatalf("waiting answer %v", res)
	}
	if _, knocks := room.Admission(); len(knocks) != 1 || knocks[0].Name != "Gus" {
		t.Fatalf("host sees %+v", knocks)
	}
	views.mu.Lock()
	streamed := len(views.added)
	views.mu.Unlock()
	if streamed != 0 {
		t.Fatal("streamed before the host's OK")
	}
	if err := room.Answer("nobody", true); err != ErrNotWaiting {
		t.Fatalf("answer to nobody: %v", err)
	}
	if err := room.Answer("G", true); err != nil {
		t.Fatal(err)
	}
	_ = json.Unmarshal((<-sender.ch).Payload, &res)
	if res["ok"] != true || res["token"] == "" {
		t.Fatalf("let in %v", res)
	}
	views.mu.Lock()
	defer views.mu.Unlock()
	if !slices.Equal(views.added, []string{"G"}) {
		t.Fatalf("viewers %v", views.added)
	}
	if g, _ := room.Admission(); g.Used != 1 || changes < 3 {
		t.Fatalf("used %d, %d changes", g.Used, changes)
	}
}
