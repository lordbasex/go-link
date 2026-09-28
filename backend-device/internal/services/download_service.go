// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"os"
	"sync"
	"time"
)

// Download limits.
const (
	// MaxDownloadChunk is the most a single read returns (plus the 8 byte
	// offset), under the 64 KiB every WebRTC stack takes in one message.
	MaxDownloadChunk = 60 << 10
	// downloadIdle closes a download nobody reads anymore.
	downloadIdle = 2 * time.Minute
)

// DownloadService sends the host's recordings to their linked browser on
// the "files" DataChannel, straight over WebRTC. The browser pulls the
// file piece by piece, so it sets the pace, keeps as many reads in flight
// as it likes, shows the progress, can stop at any time, and checks the
// whole file with the SHA-256 it got at the start.
//
// Protocol (text messages are JSON):
//
//	browser  {"type":"download","id":"t1","file":"<recording id>"}
//	device   {"type":"download_ready","id":"t1","file":"…","name":"x.webm","size":123,"sha256":"…"}
//	browser  {"type":"read","id":"t1","offset":0,"length":61440}
//	device   binary: offset (8 bytes, big endian) + up to length bytes
//	browser  {"type":"done","id":"t1"} or {"type":"cancel","id":"t1"}
//	device   {"type":"download_error","id":"t1","error":"…","code":"…"} on any failure
//
// One download per browser at a time: a new one replaces the last.
type DownloadService struct {
	recs *RecordingService
	send func(peerID string, isString bool, data []byte) bool

	mu      sync.Mutex
	current map[string]*download // by peer
}

type download struct {
	id    string
	file  *os.File
	size  int64
	timer *time.Timer
}

// NewDownloadService builds the service. send writes on a browser's files
// channel.
func NewDownloadService(recs *RecordingService, send func(peerID string, isString bool, data []byte) bool) *DownloadService {
	return &DownloadService{recs: recs, send: send, current: map[string]*download{}}
}

type downloadMsg struct {
	Type   string `json:"type"`
	ID     string `json:"id"`
	File   string `json:"file"`
	Offset int64  `json:"offset"`
	Length int    `json:"length"`
}

type downloadReady struct {
	Type   string `json:"type"` // download_ready
	ID     string `json:"id"`
	File   string `json:"file"`
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

type downloadError struct {
	Type  string `json:"type"` // download_error
	ID    string `json:"id"`
	Error string `json:"error"`
	Code  string `json:"code,omitempty"`
}

// Handle takes a text message of the files channel. It reports false for
// messages that are not about downloads (uploads use the same channel).
func (d *DownloadService) Handle(peerID string, data []byte) bool {
	var msg downloadMsg
	if json.Unmarshal(data, &msg) != nil {
		return false
	}
	switch msg.Type {
	case "download":
		d.open(peerID, msg)
	case "read":
		d.read(peerID, msg)
	case "done", "cancel":
		d.close(peerID, msg.ID)
	default:
		return false
	}
	return true
}

func (d *DownloadService) reply(peerID string, v any) {
	if b, err := json.Marshal(v); err == nil {
		d.send(peerID, true, b)
	}
}

func (d *DownloadService) fail(peerID, id string, err error) {
	code, _ := ErrorCode(err)
	d.reply(peerID, downloadError{Type: "download_error", ID: id, Error: err.Error(), Code: code})
}

func (d *DownloadService) open(peerID string, msg downloadMsg) {
	d.Abort(peerID)
	if msg.ID == "" || d.recs == nil {
		d.fail(peerID, msg.ID, ErrUnknownRecording)
		return
	}
	f, info, err := d.recs.Open(msg.File)
	if err != nil {
		d.fail(peerID, msg.ID, err)
		return
	}
	dl := &download{id: msg.ID, file: f, size: info.Size}
	if fi, err := f.Stat(); err == nil {
		dl.size = fi.Size()
	}
	dl.timer = time.AfterFunc(downloadIdle, func() { d.close(peerID, msg.ID) })
	d.mu.Lock()
	d.current[peerID] = dl
	d.mu.Unlock()
	d.reply(peerID, downloadReady{Type: "download_ready", ID: msg.ID, File: info.ID, Name: info.File, Size: dl.size, SHA256: info.SHA256})
}

func (d *DownloadService) read(peerID string, msg downloadMsg) {
	d.mu.Lock()
	dl := d.current[peerID]
	d.mu.Unlock()
	if dl == nil || dl.id != msg.ID {
		d.fail(peerID, msg.ID, errors.New("no such download: ask for it again"))
		return
	}
	dl.timer.Reset(downloadIdle)
	if msg.Offset < 0 || msg.Offset > dl.size {
		d.fail(peerID, msg.ID, errors.New("read outside the file"))
		return
	}
	n := msg.Length
	if n <= 0 || n > MaxDownloadChunk {
		n = MaxDownloadChunk
	}
	n = int(min(int64(n), dl.size-msg.Offset))
	buf := make([]byte, 8+n)
	binary.BigEndian.PutUint64(buf, uint64(msg.Offset))
	if _, err := dl.file.ReadAt(buf[8:], msg.Offset); err != nil && !errors.Is(err, io.EOF) {
		d.fail(peerID, msg.ID, err)
		return
	}
	if !d.send(peerID, false, buf) {
		d.close(peerID, msg.ID) // the channel is gone
	}
}

func (d *DownloadService) close(peerID, id string) {
	d.mu.Lock()
	dl := d.current[peerID]
	if dl == nil || dl.id != id {
		d.mu.Unlock()
		return
	}
	delete(d.current, peerID)
	d.mu.Unlock()
	dl.timer.Stop()
	_ = dl.file.Close()
}

// Abort drops a browser's download (it left, or started another).
func (d *DownloadService) Abort(peerID string) {
	d.mu.Lock()
	dl := d.current[peerID]
	d.mu.Unlock()
	if dl != nil {
		d.close(peerID, dl.id)
	}
}
