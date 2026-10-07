// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Package libretro is a minimal libretro frontend: it loads an emulator
// core (a shared library such as mame2003_plus_libretro.dylib), runs it
// one frame at a time and hands out its picture, sound and input
// requests. It is the same API RetroArch uses to run cores.
//
// A process can run one core at a time: libretro callbacks carry no
// context, so they are routed to a single active Core.
package libretro

/*
#cgo linux LDFLAGS: -ldl
#include <stdlib.h>
#include "glue.h"
*/
import "C"

import (
	"errors"
	"fmt"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"unsafe"
)

// PixelFormat is the layout of video frames.
type PixelFormat int

// Formats defined by libretro.
const (
	Format0RGB1555 PixelFormat = C.RETRO_PIXEL_FORMAT_0RGB1555
	FormatXRGB8888 PixelFormat = C.RETRO_PIXEL_FORMAT_XRGB8888
	FormatRGB565   PixelFormat = C.RETRO_PIXEL_FORMAT_RGB565
)

// Joypad button ids (RetroPad).
const (
	JoypadB      = C.RETRO_DEVICE_ID_JOYPAD_B
	JoypadY      = C.RETRO_DEVICE_ID_JOYPAD_Y
	JoypadSelect = C.RETRO_DEVICE_ID_JOYPAD_SELECT
	JoypadStart  = C.RETRO_DEVICE_ID_JOYPAD_START
	JoypadUp     = C.RETRO_DEVICE_ID_JOYPAD_UP
	JoypadDown   = C.RETRO_DEVICE_ID_JOYPAD_DOWN
	JoypadLeft   = C.RETRO_DEVICE_ID_JOYPAD_LEFT
	JoypadRight  = C.RETRO_DEVICE_ID_JOYPAD_RIGHT
	JoypadA      = C.RETRO_DEVICE_ID_JOYPAD_A
	JoypadX      = C.RETRO_DEVICE_ID_JOYPAD_X
	JoypadL      = C.RETRO_DEVICE_ID_JOYPAD_L
	JoypadR      = C.RETRO_DEVICE_ID_JOYPAD_R
	JoypadL2     = C.RETRO_DEVICE_ID_JOYPAD_L2
	JoypadR2     = C.RETRO_DEVICE_ID_JOYPAD_R2
	JoypadL3     = C.RETRO_DEVICE_ID_JOYPAD_L3
	JoypadR3     = C.RETRO_DEVICE_ID_JOYPAD_R3
)

// Frame is one video frame. Data is only valid during the Video callback;
// it is nil when the core repeats the previous frame.
type Frame struct {
	Data          []byte
	Width, Height int
	Pitch         int // bytes per row
	Format        PixelFormat
}

// Handlers receive what the core produces and answer its input queries.
// They run on the goroutine that calls Run.
type Handlers struct {
	Video func(Frame)
	// Audio receives interleaved stereo samples at AVInfo.SampleRate. The
	// slice is only valid during the call.
	Audio func(samples []int16)
	// Pressed reports whether a RetroPad button is down for a port (0-3).
	Pressed func(port, id int) bool
	Log     func(level int, msg string)
}

// Config configures a core.
type Config struct {
	SystemDir string            // BIOS, samples, hiscore data
	SaveDir   string            // NVRAM and saves
	Options   map[string]string // core options, e.g. mame2003-plus_skip_disclaimer
	Handlers  Handlers
}

// SystemInfo describes the core.
type SystemInfo struct {
	Name, Version, Extensions string
	NeedFullpath              bool
}

// AVInfo describes the loaded game's video and audio.
type AVInfo struct {
	BaseWidth, BaseHeight int
	MaxWidth, MaxHeight   int
	AspectRatio           float64
	FPS                   float64
	SampleRate            float64
}

// Core is a loaded libretro core.
type Core struct {
	c       *C.core_t
	cfg     Config
	pixfmt  PixelFormat
	options map[string]*C.char
	strings []*C.char
	loaded  bool
	audio   []int16
}

// active is the running core. Callbacks read it without locks: the core
// calls back into Go while Open, Run or Close are still executing.
var (
	openMu sync.Mutex // serializes Open and Close
	active atomic.Pointer[Core]
)

// Open loads the core library and initializes it.
func Open(path string, cfg Config) (*Core, error) {
	openMu.Lock()
	defer openMu.Unlock()
	if active.Load() != nil {
		return nil, errors.New("libretro: a core is already open in this process")
	}
	k := &Core{c: (*C.core_t)(C.calloc(1, C.size_t(unsafe.Sizeof(C.core_t{})))), cfg: cfg, pixfmt: Format0RGB1555, options: map[string]*C.char{}}
	cpath := C.CString(path)
	defer C.free(unsafe.Pointer(cpath))
	var errbuf [256]C.char
	if rc := C.core_open(k.c, cpath, &errbuf[0], C.size_t(len(errbuf))); rc != 0 {
		C.free(unsafe.Pointer(k.c))
		return nil, fmt.Errorf("libretro: cannot open %s: %s", path, C.GoString(&errbuf[0]))
	}
	if v := C.core_api_version(k.c); v != C.RETRO_API_VERSION {
		C.core_close(k.c)
		C.free(unsafe.Pointer(k.c))
		return nil, fmt.Errorf("libretro: core API version %d, want %d", v, C.RETRO_API_VERSION)
	}
	for key, value := range cfg.Options {
		k.options[key] = C.CString(value)
	}
	active.Store(k)
	C.core_install_callbacks(k.c)
	C.core_init(k.c)
	return k, nil
}

