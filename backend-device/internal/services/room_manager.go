// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"sync/atomic"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/lordbasex/go-link/backend-device/pkg/input"
)

// ControlSender delivers JSON messages on a peer's "control" channel.
type ControlSender interface {
	SendControl(peerID string, msg []byte) bool
}

// RoomSummary is what the public directory shows about the room.
type RoomSummary struct {
	Players, Queue, Spectators, MaxPlayers int
	// Members is everyone in the room now, for the history of games.
	Members []MemberSummary
}

// MemberSummary is one browser in the room: its name and the ports
// (1-4) its players sit at, none for spectators and the queue.
type MemberSummary struct {
	Peer  string
	Name  string
	Ports []int
}

// RoomManagerConfig configures RoomManager. Zero values get defaults.
type RoomManagerConfig struct {
	MaxPlayers int              // ports, default 4
	Now        func() time.Time // default time.Now
	Logger     *slog.Logger
	// OnSummary runs (on the actor goroutine) after every change.
	OnSummary func(RoomSummary)
}

const (
	maxNameLen = 24
	maxChatLen = 300
	chatBurst  = 5
	// Any control message from a guest (hello, typing, queue...) makes the
	// room answer everyone: a guest gets controlBurst of them per second,
	// the rest are dropped, so nobody can make the room flood the others.
	controlBurst = 20
	chatWindow   = 5 * time.Second
	chatHistory  = 50
	commandQueue = 256
	// swapTimeout is how long a request to swap controllers waits for an
	// answer.
	swapTimeout = 30 * time.Second
	// typingFor is how long "is typing…" lasts after the last keystroke
	// notice; browsers repeat it every few seconds while typing.
	typingFor = 6 * time.Second
)

// seatKey is one local player of one browser.
type seatKey struct {
	peer  string
	local uint8
}

type member struct {
	peer      string
	name      string
	locals    []uint8
	spectator bool
	order     int
	chatTimes []time.Time
	// controlAt/controlN count the control messages of the current second.
	controlAt time.Time
	controlN  int
	// typingUntil: the member is typing a chat message until then.
	typingUntil time.Time
}

// pendingSwap is a seated player asking another one to swap controllers
// (seats), like handing over the joystick: it needs the other's yes.
type pendingSwap struct {
	id       int
	from, to int     // ports
	asker    seatKey // who sat at from when asking
	target   seatKey // who sat at to when asking
}

// RoomManager owns the state of a room: seats P1-P4, the queue, the
// spectators and the chat. It is an actor: a single goroutine (Run) owns
// the state and every public method posts a command to it, so no state
// is shared and no locks are needed. The only exception is the seat map
// read by the input path, published as an immutable snapshot.
type RoomManager struct {
	cfg  RoomManagerConfig
	log  *slog.Logger
	out  ControlSender
	cmds chan func()

	// Owned by the actor goroutine.
	members   map[string]*member
	nextOrder int
	voiceOff  bool
	chatOff   bool // the host turned the room's chat off
	info      RoomInfo
	pausable  bool // a game is running (the test card never pauses)
	controls  GameControls
	paused    bool
	pausedBy  string
	recording bool              // the host is recording the game (everyone is told)
	onPause   func(paused bool) // set by OnPause; called on the actor goroutine
	seats     []*seatKey
	queue     []seatKey
	history   [][]byte
	swaps     []pendingSwap
	nextSwap  int

	ports atomic.Pointer[map[seatKey]int]
}

// NewRoomManager builds the manager. Call Run to start it.
func NewRoomManager(cfg RoomManagerConfig, out ControlSender) *RoomManager {
	if cfg.MaxPlayers <= 0 || cfg.MaxPlayers > 4 {
		cfg.MaxPlayers = 4
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	m := &RoomManager{
		cfg:      cfg,
		controls: TestCardControls,
		log:      cfg.Logger,
		out:      out,
		cmds:     make(chan func(), commandQueue),
		members:  make(map[string]*member),
		seats:    make([]*seatKey, cfg.MaxPlayers),
	}
	empty := map[seatKey]int{}
	m.ports.Store(&empty)
	return m
}

// Run executes commands until ctx ends.
func (m *RoomManager) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case cmd := <-m.cmds:
			cmd()
		}
	}
}

