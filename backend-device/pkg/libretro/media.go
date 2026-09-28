// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package libretro

// FrameSizeI420 returns the byte length of a packed I420 frame.
func FrameSizeI420(w, h int) int {
	cw, ch := (w+1)/2, (h+1)/2
	return w*h + 2*cw*ch
}

func rgbOf(f Frame, x, y int) (r, g, b int) {
	switch f.Format {
	case FormatXRGB8888:
		o := y*f.Pitch + x*4
		return int(f.Data[o+2]), int(f.Data[o+1]), int(f.Data[o])
	case FormatRGB565:
		o := y*f.Pitch + x*2
		v := int(f.Data[o]) | int(f.Data[o+1])<<8
		return (v >> 11 & 31) << 3, (v >> 5 & 63) << 2, (v & 31) << 3
	default: // 0RGB1555
		o := y*f.Pitch + x*2
		v := int(f.Data[o]) | int(f.Data[o+1])<<8
		return (v >> 10 & 31) << 3, (v >> 5 & 31) << 3, (v & 31) << 3
	}
}

// ToI420 converts a frame to packed I420 (BT.601 limited range), the
// input of the VP8 encoder. dst must have FrameSizeI420 bytes. Chroma is
// taken from the top-left pixel of each 2x2 block, which is enough for
// the flat colors of arcade games and keeps the conversion cheap.
func ToI420(dst []byte, f Frame) {
	w, h := f.Width, f.Height
	cw := (w + 1) / 2
	yPlane := dst[:w*h]
	uPlane := dst[w*h : w*h+cw*((h+1)/2)]
	vPlane := dst[w*h+cw*((h+1)/2):]
	for y := 0; y < h; y++ {
		row := y * w
		for x := 0; x < w; x++ {
			r, g, b := rgbOf(f, x, y)
			yPlane[row+x] = byte((66*r+129*g+25*b+128)>>8 + 16)
			if x%2 == 0 && y%2 == 0 {
				i := (y/2)*cw + x/2
				uPlane[i] = byte((-38*r-74*g+112*b+128)>>8 + 128)
				vPlane[i] = byte((112*r-94*g-18*b+128)>>8 + 128)
			}
		}
	}
}

// Resampler converts interleaved stereo 16-bit audio between sample rates
// with linear interpolation, keeping state between calls so there are no
// clicks at buffer boundaries.
type Resampler struct {
	step float64 // input samples per output sample
	pos  float64 // position of the next output sample, relative to prev
	prev [2]int16
	out  []int16
}

// NewResampler converts from rate `from` to rate `to`.
func NewResampler(from, to float64) *Resampler {
	return &Resampler{step: from / to}
}

// Process consumes interleaved stereo input and returns resampled output.
// The returned slice is reused by the next call.
func (r *Resampler) Process(in []int16) []int16 {
	r.out = r.out[:0]
	frames := len(in) / 2
	if r.step == 1 {
		return append(r.out, in[:frames*2]...)
	}
	sample := func(i int, ch int) float64 {
		if i < 0 {
			return float64(r.prev[ch])
		}
		return float64(in[i*2+ch])
	}
	// Positions are measured from prev (index -1) to the last input frame.
	for r.pos < float64(frames) {
		i := int(r.pos) - 1
		frac := r.pos - float64(int(r.pos))
		for ch := 0; ch < 2; ch++ {
			a, b := sample(i, ch), sample(i+1, ch)
			r.out = append(r.out, int16(a+(b-a)*frac))
		}
		r.pos += r.step
	}
	r.pos -= float64(frames)
	if frames > 0 {
		r.prev = [2]int16{in[(frames-1)*2], in[(frames-1)*2+1]}
	}
	return r.out
}