// Info returns the core's name and version.
func (k *Core) Info() SystemInfo {
	var info C.struct_retro_system_info
	C.core_system_info(k.c, &info)
	return SystemInfo{
		Name:         C.GoString(info.library_name),
		Version:      C.GoString(info.library_version),
		Extensions:   C.GoString(info.valid_extensions),
		NeedFullpath: bool(info.need_fullpath),
	}
}

// Load starts a game from its file (a ROM zip for MAME cores). An empty
// path starts the core with no content, for cores that support it (go-link
// HD plays its built-in demo).
func (k *Core) Load(path string) (AVInfo, error) {
	var cpath *C.char
	if path != "" {
		cpath = C.CString(path)
		k.strings = append(k.strings, cpath) // cores may keep the pointer
	}
	if !C.core_load_game(k.c, cpath) {
		if path == "" {
			return AVInfo{}, errors.New("libretro: the core could not start with no content")
		}
		return AVInfo{}, fmt.Errorf("libretro: the core could not load %s", path)
	}
	k.loaded = true
	for port := C.uint(0); port < 4; port++ {
		C.core_set_port_device(k.c, port, C.RETRO_DEVICE_JOYPAD)
	}
	var av C.struct_retro_system_av_info
	C.core_av_info(k.c, &av)
	return AVInfo{
		BaseWidth:   int(av.geometry.base_width),
		BaseHeight:  int(av.geometry.base_height),
		MaxWidth:    int(av.geometry.max_width),
		MaxHeight:   int(av.geometry.max_height),
		AspectRatio: float64(av.geometry.aspect_ratio),
		FPS:         float64(av.timing.fps),
		SampleRate:  float64(av.timing.sample_rate),
	}, nil
}

// Run emulates one frame; the handlers are called during it.
func (k *Core) Run() {
	k.audio = k.audio[:0]
	C.core_run(k.c)
	if len(k.audio) > 0 && k.cfg.Handlers.Audio != nil {
		k.cfg.Handlers.Audio(k.audio)
	}
}

// Reset restarts the game.
func (k *Core) Reset() { C.core_reset(k.c) }

// StateSize returns the size in bytes of a save state of the loaded game,
// or 0 when the core cannot save it. Call it on the core's thread,
// between Run calls.
func (k *Core) StateSize() int {
	if !k.loaded {
		return 0
	}
	return int(C.core_serialize_size(k.c))
}

// SaveState snapshots the whole emulated machine (a libretro save state).
// Call it on the core's thread, between Run calls.
func (k *Core) SaveState() ([]byte, error) {
	size := k.StateSize()
	if size <= 0 {
		return nil, errors.New("libretro: the core does not support save states for this game")
	}
	b := make([]byte, size)
	if !C.core_serialize(k.c, unsafe.Pointer(&b[0]), C.size_t(size)) {
		return nil, errors.New("libretro: the core could not save the state")
	}
	return b, nil
}

// LoadState restores a snapshot made by SaveState for the same game and
// core. Call it on the core's thread, between Run calls.
func (k *Core) LoadState(b []byte) error {
	if !k.loaded {
		return errors.New("libretro: no game loaded")
	}
	if len(b) == 0 {
		return errors.New("libretro: empty save state")
	}
	if !C.core_unserialize(k.c, unsafe.Pointer(&b[0]), C.size_t(len(b))) {
		return errors.New("libretro: the core refused the save state")
	}
	return nil
}

// Close unloads the game and the core.
func (k *Core) Close() {
	openMu.Lock()
	defer openMu.Unlock()
	if k.loaded {
		C.core_unload_game(k.c)
		k.loaded = false
	}
	C.core_deinit(k.c)
	C.core_close(k.c)
	C.free(unsafe.Pointer(k.c))
	for _, s := range k.options {
		C.free(unsafe.Pointer(s))
	}
	for _, s := range k.strings {
		C.free(unsafe.Pointer(s))
	}
	active.CompareAndSwap(k, nil)
}

// LockThread pins the calling goroutine to its OS thread. Call it before
// Open and keep using the core from that goroutine: some cores are not
// safe to call from different threads.
func LockThread() { runtime.LockOSThread() }

func (k *Core) cstring(s string) *C.char {
	c := C.CString(s)
	k.strings = append(k.strings, c)
	return c
}

func current() *Core { return active.Load() }

// DefaultOption returns the default value of a libretro option
// declaration, "Description; default|other|...": the first value.
func DefaultOption(decl string) (string, bool) {
	_, values, ok := strings.Cut(decl, "; ")
	if !ok {
		return "", false
	}
	def, _, _ := strings.Cut(values, "|")
	return def, def != ""
}

