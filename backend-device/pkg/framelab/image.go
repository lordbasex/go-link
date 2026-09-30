// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Package framelab is the plumbing of the video quality lab: packed RGB
// pictures, the scaling and color conversions the stream goes through,
// picture metrics (PSNR, SSIM), a lossless recording of an emulator run,
// an IVF writer and scripted controller input. cmd/framelab drives it.
package framelab

import (
	"bufio"
	"fmt"
	"image"
	"image/png"
	"os"
)

// Image is a packed 8-bit RGB picture: 3 bytes per pixel, no row padding.
type Image struct {
	W, H int
	Pix  []byte
}

// NewImage returns a black picture.
func NewImage(w, h int) Image { return Image{W: w, H: h, Pix: make([]byte, w*h*3)} }

// Clone returns a copy that shares no memory with img.
func (img Image) Clone() Image {
	return Image{W: img.W, H: img.H, Pix: append([]byte(nil), img.Pix...)}
}

// Nearest scales the picture up by an integer factor, repeating pixels.
func Nearest(src Image, factor int) Image {
	if factor == 1 {
		return src.Clone()
	}
	dst := NewImage(src.W*factor, src.H*factor)
	for y := 0; y < dst.H; y++ {
		sr := (y / factor) * src.W * 3
		dr := y * dst.W * 3
		for x := 0; x < dst.W; x++ {
			s := sr + (x/factor)*3
			d := dr + x*3
			dst.Pix[d], dst.Pix[d+1], dst.Pix[d+2] = src.Pix[s], src.Pix[s+1], src.Pix[s+2]
		}
	}
	return dst
}

// BoxDown scales the picture down by an integer factor, averaging each
// factor x factor block (rounded). It undoes Nearest exactly.
func BoxDown(src Image, factor int) Image {
	if factor == 1 {
		return src.Clone()
	}
	dst := NewImage(src.W/factor, src.H/factor)
	n := factor * factor
	for y := 0; y < dst.H; y++ {
		for x := 0; x < dst.W; x++ {
			var sum [3]int
			for dy := 0; dy < factor; dy++ {
				row := (y*factor + dy) * src.W * 3
				for dx := 0; dx < factor; dx++ {
					o := row + (x*factor+dx)*3
					sum[0] += int(src.Pix[o])
					sum[1] += int(src.Pix[o+1])
					sum[2] += int(src.Pix[o+2])
				}
			}
			d := (y*dst.W + x) * 3
			for c := 0; c < 3; c++ {
				dst.Pix[d+c] = byte((sum[c] + n/2) / n)
			}
		}
	}
	return dst
}

// Crop returns the rectangle (x, y, w, h), clamped to the picture.
func Crop(src Image, x, y, w, h int) Image {
	x, y = max(0, min(x, src.W)), max(0, min(y, src.H))
	w, h = max(0, min(w, src.W-x)), max(0, min(h, src.H-y))
	dst := NewImage(w, h)
	for r := 0; r < h; r++ {
		copy(dst.Pix[r*w*3:(r+1)*w*3], src.Pix[((y+r)*src.W+x)*3:])
	}
	return dst
}

// XRGB returns the picture as little-endian XRGB8888 rows (B, G, R, X in
// memory), the layout of a libretro frame.
func XRGB(src Image) []byte {
	out := make([]byte, src.W*src.H*4)
	for i, j := 0, 0; i < len(src.Pix); i, j = i+3, j+4 {
		out[j], out[j+1], out[j+2] = src.Pix[i+2], src.Pix[i+1], src.Pix[i]
	}
	return out
}

// ReadPNG loads a PNG as RGB (alpha is ignored).
func ReadPNG(path string) (Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return Image{}, err
	}
	defer f.Close()
	m, err := png.Decode(bufio.NewReader(f))
	if err != nil {
		return Image{}, fmt.Errorf("%s: %w", path, err)
	}
	return FromImage(m), nil
}

// FromImage converts any image.Image to RGB.
func FromImage(m image.Image) Image {
	b := m.Bounds()
	img := NewImage(b.Dx(), b.Dy())
	i := 0
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			r, g, bl, _ := m.At(x, y).RGBA()
			img.Pix[i], img.Pix[i+1], img.Pix[i+2] = byte(r>>8), byte(g>>8), byte(bl>>8)
			i += 3
		}
	}
	return img
}

// WritePNG saves the picture as a lossless PNG.
func WritePNG(path string, img Image) error {
	m := image.NewNRGBA(image.Rect(0, 0, img.W, img.H))
	for i, j := 0, 0; i < len(img.Pix); i, j = i+3, j+4 {
		m.Pix[j], m.Pix[j+1], m.Pix[j+2], m.Pix[j+3] = img.Pix[i], img.Pix[i+1], img.Pix[i+2], 255
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	w := bufio.NewWriter(f)
	enc := png.Encoder{CompressionLevel: png.BestSpeed}
	if err := enc.Encode(w, m); err != nil {
		f.Close()
		return err
	}
	if err := w.Flush(); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}
