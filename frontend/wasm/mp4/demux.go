// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Command mp4 (WebAssembly) holds the container half of turning a go-link recording
// (WebM: VP8 video, Opus sound) into an MP4 people can share: Demux finds
// every frame in the WebM without copying it, and Muxer writes the MP4 from
// the frames the browser re-encodes (H.264 and AAC through WebCodecs). It
// only uses the standard library, so it compiles to WebAssembly for the
// website (public/mp4/mp4.wasm).
package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
)

// Track is one track of the WebM.
type Track struct {
	Number       int
	Type         int // 1 video, 2 audio
	CodecID      string
	Name         string
	Width        int
	Height       int
	Channels     int
	Rate         float64
	CodecPrivate []byte
}

// Frame is where one frame sits in the file.
type Frame struct {
	Track  int
	TimeUs int64 // from the start of the file
	Offset int
	Size   int
}

// File is what Demux found.
type File struct {
	Tracks []Track
	Frames []Frame
}

// EBML element IDs (with their marker bits, as written in the file).
const (
	idSegment       = 0x18538067
	idInfo          = 0x1549A966
	idTimecodeScale = 0x2AD7B1
	idTracks        = 0x1654AE6B
	idTrackEntry    = 0xAE
	idTrackNumber   = 0xD7
	idTrackType     = 0x83
	idCodecID       = 0x86
	idName          = 0x536E
	idCodecPrivate  = 0x63A2
	idVideo         = 0xE0
	idPixelWidth    = 0xB0
	idPixelHeight   = 0xBA
	idAudio         = 0xE1
	idSampling      = 0xB5
	idChannels      = 0x9F
	idCluster       = 0x1F43B675
	idTimecode      = 0xE7
	idSimpleBlock   = 0xA3
	idBlockGroup    = 0xA0
	idBlock         = 0xA1
)

// Masters Demux walks into; every other element is skipped whole.
var masters = map[uint32]bool{
	idSegment: true, idInfo: true, idTracks: true, idTrackEntry: true,
	idVideo: true, idAudio: true, idCluster: true, idBlockGroup: true,
}

var errShort = errors.New("webm: file ends in the middle of an element")

// readVint reads an EBML variable size integer. With keepMarker the
// length marker stays (element IDs); unknown reports an all-ones size.
func readVint(b []byte, keepMarker bool) (v uint64, n int, unknown bool, err error) {
	if len(b) == 0 {
		return 0, 0, false, errShort
	}
	first := b[0]
	n = 1
	for mask := byte(0x80); n <= 8 && first&mask == 0; mask >>= 1 {
		n++
	}
	if n > 8 {
		return 0, 0, false, errors.New("webm: bad variable size integer")
	}
	if len(b) < n {
		return 0, 0, false, errShort
	}
	v = uint64(first)
	if !keepMarker {
		v &= uint64(0xFF >> n)
	}
	allOnes := v == uint64(0xFF>>n)
	for i := 1; i < n; i++ {
		v = v<<8 | uint64(b[i])
		allOnes = allOnes && b[i] == 0xFF
	}
	return v, n, allOnes && !keepMarker, nil
}

func readUint(b []byte) uint64 {
	var v uint64
	for _, c := range b {
		v = v<<8 | uint64(c)
	}
	return v
}

func readFloat(b []byte) float64 {
	switch len(b) {
	case 4:
		return float64(math.Float32frombits(binary.BigEndian.Uint32(b)))
	case 8:
		return math.Float64frombits(binary.BigEndian.Uint64(b))
	}
	return 0
}

// Demux lists the tracks and frames of a WebM file. It reads the file in
// one pass: masters it cares about are entered, the rest is skipped, and
// a master of unknown size (a file written live) simply goes on.
func Demux(b []byte) (*File, error) {
	f := &File{}
	scale := int64(1_000_000) // TimecodeScale in ns: 1 ms unless the file says
	var cluster int64
	var track *Track
	pos := 0
	for pos < len(b) {
		id, n, _, err := readVint(b[pos:], true)
		if err != nil {
			return nil, err
		}
		size, m, unknown, err := readVint(b[pos+n:], false)
		if err != nil {
			return nil, err
		}
		start := pos + n + m
		if masters[uint32(id)] {
			if id == idTrackEntry {
				f.Tracks = append(f.Tracks, Track{})
				track = &f.Tracks[len(f.Tracks)-1]
			}
			pos = start
			continue
		}
		if unknown {
			return nil, fmt.Errorf("webm: element %x has no size", id)
		}
		end := start + int(size)
		if size > uint64(len(b)) || end > len(b) {
			// A cut file (a recording that never closed): keep what came before.
			break
		}
		data := b[start:end]
		switch uint32(id) {
		case idTimecodeScale:
			if v := int64(readUint(data)); v > 0 {
				scale = v
			}
		case idTimecode:
			cluster = int64(readUint(data))
		case idSimpleBlock, idBlock:
			fr, err := blockFrame(data, start, cluster, scale)
			if err != nil {
				return nil, err
			}
			f.Frames = append(f.Frames, fr)
		}
		if track != nil {
			switch uint32(id) {
			case idTrackNumber:
				track.Number = int(readUint(data))
			case idTrackType:
				track.Type = int(readUint(data))
			case idCodecID:
				track.CodecID = string(data)
			case idName:
				track.Name = string(data)
			case idCodecPrivate:
				track.CodecPrivate = data
			case idPixelWidth:
				track.Width = int(readUint(data))
			case idPixelHeight:
				track.Height = int(readUint(data))
			case idSampling:
				track.Rate = readFloat(data)
			case idChannels:
				track.Channels = int(readUint(data))
			}
		}
		pos = end
	}
	if len(f.Tracks) == 0 {
		return nil, errors.New("webm: no tracks")
	}
	return f, nil
}

// blockFrame reads a (Simple)Block header: track number, a 16 bit time
// relative to the cluster, flags; laced blocks are not used by go-link.
func blockFrame(data []byte, at int, cluster, scale int64) (Frame, error) {
	tn, n, _, err := readVint(data, false)
	if err != nil {
		return Frame{}, err
	}
	if len(data) < n+3 {
		return Frame{}, errShort
	}
	rel := int64(int16(binary.BigEndian.Uint16(data[n:])))
	if data[n+2]&0x06 != 0 {
		return Frame{}, errors.New("webm: laced blocks are not supported")
	}
	head := n + 3
	return Frame{
		Track:  int(tn),
		TimeUs: (cluster + rel) * scale / 1000,
		Offset: at + head,
		Size:   len(data) - head,
	}, nil
}
