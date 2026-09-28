// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/at-wat/ebml-go/mkvcore"
	"github.com/pion/rtp"
)

// fakeClock is a time the test moves forward.
type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func newFakeClock() *fakeClock { return &fakeClock{t: time.Date(2026, 9, 28, 21, 30, 0, 0, time.UTC)} }

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) Add(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

// Fake VP8 frames: the recorder only reads the keyframe bit.
var (
	keyFrame   = []byte{0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a}
	interFrame = []byte{0x11, 0x02, 0x00}
)

// readBlocks reads a WebM file back: the frames of each track.
func readBlocks(t *testing.T, path string) map[uint64][]int64 {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	readers, err := mkvcore.NewSimpleBlockReader(f)
	if err != nil {
		t.Fatal(err)
	}
	// The reader hands out every track at once: read them together.
	out := map[uint64][]int64{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, r := range readers {
		wg.Go(func() {
			var got []int64
			for {
				_, _, ts, err := r.Read()
				if err != nil {
					break
				}
				got = append(got, ts)
			}
			mu.Lock()
			out[r.TrackEntry().TrackNumber] = got
			mu.Unlock()
		})
	}
	wg.Wait()
	return out
}

func TestARecordingKeepsVideoGameSoundAndEachVoice(t *testing.T) {
	clock := newFakeClock()
	path := filepath.Join(t.TempDir(), "game.webm")
	rec, err := NewRecorder(RecorderConfig{Path: path, Now: clock.Now})
	if err != nil {
		t.Fatal(err)
	}
	// Before the first keyframe nothing is kept.
	rec.Video(interFrame, 320, 240)
	rec.GameAudio([]byte{1, 2, 3})
	clock.Add(10 * time.Millisecond)
	for i := range 50 {
		frame := interFrame
		if i%25 == 0 {
			frame = keyFrame
		}
		rec.Video(frame, 320, 240)
		rec.GameAudio([]byte{0xfc, byte(i)})
		if i%2 == 0 {
			// P2 talks; its RTP clock starts anywhere.
			rec.Voice(2, &rtp.Packet{Header: rtp.Header{SSRC: 7, Timestamp: 90000 + uint32(i/2)*1920}, Payload: []byte{0xf8, byte(i)}})
		}
		clock.Add(20 * time.Millisecond)
	}
	rec.Voice(5, &rtp.Packet{Payload: []byte{1}}) // not a port: ignored
	rec.Stop(RecStopped)

	dur, size, tracks, reason, err := rec.Result()
	if err != nil || reason != RecStopped {
		t.Fatalf("result err=%v reason=%q", err, reason)
	}
	if want := []string{TrackVideo, TrackGame, "voice-p2"}; !slices.Equal(tracks, want) {
		t.Fatalf("tracks %v, want %v", tracks, want)
	}
	if dur < 900*time.Millisecond || dur > time.Second {
		t.Fatalf("duration %v", dur)
	}
	if fi, _ := os.Stat(path); fi == nil || fi.Size() != size || size == 0 {
		t.Fatalf("size %d, file %v", size, fi)
	}
	blocks := readBlocks(t, path)
	if len(blocks[recTrackVideo]) != 50 || len(blocks[recTrackGame]) != 50 || len(blocks[recTrackVoice+1]) != 25 {
		t.Fatalf("blocks per track: video %d game %d voice %d", len(blocks[recTrackVideo]), len(blocks[recTrackGame]), len(blocks[recTrackVoice+1]))
	}
	if len(blocks[recTrackVoice]) != 0 {
		t.Fatal("P1 said nothing but has blocks")
	}
	// The game's sound is continuous: 20 ms apart. The voice follows its
	// own clock (1920 samples = 40 ms), placed where it arrived.
	for i, ts := range blocks[recTrackGame] {
		if ts != int64(i*20) {
			t.Fatalf("game block %d at %d ms", i, ts)
		}
	}
	for i, ts := range blocks[recTrackVoice+1] {
		if ts != int64(i*40) {
			t.Fatalf("voice block %d at %d ms", i, ts)
		}
	}
}

func TestARecordingStopsAtItsLimit(t *testing.T) {
	clock := newFakeClock()
	path := filepath.Join(t.TempDir(), "long.webm")
	limit := make(chan string, 1)
	rec, err := NewRecorder(RecorderConfig{Path: path, Now: clock.Now, MaxDur: 100 * time.Millisecond, OnLimit: func(r string) { limit <- r }})
	if err != nil {
		t.Fatal(err)
	}
	rec.Video(keyFrame, 64, 64)
	for range 20 {
		clock.Add(20 * time.Millisecond)
		rec.Video(interFrame, 64, 64)
	}
	select {
	case r := <-limit:
		if r != RecLimitTime {
			t.Fatalf("reason %q", r)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("the limit never stopped the recording")
	}
	rec.Stop(RecStopped) // too late: the limit already ended it
	if _, _, _, reason, _ := rec.Result(); reason != RecLimitTime {
		t.Fatalf("reason %q", reason)
	}
}

func TestARecordingWithoutAPictureLeavesNothing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "empty.webm")
	rec, err := NewRecorder(RecorderConfig{Path: path})
	if err != nil {
		t.Fatal(err)
	}
	rec.GameAudio([]byte{1})
	rec.Stop(RecStopped)
	if _, _, _, _, err := rec.Result(); !errors.Is(err, ErrEmptyRecording) {
		t.Fatalf("err %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("an empty recording left a file")
	}
}

// record makes a finished recording of a room with n video frames.
func record(t *testing.T, s *RecordingService, clock *fakeClock, roomID, name string, n int) RecordingInfo {
	t.Helper()
	rec, err := s.Start(roomID, name, nil)
	if err != nil {
		t.Fatal(err)
	}
	for i := range n {
		f := interFrame
		if i == 0 {
			f = append([]byte{0x10}, make([]byte, 3000)...) // a big keyframe
		}
		rec.Video(f, 320, 240)
		clock.Add(20 * time.Millisecond)
	}
	info, err := s.Finish(rec, roomID, name, RecStopped)
	if err != nil {
		t.Fatal(err)
	}
	return info
}

func TestRecordingsAreKeptDescribedListedAndDeleted(t *testing.T) {
	clock := newFakeClock()
	dir := t.TempDir()
	s := NewRecordingService(dir, clock.Now)
	info := record(t, s, clock, "a1b2", "Friday Night!", 10)
	if info.ID != "a1b2/friday-night-2026-09-28-2130.webm" || info.RoomID != "a1b2" || info.Room != "Friday Night!" || info.Reason != RecStopped {
		t.Fatalf("info %+v", info)
	}
	b, _ := os.ReadFile(filepath.Join(dir, "a1b2", info.File))
	if sum := sha256.Sum256(b); hex.EncodeToString(sum[:]) != info.SHA256 || int64(len(b)) != info.Size {
		t.Fatal("the checksum or size does not match the file")
	}
	if fi, _ := os.Stat(filepath.Join(dir, "a1b2", info.File)); fi.Mode().Perm() != 0o600 {
		t.Fatalf("permissions %v", fi.Mode().Perm())
	}
	// A second one in the same minute gets its own name.
	again := record(t, s, clock, "a1b2", "Friday Night!", 5)
	if again.File == info.File {
		t.Fatal("two recordings share a file")
	}
	if list := s.List(); len(list) != 2 {
		t.Fatalf("list %+v", list)
	}
	if got, err := s.Get(info.ID); err != nil || got.SHA256 != info.SHA256 {
		t.Fatalf("get %+v %v", got, err)
	}
	for _, bad := range []string{"../x.webm", "a1b2/../../etc.webm", "a1b2", "zz/ok.webm", "a1b2/UP.webm", ""} {
		if _, err := s.Get(bad); !errors.Is(err, ErrUnknownRecording) {
			t.Fatalf("%q: %v", bad, err)
		}
	}
	if err := s.Delete(info.ID); err != nil {
		t.Fatal(err)
	}
	if n := s.DeleteAll(); n != 1 || len(s.List()) != 0 {
		t.Fatalf("delete all %d, left %v", n, s.List())
	}
	if _, err := os.Stat(filepath.Join(dir, "a1b2")); !os.IsNotExist(err) {
		t.Fatal("the empty room folder stayed")
	}
}

func TestARecordingTheDeviceNeverClosedIsKept(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "c0ffee"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "c0ffee", "night-2026-09-28-2130.webm"), []byte("half a file"), 0o600); err != nil {
		t.Fatal(err)
	}
	s := NewRecordingService(dir, nil)
	list := s.List()
	if len(list) != 1 || list[0].Reason != RecInterrupted || list[0].Size != 11 || list[0].SHA256 == "" {
		t.Fatalf("list %+v", list)
	}
}