func (m *RoomManager) do(cmd func()) { m.cmds <- cmd }

// Sync waits until every command posted before it has run (tests).
func (m *RoomManager) Sync() {
	done := make(chan struct{})
	m.do(func() { close(done) })
	<-done
}

// PortOf returns the port (1-4) of a local player, if seated. Safe to
// call from any goroutine; used by the input path at frame rate.
func (m *RoomManager) PortOf(peerID string, local uint8) (int, bool) {
	port, ok := (*m.ports.Load())[seatKey{peerID, local}]
	return port, ok
}

// Join adds a guest whose control channel just opened.
func (m *RoomManager) Join(peerID string) {
	m.do(func() {
		if _, ok := m.members[peerID]; ok {
			return
		}
		// Earlier chat first, then the new seat and state go out live.
		for _, msg := range m.history {
			m.out.SendControl(peerID, msg)
		}
		m.nextOrder++
		m.members[peerID] = &member{peer: peerID, name: defaultName(peerID), locals: []uint8{0}, order: m.nextOrder}
		m.reconcile()
	})
}

// Leave removes a guest. It is idempotent.
func (m *RoomManager) Leave(peerID string) {
	m.do(func() {
		mem, ok := m.members[peerID]
		if !ok {
			return
		}
		delete(m.members, peerID)
		m.reconcile()
		if m.cfg.Now().Before(mem.typingUntil) {
			m.broadcastTyping() // who left stops "typing"
		}
	})
}

// SetVoice tells guests whether voice between players is on.
func (m *RoomManager) SetVoice(on bool) {
	m.do(func() {
		if m.voiceOff != !on {
			m.voiceOff = !on
			m.broadcastState()
		}
	})
}

// RoomInfo describes the room to its guests, over the control channel:
// rooms are private, so guests do not read it from the public directory.
type RoomInfo struct {
	Title string `json:"title"`
	Game  string `json:"game"`
	Host  string `json:"host"`
	// Art is a small JPEG of the game (base64), or "".
	Art string `json:"art,omitempty"`
}

// SetInfo tells guests the room's name, game, host and picture.
func (m *RoomManager) SetInfo(info RoomInfo) {
	m.do(func() {
		if m.info != info {
			m.info = info
			m.broadcastState()
		}
	})
}

// SetChat turns the room's chat on or off. Off, the device drops chat and
// typing messages (the web also hides the chat, but this is the rule).
func (m *RoomManager) SetChat(on bool) {
	m.do(func() {
		if m.chatOff != !on {
			m.chatOff = !on
			if !on {
				for _, mem := range m.members {
					mem.typingUntil = time.Time{}
				}
				m.broadcastTyping()
			}
			m.broadcastState()
		}
	})
}

// OnPause registers who stops and resumes the emulator.
func (m *RoomManager) OnPause(fn func(paused bool)) {
	m.do(func() { m.onPause = fn })
}

// GameControls is the control panel of the running game, so browsers can
// draw a matching on-screen gamepad.
type GameControls struct {
	Players int    `json:"players,omitempty"`
	Buttons int    `json:"buttons"`           // action buttons per player
	Control string `json:"control,omitempty"` // joy4way, joy8way, dial... from MAME
}

// TestCardControls is what the test card offers: every button lights up.
var TestCardControls = GameControls{Players: 4, Buttons: 6, Control: "joy8way"}

// SetControls tells guests which controls the running game has.
func (m *RoomManager) SetControls(c GameControls) {
	m.do(func() {
		m.controls = c
		m.broadcastState()
	})
}

// SetPausable tells whether a game is running. Starting or stopping a
// game always resumes.
func (m *RoomManager) SetPausable(on bool) {
	m.do(func() {
		m.pausable = on
		m.setPaused(false, "")
		m.broadcastState()
	})
}

