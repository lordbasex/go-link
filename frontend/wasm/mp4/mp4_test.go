// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package main

import (
	"bytes"
	"encoding/binary"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// el writes one EBML element with an 8 byte size.
func el(id uint32, body ...[]byte) []byte {
	var idb []byte
	for v := id; v > 0; v >>= 8 {
		idb = append([]byte{byte(v)}, idb...)
	}
	b := bytes.Join(body, nil)
	size := make([]byte, 8)
	binary.BigEndian.PutUint64(size, uint64(len(b)))
	size[0] = 0x01
	return append(append(idb, size...), b...)
}

func uintEl(id uint32, v uint64) []byte { return el(id, binary.BigEndian.AppendUint64(nil, v)) }

func block(track byte, rel int16, data []byte) []byte {
	return el(idSimpleBlock, []byte{0x80 | track}, binary.BigEndian.AppendUint16(nil, uint16(rel)), []byte{0x80}, data)
}

func TestDemuxFindsTracksAndFrames(t *testing.T) {
	file := bytes.Join([][]byte{
		el(0x1A45DFA3, el(0x4282, []byte("webm"))),
		el(idSegment,
			el(idInfo, uintEl(idTimecodeScale, 1_000_000)),
			el(idTracks,
				el(idTrackEntry, uintEl(idTrackNumber, 1), uintEl(idTrackType, 1), el(idCodecID, []byte("V_VP8")), el(idName, []byte("Game video")),
					el(idVideo, uintEl(idPixelWidth, 288), uintEl(idPixelHeight, 224))),
				el(idTrackEntry, uintEl(idTrackNumber, 2), uintEl(idTrackType, 2), el(idCodecID, []byte("A_OPUS")), el(idCodecPrivate, []byte("OpusHead")),
					el(idAudio, el(idSampling, binary.BigEndian.AppendUint64(nil, 0x40E7700000000000)), uintEl(idChannels, 2)))),
			el(idCluster, uintEl(idTimecode, 1000), block(1, 0, []byte{0x10, 1, 2}), block(2, 20, []byte{9, 9})),
			el(0x1C53BB6B, []byte{1, 2, 3}), // cues: skipped
		),
	}, nil)
	f, err := Demux(file)
	if err != nil {
		t.Fatal(err)
	}
	if len(f.Tracks) != 2 || f.Tracks[0].Width != 288 || f.Tracks[0].Height != 224 || f.Tracks[1].Rate != 48000 ||
		f.Tracks[1].Channels != 2 || f.Tracks[0].Name != "Game video" || string(f.Tracks[1].CodecPrivate) != "OpusHead" {
		t.Fatalf("tracks: %+v", f.Tracks)
	}
	if len(f.Frames) != 2 {
		t.Fatalf("frames: %+v", f.Frames)
	}
	v, a := f.Frames[0], f.Frames[1]
	if v.Track != 1 || v.TimeUs != 1_000_000 || !bytes.Equal(file[v.Offset:v.Offset+v.Size], []byte{0x10, 1, 2}) {
		t.Fatalf("video frame: %+v", v)
	}
	if a.Track != 2 || a.TimeUs != 1_020_000 || !bytes.Equal(file[a.Offset:a.Offset+a.Size], []byte{9, 9}) {
		t.Fatalf("audio frame: %+v", a)
	}
}

func TestDemuxKeepsWhatCameBeforeACut(t *testing.T) {
	whole := el(idSegment,
		el(idTracks, el(idTrackEntry, uintEl(idTrackNumber, 1), uintEl(idTrackType, 2))),
		el(idCluster, uintEl(idTimecode, 0), block(1, 0, []byte{1}), block(1, 20, []byte{2, 2, 2, 2})))
	f, err := Demux(whole[:len(whole)-2])
	if err != nil || len(f.Frames) != 1 {
		t.Fatalf("got %v, %+v", err, f)
	}
}

// boxes lists the top level boxes of an MP4.
func boxes(t *testing.T, b []byte) map[string][]byte {
	out := map[string][]byte{}
	for len(b) >= 8 {
		size := int(binary.BigEndian.Uint32(b))
		if size < 8 || size > len(b) {
			t.Fatalf("bad box size %d", size)
		}
		out[string(b[4:8])] = b[8:size]
		b = b[size:]
	}
	return out
}

// find returns the first box of that type anywhere inside b.
func find(b []byte, typ string) []byte {
	i := bytes.Index(b, []byte(typ))
	if i < 4 {
		return nil
	}
	size := int(binary.BigEndian.Uint32(b[i-4:]))
	return b[i+4 : i-4+size]
}

func TestMuxerIndexPointsAtTheData(t *testing.T) {
	m, err := NewMuxer([]TrackConfig{
		{Kind: "video", Width: 576, Height: 448, Name: "Game"},
		{Kind: "audio", Rate: 48000, Channels: 2, Name: "Game and voices", Default: true},
		{Kind: "audio", Rate: 48000, Channels: 2, Name: "Voices"}, // no samples: left out
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = m.SetDescription(0, []byte{1, 0x42, 0xE0, 0x28, 0xFF, 0xE0, 0})
	for i := range 4 {
		_ = m.Add(0, int64(i)*16_667, i == 0, []byte{byte(0xA0 + i), 0xBB})
		_ = m.Add(1, int64(i)*21_333, true, []byte{byte(0xC0 + i)})
	}
	out, err := m.Finish()
	if err != nil {
		t.Fatal(err)
	}
	top := boxes(t, out)
	if top["ftyp"] == nil || top["moov"] == nil || top["mdat"] == nil {
		t.Fatalf("boxes: %v", len(top))
	}
	if bytes.Index(out, []byte("moov")) > bytes.Index(out, []byte("mdat")) {
		t.Fatal("the index must come before the data")
	}
	if n := bytes.Count(top["moov"], []byte("trak")); n != 2 {
		t.Fatalf("%d tracks, want 2 (the empty one is left out)", n)
	}
	// Every chunk offset of the video track points at its sample.
	co := find(top["moov"], "co64")
	n := int(binary.BigEndian.Uint32(co[4:]))
	if n != 4 {
		t.Fatalf("%d video samples", n)
	}
	for i := range n {
		off := binary.BigEndian.Uint64(co[8+8*i:])
		if out[off] != byte(0xA0+i) {
			t.Fatalf("sample %d at %d is %x", i, off, out[off])
		}
	}
	if find(top["moov"], "esds") == nil || find(top["moov"], "avcC") == nil || find(top["moov"], "stss") == nil {
		t.Fatal("missing decoder configuration or sync table")
	}
}

func TestMuxerWritesCompositionOffsetsForReorderedFrames(t *testing.T) {
	m, _ := NewMuxer([]TrackConfig{{Kind: "video", Width: 64, Height: 64}})
	_ = m.SetDescription(0, []byte{1, 0x64, 0, 0x1F, 0xFF, 0xE0, 0})
	for _, pts := range []int64{0, 100_000, 33_333, 66_667} { // I P B B
		_ = m.Add(0, pts, pts == 0, []byte{1})
	}
	out, _ := m.Finish()
	if find(out, "ctts") == nil {
		t.Fatal("reordered frames need a ctts box")
	}
}

func TestDefaultASC(t *testing.T) {
	if got := defaultASC(48000, 2); !bytes.Equal(got, []byte{0x11, 0x90}) {
		t.Fatalf("%x", got)
	}
}

// With ffmpeg on the computer, a real H.264 + AAC stream goes through the
// muxer and ffprobe must read it back.
func TestMuxerOutputPlays(t *testing.T) {
	ffmpeg, err1 := exec.LookPath("ffmpeg")
	ffprobe, err2 := exec.LookPath("ffprobe")
	if err1 != nil || err2 != nil {
		t.Skip("no ffmpeg")
	}
	dir := t.TempDir()
	src := filepath.Join(dir, "src.mp4")
	cmd := exec.Command(ffmpeg, "-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=30:duration=1",
		"-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
		"-c:v", "libx264", "-bf", "2", "-g", "15", "-c:a", "aac", "-ac", "2", src)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Skipf("ffmpeg cannot make the test file: %v %s", err, out)
	}
	// Read the samples back out of ffmpeg's file with our own tools: take
	// the avcC/esds and every sample, and mux them again.
	b, _ := os.ReadFile(src)
	s := readSamples(t, b)
	m, _ := NewMuxer([]TrackConfig{{Kind: "video", Width: 160, Height: 120}, {Kind: "audio", Rate: 48000, Channels: 2, Default: true}})
	_ = m.SetDescription(0, s.avcC)
	_ = m.SetDescription(1, s.asc)
	for _, x := range s.video {
		_ = m.Add(0, x.pts, x.key, x.data)
	}
	for _, x := range s.audio {
		_ = m.Add(1, x.pts, true, x.data)
	}
	out, err := m.Finish()
	if err != nil {
		t.Fatal(err)
	}
	dst := filepath.Join(dir, "dst.mp4")
	_ = os.WriteFile(dst, out, 0o600)
	res, err := exec.Command(ffmpeg, "-v", "error", "-i", dst, "-f", "null", "-").CombinedOutput()
	if err != nil || len(res) > 0 {
		t.Fatalf("ffmpeg cannot decode the muxed file: %v %s", err, res)
	}
	probe, _ := exec.Command(ffprobe, "-v", "error", "-count_frames", "-show_entries", "stream=codec_name,nb_read_frames", "-of", "csv=p=0", dst).Output()
	if !bytes.Contains(probe, []byte("h264,30")) || !bytes.Contains(probe, []byte("aac,")) {
		t.Fatalf("ffprobe: %s", probe)
	}
}

// GO_LINK_RECORDING=path/to/recording.webm checks a real recording.
func TestDemuxRealRecording(t *testing.T) {
	path := os.Getenv("GO_LINK_RECORDING")
	if path == "" {
		t.Skip("set GO_LINK_RECORDING")
	}
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	f, err := Demux(b)
	if err != nil {
		t.Fatal(err)
	}
	count := map[int]int{}
	for _, fr := range f.Frames {
		count[fr.Track]++
	}
	for _, tr := range f.Tracks {
		t.Logf("track %d %s %q %dx%d %d ch %.0f Hz: %d frames", tr.Number, tr.CodecID, tr.Name, tr.Width, tr.Height, tr.Channels, tr.Rate, count[tr.Number])
	}
	if count[1] == 0 || count[2] == 0 {
		t.Fatal("no video or no game sound")
	}
}

func TestMuxerDecodeTimesMoveForward(t *testing.T) {
	m, _ := NewMuxer([]TrackConfig{{Kind: "video", Width: 64, Height: 64}})
	for _, pts := range []int64{0, 16_667, 16_667, 33_333} {
		_ = m.Add(0, pts, pts == 0, []byte{1})
	}
	durs, _, _ := m.tracks[0].timing()
	for i, d := range durs[:len(durs)-1] {
		if d == 0 {
			t.Fatalf("sample %d has no duration: %v", i, durs)
		}
	}
}

func TestMuxerInterleavesTracksByTime(t *testing.T) {
	m, _ := NewMuxer([]TrackConfig{{Kind: "video", Width: 64, Height: 64}, {Kind: "audio", Rate: 48000, Channels: 2, Default: true}})
	_ = m.SetDescription(0, []byte{1, 0x42, 0xE0, 0x28, 0xFF, 0xE0, 0})
	// All video first, then all sound, as the browser adds them.
	for i := range 3 {
		_ = m.Add(0, int64(i)*1_000_000, i == 0, []byte{'v', byte(i)})
	}
	for i := range 3 {
		_ = m.Add(1, int64(i)*1_000_000+500_000, true, []byte{'a', byte(i)})
	}
	out, _ := m.Finish()
	mdat := out[bytes.LastIndex(out, []byte("mdat"))+4:]
	if string(mdat) != "v\x00a\x00v\x01a\x01v\x02a\x02" {
		t.Fatalf("data order %q, want video and sound alternating", mdat)
	}
	// And the index still points at each sample.
	co := find(out, "co64")
	for i := range 3 {
		off := binary.BigEndian.Uint64(co[8+8*i:])
		if out[off] != 'v' || out[off+1] != byte(i) {
			t.Fatalf("video sample %d moved", i)
		}
	}
}
