// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build !headless

package gui

import (
	"image"
	"image/color"
	"math"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/driver/desktop"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"
)

// background is the gradient behind a section.
func background(p palette) *canvas.LinearGradient {
	g := canvas.NewLinearGradient(p.top, p.bottom, 315)
	return g
}

// glass wraps content in a translucent rounded card.
func glass(content fyne.CanvasObject) fyne.CanvasObject {
	return glassPadded(content, 14, 16)
}

func glassPadded(content fyne.CanvasObject, vpad, hpad float32) fyne.CanvasObject {
	bg := canvas.NewRectangle(cardFill)
	bg.CornerRadius = 16
	bg.StrokeColor = cardStroke
	bg.StrokeWidth = 1
	return container.NewStack(bg, container.New(layout.NewCustomPaddedLayout(vpad, vpad, hpad, hpad), content))
}

// text makes a canvas text in white or a muted tone.
func text(s string, size float32, c color.Color, bold bool) *canvas.Text {
	t := canvas.NewText(s, c)
	t.TextSize = size
	t.TextStyle.Bold = bold
	return t
}

func wrapped(s string) *widget.Label {
	l := widget.NewLabel(s)
	l.Wrapping = fyne.TextWrapWord
	return l
}

// iconImage shows a line icon at a fixed size.
func iconImage(name string, c color.Color, size float32) *canvas.Image {
	img := canvas.NewImageFromResource(icon(name, c))
	img.FillMode = canvas.ImageFillContain
	img.SetMinSize(fyne.NewSize(size, size))
	return img
}

// tileImage draws the glossy rounded tile of MacDub's hero: a diagonal
// gradient, a white shine on the top half and a thin light border.
func tileImage(p palette, px int) image.Image {
	img := image.NewNRGBA(image.Rect(0, 0, px, px))
	r := float64(px) * 0.22
	top := withAlpha(p.accent, 242)
	bottom := withAlpha(p.top, 230)
	for y := 0; y < px; y++ {
		for x := 0; x < px; x++ {
			cov := roundedCoverage(float64(x)+0.5, float64(y)+0.5, float64(px), r)
			if cov <= 0 {
				continue
			}
			t := (float64(x) + float64(y)) / float64(2*px)
			c := lerp(top, bottom, t)
			// shine: white fading from the top edge to the middle
			if fy := float64(y) / float64(px); fy < 0.5 {
				c = blend(c, white, 0.35*(1-fy/0.5))
			}
			// border
			if edge := borderDistance(float64(x)+0.5, float64(y)+0.5, float64(px), r); edge < 1.6 {
				c = blend(c, white, 0.25)
			}
			c.A = uint8(float64(c.A) * cov)
			img.SetNRGBA(x, y, c)
		}
	}
	return img
}

// circleImage draws the round action button: a vertical gradient with a
// light border.
func circleImage(p palette, px int, disabled bool) image.Image {
	img := image.NewNRGBA(image.Rect(0, 0, px, px))
	c0, c1 := p.accent, p.top
	if disabled {
		c0, c1 = withAlpha(c0, 110), withAlpha(c1, 110)
	}
	rad := float64(px) / 2
	for y := 0; y < px; y++ {
		for x := 0; x < px; x++ {
			d := math.Hypot(float64(x)+0.5-rad, float64(y)+0.5-rad)
			cov := math.Max(0, math.Min(1, rad-d))
			if cov <= 0 {
				continue
			}
			c := lerp(c0, c1, float64(y)/float64(px))
			if rad-d < 3 {
				c = blend(c, white, 0.35)
			}
			c.A = uint8(float64(c.A) * cov)
			img.SetNRGBA(x, y, c)
		}
	}
	return img
}

func roundedCoverage(x, y, size, r float64) float64 {
	cx := math.Max(r, math.Min(x, size-r))
	cy := math.Max(r, math.Min(y, size-r))
	d := math.Hypot(x-cx, y-cy)
	return math.Max(0, math.Min(1, r-d+0.5))
}

func borderDistance(x, y, size, r float64) float64 {
	cx := math.Max(r, math.Min(x, size-r))
	cy := math.Max(r, math.Min(y, size-r))
	if cx != x || cy != y {
		return r - math.Hypot(x-cx, y-cy)
	}
	return math.Min(math.Min(x, size-x), math.Min(y, size-y))
}

