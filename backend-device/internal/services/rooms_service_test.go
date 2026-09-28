// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/lordbasex/go-link/backend-device/internal/models"
	"github.com/lordbasex/go-link/backend-device/pkg/cores"
	"github.com/lordbasex/go-link/backend-device/pkg/libretro"
	"github.com/lordbasex/go-link/backend-device/pkg/signalclient"
)

// fakeGame stands in for the emulator process.
type fakeGame struct {
	rom, state string
	onReady    func(libretro.AVInfo)
	mu         sync.Mutex
	paused     bool
	fail       error
	noSaves    bool // the emulator cannot save this game whole
}

func (g *fakeGame) SavesIncomplete() bool { return g.noSaves }

func (g *fakeGame) Run(ctx context.Context, sink MediaSink) error {
	if g.fail != nil {
		return g.fail
	}
	g.onReady(libretro.AVInfo{})
	<-ctx.Done()
	return ctx.Err()
}

func (g *fakeGame) SetPaused(p bool) {
	g.mu.Lock()
	g.paused = p
	g.mu.Unlock()
}

func (g *fakeGame) isPaused() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.paused
}

func (g *fakeGame) SaveState(_ context.Context, path string) error {
	return os.WriteFile(path, []byte("state of "+g.rom), 0o644)
}

// recordingSender keeps what the rooms send to signalhub.
type recordingSender struct {
	mu   sync.Mutex
	sent []signalclient.Envelope
}

func (s *recordingSender) Send(env signalclient.Envelope) error {
	s.mu.Lock()
	s.sent = append(s.sent, env)
	s.mu.Unlock()
	return nil
}

func (s *recordingSender) count(typ string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	n := 0
	for _, e := range s.sent {
		if e.Type == typ {
			n++
		}
	}
	return n
}

func (s *recordingSender) last(typ string) signalclient.Envelope {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := len(s.sent) - 1; i >= 0; i-- {
		if s.sent[i].Type == typ {
			return s.sent[i]
		}
	}
	return signalclient.Envelope{}
}

type roomsHarness struct {
	t       *testing.T
	rooms   *RoomsService
	opener  *RoomOpener
	sender  *recordingSender
	status  *StatusService
	saves   string
	mu      sync.Mutex
	games   []*fakeGame
	saved   []models.SavedRoom
	fail    error
	history *HistoryService
	noSaves bool // new games cannot be saved whole
	// probe answers ProbeSaves (nil: no probe at all).
	probe func(rom string) bool
}

