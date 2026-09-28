// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

type outbox struct {
	mu   sync.Mutex
	msgs map[string][]map[string]any
}

func newOutbox() *outbox { return &outbox{msgs: make(map[string][]map[string]any)} }

func (o *outbox) SendControl(peer string, b []byte) bool {
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	o.mu.Lock()
	o.msgs[peer] = append(o.msgs[peer], m)
	o.mu.Unlock()
	return true
}

// lastState returns the latest room_state sent to peer.
func (o *outbox) lastState(t *testing.T, peer string) map[string]any {
	t.Helper()
	o.mu.Lock()
	defer o.mu.Unlock()
	for i := len(o.msgs[peer]) - 1; i >= 0; i-- {
		if o.msgs[peer][i]["type"] == "room_state" {
			return o.msgs[peer][i]
		}
	}
	t.Fatalf("no room_state for %s", peer)
	return nil
}

func (o *outbox) chats(peer string) []map[string]any {
	o.mu.Lock()
	defer o.mu.Unlock()
	var out []map[string]any
	for _, m := range o.msgs[peer] {
		if m["type"] == "chat" {
			out = append(out, m)
		}
	}
	return out
}

func newManager(t *testing.T) (*RoomManager, *outbox, *[]RoomSummary) {
	out := newOutbox()
	var sums []RoomSummary
	m := NewRoomManager(RoomManagerConfig{Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), OnSummary: func(s RoomSummary) { sums = append(sums, s) }}, out)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go m.Run(ctx)
	return m, out, &sums
}

func you(st map[string]any) map[string]any { return st["you"].(map[string]any) }

func ports(st map[string]any) []any { return you(st)["ports"].([]any) }

func TestFourPlayAndOneQueues(t *testing.T) {
	m, out, sums := newManager(t)
	for _, p := range []string{"a", "b", "c", "d", "e"} {
		m.Join(p)
	}
	m.Sync()
	for i, p := range []string{"a", "b", "c", "d"} {
		if got := ports(out.lastState(t, p)); len(got) != 1 || got[0] != float64(i+1) {
			t.Fatalf("%s ports %v", p, got)
		}
		if port, ok := m.PortOf(p, 0); !ok || port != i+1 {
			t.Fatalf("PortOf(%s) = %d %v", p, port, ok)
		}
	}
	st := out.lastState(t, "e")
	if q := you(st)["queue_positions"].([]any); len(q) != 1 || q[0] != float64(1) {
		t.Fatalf("e queue %v", q)
	}
	if _, ok := m.PortOf("e", 0); ok {
		t.Fatal("queued guest has a port")
	}
	last := (*sums)[len(*sums)-1]
	members := last.Members
	last.Members = nil
	if !reflect.DeepEqual(last, RoomSummary{Players: 4, Queue: 1, MaxPlayers: 4}) {
		t.Fatalf("summary %+v", last)
	}
	// Everyone, in order of arrival, with the port each one plays at.
	for i, mem := range members {
		want := []int{i + 1}
		if i == 4 {
			want = nil
		}
		if mem.Peer != string(rune('a'+i)) || !reflect.DeepEqual(mem.Ports, want) {
			t.Fatalf("members %+v", members)
		}
	}

	// P2 leaves: the head of the queue takes that same port.
	m.Leave("b")
	m.Sync()
	if got := ports(out.lastState(t, "e")); len(got) != 1 || got[0] != float64(2) {
		t.Fatalf("e should take P2, got %v", got)
	}
	found := false
	for _, c := range out.chats("a") {
		if c["system"] == "Guest E took seat P2" {
			// The web translates it from the event and its values.
			args, _ := c["args"].(map[string]any)
			found = c["event"] == EventTookSeat && args["name"] == "Guest E" && args["port"] == float64(2)
		}
	}
	if !found {
		t.Fatalf("no system message: %v", out.chats("a"))
	}
}

