// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"crypto/rand"
	"encoding/hex"
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
	// ID names the entry (delete_history). Entries saved before it
	// existed have none and go only with the whole history.
	ID             string    `json:"id,omitempty"`
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
	// Recordings made during this game, if the host recorded it.
	Recordings []RecordingInfo `json:"recordings,omitempty"`
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
	recs *RecordingService // recordings go with their entries

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

// SetRecordings links the recordings: removing an entry (or the whole
// history) removes its recordings.
func (h *HistoryService) SetRecordings(recs *RecordingService) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.recs = recs
}

// Add records a finished game and saves the file. The oldest games go
// when there are more than MaxHistory, with their recordings.
func (h *HistoryService) Add(e HistoryEntry) error {
	if e.ID == "" {
		e.ID = newEntryID()
	}
	h.mu.Lock()
	h.entries = append(h.entries, e)
	var gone []HistoryEntry
	if len(h.entries) > MaxHistory {
		gone = slices.Clone(h.entries[:len(h.entries)-MaxHistory])
		h.entries = slices.Clone(h.entries[len(h.entries)-MaxHistory:])
	}
	err := h.saveLocked()
	recs := h.recs
	h.mu.Unlock()
	deleteRecordings(recs, gone...)
	return err
}

// saveLocked writes the file. Callers hold h.mu.
func (h *HistoryService) saveLocked() error {
	b, err := json.MarshalIndent(h.entries, "", "  ")
	if err != nil {
		return err
	}
	return writePrivate(h.path, b)
}

// NewRunID names a game: the same id in the history and in the room's
// telemetry.
func NewRunID() string { return newEntryID() }

func newEntryID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func deleteRecordings(recs *RecordingService, entries ...HistoryEntry) {
	if recs == nil {
		return
	}
	for _, e := range entries {
		for _, r := range e.Recordings {
			_ = recs.Delete(r.ID)
		}
	}
}

// Delete forgets one game and deletes its recordings.
func (h *HistoryService) Delete(id string) error {
	h.mu.Lock()
	i := slices.IndexFunc(h.entries, func(e HistoryEntry) bool { return id != "" && e.ID == id })
	if i < 0 {
		h.mu.Unlock()
		return ErrUnknownHistory
	}
	gone := h.entries[i]
	h.entries = slices.Delete(h.entries, i, i+1)
	err := h.saveLocked()
	recs := h.recs
	h.mu.Unlock()
	deleteRecordings(recs, gone)
	return err
}

// ErrUnknownHistory is a delete_history id that is not in the history.
var ErrUnknownHistory = errors.New("unknown game in the history")

// ForgetRecording removes a deleted recording from the game it belongs to.
func (h *HistoryService) ForgetRecording(id string) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	changed := false
	for i := range h.entries {
		n := len(h.entries[i].Recordings)
		h.entries[i].Recordings = slices.DeleteFunc(h.entries[i].Recordings, func(r RecordingInfo) bool { return r.ID == id })
		changed = changed || len(h.entries[i].Recordings) != n
	}
	if !changed {
		return nil
	}
	return h.saveLocked()
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

// Clear forgets every past game and deletes every finished recording
// (the history's and any other).
func (h *HistoryService) Clear() error {
	h.mu.Lock()
	h.entries = nil
	recs := h.recs
	h.mu.Unlock()
	if recs != nil {
		recs.DeleteAll()
	}
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
