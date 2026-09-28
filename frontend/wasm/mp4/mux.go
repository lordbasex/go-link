// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package main

import (
	"encoding/binary"
	"errors"
	"slices"
)

// TrackConfig describes one track of the MP4.
type TrackConfig struct {
	Kind     string `json:"kind"` // "video" or "audio"
	Width    int    `json:"width"`
	Height   int    `json:"height"`
	Rate     int    `json:"rate"`
	Channels int    `json:"channels"`
	Name     string `json:"name"`
	// Default: the audio track players pick; the others are alternatives.
	Default bool `json:"default"`
}

type sample struct {
	ptsUs int64
	size  int
	key   bool
	pos   int64 // where it starts inside mdat's data
}

type mp4Track struct {
	TrackConfig
	desc    []byte // avcC for video, AudioSpecificConfig for AAC
	samples []sample
}

// Muxer writes a progressive MP4 (H.264 video, AAC audio) with the index
// (moov) before the data, so players and apps can start without reading
// to the end. Samples come in decode order; their times are presentation
// times in microseconds, and decode times are worked out from them, so an
// encoder that reorders frames also works.
type Muxer struct {
	tracks []*mp4Track
	data   []byte
}

// NewMuxer starts an MP4 with these tracks (numbered from 0 in Add).
func NewMuxer(cfg []TrackConfig) (*Muxer, error) {
	if len(cfg) == 0 {
		return nil, errors.New("mp4: no tracks")
	}
	m := &Muxer{}
	for _, c := range cfg {
		switch {
		case c.Kind == "video" && c.Width > 0 && c.Height > 0:
		case c.Kind == "audio" && c.Rate > 0 && c.Channels > 0:
		default:
			return nil, errors.New("mp4: bad track")
		}
		m.tracks = append(m.tracks, &mp4Track{TrackConfig: c})
	}
	return m, nil
}

// SetDescription sets a track's decoder configuration: the avcC record of
// H.264, or the AudioSpecificConfig of AAC (WebCodecs gives both).
func (m *Muxer) SetDescription(track int, desc []byte) error {
	if track < 0 || track >= len(m.tracks) {
		return errors.New("mp4: no such track")
	}
	m.tracks[track].desc = slices.Clone(desc)
	return nil
}

// Add appends one encoded sample.
func (m *Muxer) Add(track int, ptsUs int64, key bool, data []byte) error {
	if track < 0 || track >= len(m.tracks) {
		return errors.New("mp4: no such track")
	}
	t := m.tracks[track]
	t.samples = append(t.samples, sample{ptsUs: ptsUs, size: len(data), key: key, pos: int64(len(m.data))})
	m.data = append(m.data, data...)
	return nil
}

// Finish returns the whole file.
func (m *Muxer) Finish() ([]byte, error) {
	var tracks []*mp4Track
	for _, t := range m.tracks {
		if len(t.samples) == 0 {
			continue // a track nothing was added to is left out
		}
		if t.Kind == "video" && len(t.desc) == 0 {
			return nil, errors.New("mp4: the video track has no avcC")
		}
		if t.Kind == "audio" && len(t.desc) == 0 {
			t.desc = defaultASC(t.Rate, t.Channels)
		}
		tracks = append(tracks, t)
	}
	if len(tracks) == 0 {
		return nil, errors.New("mp4: no samples")
	}
	ftyp := box("ftyp", []byte("isom"), u32(0x200), []byte("isomiso2avc1mp41"))
	large := len(m.data)+8 > 0xFFFFFFFF
	mdatHead := 8
	if large {
		mdatHead = 16
	}
	// The index holds the data's offsets, which depend on the index's own
	// size: build it once to measure, then again with the real offsets
	// (64 bit offsets keep the size the same).
	moov := m.moov(tracks, 0)
	base := int64(len(ftyp) + len(moov) + mdatHead)
	moov = m.moov(tracks, base)

	out := make([]byte, 0, int(base)+len(m.data))
	out = append(out, ftyp...)
	out = append(out, moov...)
	if large {
		out = append(out, u32(1)...)
		out = append(out, "mdat"...)
		out = append(out, u64(uint64(len(m.data)+16))...)
	} else {
		out = append(out, u32(uint32(len(m.data)+8))...)
		out = append(out, "mdat"...)
	}
	return append(out, m.data...), nil
}

