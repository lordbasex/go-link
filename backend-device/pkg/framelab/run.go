// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package framelab

import (
	"bufio"
	"compress/gzip"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
)

// runMagic starts a run file: every frame of an emulator run, lossless,
// as gzip-compressed RGB (width and height as two little-endian uint32,
// then the pixels). Arcade pictures compress about tenfold.
const runMagic = "GLRUN1\n"

// RunWriter records frames to a run file.
type RunWriter struct {
	f  *os.File
	bw *bufio.Writer
	zw *gzip.Writer
	n  int
}

// CreateRun creates a run file.
func CreateRun(path string) (*RunWriter, error) {
	f, err := os.Create(path)
	if err != nil {
		return nil, err
	}
	bw := bufio.NewWriterSize(f, 1<<20)
	zw, _ := gzip.NewWriterLevel(bw, gzip.BestSpeed)
	if _, err := zw.Write([]byte(runMagic)); err != nil {
		f.Close()
		return nil, err
	}
	return &RunWriter{f: f, bw: bw, zw: zw}, nil
}

// Write appends one frame.
func (r *RunWriter) Write(img Image) error {
	var hdr [8]byte
	binary.LittleEndian.PutUint32(hdr[:4], uint32(img.W))
	binary.LittleEndian.PutUint32(hdr[4:], uint32(img.H))
	if _, err := r.zw.Write(hdr[:]); err != nil {
		return err
	}
	_, err := r.zw.Write(img.Pix)
	r.n++
	return err
}

// Frames is the number of frames written.
func (r *RunWriter) Frames() int { return r.n }

// Close flushes and closes the file.
func (r *RunWriter) Close() error {
	err := r.zw.Close()
	if e := r.bw.Flush(); err == nil {
		err = e
	}
	if e := r.f.Close(); err == nil {
		err = e
	}
	return err
}

// RunReader reads a run file frame by frame.
type RunReader struct {
	f  *os.File
	zr *gzip.Reader
	br *bufio.Reader
}

// OpenRun opens a run file.
func OpenRun(path string) (*RunReader, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	zr, err := gzip.NewReader(bufio.NewReaderSize(f, 1<<20))
	if err != nil {
		f.Close()
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	br := bufio.NewReaderSize(zr, 1<<20)
	magic := make([]byte, len(runMagic))
	if _, err := io.ReadFull(br, magic); err != nil || string(magic) != runMagic {
		f.Close()
		return nil, fmt.Errorf("%s: not a run file", path)
	}
	return &RunReader{f: f, zr: zr, br: br}, nil
}

// Next returns the next frame, or io.EOF after the last one.
func (r *RunReader) Next() (Image, error) {
	var hdr [8]byte
	if _, err := io.ReadFull(r.br, hdr[:]); err != nil {
		if errors.Is(err, io.ErrUnexpectedEOF) {
			return Image{}, fmt.Errorf("run file: truncated frame header")
		}
		return Image{}, err
	}
	w, h := int(binary.LittleEndian.Uint32(hdr[:4])), int(binary.LittleEndian.Uint32(hdr[4:]))
	if w <= 0 || h <= 0 || w > 8192 || h > 8192 {
		return Image{}, fmt.Errorf("run file: bad frame size %dx%d", w, h)
	}
	img := NewImage(w, h)
	if _, err := io.ReadFull(r.br, img.Pix); err != nil {
		return Image{}, fmt.Errorf("run file: truncated frame: %w", err)
	}
	return img, nil
}

// Close closes the file.
func (r *RunReader) Close() error { return r.f.Close() }
