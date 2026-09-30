// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package framelab

import (
	"fmt"
	"math"
)

// MaxPSNR is reported for identical pictures instead of +Inf, so results
// stay valid JSON and averages stay finite.
const MaxPSNR = 100

// Metrics compares a processed picture with its reference.
type Metrics struct {
	PSNR    float64 `json:"psnr"`     // RGB, all channels (dB)
	PSNRY   float64 `json:"psnr_y"`   // luma, BT.601 full range (dB)
	PSNRCb  float64 `json:"psnr_cb"`  // blue difference (dB)
	PSNRCr  float64 `json:"psnr_cr"`  // red difference (dB)
	SSIMY   float64 `json:"ssim_y"`   // luma SSIM (0-1)
	SSIMRGB float64 `json:"ssim_rgb"` // mean of the R, G and B SSIM (0-1)
}

// Compare measures b against the reference a. Both must have the same size.
func Compare(a, b Image) (Metrics, error) {
	if a.W != b.W || a.H != b.H {
		return Metrics{}, fmt.Errorf("framelab: size %dx%d vs %dx%d", a.W, a.H, b.W, b.H)
	}
	var m Metrics
	m.PSNR = PSNR(a, b)
	ay, acb, acr := planesYCbCr(a)
	by, bcb, bcr := planesYCbCr(b)
	m.PSNRY = psnrPlane(ay, by)
	m.PSNRCb = psnrPlane(acb, bcb)
	m.PSNRCr = psnrPlane(acr, bcr)
	m.SSIMY = ssimPlane(ay, by, a.W, a.H)
	var s float64
	for c := 0; c < 3; c++ {
		s += ssimPlane(channel(a, c), channel(b, c), a.W, a.H)
	}
	m.SSIMRGB = s / 3
	return m, nil
}

// PSNR is the peak signal-to-noise ratio over all RGB channels, in dB.
func PSNR(a, b Image) float64 {
	var se float64
	for i := range a.Pix {
		d := float64(a.Pix[i]) - float64(b.Pix[i])
		se += d * d
	}
	return psnrFromMSE(se / float64(len(a.Pix)))
}

func psnrFromMSE(mse float64) float64 {
	if mse <= 0 {
		return MaxPSNR
	}
	return math.Min(MaxPSNR, 10*math.Log10(255*255/mse))
}

func psnrPlane(a, b []float64) float64 {
	var se float64
	for i := range a {
		d := a[i] - b[i]
		se += d * d
	}
	return psnrFromMSE(se / float64(len(a)))
}

// planesYCbCr splits a picture into full range BT.601 Y, Cb and Cr.
func planesYCbCr(img Image) (y, cb, cr []float64) {
	n := img.W * img.H
	y, cb, cr = make([]float64, n), make([]float64, n), make([]float64, n)
	for i := 0; i < n; i++ {
		r, g, b := float64(img.Pix[i*3]), float64(img.Pix[i*3+1]), float64(img.Pix[i*3+2])
		y[i] = 0.299*r + 0.587*g + 0.114*b
		cb[i] = 128 - 0.168736*r - 0.331264*g + 0.5*b
		cr[i] = 128 + 0.5*r - 0.418688*g - 0.081312*b
	}
	return y, cb, cr
}

func channel(img Image, c int) []float64 {
	out := make([]float64, img.W*img.H)
	for i := range out {
		out[i] = float64(img.Pix[i*3+c])
	}
	return out
}

// ssimPlane is the mean SSIM (Wang et al. 2004) with an 11x11 Gaussian
// window (sigma 1.5), K1 = 0.01, K2 = 0.03, L = 255, over the whole
// plane with clamped edges.
func ssimPlane(a, b []float64, w, h int) float64 {
	const c1, c2 = (0.01 * 255) * (0.01 * 255), (0.03 * 255) * (0.03 * 255)
	n := w * h
	ab, aa, bb := make([]float64, n), make([]float64, n), make([]float64, n)
	for i := 0; i < n; i++ {
		ab[i], aa[i], bb[i] = a[i]*b[i], a[i]*a[i], b[i]*b[i]
	}
	mu1, mu2 := blur(a, w, h), blur(b, w, h)
	s11, s22, s12 := blur(aa, w, h), blur(bb, w, h), blur(ab, w, h)
	var sum float64
	for i := 0; i < n; i++ {
		m1, m2 := mu1[i], mu2[i]
		v1, v2, cov := s11[i]-m1*m1, s22[i]-m2*m2, s12[i]-m1*m2
		sum += ((2*m1*m2 + c1) * (2*cov + c2)) / ((m1*m1 + m2*m2 + c1) * (v1 + v2 + c2))
	}
	return sum / float64(n)
}

var gauss = func() []float64 {
	k := make([]float64, 11)
	var s float64
	for i := range k {
		d := float64(i - 5)
		k[i] = math.Exp(-d * d / (2 * 1.5 * 1.5))
		s += k[i]
	}
	for i := range k {
		k[i] /= s
	}
	return k
}()

// blur applies the separable Gaussian window with clamped edges.
func blur(p []float64, w, h int) []float64 {
	tmp := make([]float64, len(p))
	out := make([]float64, len(p))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			var s float64
			for k, g := range gauss {
				xx := max(0, min(w-1, x+k-5))
				s += g * p[y*w+xx]
			}
			tmp[y*w+x] = s
		}
	}
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			var s float64
			for k, g := range gauss {
				yy := max(0, min(h-1, y+k-5))
				s += g * tmp[yy*w+x]
			}
			out[y*w+x] = s
		}
	}
	return out
}

// Mean averages a list of metrics field by field.
func Mean(ms []Metrics) Metrics {
	var out Metrics
	if len(ms) == 0 {
		return out
	}
	for _, m := range ms {
		out.PSNR += m.PSNR
		out.PSNRY += m.PSNRY
		out.PSNRCb += m.PSNRCb
		out.PSNRCr += m.PSNRCr
		out.SSIMY += m.SSIMY
		out.SSIMRGB += m.SSIMRGB
	}
	n := float64(len(ms))
	out.PSNR /= n
	out.PSNRY /= n
	out.PSNRCb /= n
	out.PSNRCr /= n
	out.SSIMY /= n
	out.SSIMRGB /= n
	return out
}

// Hotspot returns the w x h window (on an 8 pixel grid) where b differs
// most from the reference a (highest squared error), to zoom into.
func Hotspot(a, b Image, w, h int) (x, y int) {
	w, h = min(w, a.W), min(h, a.H)
	best := -1.0
	for wy := 0; wy+h <= a.H; wy += 8 {
		for wx := 0; wx+w <= a.W; wx += 8 {
			var se float64
			for r := wy; r < wy+h; r++ {
				o := (r*a.W + wx) * 3
				for i := o; i < o+w*3; i++ {
					d := float64(a.Pix[i]) - float64(b.Pix[i])
					se += d * d
				}
			}
			if se > best {
				best, x, y = se, wx, wy
			}
		}
	}
	return x, y
}
