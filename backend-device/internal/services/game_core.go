// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"log/slog"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/lordbasex/go-link/backend-device/pkg/cores"
	"github.com/lordbasex/go-link/backend-device/pkg/emuproc"
	"github.com/lordbasex/go-link/backend-device/pkg/input"
	"github.com/lordbasex/go-link/backend-device/pkg/libretro"
)

// GameCoreConfig describes the game a GameCore runs.
type GameCoreConfig struct {
	CorePath  string // e.g. ~/go-link/cores/mame2003_plus_libretro.dylib
	RomPath   string // e.g. ~/go-link/roms/robby.zip
	SystemDir string // BIOS, samples, hiscores, NVRAM
	Logger    *slog.Logger
	// Video receives every frame as packed I420 of w x h (the enlarged
	// size with VideoDouble, see VideoScale); a repeated frame comes with
	// the previous picture. The slice is reused by the next frame.
	Video func(i420 []byte, w, h int, dur time.Duration)
	// VideoMode is how frames are converted to I420 (the zero value is the
	// game's size with top-left chroma); SetVideoMode changes it later.
	VideoMode emuproc.VideoMode
	// RawVideo, when set, also receives the core's own frame before the
	// I420 conversion (nil Data repeats the previous one). Only the video
	// quality lab uses it; Data is only valid during the call.
	RawVideo func(f libretro.Frame)
	// Audio receives interleaved stereo samples at 48 kHz. The slice is
	// reused by the next call.
	Audio func(pcm []int16)
}

// GameCore is a libretro core with a game loaded, set up the way go-link
// runs MAME: the mame2003-plus options, the RetroPad button mapping, I420
// video and 48 kHz audio. EmulatorSource runs it in the device process and
// the "emulate" worker in a child process. Every method must be called
// from the goroutine that called OpenGameCore, pinned to its OS thread.
type GameCore struct {
	core     *libretro.Core
	info     libretro.SystemInfo
	av       libretro.AVInfo
	pads     [4]input.Pad
	frame    []byte
	fw, fh   int
	mode     emuproc.VideoMode // for the next frames
	scale    int               // of frame: 1, or 2 when enlarged
	frameDur time.Duration
	resample *libretro.Resampler
	capture  []string // core log lines, while SavesComplete listens
	listen   bool
}

// mame2003PlusOptions skip the screens that wait for a key press and ask
// for 48 kHz audio, which is what WebRTC's Opus uses (no resampling).
var mame2003PlusOptions = map[string]string{
	"mame2003-plus_skip_disclaimer": "enabled",
	"mame2003-plus_skip_warnings":   "enabled",
	"mame2003-plus_sample_rate":     "48000",
}

// retroButton maps a RetroPad id to our buttons. For MAME cores the
// RetroPad B, A, Y, X, L, R are the arcade buttons 1 to 6, Select inserts
// a coin and Start is the player's start button.
//
// L2, R2, L3 and R3 never reach the core: mame2003-plus ties them to MAME's
// own functions, not to the game. L3 turns the sound off (a stick click on
// a gamepad silenced the game for everyone until the room restarted) and
// R2 opens MAME's menu, where any seated guest could change the DIP
// switches that MAME then saves.
var retroButton = map[int]input.Button{
	libretro.JoypadUp:     input.Up,
	libretro.JoypadDown:   input.Down,
	libretro.JoypadLeft:   input.Left,
	libretro.JoypadRight:  input.Right,
	libretro.JoypadB:      input.Button1,
	libretro.JoypadA:      input.Button2,
	libretro.JoypadY:      input.Button3,
	libretro.JoypadX:      input.Button4,
	libretro.JoypadL:      input.Button5,
	libretro.JoypadR:      input.Button6,
	libretro.JoypadStart:  input.Start,
	libretro.JoypadSelect: input.Coin,
}

// OpenGameCore pins the calling goroutine to its OS thread, loads the core
// and the game. Close it when done.
func OpenGameCore(cfg GameCoreConfig) (*GameCore, error) {
	libretro.LockThread()
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	if err := os.MkdirAll(cfg.SystemDir, 0o755); err != nil {
		return nil, err
	}
	g := &GameCore{frameDur: time.Second / 60, mode: cfg.VideoMode, scale: 1}
	log := cfg.Logger
	// Never run a core someone changed after it was downloaded.
	if err := cores.Verify(cfg.CorePath); err != nil {
		return nil, err
	}
	core, err := libretro.Open(cfg.CorePath, libretro.Config{
		SystemDir: cfg.SystemDir,
		SaveDir:   cfg.SystemDir,
		Options:   mame2003PlusOptions,
		Handlers: libretro.Handlers{
			Video: func(f libretro.Frame) {
				if cfg.RawVideo != nil {
					cfg.RawVideo(f)
				}
				if f.Data != nil {
					g.convert(f)
				}
				if g.frame != nil && cfg.Video != nil { // a nil frame repeats the previous one
					cfg.Video(g.frame, g.fw, g.fh, g.frameDur)
				}
			},
			Audio: func(samples []int16) {
				if g.resample != nil && cfg.Audio != nil {
					cfg.Audio(g.resample.Process(samples))
				}
			},
			Pressed: func(port, id int) bool {
				b, ok := retroButton[id]
				return ok && port < len(g.pads) && g.pads[port].Buttons.Pressed(b)
			},
			Log: func(level int, msg string) {
				if g.listen {
					g.capture = append(g.capture, msg)
				}
				if level >= 2 {
					log.Warn("core", "msg", trimNewline(msg))
				} else {
					log.Debug("core", "msg", trimNewline(msg))
				}
			},
		},
	})
	if err != nil {
		return nil, err
	}
	g.core = core
	g.info = core.Info()
	av, err := core.Load(cfg.RomPath)
	if err != nil {
		core.Close()
		return nil, err
	}
	g.av = av
	if av.FPS > 0 {
		g.frameDur = time.Duration(float64(time.Second) / av.FPS)
	}
	g.resample = libretro.NewResampler(av.SampleRate, 48000)
	return g, nil
}