//export goEnvironment
func goEnvironment(cmd C.uint, data unsafe.Pointer) C.bool {
	k := current()
	if k == nil {
		return false
	}
	switch cmd &^ C.RETRO_ENVIRONMENT_EXPERIMENTAL {
	case C.RETRO_ENVIRONMENT_GET_CAN_DUPE:
		*(*C.bool)(data) = true
	case C.RETRO_ENVIRONMENT_SET_PIXEL_FORMAT:
		f := PixelFormat(*(*C.enum_retro_pixel_format)(data))
		if f != Format0RGB1555 && f != FormatXRGB8888 && f != FormatRGB565 {
			return false
		}
		k.pixfmt = f
	case C.RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
		*(**C.char)(data) = k.cstring(k.cfg.SystemDir)
	case C.RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY:
		*(**C.char)(data) = k.cstring(k.cfg.SaveDir)
	case C.RETRO_ENVIRONMENT_GET_VARIABLE:
		v := (*C.struct_retro_variable)(data)
		value, ok := k.options[C.GoString(v.key)]
		if !ok {
			return false
		}
		v.value = value
	case C.RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE:
		*(*C.bool)(data) = false
	case C.RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION:
		*(*C.uint)(data) = 0 // the core falls back to plain variables
	case C.RETRO_ENVIRONMENT_GET_LOG_INTERFACE:
		C.glue_set_log((*C.struct_retro_log_callback)(data))
	case C.RETRO_ENVIRONMENT_GET_INPUT_BITMASKS:
		// supported: see goInputState
	case C.RETRO_ENVIRONMENT_GET_AUDIO_VIDEO_ENABLE:
		*(*C.int)(data) = 3 // video and audio
	case C.RETRO_ENVIRONMENT_GET_LANGUAGE:
		*(*C.uint)(data) = C.RETRO_LANGUAGE_ENGLISH
	case C.RETRO_ENVIRONMENT_SET_VARIABLES:
		// Remember each option's default so GET_VARIABLE can always
		// answer: mame2003-plus leaves an unanswered option at zero
		// (gamma 0 turns every color channel fully on or off).
		for v := (*C.struct_retro_variable)(data); v != nil && v.key != nil; v = (*C.struct_retro_variable)(unsafe.Add(unsafe.Pointer(v), unsafe.Sizeof(*v))) {
			key := C.GoString(v.key)
			if _, set := k.options[key]; set || v.value == nil {
				continue
			}
			if def, ok := DefaultOption(C.GoString(v.value)); ok {
				k.options[key] = C.CString(def) // freed with the options in Close
			}
		}
	case C.RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL,
		C.RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS,
		C.RETRO_ENVIRONMENT_SET_CONTROLLER_INFO,
		C.RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME,
		C.RETRO_ENVIRONMENT_SET_GEOMETRY,
		C.RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO,
		C.RETRO_ENVIRONMENT_SET_SERIALIZATION_QUIRKS:
		// accepted, nothing to do
	case C.RETRO_ENVIRONMENT_SET_ROTATION:
		// Refused on purpose: the stream sends the picture as it comes, so
		// the core must rotate vertical games (Galaga, Pac-Man) itself.
		return false
	default:
		return false
	}
	return true
}

//export goVideoRefresh
func goVideoRefresh(data unsafe.Pointer, width, height C.uint, pitch C.size_t) {
	k := current()
	if k == nil || k.cfg.Handlers.Video == nil {
		return
	}
	f := Frame{Width: int(width), Height: int(height), Pitch: int(pitch), Format: k.pixfmt}
	if data != nil {
		f.Data = unsafe.Slice((*byte)(data), int(pitch)*int(height))
	}
	k.cfg.Handlers.Video(f)
}

//export goAudioSample
func goAudioSample(left, right C.int16_t) {
	if k := current(); k != nil {
		k.audio = append(k.audio, int16(left), int16(right))
	}
}

//export goAudioSampleBatch
func goAudioSampleBatch(data *C.int16_t, frames C.size_t) C.size_t {
	if k := current(); k != nil && frames > 0 {
		k.audio = append(k.audio, unsafe.Slice((*int16)(unsafe.Pointer(data)), int(frames)*2)...)
	}
	return frames
}

//export goInputPoll
func goInputPoll() {}

//export goInputState
func goInputState(port, device, index, id C.uint) C.int16_t {
	k := current()
	if k == nil || k.cfg.Handlers.Pressed == nil || device != C.RETRO_DEVICE_JOYPAD || port > 3 {
		return 0
	}
	if id == C.RETRO_DEVICE_ID_JOYPAD_MASK {
		var mask C.int16_t
		for b := 0; b < 16; b++ {
			if k.cfg.Handlers.Pressed(int(port), b) {
				mask |= 1 << b
			}
		}
		return mask
	}
	if k.cfg.Handlers.Pressed(int(port), int(id)) {
		return 1
	}
	return 0
}

//export goLog
func goLog(level C.int, msg *C.char) {
	if k := current(); k != nil && k.cfg.Handlers.Log != nil {
		k.cfg.Handlers.Log(int(level), C.GoString(msg))
	}
}