// timescale of a track: 90 kHz for video, the sample rate for audio.
func (t *mp4Track) timescale() int64 {
	if t.Kind == "video" {
		return 90000
	}
	return int64(t.Rate)
}

// timing works out, in the track's timescale, each sample's duration
// (decode order) and composition offset.
func (t *mp4Track) timing() (durs []uint32, offs []int32, total int64) {
	ts := t.timescale()
	n := len(t.samples)
	pts := make([]int64, n)
	for i, s := range t.samples {
		pts[i] = s.ptsUs * ts / 1_000_000
	}
	// Decode times are the presentation times in order.
	dts := slices.Clone(pts)
	slices.Sort(dts)
	// Two samples at the same time (a source that repeated a timestamp):
	// decode times must still move forward.
	for i := 1; i < n; i++ {
		if dts[i] <= dts[i-1] {
			dts[i] = dts[i-1] + 1
		}
	}
	durs = make([]uint32, n)
	offs = make([]int32, n)
	for i := range n {
		var d int64
		if i+1 < n {
			d = dts[i+1] - dts[i]
		} else if t.Kind == "audio" {
			d = 1024 // one AAC frame
		} else if i > 0 {
			d = dts[i] - dts[i-1]
		} else {
			d = ts / 60
		}
		durs[i] = uint32(max(d, 0))
		offs[i] = int32(pts[i] - dts[i])
		total += d
	}
	return durs, offs, total
}

func (m *Muxer) moov(tracks []*mp4Track, base int64) []byte {
	var traks [][]byte
	var movieMs int64
	for i, t := range tracks {
		durs, offs, total := t.timing()
		ms := total * 1000 / t.timescale()
		movieMs = max(movieMs, ms)
		traks = append(traks, trak(i+1, t, durs, offs, total, ms, base))
	}
	mvhd := fullBox("mvhd", 0, 0,
		u32(0), u32(0), u32(1000), u32(uint32(movieMs)),
		u32(0x00010000), u16(0x0100), make([]byte, 10), matrix(),
		make([]byte, 24), u32(uint32(len(tracks)+1)))
	return box("moov", append([][]byte{mvhd}, traks...)...)
}

func trak(id int, t *mp4Track, durs []uint32, offs []int32, total, ms, base int64) []byte {
	video := t.Kind == "video"
	var flags uint32 = 0x3 // enabled, in movie
	var group, volume uint16
	var w, h uint32
	if video {
		w, h = uint32(t.Width)<<16, uint32(t.Height)<<16
	} else {
		group, volume = 1, 0x0100
		if !t.Default {
			flags = 0x2 // an alternative the player can switch to
		}
	}
	tkhd := fullBox("tkhd", 0, flags,
		u32(0), u32(0), u32(uint32(id)), u32(0), u32(uint32(ms)),
		make([]byte, 8), u16(0), u16(group), u16(volume), u16(0), matrix(), u32(w), u32(h))
	mdhd := fullBox("mdhd", 0, 0, u32(0), u32(0), u32(uint32(t.timescale())), u32(uint32(total)), u16(0x55C4), u16(0))
	handler, name := "soun", t.Name
	if video {
		handler = "vide"
	}
	hdlr := fullBox("hdlr", 0, 0, u32(0), []byte(handler), make([]byte, 12), append([]byte(name), 0))
	var head []byte
	if video {
		head = fullBox("vmhd", 0, 1, make([]byte, 8))
	} else {
		head = fullBox("smhd", 0, 0, make([]byte, 4))
	}
	dinf := box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1)))
	stbl := box("stbl", sampleTables(t, durs, offs, base)...)
	return box("trak", tkhd, box("mdia", mdhd, hdlr, box("minf", head, dinf, stbl)))
}