func lerp(a, b color.NRGBA, t float64) color.NRGBA {
	f := func(x, y uint8) uint8 { return uint8(float64(x) + (float64(y)-float64(x))*t) }
	return color.NRGBA{f(a.R, b.R), f(a.G, b.G), f(a.B, b.B), f(a.A, b.A)}
}

func blend(a, b color.NRGBA, t float64) color.NRGBA {
	c := lerp(a, b, t)
	c.A = a.A
	return c
}

// heroTile is the big glossy tile with an icon that heads a section.
func heroTile(p palette, iconName string, size float32) fyne.CanvasObject {
	return tileWith(p, size, iconImage(iconName, white, size*0.46))
}

// textTile is a hero tile with a short word instead of an icon, like an
// emulator's name.
func textTile(p palette, label string, size float32) fyne.CanvasObject {
	return tileWith(p, size, text(label, size*0.24, white, true))
}

func tileWith(p palette, size float32, sym fyne.CanvasObject) fyne.CanvasObject {
	glow := canvas.NewRadialGradient(withAlpha(p.accent, 0x66), withAlpha(p.accent, 0))
	tile := canvas.NewImageFromImage(tileImage(p, int(size*2)))
	tile.FillMode = canvas.ImageFillContain
	tile.SetMinSize(fyne.NewSize(size, size))
	box := container.NewStack(glow, container.NewCenter(tile), container.NewCenter(sym))
	return container.New(layout.NewGridWrapLayout(fyne.NewSize(size*1.35, size*1.35)), box)
}

// roundButton is MacDub's round primary action with an icon and a label.
type roundButton struct {
	widget.BaseWidget
	pal      palette
	iconName string
	label    string
	disabled bool
	OnTapped func()
	disc     *canvas.Image
	sym      *canvas.Image
	text     *canvas.Text
}

func newRoundButton(label, iconName string, p palette, tap func()) *roundButton {
	b := &roundButton{pal: p, iconName: iconName, label: label, OnTapped: tap}
	b.disc = canvas.NewImageFromImage(circleImage(p, 184, false))
	b.disc.SetMinSize(fyne.NewSize(92, 92))
	b.sym = iconImage(iconName, white, 22)
	b.text = text(label, 13, white, true)
	b.text.Alignment = fyne.TextAlignCenter
	b.ExtendBaseWidget(b)
	return b
}

func (b *roundButton) CreateRenderer() fyne.WidgetRenderer {
	inner := container.NewVBox(container.NewCenter(b.sym), b.text)
	return widget.NewSimpleRenderer(container.NewStack(b.disc, container.NewCenter(inner)))
}

// Set changes the label, icon and state.
func (b *roundButton) Set(label, iconName string, disabled bool) {
	if b.label == label && b.iconName == iconName && b.disabled == disabled {
		return
	}
	b.label, b.iconName, b.disabled = label, iconName, disabled
	b.disc.Image = circleImage(b.pal, 184, disabled)
	b.disc.Refresh()
	c := white
	if disabled {
		c = withAlpha(white, 140)
	}
	b.sym.Resource = icon(iconName, c)
	b.sym.Refresh()
	b.text.Text, b.text.Color = label, c
	b.text.Refresh()
}

func (b *roundButton) Tapped(*fyne.PointEvent) {
	if !b.disabled && b.OnTapped != nil {
		b.OnTapped()
	}
}

func (b *roundButton) Cursor() desktop.Cursor { return desktop.PointerCursor }

// sidebarRow is one entry of the sidebar.
type sidebarRow struct {
	widget.BaseWidget
	pal      palette
	iconName string
	selected bool
	hovered  bool
	OnTapped func()
	bg       *canvas.Rectangle
	sym      *canvas.Image
	label    *canvas.Text
}

func newSidebarRow(label, iconName string, p palette, tap func()) *sidebarRow {
	r := &sidebarRow{pal: p, iconName: iconName, OnTapped: tap}
	r.bg = canvas.NewRectangle(color.Transparent)
	r.bg.CornerRadius = 12
	r.sym = iconImage(iconName, withAlpha(white, 205), 18)
	r.label = text(label, 15, white, false)
	r.ExtendBaseWidget(r)
	return r
}