// downloadPeer plays the owner's browser on the files channel.
type downloadPeer struct {
	mu    sync.Mutex
	texts []map[string]any
	bins  [][]byte
	open  bool
}

func (p *downloadPeer) send(_ string, isString bool, data []byte) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if isString {
		var m map[string]any
		_ = json.Unmarshal(data, &m)
		p.texts = append(p.texts, m)
	} else {
		p.bins = append(p.bins, append([]byte(nil), data...))
	}
	return p.open
}

func (p *downloadPeer) last() map[string]any {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.texts[len(p.texts)-1]
}

func TestTheOwnerDownloadsARecordingPieceByPiece(t *testing.T) {
	clock := newFakeClock()
	s := NewRecordingService(t.TempDir(), clock.Now)
	info := record(t, s, clock, "ab", "Night", 200)
	peer := &downloadPeer{open: true}
	d := NewDownloadService(s, peer.send)

	if d.Handle("p", []byte(`{"type":"begin","id":"u","name":"robby.zip","size":3}`)) {
		t.Fatal("an upload message was taken as a download")
	}
	d.Handle("p", []byte(`{"type":"download","id":"t1","file":"`+info.ID+`"}`))
	ready := peer.last()
	if ready["type"] != "download_ready" || ready["size"] != float64(info.Size) || ready["sha256"] != info.SHA256 || ready["name"] != info.File {
		t.Fatalf("ready %v", ready)
	}
	// Pull it in 1000 byte pieces, the last one short.
	file := make([]byte, 0, info.Size)
	for off := int64(0); off < info.Size; off += 1000 {
		d.Handle("p", []byte(`{"type":"read","id":"t1","offset":`+itoa(off)+`,"length":1000}`))
		peer.mu.Lock()
		msg := peer.bins[len(peer.bins)-1]
		peer.mu.Unlock()
		if got := int64(binary.BigEndian.Uint64(msg)); got != off {
			t.Fatalf("piece at %d says %d", off, got)
		}
		file = append(file, msg[8:]...)
	}
	sum := sha256.Sum256(file)
	if int64(len(file)) != info.Size || hex.EncodeToString(sum[:]) != info.SHA256 {
		t.Fatal("the downloaded file differs")
	}
	// Too big a read is cut to the largest piece.
	d.Handle("p", []byte(`{"type":"read","id":"t1","offset":0,"length":10000000}`))
	peer.mu.Lock()
	if n := len(peer.bins[len(peer.bins)-1]) - 8; int64(n) != min(info.Size, MaxDownloadChunk) {
		t.Fatalf("piece of %d bytes", n)
	}
	peer.mu.Unlock()
	// After cancel, nothing more.
	d.Handle("p", []byte(`{"type":"cancel","id":"t1"}`))
	d.Handle("p", []byte(`{"type":"read","id":"t1","offset":0,"length":10}`))
	if m := peer.last(); m["type"] != "download_error" {
		t.Fatalf("read after cancel: %v", m)
	}
	// Unknown or unsafe files.
	d.Handle("p", []byte(`{"type":"download","id":"t2","file":"../../device.json"}`))
	if m := peer.last(); m["type"] != "download_error" || m["code"] != "unknown_recording" {
		t.Fatalf("unsafe file: %v", m)
	}
}