func TestLocalPlayersTakeSeveralSeats(t *testing.T) {
	m, out, _ := newManager(t)
	m.Join("home")
	m.HandleControl("home", []byte(`{"type":"hello","name":"Fede","local_players":[0,1,1,7]}`))
	m.Sync()
	st := out.lastState(t, "home")
	if got := ports(st); len(got) != 2 {
		t.Fatalf("ports %v", got)
	}
	seats := st["seats"].([]any)
	if seats[0].(map[string]any)["name"] != "Fede (1)" || seats[1].(map[string]any)["name"] != "Fede (2)" {
		t.Fatalf("seats %v", seats)
	}
	if port, ok := m.PortOf("home", 1); !ok || port != 2 {
		t.Fatalf("local player 1 port %d %v", port, ok)
	}
	// Going back to one local player frees P2.
	m.HandleControl("home", []byte(`{"type":"hello","local_players":[0]}`))
	m.Sync()
	if _, ok := m.PortOf("home", 1); ok {
		t.Fatal("P2 not freed")
	}
}

func TestSpectateAndRequeue(t *testing.T) {
	m, out, sums := newManager(t)
	for _, p := range []string{"a", "b", "c", "d", "e"} {
		m.Join(p)
	}
	m.HandleControl("a", []byte(`{"type":"spectate"}`))
	m.Sync()
	if got := ports(out.lastState(t, "e")); len(got) != 1 || got[0] != float64(1) {
		t.Fatalf("e should take P1, got %v", got)
	}
	if st := out.lastState(t, "a"); you(st)["spectator"] != true || len(st["spectators"].([]any)) != 1 {
		t.Fatalf("a spectator state %v", st)
	}
	if last := (*sums)[len(*sums)-1]; last.Spectators != 1 || last.Queue != 0 {
		t.Fatalf("summary %+v", last)
	}
	m.HandleControl("a", []byte(`{"type":"queue"}`))
	m.Sync()
	if q := you(out.lastState(t, "a"))["queue_positions"].([]any); len(q) != 1 {
		t.Fatalf("a not queued again: %v", q)
	}
}

func TestChat(t *testing.T) {
	m, out, _ := newManager(t)
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	m.cfg.Now = func() time.Time { return now }
	m.Join("a")
	m.Join("b")
	m.HandleControl("a", []byte(`{"type":"hello","name":"  Ana\u0007  "}`))
	m.HandleControl("a", []byte(`{"type":"chat","text":"hi there"}`))
	m.HandleControl("a", []byte(`{"type":"chat","text":"`+strings.Repeat("x", 400)+`"}`))
	m.Sync()
	var got []map[string]any
	for _, c := range out.chats("b") {
		if c["name"] != nil {
			got = append(got, c)
		}
	}
	if len(got) != 2 || got[0]["name"] != "Ana" || got[0]["role"] != "P1" || got[0]["port"] != float64(1) || got[0]["text"] != "hi there" {
		t.Fatalf("chat %v", got)
	}
	if n := len([]rune(got[1]["text"].(string))); n != maxChatLen {
		t.Fatalf("long message kept %d runes", n)
	}

	// Rate limit: 5 messages per 5 seconds.
	for i := 0; i < 4; i++ {
		m.HandleControl("a", []byte(`{"type":"chat","text":"spam"}`))
	}
	m.Sync()
	warned := false
	for _, c := range out.chats("a") {
		if c["system"] == "You are sending messages too fast." {
			warned = true
		}
	}
	if !warned {
		t.Fatal("no rate limit warning")
	}

	// A late joiner receives the history.
	m.Join("c")
	m.Sync()
	if len(out.chats("c")) < 5 {
		t.Fatalf("history not sent: %d", len(out.chats("c")))
	}
}

func TestIgnoresGarbage(t *testing.T) {
	m, out, _ := newManager(t)
	m.Join("a")
	m.HandleControl("a", []byte(`not json`))
	m.HandleControl("a", []byte(`{"type":"chat","text":"   "}`))
	m.HandleControl("stranger", []byte(`{"type":"chat","text":"hi"}`))
	m.Leave("nobody")
	m.Sync()
	if n := len(out.chats("a")); n != 1 { // only "took seat P1"
		t.Fatalf("unexpected chat: %v", out.chats("a"))
	}
}

