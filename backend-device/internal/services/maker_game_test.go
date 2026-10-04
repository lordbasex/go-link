// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestTheWillyMakerGameLivesApartFromTheROMs(t *testing.T) {
	roms, maker := t.TempDir(), t.TempDir()
	lib := NewLibraryService(roms, NewStatusService(deviceID, "test", "ws://x", roms), slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err := lib.CheckMakerUpload("slammast.zip", 10); err == nil {
		t.Fatal("a device without the folder took a game")
	}
	lib.SetMakerDir(maker)
	if lib.HasRom(MakerRom) {
		t.Fatal("no game was sent yet")
	}
	for _, bad := range []struct {
		name string
		size int64
	}{{"robby.zip", 10}, {"slammast.zip", 0}, {"slammast.zip", RomTestMaxSize + 1}} {
		if lib.CheckMakerUpload(bad.name, bad.size) == nil {
			t.Fatalf("took %s of %d bytes", bad.name, bad.size)
		}
	}
	if err := lib.CheckMakerUpload("slammast.zip", 10); err != nil {
		t.Fatal(err)
	}
	if err := lib.StoreMaker(strings.NewReader("hello")); err == nil {
		t.Fatal("stored a file that is not a zip")
	}
	for _, body := range []string{"PK\x03\x04first", "PK\x03\x04second"} {
		if err := lib.StoreMaker(strings.NewReader(body)); err != nil {
			t.Fatal(err)
		}
		if b, _ := os.ReadFile(lib.RomPath(MakerRom)); string(b) != body {
			t.Fatalf("the game is %q", b)
		}
	}
	if lib.RomPath(MakerRom) != filepath.Join(maker, "slammast.zip") || !lib.HasRom(MakerRom) {
		t.Fatalf("the game is at %s", lib.RomPath(MakerRom))
	}
	if _, err := os.Stat(filepath.Join(roms, "slammast.zip")); !os.IsNotExist(err) {
		t.Fatal("the game went into the ROM folder")
	}
	if got := lib.Maker(); got.Title != "Willy Maker" || got.Players != 4 {
		t.Fatalf("default %+v", got)
	}
	if err := lib.SetMakerInfo(MakerInfo{Title: " My street ", Players: 9, Labels: []string{"Punch", "Hop", "C", "D"}}); err != nil {
		t.Fatal(err)
	}
	if got := lib.Maker(); got.Title != "My street" || got.Players != 4 || !reflect.DeepEqual(got.Labels, []string{"Punch", "Hop", "C"}) {
		t.Fatalf("info %+v", got)
	}
	if lib.Title(MakerRom) != "My street" {
		t.Fatalf("title %q", lib.Title(MakerRom))
	}
}

func TestAWillyMakerUploadGoesToItsFolder(t *testing.T) {
	roms := t.TempDir()
	lib := NewLibraryService(roms, NewStatusService(deviceID, "test", "ws://x", roms), slog.New(slog.NewTextHandler(io.Discard, nil)))
	lib.SetMakerDir(t.TempDir())
	var replies []FileReply
	up := NewUploadService(lib, func(_ string, r FileReply) { replies = append(replies, r) })
	up.SetMaker(lib)
	body := "PK\x03\x04game"
	up.Handle("p", true, []byte(`{"type":"begin","id":"m1","name":"slammast.zip","size":8,"purpose":"maker"}`))
	up.Handle("p", false, []byte(body))
	up.Handle("p", true, []byte(`{"type":"end","id":"m1"}`))
	if len(replies) != 1 || !replies[0].OK {
		t.Fatalf("replies %+v", replies)
	}
	if b, _ := os.ReadFile(lib.RomPath(MakerRom)); string(b) != body {
		t.Fatalf("stored %q", b)
	}
	if _, err := os.Stat(filepath.Join(roms, "slammast.zip")); !os.IsNotExist(err) {
		t.Fatal("the game went into the ROM folder")
	}
}

func TestAWillyMakerGameHasOneRoom(t *testing.T) {
	h := newRoomsHarness(t, 4, nil)
	h.lib.SetMakerDir(t.TempDir())
	open := func(roomID, title string) GameReply {
		t.Helper()
		if err := h.lib.StoreMaker(strings.NewReader("PK\x03\x04" + title)); err != nil {
			t.Fatal(err)
		}
		replies := make(chan GameReply, 1)
		opens := h.sender.count("room_open")
		req := GameRequest{Rom: MakerRom, Title: title, Maker: &MakerInfo{Title: title, Players: 2, Labels: []string{"Punch", "Hop"}}}
		if err := h.rooms.Create(req, func(r GameReply) { replies <- r }); err != nil {
			t.Fatal(err)
		}
		eventually(t, "room_open", func() bool { return h.sender.count("room_open") > opens })
		h.answerOpen(roomID)
		select {
		case r := <-replies:
			return r
		case <-time.After(3 * time.Second):
			t.Fatal("no reply")
			return GameReply{}
		}
	}
	first := open("R1", "My street")
	if first.Type != "room_created" || first.Title != "My street" {
		t.Fatalf("reply %+v", first)
	}
	if got := h.rooms.controlsOf(MakerRom); got.Players != 2 || got.Buttons != 2 || !reflect.DeepEqual(got.Labels, []string{"Punch", "Hop"}) {
		t.Fatalf("controls %+v", got)
	}
	// a robby room stays; a new Willy Maker game replaces only its own room
	h.create("robby", "R2")
	second := open("R3", "My street v2")
	var maker, others int
	for _, r := range h.rooms.List() {
		if r.Rom == MakerRom {
			maker++
			if r.ID != second.ID || r.RoomID != "R3" {
				t.Fatalf("the Willy Maker room is %+v", r)
			}
		} else {
			others++
		}
	}
	if maker != 1 || others != 1 {
		t.Fatalf("%d Willy Maker rooms and %d others", maker, others)
	}
}
