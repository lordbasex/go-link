// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Package ownsets knows the ROM sets go-link made itself. They are laid out
// as a set of the core's driver list (the stock core only runs those), so
// by name they look like that original game. The device tells them apart
// by the SHA-256 of every file inside the zip, never by a name and never by
// the zip's own hash (its entry timestamps change on every build). The list
// is written by rom/tools/ownsets.mjs, which build.mjs runs after every
// build, and embedded here.
package ownsets

import (
	"archive/zip"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

//go:embed sets.json art
var embedded embed.FS

// File is one file inside a go-link set.
type File struct {
	Name   string `json:"name"` // lower case, no folder
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

// Set is one go-link set.
type Set struct {
	ID          string   `json:"id"`
	Set         string   `json:"set"` // the core's set it is laid out as (the zip's name)
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Year        string   `json:"year"`
	Maker       string   `json:"maker"`
	Players     int      `json:"players"`
	Buttons     int      `json:"buttons"`
	Control     string   `json:"control"`
	Labels      []string `json:"labels"` // what each button does, button 1 first
	Art         string   `json:"art"`    // a picture in art/, or ""
	Files       []File   `json:"files"`
}

type list struct {
	Format int   `json:"format"`
	Sets   []Set `json:"sets"`
}

var (
	loadOnce sync.Once
	sets     []Set
)

// All returns the embedded list.
func All() []Set {
	loadOnce.Do(func() {
		b, err := embedded.ReadFile("sets.json")
		if err != nil {
			return
		}
		var l list
		if json.Unmarshal(b, &l) == nil {
			sets = l.Sets
		}
	})
	return sets
}

// Picture returns the set's picture (PNG), if it ships one.
func (s *Set) Picture() ([]byte, bool) {
	if s == nil || s.Art == "" {
		return nil, false
	}
	b, err := embedded.ReadFile("art/" + s.Art)
	return b, err == nil
}

// PictureKey identifies the picture for caches.
func (s *Set) PictureKey() string { return "ownsets:" + s.ID + ":" + s.Art }

// maxFile bounds what is read of one file inside a zip: a go-link set's
// files are a few MB, and sizes are compared before reading anything.
const maxFile = 64 << 20

// Match tells whether the zip at path is a go-link set: every file inside
// it, and only those, has the size and SHA-256 of one entry of list. The
// zip's name only picks the candidates (the core finds a game by it); the
// files decide. nil when it is not one.
func Match(path string, list []Set) (*Set, error) {
	name := strings.ToLower(strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)))
	var cands []*Set
	for i := range list {
		if list[i].Set == name && len(list[i].Files) > 0 {
			cands = append(cands, &list[i])
		}
	}
	if len(cands) == 0 {
		return nil, nil
	}
	zr, err := zip.OpenReader(path)
	if err != nil {
		return nil, err
	}
	defer zr.Close()
	files := map[string]*zip.File{}
	for _, f := range zr.File {
		if f.FileInfo().IsDir() {
			continue
		}
		n := strings.ToLower(f.Name)
		if i := strings.LastIndexByte(n, '/'); i >= 0 {
			n = n[i+1:]
		}
		if _, dup := files[n]; dup {
			return nil, nil // two files of one name: not ours
		}
		files[n] = f
	}
	hashes := map[string]string{} // computed once per file
	for _, s := range cands {
		if same(s, files, hashes) {
			return s, nil
		}
	}
	return nil, nil
}

func same(s *Set, files map[string]*zip.File, hashes map[string]string) bool {
	if len(files) != len(s.Files) {
		return false
	}
	for _, want := range s.Files {
		f := files[want.Name]
		if f == nil || int64(f.UncompressedSize64) != want.Size || want.Size > maxFile {
			return false
		}
	}
	for _, want := range s.Files {
		h, ok := hashes[want.Name]
		if !ok {
			h = hashFile(files[want.Name], want.Size)
			hashes[want.Name] = h
		}
		if h == "" || h != want.SHA256 {
			return false
		}
	}
	return true
}

func hashFile(f *zip.File, size int64) string {
	rc, err := f.Open()
	if err != nil {
		return ""
	}
	defer rc.Close()
	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(rc, size+1))
	if err != nil || n != size {
		return ""
	}
	return hex.EncodeToString(h.Sum(nil))
}

// Matcher remembers the answer for each zip until it changes on disk
// (size or modification time), so a library rescan hashes nothing new.
type Matcher struct {
	list []Set
	mu   sync.Mutex
	seen map[string]matchEntry
}

type matchEntry struct {
	size int64
	mod  time.Time
	set  *Set
}

// NewMatcher matches against list (All() when nil).
func NewMatcher(list []Set) *Matcher {
	if list == nil {
		list = All()
	}
	return &Matcher{list: list, seen: map[string]matchEntry{}}
}

// Match is Match with the cache. Unreadable zips are never ours.
func (m *Matcher) Match(path string) *Set {
	fi, err := os.Stat(path)
	if err != nil {
		return nil
	}
	m.mu.Lock()
	e, ok := m.seen[path]
	m.mu.Unlock()
	if ok && e.size == fi.Size() && e.mod.Equal(fi.ModTime()) {
		return e.set
	}
	s, _ := Match(path, m.list)
	m.mu.Lock()
	if len(m.seen) > 4096 {
		m.seen = map[string]matchEntry{}
	}
	m.seen[path] = matchEntry{size: fi.Size(), mod: fi.ModTime(), set: s}
	m.mu.Unlock()
	return s
}
