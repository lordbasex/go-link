// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build js && wasm

package main

import (
	"encoding/binary"
	"encoding/json"
	"math"
	"sync"
	"syscall/js"
)

// The website calls these through globalThis.goLinkMp4:
//
//	demux(Uint8Array) -> {tracks, frames: {track, time, offset, size}} | {error}
//	create(configJSON) -> id | {error}
//	describe(id, track, Uint8Array)
//	add(id, track, timeUs, key, Uint8Array) -> null | {error}
//	finish(id) -> Uint8Array | {error}
//	free(id)
var (
	mu      sync.Mutex
	muxers  = map[int]*Muxer{}
	nextMux = 1
)

func fail(err error) any { return map[string]any{"error": err.Error()} }

func bytesOf(v js.Value) []byte {
	b := make([]byte, v.Get("length").Int())
	js.CopyBytesToGo(b, v)
	return b
}

func toJS(b []byte) js.Value {
	u := js.Global().Get("Uint8Array").New(len(b))
	js.CopyBytesToJS(u, b)
	return u
}

// typed builds a JS typed array (Float64Array, Uint32Array...) from its
// little endian bytes.
func typed(kind string, raw []byte) js.Value {
	u := toJS(raw)
	return js.Global().Get(kind).New(u.Get("buffer"))
}

func demux(_ js.Value, args []js.Value) any {
	f, err := Demux(bytesOf(args[0]))
	if err != nil {
		return fail(err)
	}
	tracks := make([]any, 0, len(f.Tracks))
	for _, t := range f.Tracks {
		tracks = append(tracks, map[string]any{
			"number": t.Number, "type": t.Type, "codec": t.CodecID, "name": t.Name,
			"width": t.Width, "height": t.Height, "channels": t.Channels, "rate": t.Rate,
			"codecPrivate": toJS(t.CodecPrivate),
		})
	}
	n := len(f.Frames)
	track := make([]byte, n)
	times := make([]byte, 8*n)
	offsets := make([]byte, 8*n)
	sizes := make([]byte, 4*n)
	for i, fr := range f.Frames {
		track[i] = byte(fr.Track)
		binary.LittleEndian.PutUint64(times[8*i:], math.Float64bits(float64(fr.TimeUs)))
		binary.LittleEndian.PutUint64(offsets[8*i:], math.Float64bits(float64(fr.Offset)))
		binary.LittleEndian.PutUint32(sizes[4*i:], uint32(fr.Size))
	}
	return map[string]any{
		"tracks": tracks,
		"frames": map[string]any{
			"track":  toJS(track),
			"time":   typed("Float64Array", times),
			"offset": typed("Float64Array", offsets),
			"size":   typed("Uint32Array", sizes),
		},
	}
}

func create(_ js.Value, args []js.Value) any {
	var cfg []TrackConfig
	if err := json.Unmarshal([]byte(args[0].String()), &cfg); err != nil {
		return fail(err)
	}
	m, err := NewMuxer(cfg)
	if err != nil {
		return fail(err)
	}
	mu.Lock()
	defer mu.Unlock()
	id := nextMux
	nextMux++
	muxers[id] = m
	return id
}

func muxer(v js.Value) *Muxer {
	mu.Lock()
	defer mu.Unlock()
	return muxers[v.Int()]
}

func describe(_ js.Value, args []js.Value) any {
	if m := muxer(args[0]); m != nil {
		if err := m.SetDescription(args[1].Int(), bytesOf(args[2])); err != nil {
			return fail(err)
		}
	}
	return nil
}

func add(_ js.Value, args []js.Value) any {
	m := muxer(args[0])
	if m == nil {
		return map[string]any{"error": "mp4: no such file"}
	}
	if err := m.Add(args[1].Int(), int64(args[2].Float()), args[3].Bool(), bytesOf(args[4])); err != nil {
		return fail(err)
	}
	return nil
}

func finish(_ js.Value, args []js.Value) any {
	m := muxer(args[0])
	if m == nil {
		return map[string]any{"error": "mp4: no such file"}
	}
	out, err := m.Finish()
	free(js.Null(), args[:1])
	if err != nil {
		return fail(err)
	}
	return toJS(out)
}

func free(_ js.Value, args []js.Value) any {
	mu.Lock()
	defer mu.Unlock()
	delete(muxers, args[0].Int())
	return nil
}

func main() {
	api := map[string]any{
		"demux":    js.FuncOf(demux),
		"create":   js.FuncOf(create),
		"describe": js.FuncOf(describe),
		"add":      js.FuncOf(add),
		"finish":   js.FuncOf(finish),
		"free":     js.FuncOf(free),
	}
	js.Global().Set("goLinkMp4", js.ValueOf(api))
	select {}
}