// setPaused changes the pause and tells the emulator. Actor goroutine.
func (m *RoomManager) setPaused(paused bool, by string) {
	if m.paused == paused {
		return
	}
	m.paused, m.pausedBy = paused, by
	if !paused {
		m.pausedBy = ""
	}
	if m.onPause != nil {
		m.onPause(paused)
	}
}

// Pause pauses or resumes the game for everyone on behalf of the host
// (from the linked browser), with a line in the chat.
func (m *RoomManager) Pause(paused bool, by string) {
	m.do(func() {
		if !m.pausable || paused == m.paused {
			return
		}
		m.setPaused(paused, by)
		if paused {
			m.system(fmt.Sprintf("%s paused the game", by))
		} else {
			m.system(fmt.Sprintf("%s resumed the game", by))
		}
		m.broadcastState()
	})
}

// Chat events: a machine-readable kind for some system lines, so the web
// can show them in the reader's language.
const (
	EventRecordingStarted = "recording_started"
	EventRecordingStopped = "recording_stopped"
)

// SetRecording tells everyone in the room whether the host records the
// game: room_state.recording (a REC badge) and a line in the chat, since
// the players' voices are recorded too.
func (m *RoomManager) SetRecording(on bool) {
	m.do(func() {
		if m.recording == on {
			return
		}
		m.recording = on
		msg := chatOut{Type: "chat", TS: m.cfg.Now().UnixMilli()}
		if on {
			msg.System, msg.Event = "The host is recording this game, with the players' voices", EventRecordingStarted
		} else {
			msg.System, msg.Event = "The recording stopped", EventRecordingStopped
		}
		m.publish(msg)
		m.broadcastState()
	})
}

// Reset removes everyone (the signaling link was lost).
func (m *RoomManager) Reset() {
	m.do(func() {
		m.members = make(map[string]*member)
		m.history = nil
		m.reconcile()
	})
}

type controlIn struct {
	Type         string `json:"type"`
	Name         string `json:"name"`
	LocalPlayers []int  `json:"local_players"`
	Text         string `json:"text"`
	Paused       bool   `json:"paused"`
	From         int    `json:"from"`
	To           int    `json:"to"`
	Accept       bool   `json:"accept"`
	On           bool   `json:"on"`
}

// HandleControl processes a JSON message from a guest.
func (m *RoomManager) HandleControl(peerID string, data []byte) {
	var msg controlIn
	if len(data) > 4096 || json.Unmarshal(data, &msg) != nil {
		return
	}
	m.do(func() {
		mem := m.members[peerID]
		if mem == nil {
			return
		}
		if now := m.cfg.Now(); now.Sub(mem.controlAt) >= time.Second {
			mem.controlAt, mem.controlN = now, 0
		}
		if mem.controlN++; mem.controlN > controlBurst {
			return
		}
		switch msg.Type {
		case "hello":
			if name := cleanText(msg.Name, maxNameLen); name != "" {
				mem.name = name
			}
			if locals := cleanLocals(msg.LocalPlayers); len(locals) > 0 {
				mem.locals = locals
			}
			m.reconcile()
		case "chat":
			if m.chatOff {
				return
			}
			m.chat(mem, msg.Text)
			m.setTyping(mem, false)
		case "typing":
			if !m.chatOff {
				m.setTyping(mem, msg.On)
			}
		case "spectate":
			if !mem.spectator {
				mem.spectator = true
				m.system(fmt.Sprintf("%s is now watching", mem.name))
				m.reconcile()
			}
		case "queue":
			if mem.spectator {
				mem.spectator = false
				m.reconcile()
			}
		case "pause":
			// Only a seated player pauses, and only a game.
			if role, _ := m.roleOf(mem); !m.pausable || !strings.HasPrefix(role, "P") || msg.Paused == m.paused {
				return
			}
			m.setPaused(msg.Paused, mem.name)
			if msg.Paused {
				m.system(fmt.Sprintf("%s paused the game", mem.name))
			} else {
				m.system(fmt.Sprintf("%s resumed the game", mem.name))
			}
			m.broadcastState()
		case "swap_seat":
			m.askSwap(peerID, msg.From, msg.To)
		case "swap_answer":
			m.answerSwap(peerID, msg.From, msg.To, msg.Accept)
		}
	})
}

