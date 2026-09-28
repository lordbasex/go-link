// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"encoding/binary"
	"errors"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/at-wat/ebml-go/mkvcore"
	"github.com/at-wat/ebml-go/webm"
	"github.com/pion/rtp"
)

// Recording limits: a recording stops by itself at whichever comes first.
const (
	MaxRecordingDuration = 2 * time.Hour
	MaxRecordingBytes    = 2 << 30 // 2 GiB
)

// Why a recording stopped (RecordingInfo.Reason).
const (
	RecStopped       = "stopped"        // the host stopped it
	RecPaused        = "paused"         // the game was paused
	RecLimitTime     = "limit_time"     // it reached MaxRecordingDuration
	RecLimitSize     = "limit_size"     // it reached MaxRecordingBytes
	RecRoomStopped   = "room_stopped"   // the room was archived, deleted or failed
	RecDeviceStopped = "device_stopped" // the device was shut down
	RecInterrupted   = "interrupted"    // the device stopped without closing it (found at startup)
)

// Track names, in RecordingInfo.Tracks and in the file.
const (
	TrackVideo = "video"
	TrackGame  = "game"
)

// voiceTrack is the name of a player's voice track (voice-p1..voice-p4).
func voiceTrack(port int) string { return "voice-p" + string(rune('0'+port)) }

// WebM track numbers: video, game sound, then one voice per port.
const (
	recTrackVideo = 1
	recTrackGame  = 2
	recTrackVoice = 3 // P1; P2-P4 follow
	recTracks     = 6
)

// frameQueue bounds the frames waiting for the disk. The media paths never
// wait: when the disk falls this far behind, frames are dropped.
const frameQueue = 2048

type recFrame struct {
	track int
	data  []byte
	at    time.Duration // arrival, from Recorder.Start
	w, h  int           // video frame size
	ts    uint32        // RTP timestamp (voice)
	ssrc  uint32        // RTP source (voice)
}

// voiceClock turns one voice track's RTP timestamps into file time: the
// first packet of each source is placed at its arrival, the next ones by
// their 48 kHz timestamps.
type voiceClock struct {
	on     bool
	ssrc   uint32
	base   uint32
	anchor time.Duration
	last   time.Duration
}

// Recorder writes a room's game to a WebM file as it is played: the VP8
// video and the Opus game sound the room already encoded for its guests,
// and the players' voices as they arrive (forwarded Opus packets). Nothing
// is decoded or encoded again, so recording costs a copy per packet.
//
// The media paths call Video, GameAudio and Voice; they never block. One
// goroutine writes the file. The file starts at the first video keyframe.
type Recorder struct {
	path     string
	start    time.Time
	maxDur   time.Duration
	maxBytes int64
	onLimit  func(reason string)
	now      func() time.Time

	frames  chan recFrame
	active  atomic.Bool
	stop    chan string // the reason, once
	stopped sync.Once
	done    chan struct{}
	dropped atomic.Int64

	// Set by the writer goroutine, read after done.
	result recResult
}

type recResult struct {
	duration time.Duration
	size     int64
	tracks   []string
	err      error
	reason   string
}

// RecorderConfig makes a Recorder. Zero limits mean the defaults.
type RecorderConfig struct {
	Path     string
	MaxDur   time.Duration
	MaxBytes int64
	// OnLimit runs (on its own goroutine) when a limit stops the
	// recording, so the room can tell everyone.
	OnLimit func(reason string)
	Now     func() time.Time
}

