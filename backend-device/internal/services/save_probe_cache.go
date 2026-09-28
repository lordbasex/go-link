// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// SaveProbeCache remembers ProbeSaves by ROM, for one version of the core:
// a new core (maybe one that saves more) tests every game again. It lives
// in a JSON file next to the core, and runs one probe per ROM at a time.
type SaveProbeCache struct {
	path  string // the JSON file
	core  func() (corePath string)
	probe func(ctx context.Context, corePath, rom string) (bool, error)

	mu      sync.Mutex
	entries map[string]saveProbeEntry
	busy    map[string]*sync.Mutex
}

type saveProbeEntry struct {
	OK   bool   `json:"ok"`
	Core string `json:"core"` // the core's SHA-256 when it was tested
}

// NewSaveProbeCache loads path (a missing or broken file is an empty cache).
// probe tests one ROM with the core at corePath.
func NewSaveProbeCache(path string, core func() string, probe func(ctx context.Context, corePath, rom string) (bool, error)) *SaveProbeCache {
	c := &SaveProbeCache{path: path, core: core, probe: probe, entries: map[string]saveProbeEntry{}, busy: map[string]*sync.Mutex{}}
	if b, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(b, &c.entries)
	}
	return c
}

// coreID is the core's recorded SHA-256 (written when it was downloaded).
func coreID(corePath string) string {
	b, err := os.ReadFile(corePath + ".sha256")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

// SavesWork answers from the cache, or probes the ROM (a few seconds).
func (c *SaveProbeCache) SavesWork(ctx context.Context, rom string) (bool, error) {
	corePath := c.core()
	id := coreID(corePath)
	c.mu.Lock()
	lock := c.busy[rom]
	if lock == nil {
		lock = &sync.Mutex{}
		c.busy[rom] = lock
	}
	c.mu.Unlock()
	lock.Lock() // one probe per ROM: a second caller waits for the answer
	defer lock.Unlock()
	c.mu.Lock()
	e, ok := c.entries[rom]
	c.mu.Unlock()
	if ok && id != "" && e.Core == id {
		return e.OK, nil
	}
	works, err := c.probe(ctx, corePath, rom)
	if err != nil {
		return false, err
	}
	c.mu.Lock()
	c.entries[rom] = saveProbeEntry{OK: works, Core: id}
	b, _ := json.MarshalIndent(c.entries, "", "  ")
	c.mu.Unlock()
	if id != "" {
		_ = os.MkdirAll(filepath.Dir(c.path), 0o755)
		_ = os.WriteFile(c.path, b, 0o644)
	}
	return works, nil
}