// askSwap moves a seated player from port from to port to. A free port is
// taken at once, and so is a port of the same browser; a port of someone
// else waits for their answer (swap_answer), for swapTimeout at most.
func (m *RoomManager) askSwap(peer string, from, to int) {
	if from < 1 || to < 1 || from > len(m.seats) || to > len(m.seats) || from == to {
		return
	}
	asker := m.seats[from-1]
	if asker == nil || asker.peer != peer {
		return
	}
	target := m.seats[to-1]
	if target == nil {
		m.seats[to-1], m.seats[from-1] = asker, nil
		m.system(fmt.Sprintf("%s moved to P%d", m.displayName(*asker), to))
		m.reconcile()
		return
	}
	// The same browser, or the other player already asked for this very
	// swap: both want it, so no need to ask again.
	crossed := slices.ContainsFunc(m.swaps, func(p pendingSwap) bool {
		return p.from == to && p.to == from && m.swapValid(p)
	})
	if target.peer == peer || crossed {
		m.swapSeats(from, to)
		m.reconcile()
		return
	}
	// One request per port: a new one replaces the old.
	m.swaps = slices.DeleteFunc(m.swaps, func(p pendingSwap) bool { return p.from == from })
	m.nextSwap++
	req := pendingSwap{id: m.nextSwap, from: from, to: to, asker: *asker, target: *target}
	m.swaps = append(m.swaps, req)
	m.system(fmt.Sprintf("%s (P%d) asks %s (P%d) to swap controllers", m.displayName(*asker), from, m.displayName(*target), to))
	time.AfterFunc(swapTimeout, func() {
		m.do(func() {
			n := len(m.swaps)
			m.swaps = slices.DeleteFunc(m.swaps, func(p pendingSwap) bool { return p.id == req.id })
			if len(m.swaps) != n {
				m.broadcastState()
			}
		})
	})
	m.broadcastState()
}

// answerSwap is the reply of the player asked to swap.
func (m *RoomManager) answerSwap(peer string, from, to int, accept bool) {
	i := slices.IndexFunc(m.swaps, func(p pendingSwap) bool { return p.from == from && p.to == to && p.target.peer == peer })
	if i < 0 {
		return
	}
	req := m.swaps[i]
	m.swaps = slices.Delete(m.swaps, i, i+1)
	if !m.swapValid(req) {
		m.broadcastState()
		return
	}
	if !accept {
		m.system(fmt.Sprintf("%s kept P%d", m.displayName(req.target), to))
		m.broadcastState()
		return
	}
	m.swapSeats(from, to)
	m.reconcile()
}

// swapSeats exchanges the players of two ports and says so in the chat.
func (m *RoomManager) swapSeats(a, b int) {
	m.seats[a-1], m.seats[b-1] = m.seats[b-1], m.seats[a-1]
	m.swaps = slices.DeleteFunc(m.swaps, func(p pendingSwap) bool { return !m.swapValid(p) })
	x, y := m.seats[a-1], m.seats[b-1]
	if x != nil && y != nil {
		m.system(fmt.Sprintf("%s is now P%d and %s is P%d", m.displayName(*y), b, m.displayName(*x), a))
	}
}

// swapValid reports whether both players still sit where they sat when
// the swap was asked.
func (m *RoomManager) swapValid(p pendingSwap) bool {
	f, t := m.seats[p.from-1], m.seats[p.to-1]
	return f != nil && t != nil && *f == p.asker && *t == p.target
}