func (r *sidebarRow) CreateRenderer() fyne.WidgetRenderer {
	row := container.NewHBox(r.sym, r.label)
	return widget.NewSimpleRenderer(container.NewStack(r.bg, container.New(layout.NewCustomPaddedLayout(10, 10, 14, 14), row)))
}

func (r *sidebarRow) SetSelected(on bool) {
	r.selected = on
	r.paint()
}

func (r *sidebarRow) paint() {
	switch {
	case r.selected:
		r.bg.FillColor = withAlpha(white, 0x24)
		r.sym.Resource = icon(r.iconName, r.pal.accent)
	case r.hovered:
		r.bg.FillColor = withAlpha(white, 0x12)
		r.sym.Resource = icon(r.iconName, withAlpha(white, 205))
	default:
		r.bg.FillColor = color.Transparent
		r.sym.Resource = icon(r.iconName, withAlpha(white, 205))
	}
	r.label.TextStyle.Bold = r.selected
	r.bg.Refresh()
	r.sym.Refresh()
	r.label.Refresh()
}

func (r *sidebarRow) Tapped(*fyne.PointEvent) {
	if r.OnTapped != nil {
		r.OnTapped()
	}
}

func (r *sidebarRow) MouseIn(*desktop.MouseEvent)    { r.hovered = true; r.paint() }
func (r *sidebarRow) MouseMoved(*desktop.MouseEvent) {}
func (r *sidebarRow) MouseOut()                      { r.hovered = false; r.paint() }
func (r *sidebarRow) Cursor() desktop.Cursor         { return desktop.PointerCursor }

// sidebarHeading is the small, faint label above a group of sidebar rows.
// It is not clickable.
func sidebarHeading(label string) (fyne.CanvasObject, *canvas.Text) {
	t := text(strings.ToUpper(label), 11, textFaint, true)
	return container.New(layout.NewCustomPaddedLayout(12, 0, 14, 14), t), t
}

// indented shifts a sidebar row to the right, under its group heading.
func indented(o fyne.CanvasObject) fyne.CanvasObject {
	return container.New(layout.NewCustomPaddedLayout(0, 0, 14, 0), o)
}

// tabButton is one tab of a page: plain text with an accent underline
// when selected.
type tabButton struct {
	widget.BaseWidget
	pal      palette
	selected bool
	hovered  bool
	OnTapped func()
	label    *canvas.Text
	line     *canvas.Rectangle
}

func newTabButton(label string, p palette, tap func()) *tabButton {
	b := &tabButton{pal: p, OnTapped: tap}
	b.label = text(label, 14, textMuted, false)
	b.line = canvas.NewRectangle(color.Transparent)
	b.line.CornerRadius = 1
	b.line.SetMinSize(fyne.NewSize(1, 2))
	b.ExtendBaseWidget(b)
	return b
}

func (b *tabButton) CreateRenderer() fyne.WidgetRenderer {
	label := container.New(layout.NewCustomPaddedLayout(6, 6, 4, 4), b.label)
	return widget.NewSimpleRenderer(container.NewBorder(nil, b.line, nil, nil, label))
}

func (b *tabButton) SetSelected(on bool) {
	b.selected = on
	b.paint()
}

func (b *tabButton) paint() {
	switch {
	case b.selected:
		b.label.Color, b.line.FillColor = white, b.pal.accent
	case b.hovered:
		b.label.Color, b.line.FillColor = white, withAlpha(white, 0x33)
	default:
		b.label.Color, b.line.FillColor = textMuted, color.Transparent
	}
	b.label.TextStyle.Bold = b.selected
	b.label.Refresh()
	b.line.Refresh()
}

func (b *tabButton) Tapped(*fyne.PointEvent) {
	if b.OnTapped != nil {
		b.OnTapped()
	}
}

func (b *tabButton) MouseIn(*desktop.MouseEvent)    { b.hovered = true; b.paint() }
func (b *tabButton) MouseMoved(*desktop.MouseEvent) {}
func (b *tabButton) MouseOut()                      { b.hovered = false; b.paint() }
func (b *tabButton) Cursor() desktop.Cursor         { return desktop.PointerCursor }