// convert turns a core frame into the I420 picture of the current mode.
func (g *GameCore) convert(f libretro.Frame) {
	scale := g.mode.Scale()
	w, h := f.Width*scale, f.Height*scale
	if size := libretro.FrameSizeI420(w, h); len(g.frame) != size {
		g.frame = make([]byte, size)
	}
	switch g.mode {
	case emuproc.VideoDouble:
		libretro.ToI420Double(g.frame, f)
	case emuproc.VideoBox:
		libretro.ToI420Box(g.frame, f)
	default:
		libretro.ToI420(g.frame, f)
	}
	g.fw, g.fh, g.scale = w, h, scale
}

// SetVideoMode changes how the next frames are converted.
func (g *GameCore) SetVideoMode(m emuproc.VideoMode) { g.mode = m }

// VideoScale is how many times the last picture is enlarged (1 or 2).
func (g *GameCore) VideoScale() int { return g.scale }

// Info returns the core's name and version.
func (g *GameCore) Info() libretro.SystemInfo { return g.info }

// AV returns the game's video and audio description.
func (g *GameCore) AV() libretro.AVInfo { return g.av }

// FrameDuration is how long one frame lasts at the game's frame rate.
func (g *GameCore) FrameDuration() time.Duration { return g.frameDur }

// Aspect returns the display aspect ratio of the picture.
func (g *GameCore) Aspect() float64 {
	if g.av.AspectRatio > 0 {
		return g.av.AspectRatio
	}
	if g.av.BaseHeight > 0 {
		return float64(g.av.BaseWidth) / float64(g.av.BaseHeight)
	}
	return 0
}

// SetPads sets the controllers of ports 1-4 for the next frames.
func (g *GameCore) SetPads(pads [4]input.Pad) { g.pads = pads }

// Run emulates one frame; Video and Audio are called during it.
func (g *GameCore) Run() { g.core.Run() }

// LastFrame returns the last picture (nil before the first one). The
// slice is reused by the next frame.
func (g *GameCore) LastFrame() (i420 []byte, w, h int) { return g.frame, g.fw, g.fh }

// SaveState snapshots the game.
func (g *GameCore) SaveState() ([]byte, error) { return g.core.SaveState() }

// LoadState restores a snapshot made by SaveState.
func (g *GameCore) LoadState(b []byte) error { return g.core.LoadState(b) }

// stateItem is one line of the list mame2003-plus logs on every save:
// "<module>.<n>.<item>: <offsets>", e.g. "z80.1.PC: 1a3c..1a3d".
var stateItem = regexp.MustCompile(`(?:^|\s)([A-Za-z0-9_]+)\.(\d+)\.([^:]+):`)

// SavesComplete reports whether a save keeps this game whole. MAME 2003-Plus
// (MAME 0.78) does not save the registers of every CPU: the Konami CPU of
// The Simpsons or Aliens keeps none, so a loaded save runs on garbage, the
// game crashes and the board restarts (The Simpsons then loops on its
// RAM/ROM check). It makes a save in memory and reads the list of what went
// in, which the core logs. When the core logs no list, it answers true
// (nothing to go by).
func (g *GameCore) SavesComplete() bool {
	ok, _ := g.SaveContents()
	return ok
}

// SaveContents makes a save in memory and returns SavesComplete's verdict
// and the modules the save holds ("m68000", "z80", "QSound"...).
func (g *GameCore) SaveContents() (complete bool, modules []string) {
	g.capture, g.listen = nil, true
	_, err := g.core.SaveState()
	g.listen = false
	lines := g.capture
	g.capture = nil
	if err != nil {
		return false, nil
	}
	return savesComplete(lines), saveModules(lines)
}

// saveModules lists the modules of the core's save list, once each.
func saveModules(lines []string) []string {
	var out []string
	for _, l := range lines {
		if m := stateItem.FindStringSubmatch(l); m != nil && !slices.Contains(out, m[1]) {
			out = append(out, m[1])
		}
	}
	return out
}

// savesComplete checks the core's list of saved items. Every CPU saves its
// program counter as "<cpu>.<n>.PC", numbered from 0: a missing number is
// a CPU whose state is not saved. A game has at least one CPU, so a list
// without any PC is incomplete too.
func savesComplete(lines []string) bool {
	listed := false
	withPC := map[int]bool{}
	highest := -1
	for _, l := range lines {
		m := stateItem.FindStringSubmatch(l)
		if m == nil {
			continue
		}
		listed = true
		if !strings.EqualFold(strings.TrimSpace(m[3]), "pc") {
			continue
		}
		n, err := strconv.Atoi(m[2])
		if err != nil {
			continue
		}
		withPC[n] = true
		highest = max(highest, n)
	}
	if !listed {
		return true
	}
	if highest < 0 {
		return false
	}
	for n := 0; n <= highest; n++ {
		if !withPC[n] {
			return false
		}
	}
	return true
}

// Close unloads the game and the core.
func (g *GameCore) Close() { g.core.Close() }

func trimNewline(s string) string {
	for len(s) > 0 && (s[len(s)-1] == '\n' || s[len(s)-1] == '\r') {
		s = s[:len(s)-1]
	}
	return s
}