// reconcile brings seats and queue in line with the members, fills free
// ports from the queue, publishes the seat map and notifies everyone.
func (m *RoomManager) reconcile() {
	wants := func(k seatKey) bool {
		mem := m.members[k.peer]
		return mem != nil && !mem.spectator && slices.Contains(mem.locals, k.local)
	}
	for i, s := range m.seats {
		if s != nil && !wants(*s) {
			if mem := m.members[s.peer]; mem != nil {
				m.system(fmt.Sprintf("%s left P%d", mem.name, i+1))
			} else {
				m.system(fmt.Sprintf("P%d is free", i+1))
			}
			m.seats[i] = nil
		}
	}
	m.queue = slices.DeleteFunc(m.queue, func(k seatKey) bool { return !wants(k) })

	// New wishes join the queue in arrival order.
	ordered := make([]*member, 0, len(m.members))
	for _, mem := range m.members {
		ordered = append(ordered, mem)
	}
	slices.SortFunc(ordered, func(a, b *member) int { return a.order - b.order })
	for _, mem := range ordered {
		if mem.spectator {
			continue
		}
		for _, l := range mem.locals {
			k := seatKey{mem.peer, l}
			if m.portIndex(k) < 0 && !slices.Contains(m.queue, k) {
				m.queue = append(m.queue, k)
			}
		}
	}

	// Free ports go to the head of the queue: like at the arcade, the
	// next in line takes the joystick that was just released.
	for i := range m.seats {
		if m.seats[i] == nil && len(m.queue) > 0 {
			k := m.queue[0]
			m.queue = m.queue[1:]
			m.seats[i] = &k
			m.system(fmt.Sprintf("%s took seat P%d", m.displayName(k), i+1))
		}
	}

	ports := make(map[seatKey]int)
	for i, s := range m.seats {
		if s != nil {
			ports[*s] = i + 1
		}
	}
	m.ports.Store(&ports)
	m.swaps = slices.DeleteFunc(m.swaps, func(p pendingSwap) bool { return !m.swapValid(p) })
	m.broadcastState()
	if m.cfg.OnSummary != nil {
		m.cfg.OnSummary(m.summary())
	}
}

func (m *RoomManager) portIndex(k seatKey) int {
	for i, s := range m.seats {
		if s != nil && *s == k {
			return i
		}
	}
	return -1
}

func (m *RoomManager) displayName(k seatKey) string {
	mem := m.members[k.peer]
	if mem == nil {
		return "?"
	}
	if len(mem.locals) > 1 {
		return fmt.Sprintf("%s (%d)", mem.name, k.local+1)
	}
	return mem.name
}

func (m *RoomManager) summary() RoomSummary {
	s := RoomSummary{MaxPlayers: m.cfg.MaxPlayers, Queue: len(m.queue)}
	for _, seat := range m.seats {
		if seat != nil {
			s.Players++
		}
	}
	for _, mem := range m.members {
		if mem.spectator {
			s.Spectators++
		}
		ms := MemberSummary{Peer: mem.peer, Name: mem.name}
		for i, seat := range m.seats {
			if seat != nil && seat.peer == mem.peer {
				ms.Ports = append(ms.Ports, i+1)
			}
		}
		s.Members = append(s.Members, ms)
	}
	slices.SortFunc(s.Members, func(a, b MemberSummary) int {
		return m.members[a.Peer].order - m.members[b.Peer].order
	})
	return s
}

type seatOut struct {
	Port        int    `json:"port"`
	Name        string `json:"name"`
	LocalPlayer int    `json:"local_player"`
	You         bool   `json:"you"`
}

type queueOut struct {
	Position int    `json:"position"`
	Name     string `json:"name"`
	You      bool   `json:"you"`
}

type personOut struct {
	Name string `json:"name"`
	You  bool   `json:"you"`
}

type youOut struct {
	Name           string `json:"name"`
	Ports          []int  `json:"ports"`
	QueuePositions []int  `json:"queue_positions"`
	Spectator      bool   `json:"spectator"`
	// SwapOffers are requests to swap controllers waiting for your answer;
	// SwapAsked are yours waiting for someone else's.
	SwapOffers []swapOut `json:"swap_offers"`
	SwapAsked  []swapOut `json:"swap_asked"`
}

type swapOut struct {
	From int    `json:"from"`
	To   int    `json:"to"`
	Name string `json:"name"` // the other player
}