func newRoomsHarness(t *testing.T, maxRooms int, saved []models.SavedRoom) *roomsHarness {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	romsDir, coresDir := t.TempDir(), t.TempDir()
	for _, rom := range []string{"robby", "galaga"} {
		if err := os.WriteFile(filepath.Join(romsDir, rom+".zip"), []byte("PK\x03\x04"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(coresDir, cores.FileName(cores.DefaultCore, runtime.GOOS)), []byte("core"), 0o644); err != nil {
		t.Fatal(err)
	}
	status := NewStatusService(deviceID, "test", "ws://x", romsDir)
	lib := NewLibraryService(romsDir, status, logger)
	lib.SetCore(coresDir, "")
	h := &roomsHarness{t: t, opener: NewRoomOpener(), sender: &recordingSender{}, status: status, saves: t.TempDir(), history: NewHistoryService(filepath.Join(t.TempDir(), "history.json"))}
	h.opener.SetSender(h.sender)
	h.rooms = NewRoomsService(RoomsConfig{
		History:  h.history,
		Library:  lib,
		Status:   status,
		ICE:      NewICEStore(),
		Stream:   StreamConfig{IncludeLoopback: true, Logger: logger},
		Opener:   h.opener,
		HostName: "test-host",
		SavesDir: h.saves,
		MaxRooms: maxRooms,
		Rooms:    saved,
		Save: func(list []models.SavedRoom) error {
			h.mu.Lock()
			h.saved = list
			h.mu.Unlock()
			return nil
		},
		NewSource: func(rom, state string, onReady func(libretro.AVInfo)) RoomSource {
			g := &fakeGame{rom: rom, state: state, onReady: onReady}
			h.mu.Lock()
			g.fail = h.fail
			g.noSaves = h.noSaves
			h.games = append(h.games, g)
			h.mu.Unlock()
			return g
		},
		ProbeSaves: func(_ context.Context, rom string) (bool, error) {
			h.mu.Lock()
			probe := h.probe
			h.mu.Unlock()
			if probe == nil {
				return true, nil
			}
			return probe(rom), nil
		},
		Logger: logger,
	})
	h.rooms.SetSender(h.sender)
	h.rooms.OnConnect(signalclient.Envelope{})
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go h.rooms.Run(ctx)
	return h
}

// answerOpen plays signalhub: the oldest room_open gets roomID.
func (h *roomsHarness) answerOpen(roomID string) {
	h.t.Helper()
	h.opener.OnMessage(signalclient.Envelope{Type: signalclient.TypeRoomOpened, RoomID: roomID})
}

func (h *roomsHarness) room(id string) models.ManagedRoom {
	for _, r := range h.rooms.List() {
		if r.ID == id {
			return r
		}
	}
	h.t.Fatalf("room %s not listed", id)
	return models.ManagedRoom{}
}

func (h *roomsHarness) game(i int) *fakeGame {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.games[i]
}

func eventually(t *testing.T, what string, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !ok() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// create starts a room and plays signalhub until it is open.
func (h *roomsHarness) create(rom, roomID string) GameReply {
	h.t.Helper()
	replies := make(chan GameReply, 1)
	opens := h.sender.count(signalclient.TypeRoomOpen)
	if err := h.rooms.Create(GameRequest{Rom: rom, Title: "Night " + rom, Public: true, Voice: true}, func(r GameReply) { replies <- r }); err != nil {
		h.t.Fatalf("create %s: %v", rom, err)
	}
	eventually(h.t, "room_open", func() bool { return h.sender.count(signalclient.TypeRoomOpen) > opens })
	h.answerOpen(roomID)
	select {
	case r := <-replies:
		return r
	case <-time.After(3 * time.Second):
		h.t.Fatal("no reply")
		return GameReply{}
	}
}

func TestRoomsLifecycle(t *testing.T) {
	h := newRoomsHarness(t, 4, nil)
	reply := h.create("robby", "R1")
	if reply.Type != "room_created" || reply.RoomID != "R1" || reply.ID == "" || reply.Title != "Night robby" {
		t.Fatalf("reply %+v", reply)
	}
	id := reply.ID
	if r := h.room(id); r.State != models.RoomLive || r.RoomID != "R1" || !r.Voice {
		t.Fatalf("listed %+v", r)
	}
	if st := h.status.Snapshot(); len(st.Rooms) != 1 || st.Rooms[0].ID != id {
		t.Fatalf("status rooms %+v", st.Rooms)
	}

	// Pause from the host: the game holds and the lobby says so.
	if _, err := h.rooms.Action(context.Background(), id, "pause", ""); err != nil {
		t.Fatal(err)
	}
	eventually(t, "paused", func() bool { return h.game(0).isPaused() && h.room(id).State == models.RoomPaused })
	if n := len(h.games); n != 1 {
		t.Fatalf("the room started %d games", n)
	}
	eventually(t, "lobby update", func() bool {
		var meta map[string]any
		_ = json.Unmarshal(h.sender.last(signalclient.TypeRoomUpdate).Meta, &meta)
		return meta["paused"] == true
	})

	// Save a game, then archive (saves auto.state and closes the room).
	slot, err := h.rooms.Action(context.Background(), id, "save", "Stage 3")
	if err != nil || slot != 1 {
		t.Fatalf("save: %d %v", slot, err)
	}
	if _, err := os.Stat(filepath.Join(h.saves, id, "slot-1.state")); err != nil {
		t.Fatal(err)
	}
	// Saved games are private to the user.
	if dir, _ := os.Stat(filepath.Join(h.saves, id)); dir.Mode().Perm() != 0o700 {
		t.Fatalf("saves folder %v", dir.Mode().Perm())
	}
	if _, err := h.rooms.Action(context.Background(), id, "favorite", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := h.rooms.Action(context.Background(), id, "archive", ""); err != nil {
		t.Fatal(err)
	}
	r := h.room(id)
	if r.State != models.RoomArchived || !r.Autosave || !r.Favorite || r.RoomID != "" || len(r.Saves) != 1 || r.Saves[0].Name != "Stage 3" {
		t.Fatalf("archived %+v", r)
	}
	if h.sender.last(signalclient.TypeRoomClose).RoomID != "R1" {
		t.Fatal("the signalhub room must be closed")
	}
	if _, err := h.rooms.Action(context.Background(), id, "pause", ""); err == nil {
		t.Fatal("an archived room cannot pause")
	}

	// Turn it on again from where it was: a new session with a new key
	// for the host's browsers (every invitation of the old one is gone).
	oldKey := ownerKeyOf(h, id)
	replies := make(chan GameReply, 1)
	if err := h.rooms.Start(id, "continue", 0, func(r GameReply) { replies <- r }); err != nil {
		t.Fatal(err)
	}
	eventually(t, "reopen", func() bool { return h.sender.count(signalclient.TypeRoomOpen) == 2 })
	h.answerOpen("R2")
	if got := <-replies; got.RoomID != "R2" || got.ID != id {
		t.Fatalf("start reply %+v", got)
	}
	if key := ownerKeyOf(h, id); key == "" || key == oldKey {
		t.Fatalf("owner key after starting again: %q (was %q)", key, oldKey)
	}
	if g := h.game(1); g.state != filepath.Join(h.saves, id, "auto.state") {
		t.Fatalf("started from %q", g.state)
	}

	// Delete sends it to the trash; purge removes it and its saves.
	if _, err := h.rooms.Action(context.Background(), id, "delete", ""); err != nil {
		t.Fatal(err)
	}
	if r := h.room(id); r.State != models.RoomTrash || r.DeletedAt == nil {
		t.Fatalf("trash %+v", r)
	}
	if _, err := h.rooms.Action(context.Background(), id, "purge", ""); err != nil {
		t.Fatal(err)
	}
	if len(h.rooms.List()) != 0 {
		t.Fatal("purged room still listed")
	}
	if _, err := os.Stat(filepath.Join(h.saves, id)); !os.IsNotExist(err) {
		t.Fatal("saved games must be deleted with the room")
	}
	h.mu.Lock()
	persisted := len(h.saved)
	h.mu.Unlock()
	if persisted != 0 {
		t.Fatal("device.json must forget the purged room")
	}
}

func TestRoomsLimitAndFailure(t *testing.T) {
	h := newRoomsHarness(t, 1, nil)
	h.create("robby", "R1")
	if err := h.rooms.Create(GameRequest{Rom: "galaga"}, func(GameReply) {}); !errors.Is(err, ErrTooManyRooms) {
		t.Fatalf("limit: %v", err)
	} else if code, limit := ErrorCode(err); code != "too_many_rooms" || limit != 1 || !strings.Contains(err.Error(), "at most 1 games") {
		t.Fatalf("limit error: %q %s %d", err, code, limit)
	}
	if err := h.rooms.Create(GameRequest{Rom: "nope"}, func(GameReply) {}); err != ErrUnknownRom {
		t.Fatalf("unknown rom: %v", err)
	}

	h2 := newRoomsHarness(t, 4, nil)
	h2.mu.Lock()
	h2.fail = io.ErrUnexpectedEOF
	h2.mu.Unlock()
	replies := make(chan GameReply, 1)
	if err := h2.rooms.Create(GameRequest{Rom: "robby"}, func(r GameReply) { replies <- r }); err != nil {
		t.Fatal(err)
	}
	got := <-replies
	if got.Type != "room_error" || !strings.Contains(got.Error, "unexpected EOF") {
		t.Fatalf("failure reply %+v", got)
	}
	list := h2.rooms.List()
	if len(list) != 1 || list[0].State != models.RoomArchived || list[0].LastError == "" {
		t.Fatalf("failed room %+v", list)
	}
	if h2.sender.count(signalclient.TypeRoomOpen) != 0 {
		t.Fatal("a game that fails must never show up in the lobby")
	}
}

func TestRoomsComeBackAfterRestart(t *testing.T) {
	now := time.Now()
	old := now.Add(-40 * 24 * time.Hour)
	saved := []models.SavedRoom{
		{ID: "a1", Name: "Robby", Rom: "robby", State: models.RoomLive, Autosave: true, CreatedAt: now, Since: now},
		{ID: "b2", Name: "Old", Rom: "galaga", State: models.RoomTrash, DeletedAt: &old, CreatedAt: old, Since: old},
		{ID: "c3", Name: "Kept", Rom: "galaga", State: models.RoomArchived, CreatedAt: now, Since: now},
	}
	h := newRoomsHarness(t, 4, saved)
	eventually(t, "restart", func() bool {
		h.mu.Lock()
		defer h.mu.Unlock()
		return len(h.games) == 1
	})
	if g := h.game(0); g.rom != "robby" || !strings.HasSuffix(g.state, filepath.Join("a1", "auto.state")) {
		t.Fatalf("restarted %+v", g)
	}
	eventually(t, "trash emptied", func() bool { return len(h.rooms.List()) == 2 })
	h.answerOpen("R9")
	eventually(t, "room id", func() bool { return h.room("a1").RoomID == "R9" })
}

func TestRoomKeepsItsLobbyPicture(t *testing.T) {
	h := newRoomsHarness(t, 4, nil)
	replies := make(chan GameReply, 1)
	if err := h.rooms.Create(GameRequest{Rom: "robby", Art: "title"}, func(r GameReply) { replies <- r }); err != nil {
		t.Fatal(err)
	}
	eventually(t, "room_open", func() bool { return h.sender.count(signalclient.TypeRoomOpen) == 1 })
	h.answerOpen("R1")
	r := <-replies
	if got := h.room(r.ID).Art; got != "title" {
		t.Fatalf("art = %q", got)
	}
	if artKind("poster") != "" || artKind("snap") != "snap" {
		t.Fatal("only boxart, title and snap are kept")
	}
}

func TestEveryInvitationToARoomHasItsOwnPIN(t *testing.T) {
	h := newRoomsHarness(t, 2, nil)
	replies := make(chan GameReply, 1)
	opens := h.sender.count(signalclient.TypeRoomOpen)
	if err := h.rooms.Create(GameRequest{Rom: "robby", Title: "Secret", Public: false}, func(r GameReply) { replies <- r }); err != nil {
		t.Fatal(err)
	}
	eventually(t, "room_open", func() bool { return h.sender.count(signalclient.TypeRoomOpen) > opens })
	h.answerOpen("R9")
	r := <-replies
	// Each invitation is a new PIN, for one person.
	a, err := h.rooms.Invite(r.ID)
	if err != nil || !ValidPIN(a.Pin) {
		t.Fatalf("invite %+v %v", a, err)
	}
	b, _ := h.rooms.Invite(r.ID)
	if a.Pin == b.Pin {
		t.Fatal("two invitations share a PIN")
	}
	if _, err := h.rooms.Invite("nope"); err == nil {
		t.Fatal("invited to a room that does not exist")
	}
	// Every room is private now: asking for a public one gives a private
	// room too, with a key for the host's browsers.
	pub := h.create("galaga", "R10")
	for _, room := range h.rooms.List() {
		if room.ID == pub.ID && (room.Public || room.OwnerKey == "") {
			t.Fatalf("a room is public or has no owner key: %+v", room.SavedRoom)
		}
	}
}

// ownerKeyOf is a running room's key for the host's own browsers.
func ownerKeyOf(h *roomsHarness, id string) string {
	for _, room := range h.rooms.List() {
		if room.ID == id {
			return room.OwnerKey
		}
	}
	return ""
}

func TestGameRoomsGetAnInvitationThatCanChange(t *testing.T) {
	h := newRoomsHarness(t, 2, nil)
	replies := make(chan GameReply, 1)
	opens := h.sender.count(signalclient.TypeRoomOpen)
	if err := h.rooms.Create(GameRequest{Rom: "robby", Title: "Secret", Public: false}, func(r GameReply) { replies <- r }); err != nil {
		t.Fatal(err)
	}
	eventually(t, "room_open", func() bool { return h.sender.count(signalclient.TypeRoomOpen) > opens })
	if open := h.sender.last(signalclient.TypeRoomOpen); !open.InviteOnly || open.Public {
		t.Fatalf("a private room must be invite-only: %+v", open)
	}
	h.answerOpen("11111111-2222-4333-8444-555555555555")
	r := <-replies
	eventually(t, "invite_create", func() bool { return h.sender.count(signalclient.TypeInviteCreate) == 1 })
	if ask := h.sender.last(signalclient.TypeInviteCreate); ask.RoomID != "11111111-2222-4333-8444-555555555555" {
		t.Fatalf("invite_create for %q", ask.RoomID)
	}
	h.rooms.OnMessage(signalclient.Envelope{Type: signalclient.TypeInviteCreated, RoomID: "11111111-2222-4333-8444-555555555555", Invite: "abcdefghijklmnopqrstuv", Code: "123456789"})
	if room := h.room(r.ID); room.Invite != "abcdefghijklmnopqrstuv" || room.InviteCode != "123456789" {
		t.Fatalf("invite not shown to the owner: %+v", room)
	}
	// Another room's invitation is not ours.
	h.rooms.OnMessage(signalclient.Envelope{Type: signalclient.TypeInviteCreated, RoomID: "99999999-2222-4333-8444-555555555555", Invite: "zzzzzzzzzzzzzzzzzzzzzz", Code: "999999999"})
	if room := h.room(r.ID); room.Invite != "abcdefghijklmnopqrstuv" {
		t.Fatal("took another room's invitation")
	}
	if _, err := h.rooms.Action(context.Background(), r.ID, "new_link", ""); err != nil {
		t.Fatal(err)
	}
	if n := h.sender.count(signalclient.TypeInviteCreate); n != 2 {
		t.Fatalf("new_link sent %d invite_create in all", n)
	}
}

func TestArchivingAGameRecordsItInTheHistory(t *testing.T) {
	h := newRoomsHarness(t, 2, nil)
	r := h.create("robby", "R1")
	if _, err := h.rooms.Action(context.Background(), r.ID, "archive", ""); err != nil {
		t.Fatal(err)
	}
	list := h.history.List()
	if len(list) != 1 || list[0].RoomID != r.ID || list[0].Rom != "robby" || list[0].Reason != "archived" || list[0].EndedAt.Before(list[0].StartedAt) {
		t.Fatalf("history %+v", list)
	}
	// It survives a restart of the device.
	again := NewHistoryService(h.history.path)
	if len(again.List()) != 1 {
		t.Fatal("the history was not saved")
	}
}

func TestTheHistoryKeepsWhoPlayedAtWhichPortAndFromWhere(t *testing.T) {
	h := newRoomsHarness(t, 2, nil)
	r := h.create("robby", "R1")
	gr := h.rooms.find(r.ID)
	h.rooms.mu.Lock()
	manager, stream := gr.manager, gr.stream
	h.rooms.mu.Unlock()

	manager.Join("peer-a")
	manager.HandleControl("peer-a", []byte(`{"type":"hello","name":"Fede"}`))
	manager.Join("peer-b")
	manager.HandleControl("peer-b", []byte(`{"type":"hello","name":"Ana"}`))
	manager.Sync()
	stream.mu.Lock()
	stream.addrs["peer-a"] = PeerAddr{IP: "192.0.2.10", Path: "direct"}
	stream.addrs["peer-b"] = PeerAddr{Path: "relay"} // its own relay hides it
	stream.mu.Unlock()
	manager.Leave("peer-b") // who left early is still remembered
	manager.Sync()

	if _, err := h.rooms.Action(context.Background(), r.ID, "archive", ""); err != nil {
		t.Fatal(err)
	}
	people := h.history.List()[0].People
	want := []HistoryPerson{
		{Name: "Fede", Ports: []int{1}, IP: "192.0.2.10", Path: "direct"},
		{Name: "Ana", Ports: []int{2}, Path: "relay"},
	}
	if !reflect.DeepEqual(people, want) {
		t.Fatalf("people %+v", people)
	}
}

func TestARoomKeepsAtMostTwentySavedGames(t *testing.T) {
	h := newRoomsHarness(t, 2, nil)
	r := h.create("robby", "R1")
	for i := 1; i <= MaxSaveSlots; i++ {
		if _, err := h.rooms.Action(context.Background(), r.ID, "save", ""); err != nil {
			t.Fatalf("save %d: %v", i, err)
		}
	}
	if _, err := h.rooms.Action(context.Background(), r.ID, "save", ""); !errors.Is(err, ErrTooManySaves) {
		t.Fatalf("save %d: %v", MaxSaveSlots+1, err)
	}
}

func TestAGameThatCannotBeSavedNeverKeepsASave(t *testing.T) {
	h := newRoomsHarness(t, 4, nil)
	id := h.create("robby", "R1").ID
	// Saved by an older device: an automatic save exists.
	if _, err := h.rooms.Action(context.Background(), id, "archive", ""); err != nil {
		t.Fatal(err)
	}
	auto := filepath.Join(h.saves, id, "auto.state")
	if _, err := os.Stat(auto); err != nil || !h.room(id).Autosave {
		t.Fatalf("no automatic save to start with: %v", err)
	}
	h.mu.Lock()
	h.noSaves = true
	h.mu.Unlock()
	if err := h.rooms.Start(id, "continue", 0, func(GameReply) {}); err != nil {
		t.Fatal(err)
	}
	eventually(t, "the room knows", func() bool { return h.room(id).NoSaves })
	if r := h.room(id); r.Autosave {
		t.Fatalf("the stale automatic save is still listed: %+v", r)
	}
	if _, err := os.Stat(auto); !os.IsNotExist(err) {
		t.Fatalf("the stale automatic save is still on disk: %v", err)
	}
	if _, err := h.rooms.Action(context.Background(), id, "save", "Stage 2"); !errors.Is(err, ErrNoSaves) {
		t.Fatalf("saving a game that cannot be saved: %v", err)
	}
	if code, _ := ErrorCode(ErrNoSaves); code != "no_saves" {
		t.Fatalf("error code %q", code)
	}
}

func TestAGameWhoseSaveLosesSomethingStartsOver(t *testing.T) {
	h := newRoomsHarness(t, 4, nil)
	id := h.create("robby", "R1").ID
	if _, err := h.rooms.Action(context.Background(), id, "archive", ""); err != nil {
		t.Fatal(err)
	}
	auto := filepath.Join(h.saves, id, "auto.state")
	// The probe finds the save incomplete (e.g. the sound chip is not in it).
	h.mu.Lock()
	h.probe = func(string) bool { return false }
	h.mu.Unlock()
	if err := h.rooms.Start(id, "continue", 0, func(GameReply) {}); err != nil {
		t.Fatal(err)
	}
	eventually(t, "a fresh game", func() bool {
		h.mu.Lock()
		defer h.mu.Unlock()
		return len(h.games) == 2 && h.games[1].state == ""
	})
	eventually(t, "the room knows", func() bool { r := h.room(id); return r.NoSaves && !r.Autosave })
	if _, err := os.Stat(auto); !os.IsNotExist(err) {
		t.Fatalf("the useless automatic save is still on disk: %v", err)
	}
	// Play signalhub for the restarted room, so the next open is the new one.
	eventually(t, "the reopen", func() bool { return h.sender.count(signalclient.TypeRoomOpen) == 2 })
	h.answerOpen("R2")

	// A game whose saves work resumes from its save.
	h.mu.Lock()
	h.probe = func(rom string) bool { return rom == "galaga" }
	h.mu.Unlock()
	id2 := h.create("galaga", "R3").ID
	if _, err := h.rooms.Action(context.Background(), id2, "archive", ""); err != nil {
		t.Fatal(err)
	}
	h.mu.Lock()
	n := len(h.games)
	h.mu.Unlock()
	if err := h.rooms.Start(id2, "continue", 0, func(GameReply) {}); err != nil {
		t.Fatal(err)
	}
	eventually(t, "a resumed game", func() bool {
		h.mu.Lock()
		defer h.mu.Unlock()
		return len(h.games) == n+1 && h.games[n].state == filepath.Join(h.saves, id2, "auto.state")
	})
	if h.room(id2).NoSaves {
		t.Fatal("a game whose saves work was marked")
	}
}