// statusChip is a small pill with a colored dot and a label.
type statusChip struct {
	content fyne.CanvasObject
	bg      *canvas.Rectangle
	dot     *canvas.Circle
	label   *canvas.Text
}

func newStatusChip() *statusChip {
	c := &statusChip{bg: canvas.NewRectangle(cardFill), dot: statusDot(textFaint), label: text("", 12, white, false)}
	c.bg.CornerRadius = 11
	c.bg.StrokeColor, c.bg.StrokeWidth = cardStroke, 1
	row := container.New(layout.NewCustomPaddedHBoxLayout(6), container.NewCenter(sized(c.dot, 8, 8)), c.label)
	c.content = container.NewStack(c.bg, container.New(layout.NewCustomPaddedLayout(3, 3, 10, 12), row))
	return c
}

// Set changes the label and the dot's color.
func (c *statusChip) Set(label string, dot color.NRGBA) {
	if c.label.Text == label && c.dot.FillColor == dot {
		return
	}
	c.label.Text = label
	c.dot.FillColor = dot
	c.bg.FillColor = withAlpha(dot, 0x24)
	c.label.Refresh()
	c.dot.Refresh()
	c.bg.Refresh()
}

// meter is a thin capsule bar, like MacDub's level meter.
type meter struct {
	widget.BaseWidget
	value float64
	track *canvas.Rectangle
	fill  *canvas.Rectangle
}

func newMeter(c color.Color) *meter {
	m := &meter{track: canvas.NewRectangle(withAlpha(white, 0x26)), fill: canvas.NewRectangle(c)}
	m.track.CornerRadius, m.fill.CornerRadius = 3, 3
	m.ExtendBaseWidget(m)
	return m
}

func (m *meter) SetValue(v float64, c color.Color) {
	m.value = math.Max(0, math.Min(1, v))
	m.fill.FillColor = c
	m.Refresh()
}

func (m *meter) CreateRenderer() fyne.WidgetRenderer { return &meterRenderer{m: m} }

type meterRenderer struct{ m *meter }

func (r *meterRenderer) Layout(size fyne.Size) {
	r.m.track.Resize(size)
	r.m.fill.Resize(fyne.NewSize(size.Width*float32(r.m.value), size.Height))
}
func (r *meterRenderer) MinSize() fyne.Size { return fyne.NewSize(40, 6) }
func (r *meterRenderer) Refresh() {
	r.Layout(r.m.Size())
	r.m.track.Refresh()
	r.m.fill.Refresh()
}
func (r *meterRenderer) Objects() []fyne.CanvasObject {
	return []fyne.CanvasObject{r.m.track, r.m.fill}
}
func (r *meterRenderer) Destroy() {}

// statTile is a small glass card with an icon, a title, a big value and a
// detail line, like the CleanMyMac menu panel.
type statTile struct {
	content fyne.CanvasObject
	value   *canvas.Text
	detail  *canvas.Text
	meter   *meter
}

func newStatTile(iconName, title string, p palette, withMeter bool) *statTile {
	t := &statTile{value: text("—", 20, white, true), detail: text("", 12, textMuted, false)}
	head := container.NewHBox(iconImage(iconName, p.accent, 16), text(title, 12, textMuted, true))
	parts := []fyne.CanvasObject{head, t.value, t.detail}
	if withMeter {
		t.meter = newMeter(p.accent)
		parts = append(parts, t.meter)
	}
	t.content = glassPadded(container.NewVBox(parts...), 12, 14)
	return t
}

func (t *statTile) Set(value, detail string) {
	if t.value.Text != value {
		t.value.Text = value
		t.value.Refresh()
	}
	if t.detail.Text != detail {
		t.detail.Text = detail
		t.detail.Refresh()
	}
}

// statusDot is a small colored dot with a label.
func statusDot(c color.Color) *canvas.Circle {
	d := canvas.NewCircle(c)
	return d
}

// fixedWidth gives an object a fixed width and its natural height.
func fixedWidth(w float32, o fyne.CanvasObject) fyne.CanvasObject {
	return container.New(&fixedWidthLayout{w: w}, o)
}

type fixedWidthLayout struct{ w float32 }

