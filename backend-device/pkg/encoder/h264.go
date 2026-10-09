// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package encoder

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
)

// H264 encodes I420 frames to H.264 with ffmpeg running as its own process
// (go-link HD, docs/experiments/hd-streaming.md): x264 in software, the
// fastest way to 4K on Apple Silicon, or the computer's hardware encoder
// (VideoToolbox on a Mac). ffmpeg stays a separate program the device talks
// to through pipes, never linked into it, so go-link keeps its own license
// whatever ffmpeg was built with. Frames go in with Write; each access unit
// (one frame, Annex B, with an access unit delimiter in front) comes back to
// onFrame from a goroutine as soon as the next one starts, so the stream is
// one frame behind the encoder. The SPS and PPS ride with every keyframe,
// one every two seconds, which is how a new viewer starts the picture.
type H264 struct {
	vt      *vtEncoder // VideoToolbox called directly (macOS), else ffmpeg below
	cmd     *exec.Cmd
	in      io.WriteCloser
	done    chan struct{}
	mu      sync.Mutex
	closed  bool
	frameSz int
}

// H264Encoders are the encoders H264 can drive: "x264" (software, through
// ffmpeg) and "videotoolbox" (the Mac's hardware: called directly on macOS,
// no ffmpeg needed).
var H264Encoders = []string{"x264", "videotoolbox"}

// FFmpegPath finds ffmpeg: $FFMPEG, the PATH, then Homebrew's places (an
// app opened from the Finder has a short PATH).
func FFmpegPath() (string, error) {
	if p := os.Getenv("FFMPEG"); p != "" {
		return p, nil
	}
	if p, err := exec.LookPath("ffmpeg"); err == nil {
		return p, nil
	}
	for _, p := range []string{"/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"} {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", errors.New("h264: ffmpeg not found (install it, or set FFMPEG)")
}

// NewH264 starts ffmpeg with encoder kind ("x264" or "videotoolbox").
// onFrame gets each encoded frame; it runs on the reader goroutine.
func NewH264(cfg Config, kind string, onFrame func([]byte)) (*H264, error) {
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width%2 != 0 || cfg.Height%2 != 0 {
		return nil, fmt.Errorf("h264: bad size %dx%d", cfg.Width, cfg.Height)
	}
	if cfg.FPS <= 0 {
		cfg.FPS = 60
	}
	if cfg.BitrateKbps <= 0 {
		cfg.BitrateKbps = 8000
	}
	if kind == "videotoolbox" && hasVT {
		gop := cfg.FPS * 2
		if cfg.GOPFrames > 0 {
			gop = cfg.GOPFrames
		}
		vt, err := newVT(cfg, gop, onFrame)
		if err != nil {
			return nil, err
		}
		return &H264{vt: vt}, nil
	}
	path, err := FFmpegPath()
	if err != nil {
		return nil, err
	}
	rate := strconv.Itoa(cfg.BitrateKbps) + "k"
	gop := strconv.Itoa(cfg.FPS * 2)
	if cfg.GOPFrames > 0 {
		gop = strconv.Itoa(cfg.GOPFrames)
	}
	var codec []string
	switch kind {
	case "x264":
		codec = []string{"-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-profile:v", "baseline", "-x264-params", "aud=1:repeat-headers=1"}
	case "videotoolbox":
		codec = []string{"-c:v", "h264_videotoolbox", "-realtime", "1", "-prio_speed", "1", "-profile:v", "baseline", "-bsf:v", "h264_metadata=aud=insert,dump_extra=freq=keyframe"}
	default:
		return nil, fmt.Errorf("h264: unknown encoder %q (x264 or videotoolbox)", kind)
	}
	args := []string{"-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", fmt.Sprintf("%dx%d", cfg.Width, cfg.Height), "-r", strconv.Itoa(cfg.FPS), "-i", "pipe:0"}
	args = append(args, codec...)
	args = append(args, "-b:v", rate, "-maxrate", rate, "-bufsize", strconv.Itoa(cfg.BitrateKbps/2)+"k", "-g", gop, "-f", "h264", "-flush_packets", "1", "pipe:1")
	cmd := exec.Command(path, args...)
	in, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("h264: ffmpeg: %w", err)
	}
	e := &H264{cmd: cmd, in: in, done: make(chan struct{}), frameSz: cfg.Width*cfg.Height + 2*(cfg.Width/2)*(cfg.Height/2)}
	go func() {
		defer close(e.done)
		splitAccessUnits(bufio.NewReaderSize(out, 1<<20), onFrame)
	}()
	return e, nil
}

// Write hands one I420 frame to the encoder; it blocks while ffmpeg is busy.
func (e *H264) Write(i420 []byte) error {
	return e.WriteKey(i420, false)
}

// WriteKey is Write, with key asking for a keyframe now (a viewer just
// joined); ffmpeg only makes them on its own schedule (every GOPFrames).
func (e *H264) WriteKey(i420 []byte, key bool) error {
	if e.vt != nil {
		return e.vt.write(i420, key)
	}
	if len(i420) < e.frameSz {
		return fmt.Errorf("h264: frame is %d bytes, want %d", len(i420), e.frameSz)
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.closed {
		return errors.New("h264: closed")
	}
	_, err := e.in.Write(i420[:e.frameSz])
	return err
}

// Close stops ffmpeg and waits for the last frame.
func (e *H264) Close() {
	if e.vt != nil {
		e.vt.close()
		return
	}
	e.mu.Lock()
	if e.closed {
		e.mu.Unlock()
		return
	}
	e.closed = true
	_ = e.in.Close()
	e.mu.Unlock()
	<-e.done
	_ = e.cmd.Wait()
}

// splitAccessUnits reads an Annex B stream and calls onFrame with each
// access unit, cut where the next access unit delimiter (NAL type 9) starts.
func splitAccessUnits(r io.ByteReader, onFrame func([]byte)) {
	var au []byte
	zeros := 0
	for {
		b, err := r.ReadByte()
		if err != nil {
			if len(au) > 0 {
				onFrame(au)
			}
			return
		}
		au = append(au, b)
		if b == 0 {
			zeros++
			continue
		}
		if b == 1 && zeros >= 2 {
			// a start code: peek at the NAL type
			t, err := r.ReadByte()
			if err != nil {
				if len(au) > 0 {
					onFrame(au)
				}
				return
			}
			if t&0x1f == 9 {
				start := len(au) - min(zeros, 3) - 1
				if start > 0 {
					onFrame(au[:start:start])
					rest := append([]byte(nil), au[start:]...)
					au = rest
				}
			}
			au = append(au, t)
		}
		zeros = 0
	}
}

// H264Support says which H.264 encoders the installed ffmpeg has (none
// without ffmpeg). A listed hardware encoder can still refuse a size or be
// busy: the device tries an encoder before it relies on it.
type H264Support struct {
	FFmpeg       string `json:"ffmpeg,omitempty"`
	X264         bool   `json:"x264"`
	VideoToolbox bool   `json:"videotoolbox"`
}

// ProbeH264 asks ffmpeg for its encoders.
func ProbeH264() H264Support {
	path, err := FFmpegPath()
	if err != nil {
		return H264Support{}
	}
	out, err := exec.Command(path, "-hide_banner", "-encoders").Output()
	if err != nil {
		return H264Support{FFmpeg: path}
	}
	s := string(out)
	return H264Support{FFmpeg: path, X264: strings.Contains(s, " libx264 "), VideoToolbox: strings.Contains(s, " h264_videotoolbox ")}
}