func TestOrdinal(t *testing.T) {
	for n, want := range map[int]string{1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 11: "11th", 12: "12th", 21: "21st"} {
		if got := ordinal(n); got != want {
			t.Errorf("ordinal(%d) = %s", n, got)
		}
	}
}

func TestPauseOnlyByPlayersDuringAGame(t *testing.T) {
	m, out, _ := newManager(t)
	var calls []bool
	m.OnPause(func(p bool) { calls = append(calls, p) })
	for _, p := range []string{"a", "b", "c", "d", "e"} {
		m.Join(p)
	}
	m.HandleControl("a", []byte(`{"type":"hello","name":"Ana"}`))
	// The test card never pauses.
	m.HandleControl("a", []byte(`{"type":"pause","paused":true}`))
	m.Sync()
	if st := out.lastState(t, "b"); st["paused"] == true || st["pausable"] == true {
		t.Fatalf("test card state %v", st)
	}

	m.SetPausable(true)
	// e waits in the queue: it cannot pause.
	m.HandleControl("e", []byte(`{"type":"pause","paused":true}`))
	m.Sync()
	if st := out.lastState(t, "b"); st["paused"] == true || st["pausable"] != true {
		t.Fatalf("queued guest paused: %v", st)
	}
	// A seated player pauses for everyone.
	m.HandleControl("a", []byte(`{"type":"pause","paused":true}`))
	m.Sync()
	if st := out.lastState(t, "e"); st["paused"] != true || st["paused_by"] != "Ana" {
		t.Fatalf("after pause: %v", st)
	}
	chats := out.chats("e")
	if last := chats[len(chats)-1]; last["system"] != "Ana paused the game" {
		t.Fatalf("chat %v", last)
	}
	// Another player resumes.
	m.HandleControl("b", []byte(`{"type":"pause","paused":false}`))
	m.Sync()
	if st := out.lastState(t, "a"); st["paused"] == true {
		t.Fatalf("after resume: %v", st)
	}
	// Leaving the game ends the pause.
	m.HandleControl("a", []byte(`{"type":"pause","paused":true}`))
	m.SetPausable(false)
	m.Sync()
	if st := out.lastState(t, "a"); st["paused"] == true || st["pausable"] == true {
		t.Fatalf("after the game: %v", st)
	}
	if want := []bool{true, false, true, false}; len(calls) != len(want) {
		t.Fatalf("emulator calls %v, want %v", calls, want)
	}
}

func TestStateCarriesTheGameControls(t *testing.T) {
	m, out, _ := newManager(t)
	m.Join("a")
	m.Sync()
	c, _ := out.lastState(t, "a")["controls"].(map[string]any)
	if c["buttons"] != float64(6) || c["control"] != "joy8way" {
		t.Fatalf("test card controls %v", c)
	}
	m.SetControls(GameControls{Players: 2, Buttons: 2, Control: "joy4way"})
	m.Sync()
	c, _ = out.lastState(t, "a")["controls"].(map[string]any)
	if c["buttons"] != float64(2) || c["control"] != "joy4way" || c["players"] != float64(2) {
		t.Fatalf("game controls %v", c)
	}
}

func swapsOf(st map[string]any, key string) []any { return you(st)[key].([]any) }