type stateOut struct {
	Type       string       `json:"type"`
	MaxPlayers int          `json:"max_players"`
	Voice      bool         `json:"voice"`
	Chat       bool         `json:"chat"`
	Info       RoomInfo     `json:"info"`
	Seats      []*seatOut   `json:"seats"`
	Queue      []queueOut   `json:"queue"`
	Spectators []personOut  `json:"spectators"`
	You        youOut       `json:"you"`
	Pausable   bool         `json:"pausable"`
	Paused     bool         `json:"paused"`
	PausedBy   string       `json:"paused_by,omitempty"`
	Controls   GameControls `json:"controls"`
	Recording  bool         `json:"recording"`
}

// broadcastState sends each member its own view of the room.
func (m *RoomManager) broadcastState() {
	for peer, mem := range m.members {
		st := stateOut{Type: "room_state", MaxPlayers: m.cfg.MaxPlayers, Voice: !m.voiceOff, Chat: !m.chatOff, Info: m.info, Seats: make([]*seatOut, len(m.seats)), Queue: []queueOut{}, Spectators: []personOut{},
			Pausable: m.pausable, Paused: m.paused, PausedBy: m.pausedBy, Controls: m.controls, Recording: m.recording}
		st.You = youOut{Name: mem.name, Ports: []int{}, QueuePositions: []int{}, Spectator: mem.spectator, SwapOffers: []swapOut{}, SwapAsked: []swapOut{}}
		for _, p := range m.swaps {
			if p.target.peer == peer {
				st.You.SwapOffers = append(st.You.SwapOffers, swapOut{From: p.from, To: p.to, Name: m.displayName(p.asker)})
			}
			if p.asker.peer == peer {
				st.You.SwapAsked = append(st.You.SwapAsked, swapOut{From: p.from, To: p.to, Name: m.displayName(p.target)})
			}
		}
		for i, s := range m.seats {
			if s == nil {
				continue
			}
			you := s.peer == peer
			st.Seats[i] = &seatOut{Port: i + 1, Name: m.displayName(*s), LocalPlayer: int(s.local), You: you}
			if you {
				st.You.Ports = append(st.You.Ports, i+1)
			}
		}
		for i, k := range m.queue {
			you := k.peer == peer
			st.Queue = append(st.Queue, queueOut{Position: i + 1, Name: m.displayName(k), You: you})
			if you {
				st.You.QueuePositions = append(st.You.QueuePositions, i+1)
			}
		}
		for _, other := range m.members {
			if other.spectator {
				st.Spectators = append(st.Spectators, personOut{Name: other.name, You: other.peer == peer})
			}
		}
		slices.SortFunc(st.Spectators, func(a, b personOut) int { return strings.Compare(a.Name, b.Name) })
		b, err := json.Marshal(st)
		if err == nil {
			m.out.SendControl(peer, b)
		}
	}
}

type chatOut struct {
	Type   string `json:"type"`
	Name   string `json:"name,omitempty"`
	Port   int    `json:"port,omitempty"`
	Role   string `json:"role,omitempty"`
	Text   string `json:"text,omitempty"`
	System string `json:"system,omitempty"`
	Event  string `json:"event,omitempty"` // EventRecordingStarted...
	TS     int64  `json:"ts"`
}

func (m *RoomManager) chat(mem *member, raw string) {
	text := cleanText(raw, maxChatLen)
	if text == "" {
		return
	}
	now := m.cfg.Now()
	mem.chatTimes = slices.DeleteFunc(mem.chatTimes, func(t time.Time) bool { return now.Sub(t) > chatWindow })
	if len(mem.chatTimes) >= chatBurst {
		b, _ := json.Marshal(chatOut{Type: "chat", System: "You are sending messages too fast.", TS: now.UnixMilli()})
		m.out.SendControl(mem.peer, b)
		return
	}
	mem.chatTimes = append(mem.chatTimes, now)
	msg := chatOut{Type: "chat", Name: mem.name, Text: text, TS: now.UnixMilli()}
	msg.Role, msg.Port = m.roleOf(mem)
	m.publish(msg)
}