func (l *fixedWidthLayout) MinSize(objects []fyne.CanvasObject) fyne.Size {
	h := float32(0)
	for _, o := range objects {
		h = max(h, o.MinSize().Height)
	}
	return fyne.NewSize(l.w, h)
}

func (l *fixedWidthLayout) Layout(objects []fyne.CanvasObject, size fyne.Size) {
	for _, o := range objects {
		o.Move(fyne.NewPos(0, 0))
		o.Resize(size)
	}
}

// dragStrip is the invisible band at the top of a window without title
// bar: dragging it moves the window, a double click zooms it.
type dragStrip struct {
	widget.BaseWidget
	title    string
	dragging bool
}

func newDragStrip(title string) *dragStrip {
	d := &dragStrip{title: title}
	d.ExtendBaseWidget(d)
	return d
}

func (d *dragStrip) CreateRenderer() fyne.WidgetRenderer {
	return widget.NewSimpleRenderer(canvas.NewRectangle(color.Transparent))
}

func (d *dragStrip) MinSize() fyne.Size { return fyne.NewSize(10, titleBarInset) }

func (d *dragStrip) Dragged(*fyne.DragEvent) {
	dragWindow(d.title, !d.dragging)
	d.dragging = true
}

func (d *dragStrip) DragEnd()                      { d.dragging = false }
func (d *dragStrip) DoubleTapped(*fyne.PointEvent) { zoomWindow(d.title) }

// withDragStrip lays the drag band over the top of a window's content.
func withDragStrip(title string, content fyne.CanvasObject) fyne.CanvasObject {
	if titleBarInset == 0 {
		return content
	}
	return container.NewStack(content, container.NewBorder(newDragStrip(title), nil, nil, nil))
}

// responsiveGrid places cards in as many columns as fit, each at least
// minW wide, with gap between them: shrinking the window moves cards to
// fewer columns instead of squeezing them.
type responsiveGrid struct {
	minW, gap float32
	width     float32 // last laid out width, so MinSize matches it
}

func newResponsiveGrid(minW, gap float32, objects ...fyne.CanvasObject) *fyne.Container {
	return container.New(&responsiveGrid{minW: minW, gap: gap}, objects...)
}

func (g *responsiveGrid) columns(width float32, n int) int {
	if width <= 0 {
		return min(n, 3)
	}
	c := int((width + g.gap) / (g.minW + g.gap))
	return max(1, min(c, n))
}

func (g *responsiveGrid) visible(objects []fyne.CanvasObject) []fyne.CanvasObject {
	var out []fyne.CanvasObject
	for _, o := range objects {
		if o.Visible() {
			out = append(out, o)
		}
	}
	return out
}

func (g *responsiveGrid) rows(objects []fyne.CanvasObject, cols int) []float32 {
	var heights []float32
	for i, o := range objects {
		if i%cols == 0 {
			heights = append(heights, 0)
		}
		heights[len(heights)-1] = max(heights[len(heights)-1], o.MinSize().Height)
	}
	return heights
}

func (g *responsiveGrid) MinSize(objects []fyne.CanvasObject) fyne.Size {
	objs := g.visible(objects)
	if len(objs) == 0 {
		return fyne.Size{}
	}
	cols := g.columns(g.width, len(objs))
	h := float32(0)
	for i, rh := range g.rows(objs, cols) {
		if i > 0 {
			h += g.gap
		}
		h += rh
	}
	return fyne.NewSize(g.minW, h)
}

func (g *responsiveGrid) Layout(objects []fyne.CanvasObject, size fyne.Size) {
	g.width = size.Width
	objs := g.visible(objects)
	if len(objs) == 0 {
		return
	}
	cols := g.columns(size.Width, len(objs))
	cellW := (size.Width - g.gap*float32(cols-1)) / float32(cols)
	y := float32(0)
	for r, rh := range g.rows(objs, cols) {
		for c := 0; c < cols; c++ {
			i := r*cols + c
			if i >= len(objs) {
				break
			}
			objs[i].Move(fyne.NewPos(float32(c)*(cellW+g.gap), y))
			objs[i].Resize(fyne.NewSize(cellW, rh))
		}
		y += rh + g.gap
	}
}