func TestSwapControllersNeedsTheOthersYes(t *testing.T) {
	m, out, _ := newManager(t)
	m.Join("a")
	m.Join("b")
	m.Sync()
	// b (P2) asks a (P1) for the joystick.
	m.HandleControl("b", []byte(`{"type":"swap_seat","from":2,"to":1}`))
	m.Sync()
	if offers := swapsOf(out.lastState(t, "a"), "swap_offers"); len(offers) != 1 {
		t.Fatalf("a offers %v", offers)
	}
	if asked := swapsOf(out.lastState(t, "b"), "swap_asked"); len(asked) != 1 {
		t.Fatalf("b asked %v", asked)
	}
	if p, _ := m.PortOf("b", 0); p != 2 {
		t.Fatal("seats changed before the answer")
	}
	// Only the asked player answers.
	m.HandleControl("b", []byte(`{"type":"swap_answer","from":2,"to":1,"accept":true}`))
	m.Sync()
	if p, _ := m.PortOf("b", 0); p != 2 {
		t.Fatal("the asker answered its own request")
	}
	m.HandleControl("a", []byte(`{"type":"swap_answer","from":2,"to":1,"accept":true}`))
	m.Sync()
	if pa, _ := m.PortOf("a", 0); pa != 2 {
		t.Fatalf("a is P%d, want P2", pa)
	}
	if pb, _ := m.PortOf("b", 0); pb != 1 {
		t.Fatalf("b is P%d, want P1", pb)
	}
	if len(swapsOf(out.lastState(t, "a"), "swap_offers")) != 0 {
		t.Fatal("the request stayed after the answer")
	}
}

func TestSwapDeclinedOrToAFreeSeat(t *testing.T) {
	m, _, _ := newManager(t)
	m.Join("a")
	m.Join("b")
	m.Sync()
	m.HandleControl("b", []byte(`{"type":"swap_seat","from":2,"to":1}`))
	m.HandleControl("a", []byte(`{"type":"swap_answer","from":2,"to":1,"accept":false}`))
	m.Sync()
	if p, _ := m.PortOf("a", 0); p != 1 {
		t.Fatal("a lost P1 after saying no")
	}
	// A free seat is taken at once.
	m.HandleControl("b", []byte(`{"type":"swap_seat","from":2,"to":4}`))
	m.Sync()
	if p, _ := m.PortOf("b", 0); p != 4 {
		t.Fatalf("b is P%d, want P4", p)
	}
	// Nobody moves someone else.
	m.HandleControl("a", []byte(`{"type":"swap_seat","from":4,"to":3}`))
	m.Sync()
	if p, _ := m.PortOf("b", 0); p != 4 {
		t.Fatal("a moved b")
	}
}

func TestSwapBetweenPlayersOfOneBrowserIsImmediate(t *testing.T) {
	m, _, _ := newManager(t)
	m.Join("a")
	m.HandleControl("a", []byte(`{"type":"hello","local_players":[0,1]}`))
	m.Sync()
	m.HandleControl("a", []byte(`{"type":"swap_seat","from":1,"to":2}`))
	m.Sync()
	if p, _ := m.PortOf("a", 0); p != 2 {
		t.Fatalf("local 0 is P%d, want P2", p)
	}
	if p, _ := m.PortOf("a", 1); p != 1 {
		t.Fatalf("local 1 is P%d, want P1", p)
	}
}

func TestSwapRequestDropsWhenAPlayerLeaves(t *testing.T) {
	m, out, _ := newManager(t)
	m.Join("a")
	m.Join("b")
	m.Sync()
	m.HandleControl("b", []byte(`{"type":"swap_seat","from":2,"to":1}`))
	m.Leave("b")
	m.Sync()
	if len(swapsOf(out.lastState(t, "a"), "swap_offers")) != 0 {
		t.Fatal("a still sees the request of a player who left")
	}
}

func TestCrossedSwapRequestsSwapAtOnce(t *testing.T) {
	m, out, _ := newManager(t)
	m.Join("a")
	m.Join("b")
	m.Sync()
	m.HandleControl("a", []byte(`{"type":"swap_seat","from":1,"to":2}`))
	m.HandleControl("b", []byte(`{"type":"swap_seat","from":2,"to":1}`))
	m.Sync()
	if p, _ := m.PortOf("a", 0); p != 2 {
		t.Fatalf("a is P%d, want P2", p)
	}
	if len(swapsOf(out.lastState(t, "b"), "swap_offers")) != 0 {
		t.Fatal("a crossed request stayed")
	}
}

