// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"encoding/json"
	"errors"
	"io"
	"sync"
)

// FileReply is sent back on the control channel after an upload.
type FileReply struct {
	Type  string `json:"type"` // "upload_result"
	ID    string `json:"id"`
	Name  string `json:"name"`
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
	// Code names an error the web translates ("not_rom": a project or AI pack, T-21).
	Code string `json:"code,omitempty"`
}

// errorCode is the translatable code of an upload error, or "".
func errorCode(err error) string {
	if errors.Is(err, ErrNotRom) {
		return "not_rom"
	}
	return ""
}

// Importer is what the uploads need from the library.
type Importer interface {
	CheckImportName(fileName string) (string, error)
	Import(fileName string, r io.Reader) error
}

// TestImporter keeps a set sent for a ROM test (RomTestService), apart
// from the library.
type TestImporter interface {
	CheckTestUpload(id, fileName string, size int64) error
	StoreTest(id, fileName string, r io.Reader) error
}

// MakerImporter keeps the game Willy Maker sends (purpose "maker"), apart
// from the library.
type MakerImporter interface {
	CheckMakerUpload(name string, size int64) error
	StoreMaker(r io.Reader) error
}

// UploadService receives ROM files from the owner's browser on the
// "files" DataChannel, straight over WebRTC: no web server involved.
//
// Protocol, per file, in order on the channel:
//
//	text   {"type":"begin","id":"…","name":"robby.zip","size":27915}
//	binary chunks of the file
//	text   {"type":"end","id":"…"}
//
// With "purpose":"rom_test" in begin, the file is a set to power on with
// rom_test: it goes to the ROM test's folder (never the ROM folder, never
// the library). With "purpose":"maker" it is the game Willy Maker made
// (slammast.zip), kept in its own folder for the room of MakerRom. The device answers with upload_result on the control
// channel.
type UploadService struct {
	lib   Importer
	tests TestImporter  // nil: tests are refused
	maker MakerImporter // nil: Willy Maker games are refused
	reply func(peerID string, r FileReply)

	mu      sync.Mutex
	current map[string]*upload // by peer
}

type upload struct {
	id, name string
	size     int64
	received int64
	pw       *io.PipeWriter
	done     chan error
	failed   error
}

// NewUploadService builds the service.
func NewUploadService(lib Importer, reply func(peerID string, r FileReply)) *UploadService {
	return &UploadService{lib: lib, reply: reply, current: make(map[string]*upload)}
}

// SetTests accepts uploads for ROM tests.
func (u *UploadService) SetTests(t TestImporter) { u.tests = t }

// SetMaker accepts the games Willy Maker sends.
func (u *UploadService) SetMaker(m MakerImporter) { u.maker = m }

type fileControl struct {
	Type    string `json:"type"`
	ID      string `json:"id"`
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	Purpose string `json:"purpose,omitempty"` // "" (the library), "rom_test" or "maker"
}

// Handle processes one message of the files channel.
func (u *UploadService) Handle(peerID string, isString bool, data []byte) {
	if !isString {
		u.chunk(peerID, data)
		return
	}
	var msg fileControl
	if json.Unmarshal(data, &msg) != nil {
		return
	}
	switch msg.Type {
	case "begin":
		u.begin(peerID, msg)
	case "end":
		u.end(peerID, msg.ID)
	}
}

func (u *UploadService) begin(peerID string, msg fileControl) {
	u.abort(peerID, errors.New("replaced by a new upload"))
	check := func() error { _, err := u.lib.CheckImportName(msg.Name); return err }
	store := func(r io.Reader) error { return u.lib.Import(msg.Name, r) }
	maxSize := int64(MaxImportSize)
	switch msg.Purpose {
	case "":
	case "rom_test":
		check = func() error {
			if u.tests == nil {
				return errors.New("this device cannot test ROMs")
			}
			return u.tests.CheckTestUpload(msg.ID, msg.Name, msg.Size)
		}
		store = func(r io.Reader) error { return u.tests.StoreTest(msg.ID, msg.Name, r) }
		maxSize = RomTestMaxSize
	case "maker":
		check = func() error {
			if u.maker == nil {
				return errors.New("this device cannot keep Willy Maker games")
			}
			return u.maker.CheckMakerUpload(msg.Name, msg.Size)
		}
		store = func(r io.Reader) error { return u.maker.StoreMaker(r) }
		maxSize = RomTestMaxSize
	default:
		check = func() error { return errors.New("unknown upload purpose") }
	}
	if err := check(); err != nil {
		u.reply(peerID, FileReply{Type: "upload_result", ID: msg.ID, Name: msg.Name, Error: err.Error(), Code: errorCode(err)})
		u.mu.Lock()
		u.current[peerID] = &upload{id: msg.ID, name: msg.Name, failed: err} // swallow its chunks
		u.mu.Unlock()
		return
	}
	if msg.Size <= 0 || msg.Size > maxSize {
		err := ErrBadRom
		u.reply(peerID, FileReply{Type: "upload_result", ID: msg.ID, Name: msg.Name, Error: err.Error(), Code: errorCode(err)})
		u.mu.Lock()
		u.current[peerID] = &upload{id: msg.ID, name: msg.Name, failed: err}
		u.mu.Unlock()
		return
	}
	pr, pw := io.Pipe()
	up := &upload{id: msg.ID, name: msg.Name, size: msg.Size, pw: pw, done: make(chan error, 1)}
	go func() {
		err := store(pr)
		_ = pr.CloseWithError(err) // unblock the writer if Import stopped early
		up.done <- err
	}()
	u.mu.Lock()
	u.current[peerID] = up
	u.mu.Unlock()
}

func (u *UploadService) chunk(peerID string, data []byte) {
	u.mu.Lock()
	up := u.current[peerID]
	u.mu.Unlock()
	if up == nil || up.failed != nil || up.pw == nil {
		return
	}
	up.received += int64(len(data))
	if up.received > up.size {
		up.failed = ErrBadRom
		_ = up.pw.CloseWithError(ErrBadRom)
		return
	}
	if _, err := up.pw.Write(data); err != nil {
		up.failed = err
	}
}

func (u *UploadService) end(peerID, id string) {
	u.mu.Lock()
	up := u.current[peerID]
	delete(u.current, peerID)
	u.mu.Unlock()
	if up == nil || up.id != id || up.pw == nil {
		return // unknown, or already answered at begin
	}
	var err error
	if up.received != up.size {
		err = errors.New("the file arrived incomplete")
		_ = up.pw.CloseWithError(err)
		<-up.done
	} else {
		_ = up.pw.Close()
		err = <-up.done
	}
	r := FileReply{Type: "upload_result", ID: up.id, Name: up.name, OK: err == nil}
	if err != nil {
		r.Error = err.Error()
		r.Code = errorCode(err)
	}
	u.reply(peerID, r)
}

// Abort drops an unfinished upload (the peer left).
func (u *UploadService) Abort(peerID string) { u.abort(peerID, errors.New("connection closed")) }

func (u *UploadService) abort(peerID string, reason error) {
	u.mu.Lock()
	up := u.current[peerID]
	delete(u.current, peerID)
	u.mu.Unlock()
	if up != nil && up.pw != nil {
		_ = up.pw.CloseWithError(reason)
		<-up.done
	}
}