// adaptiveRow puts left beside right when there is room, and above it
// (centered) when the window is narrow.
type adaptiveRow struct {
	breakpoint, gap float32
	width           float32
}

func newAdaptiveRow(breakpoint float32, left, right fyne.CanvasObject) *fyne.Container {
	return container.New(&adaptiveRow{breakpoint: breakpoint, gap: 20}, left, right)
}

func (a *adaptiveRow) wide(width float32) bool { return width == 0 || width >= a.breakpoint }

func (a *adaptiveRow) MinSize(objects []fyne.CanvasObject) fyne.Size {
	l, r := objects[0].MinSize(), objects[1].MinSize()
	if a.wide(a.width) {
		return fyne.NewSize(l.Width+a.gap+r.Width, max(l.Height, r.Height))
	}
	return fyne.NewSize(max(l.Width, r.Width), l.Height+a.gap/2+r.Height)
}

func (a *adaptiveRow) Layout(objects []fyne.CanvasObject, size fyne.Size) {
	a.width = size.Width
	left, right := objects[0], objects[1]
	l := left.MinSize()
	if a.wide(size.Width) {
		left.Move(fyne.NewPos(0, 0))
		left.Resize(fyne.NewSize(l.Width, size.Height))
		right.Move(fyne.NewPos(l.Width+a.gap, 0))
		right.Resize(fyne.NewSize(size.Width-l.Width-a.gap, size.Height))
		return
	}
	left.Move(fyne.NewPos((size.Width-l.Width)/2, 0))
	left.Resize(l)
	right.Move(fyne.NewPos(0, l.Height+a.gap/2))
	right.Resize(fyne.NewSize(size.Width, size.Height-l.Height-a.gap/2))
}

// vstack stacks sections with room between them.
func vstack(objects ...fyne.CanvasObject) *fyne.Container {
	return container.New(layout.NewCustomPaddedVBoxLayout(16), objects...)
}

// sized gives an object a fixed size inside boxes.
func sized(o fyne.CanvasObject, w, h float32) fyne.CanvasObject {
	return container.New(layout.NewGridWrapLayout(fyne.NewSize(w, h)), o)
}

// capsuleImage draws a pill: a vertical gradient with a light border.
func capsuleImage(p palette, w, h int) image.Image {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	r := float64(h) / 2
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			fx, fy := float64(x)+0.5, float64(y)+0.5
			cx := math.Max(r, math.Min(fx, float64(w)-r))
			d := math.Hypot(fx-cx, fy-r)
			cov := math.Max(0, math.Min(1, r-d+0.5))
			if cov <= 0 {
				continue
			}
			c := lerp(p.accent, p.top, float64(y)/float64(h))
			if r-d < 2 {
				c = blend(c, white, 0.35)
			}
			c.A = uint8(float64(c.A) * cov)
			img.SetNRGBA(x, y, c)
		}
	}
	return img
}

// capsuleButton is a long pill-shaped primary action, 36 px tall.
type capsuleButton struct {
	widget.BaseWidget
	OnTapped func()
	width    float32
	bg       *canvas.Image
	shine    *canvas.Rectangle
	sym      *canvas.Image
	label    *canvas.Text
}

const capsuleHeight = 36

func newCapsuleButton(label, iconName string, p palette, width float32, tap func()) *capsuleButton {
	b := &capsuleButton{OnTapped: tap, width: width}
	b.bg = canvas.NewImageFromImage(capsuleImage(p, int(width*2), capsuleHeight*2))
	b.bg.FillMode = canvas.ImageFillStretch
	b.shine = canvas.NewRectangle(color.Transparent)
	b.shine.CornerRadius = capsuleHeight / 2
	b.sym = iconImage(iconName, white, 16)
	b.label = text(label, 14, white, true)
	b.ExtendBaseWidget(b)
	return b
}

func (b *capsuleButton) CreateRenderer() fyne.WidgetRenderer {
	inner := container.New(layout.NewCustomPaddedHBoxLayout(8), container.NewCenter(b.sym), container.NewCenter(b.label))
	return widget.NewSimpleRenderer(container.NewStack(b.bg, b.shine, container.NewCenter(inner)))
}

