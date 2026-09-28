// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"time"
)

// MaxHistory is how many past games the device remembers.
const MaxHistory = 500

// HistoryEntry is one game session of a room: from the moment it was
// turned on to the moment it stopped.
type HistoryEntry struct {
	RoomID         string    `json:"room_id"` // the saved room's stable id
	Name           string    `json:"name"`
	Rom            string    `json:"rom"`
	Game           string    `json:"game"`
	StartedAt      time.Time `json:"started_at"`
	EndedAt        time.Time `json:"ended_at"`
	PeakPlayers    int       `json:"peak_players"`
	PeakSpectators int       `json:"peak_spectators"`
	// Reason the session ended: "archived", "deleted", "failed" or
	// "device_stopped".
	Reason string `json:"reason"`
	// People is everyone who joined, in order of arrival.
	People []HistoryPerson `json:"people,omitempty"`
}

// HistoryPerson is one browser that joined a game: the name it used last,
// the ports it played at (none for a spectator) and how it connected.
type HistoryPerson struct {
	Name  string `json:"name"`
	Ports []int  `json:"ports,omitempty"`
	// IP is the browser's address as the device saw it; empty when it
	// came through its own TURN relay, which hides it.
	IP   string `json:"ip,omitempty"`
	Path string `json:"path,omitempty"` // "direct" or "relay"
}

// maxHistoryPeople bounds the people one game remembers.
const maxHistoryPeople = 64

// HistoryService keeps the history of games in its own file next to
// device.json (history.json, private to the user).
type HistoryService struct {
	path string

	mu      sync.Mutex
	entries []HistoryEntry // oldest first
}

// NewHistoryService loads the history file; a missing or broken file is an
// empty history.
func NewHistoryService(path string) *HistoryService {
	h := &HistoryService{path: path}
	b, err := os.ReadFile(path)
	if err == nil {
		_ = json.Unmarshal(b, &h.entries)
	}
	return h
}

// Add records a finished game and saves the file.
func (h *HistoryService) Add(e HistoryEntry) error {
	h.mu.Lock()
	h.entries = append(h.entries, e)
	if len(h.entries) > MaxHistory {
		h.entries = slices.Clone(h.entries[len(h.entries)-MaxHistory:])
	}
	b, err := json.MarshalIndent(h.entries, "", "  ")
	h.mu.Unlock()
	if err != nil {
		return err
	}
	return writePrivate(h.path, b)
}

// List returns the history, newest first.
func (h *HistoryService) List() []HistoryEntry {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := slices.Clone(h.entries)
	slices.Reverse(out)
	if out == nil {
		out = []HistoryEntry{}
	}
	return out
}

// Clear forgets every past game.
func (h *HistoryService) Clear() error {
	h.mu.Lock()
	h.entries = nil
	h.mu.Unlock()
	if err := os.Remove(h.path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
}

// writePrivate writes a file readable only by the user, atomically.
func writePrivate(path string, b []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