func sampleTables(t *mp4Track, durs []uint32, offs []int32, base int64) [][]byte {
	n := len(t.samples)
	var entry []byte
	if t.Kind == "video" {
		name := make([]byte, 32)
		entry = box("avc1",
			make([]byte, 6), u16(1), make([]byte, 16),
			u16(uint16(t.Width)), u16(uint16(t.Height)),
			u32(0x00480000), u32(0x00480000), u32(0), u16(1), name,
			u16(0x0018), u16(0xFFFF),
			box("avcC", t.desc))
	} else {
		entry = box("mp4a",
			make([]byte, 6), u16(1), make([]byte, 8),
			u16(uint16(t.Channels)), u16(16), u16(0), u16(0), u32(uint32(t.Rate)<<16),
			esds(t.desc))
	}
	stsd := fullBox("stsd", 0, 0, u32(1), entry)

	// Durations, run length encoded.
	var stts []byte
	count := 0
	for i := range n {
		if i > 0 && durs[i] == durs[i-1] {
			continue
		}
		run := 1
		for i+run < n && durs[i+run] == durs[i] {
			run++
		}
		stts = append(stts, u32(uint32(run))...)
		stts = append(stts, u32(durs[i])...)
		count++
	}
	tables := [][]byte{stsd, fullBox("stts", 0, 0, u32(uint32(count)), stts)}

	if slices.ContainsFunc(offs, func(o int32) bool { return o != 0 }) {
		var ctts []byte
		for _, o := range offs {
			ctts = append(ctts, u32(1)...)
			ctts = append(ctts, u32(uint32(o))...)
		}
		tables = append(tables, fullBox("ctts", 1, 0, u32(uint32(n)), ctts))
	}
	if t.Kind == "video" {
		var stss []byte
		keys := 0
		for i, s := range t.samples {
			if s.key {
				stss = append(stss, u32(uint32(i+1))...)
				keys++
			}
		}
		tables = append(tables, fullBox("stss", 0, 0, u32(uint32(keys)), stss))
	}
	// One sample per chunk: the chunk offsets are the sample offsets.
	tables = append(tables, fullBox("stsc", 0, 0, u32(1), u32(1), u32(1), u32(1)))
	sizes := make([]byte, 0, 4*n)
	offsets := make([]byte, 0, 8*n)
	for _, s := range t.samples {
		sizes = append(sizes, u32(uint32(s.size))...)
		offsets = append(offsets, u64(uint64(base+s.pos))...)
	}
	tables = append(tables,
		fullBox("stsz", 0, 0, u32(0), u32(uint32(n)), sizes),
		fullBox("co64", 0, 0, u32(uint32(n)), offsets))
	return tables
}

// esds carries the AAC decoder configuration (MPEG-4 descriptors).
func esds(asc []byte) []byte {
	desc := func(tag byte, body ...[]byte) []byte {
		b := slices.Concat(body...)
		n := len(b)
		return append([]byte{tag, 0x80 | byte(n>>21), 0x80 | byte(n>>14), 0x80 | byte(n>>7), byte(n & 0x7F)}, b...)
	}
	dec := desc(0x04,
		[]byte{0x40, 0x15}, // MPEG-4 audio, audio stream
		[]byte{0, 0, 0}, u32(0), u32(0),
		desc(0x05, asc))
	return fullBox("esds", 0, 0, desc(0x03, u16(0), []byte{0}, dec, desc(0x06, []byte{0x02})))
}

// defaultASC is the AudioSpecificConfig of AAC-LC, for an encoder that
// gave none.
func defaultASC(rate, channels int) []byte {
	rates := []int{96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350}
	idx := slices.Index(rates, rate)
	if idx < 0 {
		idx = 3
	}
	return []byte{byte(2<<3 | idx>>1), byte(idx&1<<7 | channels<<3)}
}

func matrix() []byte {
	return slices.Concat(u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000))
}

func box(typ string, parts ...[]byte) []byte {
	body := slices.Concat(parts...)
	return slices.Concat(u32(uint32(len(body)+8)), []byte(typ), body)
}

func fullBox(typ string, version byte, flags uint32, parts ...[]byte) []byte {
	head := u32(uint32(version)<<24 | flags&0xFFFFFF)
	return box(typ, append([][]byte{head}, parts...)...)
}

func u16(v uint16) []byte { return binary.BigEndian.AppendUint16(nil, v) }
func u32(v uint32) []byte { return binary.BigEndian.AppendUint32(nil, v) }
func u64(v uint64) []byte { return binary.BigEndian.AppendUint64(nil, v) }
