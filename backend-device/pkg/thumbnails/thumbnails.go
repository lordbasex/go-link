// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Package thumbnails finds the host's own game images (thumbnails) and
// makes small JPEG copies to send to browsers. The images are the host's
// files: this package never downloads anything.
//
// The folder layout follows the libretro convention, one folder per kind:
//
//	<root>/Named_Boxarts/<name>.png
//	<root>/Named_Titles/<name>.png
//	<root>/Named_Snaps/<name>.png
//
// where <name> is the MAME set name (galaga) or the game title with the
// characters &*/:`<>?\|" replaced by "_" (Galaga (Namco rev. B)).
package thumbnails

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png" // PNG decoder for image.Decode
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"golang.org/x/image/draw"
)

// Kind is one type of thumbnail.
type Kind string

// The three kinds of thumbnails.
const (
	Boxart Kind = "boxart" // the box or flyer
	Title  Kind = "title"  // the title screen
	Snap   Kind = "snap"   // a screenshot while playing
)

// Kinds lists every kind, in display order.
var Kinds = []Kind{Boxart, Title, Snap}

// Folder is the folder name of a kind inside the root.
func (k Kind) Folder() string {
	switch k {
	case Title:
		return "Named_Titles"
	case Snap:
		return "Named_Snaps"
	default:
		return "Named_Boxarts"
	}
}

// Valid reports whether k is one of the known kinds.
func (k Kind) Valid() bool {
	return k == Boxart || k == Title || k == Snap
}

// MaxFileSize is the largest image accepted, from disk or dropped.
const MaxFileSize = 8 << 20

var exts = []string{".png", ".jpg", ".jpeg"}

// SafeName turns a game title into the file name libretro uses.
func SafeName(title string) string {
	return strings.Map(func(r rune) rune {
		if strings.ContainsRune("&*/:`<>?\\|\"", r) {
			return '_'
		}
		return r
	}, strings.TrimSpace(title))
}

