// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Package hdscene draws go-link HD's test scene (experiment T-31,
// docs/experiments/hd-streaming.md): two pictures scrolling at different
// speeds, like a 2D game's far and play layers, and a ball bouncing over
// them, at any size (720p, 1080p, 4K). It composes straight into packed
// I420: each layer is converted once, the play layer keeps its opaque runs
// per row (#FF00FF is transparent), and a frame is mostly memory copies,
// so drawing stays far below the encoder's time.
package hdscene

import (
	"image"
	"math"

	xdraw "golang.org/x/image/draw"
)

type plane struct {
	w, h int
	pix  []byte
}

// layer is a picture as I420 planes, as wide as its aspect gives at the scene's height.
type layer struct {
	w       int
	y, u, v plane
	// runs[row] are the [start, end) spans of opaque pixels of each luma row (the play layer)
	runs [][][2]int
	// cruns[row] the same for each chroma row
	cruns [][][2]int
}

// Scene is one test scene at one size. Not safe for concurrent use.
type Scene struct {
	W, H      int
	far, play *layer
	frame     []byte
}

// New makes a scene of w x h from a far picture and an optional play
// picture (its #FF00FF is transparent).
func New(w, h int, far, play image.Image) *Scene {
	s := &Scene{W: w, H: h, frame: make([]byte, FrameSize(w, h))}
	s.far = newLayer(far, w, h, false)
	if play != nil {
		s.play = newLayer(play, w, h, true)
	}
	return s
}

// FrameSize is a packed I420 frame's byte length.
func FrameSize(w, h int) int {
	cw, ch := (w+1)/2, (h+1)/2
	return w*h + 2*cw*ch
}

func isKey(r, g, b uint8) bool { return r > 200 && g < 80 && b > 200 }

func newLayer(img image.Image, minW, h int, keyed bool) *layer {
	b := img.Bounds()
	w := max(b.Dx()*h/max(1, b.Dy()), minW)
	w += w & 1
	rgba := image.NewRGBA(image.Rect(0, 0, w, h))
	// nearest keeps the magenta key exact on the play layer; Catmull-Rom looks better on the far one
	scaler := xdraw.Interpolator(xdraw.CatmullRom)
	if keyed {
		scaler = xdraw.NearestNeighbor
	}
	scaler.Scale(rgba, rgba.Bounds(), img, b, xdraw.Src, nil)
	cw, ch := w/2, (h+1)/2
	l := &layer{w: w, y: plane{w, h, make([]byte, w*h)}, u: plane{cw, ch, make([]byte, cw*ch)}, v: plane{cw, ch, make([]byte, cw*ch)}}
	opaque := make([]bool, w*h)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			o := y*rgba.Stride + x*4
			r, g, bl := int(rgba.Pix[o]), int(rgba.Pix[o+1]), int(rgba.Pix[o+2])
			opaque[y*w+x] = !keyed || !isKey(uint8(r), uint8(g), uint8(bl))
			l.y.pix[y*w+x] = byte((66*r+129*g+25*bl+128)>>8 + 16)
			if x&1 == 0 && y&1 == 0 {
				i := (y/2)*cw + x/2
				l.u.pix[i] = byte((-38*r-74*g+112*bl+128)>>8 + 128)
				l.v.pix[i] = byte((112*r-94*g-18*bl+128)>>8 + 128)
			}
		}
	}
	if keyed {
		l.runs = make([][][2]int, h)
		for y := 0; y < h; y++ {
			l.runs[y] = runsOf(func(x int) bool { return opaque[y*w+x] }, w)
		}
		l.cruns = make([][][2]int, ch)
		for y := 0; y < ch; y++ {
			l.cruns[y] = runsOf(func(x int) bool { return opaque[(2*y)*w+2*x] }, cw)
		}
	}
	return l
}

func runsOf(on func(x int) bool, w int) [][2]int {
	var out [][2]int
	for x := 0; x < w; {
		if !on(x) {
			x++
			continue
		}
		s := x
		for x < w && on(x) {
			x++
		}
		out = append(out, [2]int{s, x})
	}
	return out
}

// copyWrapped copies n bytes of a looping row from offset off into dst.
func copyWrapped(dst, row []byte, off, n int) {
	w := len(row)
	off %= w
	for n > 0 {
		k := min(n, w-off)
		copy(dst[:k], row[off:off+k])
		dst, n, off = dst[k:], n-k, 0
	}
}

// overlay copies the opaque runs of a looping keyed row, seen from offset off, into dst (n wide).
func overlay(dst, row []byte, runs [][2]int, off, n int) {
	w := len(row)
	off %= w
	for _, r := range runs {
		// the run as seen through the window [off, off + n), in up to two laps
		for lap := 0; lap < 2; lap++ {
			s, e := r[0]+lap*w-off, r[1]+lap*w-off
			if e <= 0 || s >= n {
				continue
			}
			s, e = max(s, 0), min(e, n)
			copy(dst[s:e], row[(s+off)%w:(s+off)%w+(e-s)])
		}
	}
}

// Draw makes frame t (60 a second) and returns it as packed I420 (valid until the next Draw).
func (s *Scene) Draw(t int) []byte {
	w, h := s.W, s.H
	cw, ch := (w+1)/2, (h+1)/2
	speed := max(2, w/480) // 4 px a frame at 1080p
	speed &^= 1
	fx := t * speed / 2
	px := t * speed
	yp := s.frame[:w*h]
	up := s.frame[w*h : w*h+cw*ch]
	vp := s.frame[w*h+cw*ch:]
	for y := 0; y < h; y++ {
		copyWrapped(yp[y*w:(y+1)*w], s.far.y.pix[y*s.far.w:(y+1)*s.far.w], fx, w)
		if s.play != nil {
			overlay(yp[y*w:(y+1)*w], s.play.y.pix[y*s.play.w:(y+1)*s.play.w], s.play.runs[y], px, w)
		}
	}
	fcw, pcw := s.far.u.w, 0
	if s.play != nil {
		pcw = s.play.u.w
	}
	for y := 0; y < ch; y++ {
		copyWrapped(up[y*cw:(y+1)*cw], s.far.u.pix[y*fcw:(y+1)*fcw], fx/2, cw)
		copyWrapped(vp[y*cw:(y+1)*cw], s.far.v.pix[y*fcw:(y+1)*fcw], fx/2, cw)
		if s.play != nil {
			overlay(up[y*cw:(y+1)*cw], s.play.u.pix[y*pcw:(y+1)*pcw], s.play.cruns[y], px/2, cw)
			overlay(vp[y*cw:(y+1)*cw], s.play.v.pix[y*pcw:(y+1)*pcw], s.play.cruns[y], px/2, cw)
		}
	}
	// a ball bouncing across, a light yellow
	r := h / 18
	bx := (t*speed*2)%(w+2*r) - r
	by := h/2 + int(float64(h/3)*math.Abs(math.Sin(float64(t)/30)))
	for dy := -r; dy <= r; dy++ {
		yy := by + dy
		if yy < 0 || yy >= h {
			continue
		}
		half := int(math.Sqrt(float64(r*r - dy*dy)))
		x0, x1 := max(bx-half, 0), min(bx+half, w-1)
		for x := x0; x <= x1; x++ {
			yp[yy*w+x] = 214
			if yy&1 == 0 && x&1 == 0 {
				up[(yy/2)*cw+x/2] = 72
				vp[(yy/2)*cw+x/2] = 150
			}
		}
	}
	return s.frame
}
