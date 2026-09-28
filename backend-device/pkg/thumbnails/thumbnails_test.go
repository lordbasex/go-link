// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package thumbnails

import (
	"bytes"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func pngBytes(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{uint8(x), uint8(y), 200, 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestFindBySetOrTitle(t *testing.T) {
	root := t.TempDir()
	if _, err := Import(root, Boxart, "galaga.png", bytes.NewReader(pngBytes(t, 30, 40))); err != nil {
		t.Fatal(err)
	}
	if _, err := Import(root, Title, "Cadillacs and Dinosaurs _World 930201_.png", bytes.NewReader(pngBytes(t, 30, 40))); err != nil {
		t.Fatal(err)
	}
	if p, ok := Find(root, Boxart, "galaga", "Galaga (Namco rev. B)"); !ok || filepath.Base(p) != "galaga.png" {
		t.Fatalf("by set: %q %v", p, ok)
	}
	if _, ok := Find(root, Title, "dino", "Cadillacs and Dinosaurs (World 930201)"); ok {
		t.Fatal("parentheses are kept by libretro, so this title must not match")
	}
	if SafeName(`Rock: n' Roll / "Live"?`) != `Rock_ n' Roll _ _Live__` {
		t.Fatalf("safe name = %q", SafeName(`Rock: n' Roll / "Live"?`))
	}
	has := Has(root, "galaga", "")
	if !has[Boxart] || has[Title] || has[Snap] {
		t.Fatalf("has = %v", has)
	}
}

func TestImportRejectsNonImages(t *testing.T) {
	root := t.TempDir()
	if _, err := Import(root, Boxart, "galaga.png", strings.NewReader("not an image")); err != ErrNotImage {
		t.Fatalf("err = %v", err)
	}
	if _, err := Import(root, Boxart, "../evil.png", bytes.NewReader(pngBytes(t, 4, 4))); err != ErrNotImage {
		t.Fatalf("path traversal err = %v", err)
	}
	if _, err := Import(root, Kind("x"), "a.png", bytes.NewReader(pngBytes(t, 4, 4))); err == nil {
		t.Fatal("unknown kind must fail")
	}
}

func TestSmallFitsAndCaches(t *testing.T) {
	root := t.TempDir()
	p, err := Import(root, Boxart, "big.png", bytes.NewReader(pngBytes(t, 300, 400)))
	if err != nil {
		t.Fatal(err)
	}
	c := NewCache(4)
	b, err := c.Small(p, 120, 160, 0)
	if err != nil {
		t.Fatal(err)
	}
	img, err := jpeg.Decode(bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	if img.Bounds().Dx() != 120 || img.Bounds().Dy() != 160 {
		t.Fatalf("size = %v", img.Bounds())
	}
	again, _ := c.Small(p, 120, 160, 0)
	if &again[0] != &b[0] {
		t.Fatal("second call must come from the cache")
	}
	tiny, err := c.Small(p, 64, 86, 3000)
	if err != nil || len(tiny) > 3000 {
		t.Fatalf("tiny = %d bytes, %v", len(tiny), err)
	}
	if _, err := os.Stat(filepath.Join(root, "Named_Boxarts", "big.png")); err != nil {
		t.Fatal(err)
	}
}

func TestFit(t *testing.T) {
	if w, h := fit(100, 50, 200, 200); w != 100 || h != 50 {
		t.Fatalf("never enlarges: %d x %d", w, h)
	}
	if w, h := fit(400, 300, 200, 200); w != 200 || h != 150 {
		t.Fatalf("fit = %d x %d", w, h)
	}
}

func TestSizeCountsOnlyImagesInKindFolders(t *testing.T) {
	root := t.TempDir()
	write := func(rel string, n int) {
		p := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, make([]byte, n), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("Named_Boxarts/galaga.png", 100)
	write("Named_Titles/Galaga (Namco rev. B).PNG", 20)
	write("Named_Snaps/rygar.jpg", 3)
	write("Named_Snaps/notes.txt", 1000)
	write("Other/galaga.png", 1000)
	if got := Size(root); got != 123 {
		t.Fatalf("Size = %d, want 123", got)
	}
	if got := Size(""); got != 0 {
		t.Fatalf("Size of no folder = %d", got)
	}
}

// hugePNG is a few bytes that declare a 30000x30000 picture.
func hugePNG() []byte {
	var buf bytes.Buffer
	buf.Write([]byte("\x89PNG\r\n\x1a\n"))
	ihdr := make([]byte, 13)
	binary.BigEndian.PutUint32(ihdr[0:], 30000)
	binary.BigEndian.PutUint32(ihdr[4:], 30000)
	ihdr[8], ihdr[9] = 8, 2 // 8 bit RGB
	_ = binary.Write(&buf, binary.BigEndian, uint32(len(ihdr)))
	chunk := append([]byte("IHDR"), ihdr...)
	buf.Write(chunk)
	_ = binary.Write(&buf, binary.BigEndian, crc32.ChecksumIEEE(chunk))
	return buf.Bytes()
}

func TestHugePicturesAreRefusedBeforeDecoding(t *testing.T) {
	root := t.TempDir()
	if _, err := Import(root, Boxart, "bomb.png", bytes.NewReader(hugePNG())); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("import: %v", err)
	}
	// One copied into the folder by hand is refused when it is shown.
	path := filepath.Join(root, "bomb.png")
	if err := os.WriteFile(path, hugePNG(), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := NewCache(10).Small(path, 96, 128, 0); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("small: %v", err)
	}
}

func TestFindTakesTheSameGameUnderAnotherVersion(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, string(Boxart.Folder()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	write := func(name string) {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("X-Men Vs. Street Fighter (Euro 960910).png")
	got, ok := Find(root, Boxart, "xmvsf", "X-Men Vs. Street Fighter (Euro 961004)")
	if !ok || filepath.Base(got) != "X-Men Vs. Street Fighter (Euro 960910).png" {
		t.Fatalf("Find = %q, %v", got, ok)
	}
	// The exact title still wins, and a title without a version too.
	write("X-Men Vs. Street Fighter (Euro 961004).png")
	if got, _ := Find(root, Boxart, "xmvsf", "X-Men Vs. Street Fighter (Euro 961004)"); filepath.Base(got) != "X-Men Vs. Street Fighter (Euro 961004).png" {
		t.Fatalf("exact title lost: %q", got)
	}
	if _, ok := Find(root, Boxart, "zzz", "Another Game (World)"); ok {
		t.Fatal("another game matched")
	}
}