// typingOf returns the names in the latest "typing" message sent to peer.
func (o *outbox) typingOf(t *testing.T, peer string) []string {
	t.Helper()
	o.mu.Lock()
	defer o.mu.Unlock()
	for i := len(o.msgs[peer]) - 1; i >= 0; i-- {
		if o.msgs[peer][i]["type"] == "typing" {
			var names []string
			for _, n := range o.msgs[peer][i]["names"].([]any) {
				names = append(names, n.(map[string]any)["name"].(string))
			}
			return names
		}
	}
	return nil
}

func TestTypingGoesToTheOthersAndStopsWithTheMessage(t *testing.T) {
	m, out, _ := newManager(t)
	m.Join("a")
	m.Join("b")
	m.HandleControl("a", []byte(`{"type":"hello","name":"Ana"}`))
	m.HandleControl("a", []byte(`{"type":"typing","on":true}`))
	m.Sync()
	if got := out.typingOf(t, "b"); len(got) != 1 || got[0] != "Ana" {
		t.Fatalf("b sees %v typing", got)
	}
	if got := out.typingOf(t, "a"); len(got) != 0 {
		t.Fatalf("a sees itself typing: %v", got)
	}
	m.HandleControl("a", []byte(`{"type":"chat","text":"hi"}`))
	m.Sync()
	if got := out.typingOf(t, "b"); len(got) != 0 {
		t.Fatalf("still typing after sending: %v", got)
	}
}

func TestChatOffDropsMessagesAndTyping(t *testing.T) {
	m, out, _ := newManager(t)
	m.Join("a")
	m.Join("b")
	m.SetChat(false)
	m.Sync()
	if out.lastState(t, "b")["chat"] != false {
		t.Fatal("room_state does not say the chat is off")
	}
	before := len(out.chats("b"))
	m.HandleControl("a", []byte(`{"type":"chat","text":"hi"}`))
	m.HandleControl("a", []byte(`{"type":"typing","on":true}`))
	m.Sync()
	for _, c := range out.chats("b")[before:] {
		if c["text"] == "hi" {
			t.Fatal("a chat message got through with the chat off")
		}
	}
	if got := out.typingOf(t, "b"); len(got) != 0 {
		t.Fatalf("typing with the chat off: %v", got)
	}
	m.SetChat(true)
	m.HandleControl("a", []byte(`{"type":"chat","text":"back"}`))
	m.Sync()
	if last := out.chats("b"); last[len(last)-1]["text"] != "back" {
		t.Fatal("the chat did not come back")
	}
}

func TestAGuestCannotMakeTheRoomFloodTheOthers(t *testing.T) {
	m, out, _ := newManager(t)
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	m.cfg.Now = func() time.Time { return now }
	m.Join("a")
	m.Join("b")
	m.Sync()
	out.mu.Lock()
	before := len(out.msgs["b"])
	out.mu.Unlock()
	// 200 renames in the same second: each would send everyone a new state.
	for i := range 200 {
		m.HandleControl("a", []byte(fmt.Sprintf(`{"type":"hello","name":"n%d"}`, i)))
	}
	m.Sync()
	out.mu.Lock()
	got := len(out.msgs["b"]) - before
	out.mu.Unlock()
	if got > controlBurst+2 {
		t.Fatalf("b received %d messages from one flooding guest", got)
	}
	// The next second the guest is heard again.
	now = now.Add(time.Second)
	m.HandleControl("a", []byte(`{"type":"hello","name":"Ana"}`))
	m.Sync()
	if st := out.lastState(t, "b"); !strings.Contains(fmt.Sprint(st), "Ana") {
		t.Fatalf("the guest was not heard after a second: %v", st)
	}
}

func TestDefaultNamesUseThePeersOwnID(t *testing.T) {
	for peer, want := range map[string]string{
		"9f3ab2c4d5":         "Guest 9F3A",
		"panel-41c482756881": "Guest 41C4",
		"ab":                 "Guest AB",
	} {
		if got := defaultName(peer); got != want {
			t.Errorf("defaultName(%q) = %q, want %q", peer, got, want)
		}
	}
}