func (b *capsuleButton) MinSize() fyne.Size { return fyne.NewSize(b.width, capsuleHeight) }

func (b *capsuleButton) Tapped(*fyne.PointEvent) {
	if b.OnTapped != nil {
		b.OnTapped()
	}
}

func (b *capsuleButton) MouseIn(*desktop.MouseEvent) {
	b.shine.FillColor = withAlpha(white, 0x1c)
	b.shine.Refresh()
}

func (b *capsuleButton) MouseMoved(*desktop.MouseEvent) {}

func (b *capsuleButton) MouseOut() {
	b.shine.FillColor = color.Transparent
	b.shine.Refresh()
}

func (b *capsuleButton) Cursor() desktop.Cursor { return desktop.PointerCursor }

// segmented is a row of mutually exclusive choices in a rounded track,
// like a macOS segmented control. SetSelected never calls OnChanged; a
// tap does.
type segmented struct {
	content   fyne.CanvasObject
	segments  []*segment
	Selected  string
	OnChanged func(string)
	disabled  bool
}

func newSegmented(options []string, p palette, changed func(string)) *segmented {
	s := &segmented{OnChanged: changed}
	var objs []fyne.CanvasObject
	for _, o := range options {
		seg := newSegment(o, p, s)
		s.segments = append(s.segments, seg)
		objs = append(objs, seg)
	}
	track := canvas.NewRectangle(withAlpha(white, 0x0f))
	track.CornerRadius = 10
	track.StrokeColor, track.StrokeWidth = cardStroke, 1
	s.content = container.NewStack(track, container.New(layout.NewCustomPaddedLayout(3, 3, 3, 3),
		container.New(layout.NewCustomPaddedHBoxLayout(2), objs...)))
	return s
}

// SetSelected marks a choice without calling OnChanged.
func (s *segmented) SetSelected(option string) {
	s.Selected = option
	for _, seg := range s.segments {
		seg.paint()
	}
}

// SetDisabled greys the control out and ignores taps.
func (s *segmented) SetDisabled(on bool) {
	s.disabled = on
	for _, seg := range s.segments {
		seg.paint()
	}
}

func (s *segmented) choose(option string) {
	if s.disabled || option == s.Selected {
		return
	}
	s.SetSelected(option)
	if s.OnChanged != nil {
		s.OnChanged(option)
	}
}

// segment is one choice of a segmented control.
type segment struct {
	widget.BaseWidget
	parent  *segmented
	pal     palette
	option  string
	hovered bool
	bg      *canvas.Rectangle
	label   *canvas.Text
}

func newSegment(option string, p palette, parent *segmented) *segment {
	s := &segment{parent: parent, pal: p, option: option}
	s.bg = canvas.NewRectangle(color.Transparent)
	s.bg.CornerRadius = 8
	s.label = text(option, 13, textMuted, false)
	s.label.Alignment = fyne.TextAlignCenter
	s.ExtendBaseWidget(s)
	return s
}

func (s *segment) CreateRenderer() fyne.WidgetRenderer {
	return widget.NewSimpleRenderer(container.NewStack(s.bg,
		container.New(layout.NewCustomPaddedLayout(6, 6, 16, 16), s.label)))
}

func (s *segment) paint() {
	selected := s.parent.Selected == s.option
	switch {
	case selected:
		s.bg.FillColor, s.label.Color = withAlpha(s.pal.accent, 0x8c), white
	case s.hovered && !s.parent.disabled:
		s.bg.FillColor, s.label.Color = withAlpha(white, 0x14), white
	default:
		s.bg.FillColor, s.label.Color = color.Transparent, textMuted
	}
	if s.parent.disabled {
		s.label.Color = textFaint
	}
	s.label.TextStyle.Bold = selected
	s.bg.Refresh()
	s.label.Refresh()
}

func (s *segment) Tapped(*fyne.PointEvent) { s.parent.choose(s.option) }

func (s *segment) MouseIn(*desktop.MouseEvent)    { s.hovered = true; s.paint() }
func (s *segment) MouseMoved(*desktop.MouseEvent) {}
func (s *segment) MouseOut()                      { s.hovered = false; s.paint() }
func (s *segment) Cursor() desktop.Cursor         { return desktop.PointerCursor }
