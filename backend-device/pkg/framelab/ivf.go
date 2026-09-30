// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package framelab

import (
	"bufio"
	"encoding/binary"
	"io"
	"os"
)

// IVFWriter writes compressed frames to an IVF file, the plain container
// libvpx tools and ffmpeg read.
type IVFWriter struct {
	f      *os.File
	w      *bufio.Writer
	frames uint32
}

// CreateIVF creates an IVF file. fourcc is "VP80" or "VP90"; the time base
// is 1/fps, one tick per frame.
func CreateIVF(path, fourcc string, width, height, fps int) (*IVFWriter, error) {
	f, err := os.Create(path)
	if err != nil {
		return nil, err
	}
	iw := &IVFWriter{f: f, w: bufio.NewWriter(f)}
	if _, err := iw.w.Write(ivfHeader(fourcc, width, height, fps, 0)); err != nil {
		f.Close()
		return nil, err
	}
	return iw, nil
}

func ivfHeader(fourcc string, width, height, fps int, frames uint32) []byte {
	h := make([]byte, 32)
	copy(h[0:4], "DKIF")
	binary.LittleEndian.PutUint16(h[4:], 0)  // version
	binary.LittleEndian.PutUint16(h[6:], 32) // header size
	copy(h[8:12], fourcc)
	binary.LittleEndian.PutUint16(h[12:], uint16(width))
	binary.LittleEndian.PutUint16(h[14:], uint16(height))
	binary.LittleEndian.PutUint32(h[16:], uint32(fps)) // time base denominator
	binary.LittleEndian.PutUint32(h[20:], 1)           // numerator
	binary.LittleEndian.PutUint32(h[24:], frames)
	return h
}

// Write appends one compressed frame shown at pts (in frames).
func (iw *IVFWriter) Write(data []byte, pts int64) error {
	var h [12]byte
	binary.LittleEndian.PutUint32(h[:4], uint32(len(data)))
	binary.LittleEndian.PutUint64(h[4:], uint64(pts))
	if _, err := iw.w.Write(h[:]); err != nil {
		return err
	}
	_, err := iw.w.Write(data)
	iw.frames++
	return err
}

// Close fixes the frame count in the header and closes the file.
func (iw *IVFWriter) Close() error {
	if err := iw.w.Flush(); err != nil {
		iw.f.Close()
		return err
	}
	var n [4]byte
	binary.LittleEndian.PutUint32(n[:], iw.frames)
	if _, err := iw.f.Seek(24, io.SeekStart); err != nil {
		iw.f.Close()
		return err
	}
	if _, err := iw.f.Write(n[:]); err != nil {
		iw.f.Close()
		return err
	}
	return iw.f.Close()
}