type typingOut struct {
	Name string `json:"name"`
	Port int    `json:"port,omitempty"`
}

// setTyping marks a member as typing a chat message (or not) and tells the
// others when that changes. The mark expires by itself after typingFor.
func (m *RoomManager) setTyping(mem *member, on bool) {
	now := m.cfg.Now()
	was := now.Before(mem.typingUntil)
	if on {
		mem.typingUntil = now.Add(typingFor)
		peer, until := mem.peer, mem.typingUntil
		time.AfterFunc(typingFor, func() {
			m.do(func() {
				if cur := m.members[peer]; cur != nil && cur.typingUntil.Equal(until) {
					cur.typingUntil = time.Time{}
					m.broadcastTyping()
				}
			})
		})
	} else {
		mem.typingUntil = time.Time{}
	}
	if was != on {
		m.broadcastTyping()
	}
}

// broadcastTyping sends each member who else is typing (never themselves).
func (m *RoomManager) broadcastTyping() {
	now := m.cfg.Now()
	var typing []*member
	for _, mem := range m.members {
		if now.Before(mem.typingUntil) {
			typing = append(typing, mem)
		}
	}
	slices.SortFunc(typing, func(a, b *member) int { return a.order - b.order })
	for peer := range m.members {
		out := struct {
			Type  string      `json:"type"`
			Names []typingOut `json:"names"`
		}{Type: "typing", Names: []typingOut{}}
		for _, mem := range typing {
			if mem.peer != peer {
				_, port := m.roleOf(mem)
				out.Names = append(out.Names, typingOut{Name: mem.name, Port: port})
			}
		}
		if b, err := json.Marshal(out); err == nil {
			m.out.SendControl(peer, b)
		}
	}
}

// roleOf describes a member for the chat: "P1", "queue 2nd" or "spectator".
func (m *RoomManager) roleOf(mem *member) (string, int) {
	for i, s := range m.seats {
		if s != nil && s.peer == mem.peer {
			return fmt.Sprintf("P%d", i+1), i + 1
		}
	}
	for i, k := range m.queue {
		if k.peer == mem.peer {
			return "queue " + ordinal(i+1), 0
		}
	}
	return "spectator", 0
}

func (m *RoomManager) system(text string) {
	m.publish(chatOut{Type: "chat", System: text, TS: m.cfg.Now().UnixMilli()})
}

// publish sends a chat line to everyone and keeps it in the history.
func (m *RoomManager) publish(msg chatOut) {
	b, err := json.Marshal(msg)
	if err != nil {
		return
	}
	m.history = append(m.history, b)
	if len(m.history) > chatHistory {
		m.history = m.history[len(m.history)-chatHistory:]
	}
	for peer := range m.members {
		m.out.SendControl(peer, b)
	}
}

// cleanText trims, drops control characters and limits the length.
func cleanText(s string, limit int) string {
	s = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, s)
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > limit {
		s = string([]rune(s)[:limit])
	}
	return s
}

// cleanLocals keeps valid, distinct local player numbers.
func cleanLocals(in []int) []uint8 {
	var out []uint8
	for _, v := range in {
		if v >= 0 && v < input.MaxLocalPlayers && !slices.Contains(out, uint8(v)) {
			out = append(out, uint8(v))
		}
	}
	slices.Sort(out)
	return out
}

func defaultName(peerID string) string {
	// The local panel's peers are "panel-<hex>": name them by the hex.
	short := strings.TrimPrefix(peerID, "panel-")
	if len(short) > 4 {
		short = short[:4]
	}
	return "Guest " + strings.ToUpper(short)
}

func ordinal(n int) string {
	switch {
	case n%100 >= 11 && n%100 <= 13:
		return fmt.Sprintf("%dth", n)
	case n%10 == 1:
		return fmt.Sprintf("%dst", n)
	case n%10 == 2:
		return fmt.Sprintf("%dnd", n)
	case n%10 == 3:
		return fmt.Sprintf("%drd", n)
	}
	return fmt.Sprintf("%dth", n)
}