// NewRecorder creates the file and starts writing. Call Stop to finish it.
func NewRecorder(cfg RecorderConfig) (*Recorder, error) {
	if cfg.MaxDur <= 0 {
		cfg.MaxDur = MaxRecordingDuration
	}
	if cfg.MaxBytes <= 0 {
		cfg.MaxBytes = MaxRecordingBytes
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	// Recordings are the host's: readable only by the user.
	f, err := os.OpenFile(cfg.Path, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	r := &Recorder{
		path: cfg.Path, start: cfg.Now(), maxDur: cfg.MaxDur, maxBytes: cfg.MaxBytes,
		onLimit: cfg.OnLimit, now: cfg.Now,
		frames: make(chan recFrame, frameQueue), stop: make(chan string, 1), done: make(chan struct{}),
	}
	r.active.Store(true)
	go r.write(&countingFile{File: f})
	return r, nil
}

// Path is the file being written.
func (r *Recorder) Path() string { return r.path }

// StartedAt is when the recording began.
func (r *Recorder) StartedAt() time.Time { return r.start }

func (r *Recorder) push(f recFrame) {
	if !r.active.Load() {
		return
	}
	f.at = r.now().Sub(r.start)
	select {
	case r.frames <- f:
	default:
		r.dropped.Add(1)
	}
}

// Video adds one encoded VP8 frame of w x h.
func (r *Recorder) Video(data []byte, w, h int) {
	r.push(recFrame{track: recTrackVideo, data: bytesCopy(data), w: w, h: h})
}

// GameAudio adds one 20 ms Opus packet of the game's sound.
func (r *Recorder) GameAudio(pkt []byte) {
	r.push(recFrame{track: recTrackGame, data: bytesCopy(pkt)})
}

// Voice adds one RTP packet of the voice of the player at port (1-4).
func (r *Recorder) Voice(port int, pkt *rtp.Packet) {
	if port < 1 || port > 4 || len(pkt.Payload) == 0 {
		return
	}
	r.push(recFrame{track: recTrackVoice + port - 1, data: bytesCopy(pkt.Payload), ts: pkt.Timestamp, ssrc: pkt.SSRC})
}

// Stop finishes the file and waits for it. The first reason wins.
func (r *Recorder) Stop(reason string) {
	r.stopped.Do(func() {
		r.active.Store(false)
		r.stop <- reason
	})
	<-r.done
}

// Result reports the finished recording: its length, size, the tracks
// that got data and why it stopped. Valid after Stop.
func (r *Recorder) Result() (duration time.Duration, size int64, tracks []string, reason string, err error) {
	<-r.done
	return r.result.duration, r.result.size, r.result.tracks, r.result.reason, r.result.err
}

// Dropped counts the frames lost because the disk was too slow.
func (r *Recorder) Dropped() int64 { return r.dropped.Load() }

func bytesCopy(b []byte) []byte { return append([]byte(nil), b...) }

// write is the recording goroutine.
func (r *Recorder) write(file *countingFile) {
	defer close(r.done)
	var (
		ws      []webm.BlockWriteCloser
		zero    time.Duration // arrival of the first keyframe: time 0 of the file
		last    [recTracks + 1]int64
		used    [recTracks + 1]bool
		clocks  [4]voiceClock
		gameN   int64 // game packets written: 20 ms each
		gameAt  time.Duration
		reason  string
		failed  error
		stopped bool
		self    bool // it stopped on its own: a limit or a disk error
	)
	finish := func(why string) {
		if stopped {
			return
		}
		stopped = true
		r.active.Store(false)
		reason = why
	}
	var ask string // Stop's reason: the frames already queued are written first
	for !stopped {
		var f recFrame
		if ask == "" {
			select {
			case ask = <-r.stop:
				continue
			case f = <-r.frames:
			}
		} else {
			select {
			case f = <-r.frames:
			default:
				finish(ask)
				continue
			}
		}
		if ws == nil {
			// Wait for a keyframe: a file must start with a whole picture.
			if f.track != recTrackVideo || len(f.data) == 0 || f.data[0]&1 != 0 {
				continue
			}
			var err error
			ws, err = webm.NewSimpleBlockWriter(file, recTrackEntries(f.w, f.h),
				mkvcore.WithSeekHead(true), mkvcore.WithCues(1<<18), mkvcore.WithBlockInterceptor(recSorter),
				mkvcore.WithSegmentInfo(&webm.Info{TimecodeScale: 1_000_000, MuxingApp: "go-link", WritingApp: "go-link"}))
			if err != nil {
				failed, self = err, true
				finish(RecStopped)
				continue
			}
			zero = f.at
		}
		if f.at < zero {
			continue
		}
		var ts int64 // milliseconds in the file
		switch {
		case f.track == recTrackVideo:
			ts = int64((f.at - zero) / time.Millisecond)
		case f.track == recTrackGame:
			// The game's sound is continuous: each packet follows the last
			// by 20 ms, from where the first one arrived.
			if gameN == 0 {
				gameAt = f.at - zero
			}
			ts = int64((gameAt + time.Duration(gameN)*20*time.Millisecond) / time.Millisecond)
			gameN++
		default:
			c := &clocks[f.track-recTrackVoice]
			if !c.on || c.ssrc != f.ssrc {
				// A new speaker (or the same one after a new connection),
				// never before the last packet of the one before.
				anchor := f.at - zero
				if c.on {
					anchor = max(anchor, c.last+20*time.Millisecond)
				}
				c.on, c.ssrc, c.base, c.anchor = true, f.ssrc, f.ts, anchor
			}
			d := c.anchor + time.Duration(f.ts-c.base)*time.Second/48000
			if d < c.last { // a late or reordered packet
				continue
			}
			c.last = d
			ts = int64(d / time.Millisecond)
		}
		// Blocks of one track must keep their order, each after the last
		// (two frames within the same millisecond would share a timestamp,
		// which players accept but muxers reject).
		if used[f.track] && ts <= last[f.track] {
			ts = last[f.track] + 1
		}
		key := f.track != recTrackVideo || f.data[0]&1 == 0
		if _, err := ws[f.track-1].Write(key, ts, f.data); err != nil {
			failed, self = err, true
			finish(RecStopped)
			continue
		}
		last[f.track], used[f.track] = ts, true
		switch {
		case time.Duration(ts)*time.Millisecond >= r.maxDur:
			finish(RecLimitTime)
			self = true
		case file.written.Load() >= r.maxBytes:
			finish(RecLimitSize)
			self = true
		}
	}
	if ws != nil {
		for _, w := range ws {
			if err := w.Close(); err != nil && failed == nil {
				failed = err
			}
		}
	} else {
		// Nothing was recorded (no picture came): no file.
		_ = file.Close()
		_ = os.Remove(r.path)
		failed = errors.Join(failed, ErrEmptyRecording)
	}
	var tracks []string
	for t := 1; t <= recTracks; t++ {
		if used[t] {
			tracks = append(tracks, recTrackName(t))
		}
	}
	r.result = recResult{
		duration: time.Duration(last[recTrackVideo]) * time.Millisecond,
		size:     file.written.Load(), tracks: tracks, err: failed, reason: reason,
	}
	if fi, err := os.Stat(r.path); err == nil {
		r.result.size = fi.Size()
	}
	if self && r.onLimit != nil {
		go r.onLimit(reason)
	}
}

// recSorter interleaves the tracks by time, waiting up to 400 ms for a
// late one (voices come from other computers).
var recSorter = mkvcore.MustBlockInterceptor(mkvcore.NewMultiTrackBlockSorter(
	mkvcore.WithMaxTimescaleDelay(400), mkvcore.WithSortRule(mkvcore.BlockSorterDropOutdated)))

// ErrEmptyRecording is a recording that stopped before its first picture.
var ErrEmptyRecording = errors.New("the recording has no picture")

func recTrackName(t int) string {
	switch t {
	case recTrackVideo:
		return TrackVideo
	case recTrackGame:
		return TrackGame
	default:
		return voiceTrack(t - recTrackVoice + 1)
	}
}

// recTrackEntries describes the file's tracks: every voice track exists
// from the start, whether or not someone talks.
func recTrackEntries(w, h int) []webm.TrackEntry {
	tracks := []webm.TrackEntry{
		{Name: "Game video", TrackNumber: recTrackVideo, TrackUID: 1, CodecID: "V_VP8", TrackType: 1,
			Video: &webm.Video{PixelWidth: uint64(w), PixelHeight: uint64(h)}},
		{Name: "Game sound", TrackNumber: recTrackGame, TrackUID: 2, CodecID: "A_OPUS", TrackType: 2,
			CodecPrivate: opusHead(2), SeekPreRoll: 80_000_000, Audio: &webm.Audio{SamplingFrequency: 48000, Channels: 2}},
	}
	for p := 1; p <= 4; p++ {
		n := uint64(recTrackVoice + p - 1)
		tracks = append(tracks, webm.TrackEntry{
			Name: "Voice P" + string(rune('0'+p)), TrackNumber: n, TrackUID: n, CodecID: "A_OPUS", TrackType: 2,
			CodecPrivate: opusHead(1), SeekPreRoll: 80_000_000, Audio: &webm.Audio{SamplingFrequency: 48000, Channels: 1},
		})
	}
	return tracks
}

// opusHead is the Opus identification header WebM keeps as CodecPrivate
// (RFC 7845, section 5.1).
func opusHead(channels byte) []byte {
	h := make([]byte, 19)
	copy(h, "OpusHead")
	h[8] = 1 // version
	h[9] = channels
	binary.LittleEndian.PutUint16(h[10:], 0)     // pre-skip
	binary.LittleEndian.PutUint32(h[12:], 48000) // input sample rate
	binary.LittleEndian.PutUint16(h[16:], 0)     // output gain
	h[18] = 0                                    // mapping family
	return h
}

// countingFile counts the bytes appended to the file (WriteAt only
// rewrites its header and index).
type countingFile struct {
	*os.File
	written atomic.Int64
}

func (c *countingFile) Write(b []byte) (int, error) {
	n, err := c.File.Write(b)
	c.written.Add(int64(n))
	return n, err
}