// Find returns the image of a kind for a set, looked up by set name first
// and then by title.
func Find(root string, kind Kind, set, title string) (string, bool) {
	if root == "" || set == "" {
		return "", false
	}
	names := []string{set}
	if t := SafeName(title); t != "" && t != set {
		names = append(names, t)
	}
	dir := filepath.Join(root, kind.Folder())
	for _, n := range names {
		if strings.ContainsAny(n, `/\`) || n == "." || n == ".." {
			continue
		}
		for _, e := range exts {
			p := filepath.Join(dir, n+e)
			if fi, err := os.Stat(p); err == nil && fi.Mode().IsRegular() {
				return p, true
			}
		}
	}
	// The same game under another version: the title without what is in
	// parentheses ("X-Men Vs. Street Fighter (Euro 961004)" finds
	// "X-Men Vs. Street Fighter (Euro 960910).png").
	if base := baseTitle(SafeName(title)); base != "" {
		if p, ok := baseIndex(dir)[base]; ok {
			return p, true
		}
	}
	return "", false
}

// baseTitle is a title without its first parenthesis (region, version).
func baseTitle(s string) string {
	if i := strings.Index(s, " ("); i > 0 {
		return s[:i]
	}
	return s
}

// dirIndex maps base titles to a picture of a folder, rebuilt when the
// folder changes: a folder can hold thousands of pictures, and the library
// asks for every set.
type dirIndex struct {
	mod    time.Time
	byBase map[string]string
}

var (
	indexMu sync.Mutex
	indexes = map[string]dirIndex{}
)

func baseIndex(dir string) map[string]string {
	fi, err := os.Stat(dir)
	if err != nil || !fi.IsDir() {
		return nil
	}
	indexMu.Lock()
	defer indexMu.Unlock()
	if idx, ok := indexes[dir]; ok && idx.mod.Equal(fi.ModTime()) {
		return idx.byBase
	}
	entries, err := os.ReadDir(dir) // sorted by name: "X.png" before "X (…).png"
	if err != nil {
		return nil
	}
	byBase := map[string]string{}
	for _, e := range entries {
		if !e.Type().IsRegular() {
			continue
		}
		name := e.Name()
		ext := filepath.Ext(name)
		if !slices.Contains(exts, ext) {
			continue
		}
		b := baseTitle(strings.TrimSuffix(name, ext))
		if _, taken := byBase[b]; !taken {
			byBase[b] = filepath.Join(dir, name)
		}
	}
	indexes[dir] = dirIndex{mod: fi.ModTime(), byBase: byBase}
	return byBase
}

// Has reports which kinds exist for a set.
func Has(root, set, title string) map[Kind]bool {
	out := make(map[Kind]bool, len(Kinds))
	for _, k := range Kinds {
		_, out[k] = Find(root, k, set, title)
	}
	return out
}

// ErrNotImage means a file is not a PNG or JPEG image.
var ErrNotImage = errors.New("thumbnails: not a PNG or JPEG image")

// MaxPixels is the largest picture accepted, per side: covers and
// screenshots are far smaller, and decoding a bigger one could exhaust the
// memory of a small device (a Raspberry Pi).
const MaxPixels = 4096

// ErrTooLarge means the picture is bigger than MaxPixels on a side.
var ErrTooLarge = fmt.Errorf("thumbnails: picture larger than %dx%d", MaxPixels, MaxPixels)

func checkPixels(cfg image.Config) error {
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width > MaxPixels || cfg.Height > MaxPixels {
		return ErrTooLarge
	}
	return nil
}

// Import saves an image the host dropped, as <root>/<kind folder>/<name>.
// name is the file's own name (galaga.png); a file already there is
// replaced, since the host is choosing a new picture.
func Import(root string, kind Kind, name string, r io.Reader) (string, error) {
	if !kind.Valid() {
		return "", fmt.Errorf("thumbnails: unknown kind %q", kind)
	}
	base := filepath.Base(name)
	ext := strings.ToLower(filepath.Ext(base))
	if base != name || base == "." || (ext != ".png" && ext != ".jpg" && ext != ".jpeg") {
		return "", ErrNotImage
	}
	data, err := io.ReadAll(io.LimitReader(r, MaxFileSize+1))
	if err != nil {
		return "", err
	}
	if len(data) > MaxFileSize {
		return "", fmt.Errorf("thumbnails: %s is larger than %d MB", name, MaxFileSize>>20)
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return "", ErrNotImage
	}
	if err := checkPixels(cfg); err != nil {
		return "", err
	}
	dir := filepath.Join(root, kind.Folder())
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	tmp, err := os.CreateTemp(dir, ".import-*")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}
	if err := os.Chmod(tmp.Name(), 0o644); err != nil {
		return "", err
	}
	dst := filepath.Join(dir, base)
	return dst, os.Rename(tmp.Name(), dst)
}

// Small returns a JPEG copy of the image that fits in maxW x maxH, never
// larger than the original, and no bigger than maxBytes when maxBytes > 0
// (quality drops step by step to fit). Results are cached by file, size
// and modification time.
func (c *Cache) Small(path string, maxW, maxH, maxBytes int) ([]byte, error) {
	fi, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if fi.Size() > MaxFileSize {
		return nil, fmt.Errorf("thumbnails: %s is too large", filepath.Base(path))
	}
	key := fmt.Sprintf("%s|%d|%d|%d|%d|%d", path, maxW, maxH, maxBytes, fi.Size(), fi.ModTime().UnixNano())
	c.mu.Lock()
	if b, ok := c.items[key]; ok {
		c.mu.Unlock()
		return b, nil
	}
	c.mu.Unlock()

	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return c.small(key, f, maxW, maxH, maxBytes)
}

// SmallBytes is Small for a picture held in memory (go-link's own sets
// ship theirs inside the device); key names it in the cache.
func (c *Cache) SmallBytes(key string, data []byte, maxW, maxH, maxBytes int) ([]byte, error) {
	if len(data) > MaxFileSize {
		return nil, fmt.Errorf("thumbnails: %s is too large", key)
	}
	key = fmt.Sprintf("%s|%d|%d|%d|%d", key, maxW, maxH, maxBytes, len(data))
	c.mu.Lock()
	if b, ok := c.items[key]; ok {
		c.mu.Unlock()
		return b, nil
	}
	c.mu.Unlock()
	return c.small(key, bytes.NewReader(data), maxW, maxH, maxBytes)
}

// small decodes a picture, scales it down and caches the JPEG under key.
func (c *Cache) small(key string, f io.ReadSeeker, maxW, maxH, maxBytes int) ([]byte, error) {
	// Check the size first: a small file can declare a huge picture, and
	// decoding it would take gigabytes (images copied into the folder by
	// hand never went through Import).
	cfg, _, err := image.DecodeConfig(io.LimitReader(f, MaxFileSize))
	if err != nil {
		return nil, ErrNotImage
	}
	if err := checkPixels(cfg); err != nil {
		return nil, err
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	src, _, err := image.Decode(io.LimitReader(f, MaxFileSize))
	if err != nil {
		return nil, ErrNotImage
	}
	b := src.Bounds()
	w, h := fit(b.Dx(), b.Dy(), maxW, maxH)
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, b, draw.Src, nil)
	var out []byte
	for _, q := range []int{82, 70, 58, 46, 34} {
		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: q}); err != nil {
			return nil, err
		}
		out = buf.Bytes()
		if maxBytes <= 0 || len(out) <= maxBytes {
			break
		}
	}
	if maxBytes > 0 && len(out) > maxBytes {
		return nil, fmt.Errorf("thumbnails: the picture does not fit in %d bytes", maxBytes)
	}
	c.mu.Lock()
	if len(c.items) >= c.max {
		c.items = map[string][]byte{} // simple and bounded: start over
	}
	c.items[key] = out
	c.mu.Unlock()
	return out, nil
}

// fit scales w x h down to fit maxW x maxH, keeping the aspect ratio.
func fit(w, h, maxW, maxH int) (int, int) {
	if w <= 0 || h <= 0 {
		return 1, 1
	}
	scale := 1.0
	if maxW > 0 && w > maxW {
		scale = float64(maxW) / float64(w)
	}
	if maxH > 0 && float64(h)*scale > float64(maxH) {
		scale = float64(maxH) / float64(h)
	}
	nw, nh := int(float64(w)*scale+0.5), int(float64(h)*scale+0.5)
	return max(nw, 1), max(nh, 1)
}

// Cache keeps recently made small copies in memory.
type Cache struct {
	mu    sync.Mutex
	items map[string][]byte
	max   int
}

// NewCache makes a cache that holds up to n images.
func NewCache(n int) *Cache {
	if n <= 0 {
		n = 256
	}
	return &Cache{items: map[string][]byte{}, max: n}
}

// Stats counts, for a list of sets, how many have each kind.
func Stats(root string, sets []struct{ Name, Title string }) map[Kind]int {
	out := map[Kind]int{}
	for _, s := range sets {
		for k, ok := range Has(root, s.Name, s.Title) {
			if ok {
				out[k]++
			}
		}
	}
	return out
}

// Size adds up the bytes of the images in the kind folders of root.
func Size(root string) int64 {
	if root == "" {
		return 0
	}
	var total int64
	for _, k := range Kinds {
		entries, _ := os.ReadDir(filepath.Join(root, k.Folder()))
		for _, e := range entries {
			if e.IsDir() || !isImage(e.Name()) {
				continue
			}
			if info, err := e.Info(); err == nil {
				total += info.Size()
			}
		}
	}
	return total
}

func isImage(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	for _, e := range exts {
		if ext == e {
			return true
		}
	}
	return false
}