func itoa(n int64) string {
	b, _ := json.Marshal(n)
	return string(b)
}

func TestHistoryEntriesTakeTheirRecordingsWithThem(t *testing.T) {
	clock := newFakeClock()
	recs := NewRecordingService(t.TempDir(), clock.Now)
	h := NewHistoryService(filepath.Join(t.TempDir(), "history.json"))
	h.SetRecordings(recs)
	a := record(t, recs, clock, "aa", "One", 3)
	clock.Add(time.Minute)
	b := record(t, recs, clock, "bb", "Two", 3)
	clock.Add(time.Minute)
	c := record(t, recs, clock, "bb", "Two", 3)
	if err := h.Add(HistoryEntry{RoomID: "aa", Recordings: []RecordingInfo{a}}); err != nil {
		t.Fatal(err)
	}
	if err := h.Add(HistoryEntry{RoomID: "bb", Recordings: []RecordingInfo{b, c}}); err != nil {
		t.Fatal(err)
	}
	list := h.List()
	if len(list) != 2 || list[0].ID == "" || list[0].ID == list[1].ID {
		t.Fatalf("entries need their own ids: %+v", list)
	}
	// Deleting one recording updates its game.
	if err := recs.Delete(c.ID); err != nil {
		t.Fatal(err)
	}
	if err := h.ForgetRecording(c.ID); err != nil {
		t.Fatal(err)
	}
	if got := h.List()[0].Recordings; len(got) != 1 || got[0].ID != b.ID {
		t.Fatalf("recordings of the game %+v", got)
	}
	// Deleting a game deletes its recordings.
	if err := h.Delete(list[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := recs.Get(b.ID); !errors.Is(err, ErrUnknownRecording) {
		t.Fatal("the game's recording stayed")
	}
	if _, err := recs.Get(a.ID); err != nil {
		t.Fatal("another game's recording went")
	}
	if err := h.Delete("nope"); !errors.Is(err, ErrUnknownHistory) {
		t.Fatalf("unknown id: %v", err)
	}
	// Clearing the history deletes every recording.
	if err := h.Clear(); err != nil {
		t.Fatal(err)
	}
	if len(recs.List()) != 0 || len(h.List()) != 0 {
		t.Fatal("clear left something")
	}
}

func TestEveryoneInTheRoomIsToldAboutTheRecording(t *testing.T) {
	m, out, _ := newManager(t)
	m.Join("a")
	m.SetRecording(true)
	m.Sync()
	if st := out.lastState(t, "a"); st["recording"] != true {
		t.Fatalf("state %v", st)
	}
	chats := out.chats("a")
	if last := chats[len(chats)-1]; last["event"] != EventRecordingStarted || last["system"] == "" {
		t.Fatalf("chat %v", last)
	}
	m.SetRecording(false)
	m.Sync()
	chats = out.chats("a")
	if st := out.lastState(t, "a"); st["recording"] != false || chats[len(chats)-1]["event"] != EventRecordingStopped {
		t.Fatalf("state %v, chat %v", st, chats[len(chats)-1])
	}
}
