// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package main

import (
	"bytes"
	"encoding/binary"
	"testing"
)

type testSample struct {
	pts  int64
	key  bool
	data []byte
}

type testSamples struct {
	avcC, asc    []byte
	video, audio []testSample
}

// children walks the boxes inside b and calls fn with each type and body.
func children(b []byte, fn func(typ string, body []byte)) {
	for len(b) >= 8 {
		size := int(binary.BigEndian.Uint32(b))
		head := 8
		if size == 1 {
			size, head = int(binary.BigEndian.Uint64(b[8:])), 16
		}
		if size < head || size > len(b) {
			return
		}
		fn(string(b[4:8]), b[head:size])
		b = b[size:]
	}
}

// descriptor finds an MPEG-4 descriptor with this tag inside an esds.
func descriptor(b []byte, tag byte) []byte {
	for i := 0; i < len(b); {
		t := b[i]
		i++
		n := 0
		for {
			c := b[i]
			i++
			n = n<<7 | int(c&0x7F)
			if c&0x80 == 0 {
				break
			}
		}
		if t == tag {
			return b[i : i+n]
		}
		switch t {
		case 0x03:
			i += 3 // ES_ID and flags: its children follow
		case 0x04:
			i += 13
		default:
			i += n
		}
	}
	return nil
}

// readSamples reads every sample of a (non fragmented) MP4, for tests.
func readSamples(t *testing.T, file []byte) testSamples {
	var out testSamples
	children(file, func(typ string, moov []byte) {
		if typ != "moov" {
			return
		}
		children(moov, func(typ string, trak []byte) {
			if typ != "trak" {
				return
			}
			var handler string
			var scale int64
			var stbl []byte
			children(trak, func(typ string, mdia []byte) {
				if typ != "mdia" {
					return
				}
				children(mdia, func(typ string, b []byte) {
					switch typ {
					case "mdhd":
						scale = int64(binary.BigEndian.Uint32(b[12:]))
					case "hdlr":
						handler = string(b[8:12])
					case "minf":
						children(b, func(typ string, b []byte) {
							if typ == "stbl" {
								stbl = b
							}
						})
					}
				})
			})
			var durs, offs, sizes []int64
			var chunkOffsets []int64
			var stsc [][3]int64
			keys := map[int]bool{}
			hasStss := false
			var avcC, asc []byte
			children(stbl, func(typ string, b []byte) {
				switch typ {
				case "stsd":
					if i := bytes.Index(b, []byte("avcC")); i > 0 {
						n := int(binary.BigEndian.Uint32(b[i-4:]))
						avcC = b[i+4 : i-4+n]
					}
					if i := bytes.Index(b, []byte("esds")); i > 0 {
						asc = descriptor(b[i+8:], 0x05)
					}
				case "stts":
					for i, n := 0, int(binary.BigEndian.Uint32(b[4:])); i < n; i++ {
						c, d := binary.BigEndian.Uint32(b[8+8*i:]), binary.BigEndian.Uint32(b[12+8*i:])
						for range c {
							durs = append(durs, int64(d))
						}
					}
				case "ctts":
					for i, n := 0, int(binary.BigEndian.Uint32(b[4:])); i < n; i++ {
						c, o := binary.BigEndian.Uint32(b[8+8*i:]), int32(binary.BigEndian.Uint32(b[12+8*i:]))
						for range c {
							offs = append(offs, int64(o))
						}
					}
				case "stsz":
					for i, n := 0, int(binary.BigEndian.Uint32(b[8:])); i < n; i++ {
						sizes = append(sizes, int64(binary.BigEndian.Uint32(b[12+4*i:])))
					}
				case "stsc":
					for i, n := 0, int(binary.BigEndian.Uint32(b[4:])); i < n; i++ {
						stsc = append(stsc, [3]int64{int64(binary.BigEndian.Uint32(b[8+12*i:])), int64(binary.BigEndian.Uint32(b[12+12*i:])), 0})
					}
				case "stco":
					for i, n := 0, int(binary.BigEndian.Uint32(b[4:])); i < n; i++ {
						chunkOffsets = append(chunkOffsets, int64(binary.BigEndian.Uint32(b[8+4*i:])))
					}
				case "co64":
					for i, n := 0, int(binary.BigEndian.Uint32(b[4:])); i < n; i++ {
						chunkOffsets = append(chunkOffsets, int64(binary.BigEndian.Uint64(b[8+8*i:])))
					}
				case "stss":
					hasStss = true
					for i, n := 0, int(binary.BigEndian.Uint32(b[4:])); i < n; i++ {
						keys[int(binary.BigEndian.Uint32(b[8+4*i:]))] = true
					}
				}
			})
			// Sample positions from the chunk table.
			var samples []testSample
			s, dts := 0, int64(0)
			for c := range chunkOffsets {
				per := int64(0)
				for _, e := range stsc {
					if int64(c+1) >= e[0] {
						per = e[1]
					}
				}
				pos := chunkOffsets[c]
				for range per {
					if s >= len(sizes) {
						break
					}
					pts := dts
					if s < len(offs) {
						pts += offs[s]
					}
					samples = append(samples, testSample{
						pts:  pts * 1_000_000 / scale,
						key:  !hasStss || keys[s+1],
						data: file[pos : pos+sizes[s]],
					})
					pos += sizes[s]
					dts += durs[s]
					s++
				}
			}
			switch handler {
			case "vide":
				out.video, out.avcC = samples, avcC
			case "soun":
				out.audio, out.asc = samples, asc
			}
		})
	})
	if len(out.video) == 0 || len(out.audio) == 0 || out.avcC == nil || out.asc == nil {
		t.Fatalf("could not read the test file: %d video, %d audio", len(out.video), len(out.audio))
	}
	return out
}
