// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build !headless

package gui

import (
	"errors"
	"fmt"
	"os"
	"reflect"
	"strings"
	"unicode"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/storage"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"

	"github.com/lordbasex/go-link/backend-device/internal/models"
	"github.com/lordbasex/go-link/backend-device/internal/services"
	"github.com/lordbasex/go-link/backend-device/pkg/romcheck"
	"github.com/lordbasex/go-link/backend-device/pkg/thumbnails"
)

// Filters of the ROM list.
const (
	filterAll      = "All"
	filterRuns     = "Runs"
	filterWontRun  = "Will not run"
	importProgress = "Copying %d / %d · %s"
)

// romsTab is MAME's ROMs tab: it lists the ROM folder with each set's check, lets the host pick
// the folder, drop zips and start a game. It also installs the emulator
// core and its game list, only when the host asks.
type romsTab struct {
	u          *ui
	content    fyne.CanvasObject
	core       *widget.Label
	coreErr    *widget.Label
	coreButton *widget.Button
	dir        *widget.Label
	summary    *widget.Label
	filter     *widget.RadioGroup
	search     *widget.Entry
	list       *widget.List
	details    *widget.Label
	message    *widget.Label
	lib        models.Library
	shown      []models.RomInfo
	current    string
	selected   string
}

func newRomsTab(u *ui) *romsTab {
	t := &romsTab{u: u}
	t.core = widget.NewLabel("")
	t.core.Truncation = fyne.TextTruncateEllipsis
	t.coreErr = widget.NewLabel("")
	t.coreErr.Importance = widget.DangerImportance
	t.coreErr.Wrapping = fyne.TextWrapWord
	t.coreErr.Hide()
	t.coreButton = widget.NewButtonWithIcon("Download what is missing", icon("download", white), func() {
		if err := u.opts.Library.DownloadCore(u.opts.Ctx); err != nil {
			u.showError(err)
		}
	})
	t.dir = widget.NewLabel("")
	t.dir.TextStyle.Monospace = true
	t.dir.Truncation = fyne.TextTruncateEllipsis
	choose := widget.NewButtonWithIcon("Choose folder…", icon("folder", white), t.chooseFolder)
	t.summary = widget.NewLabel("")
	t.filter = widget.NewRadioGroup([]string{filterAll, filterRuns, filterWontRun}, func(string) { t.apply() })
	t.filter.Horizontal = true
	t.filter.SetSelected(filterAll)
	t.search = widget.NewEntry()
	t.search.SetPlaceHolder("Search game, set or maker")
	t.search.OnChanged = func(string) { t.apply() }
	drop := widget.NewLabel("Drop .zip ROM sets on this window to copy them into the folder, or drop a folder to use it.")
	drop.Wrapping = fyne.TextWrapWord
	drop.Importance = widget.LowImportance
	drop.SizeName = theme.SizeNameCaptionText

	t.list = widget.NewList(
		func() int { return len(t.shown) },
		func() fyne.CanvasObject { return newRomRow(u.coverSize()) },
		func(i widget.ListItemID, o fyne.CanvasObject) {
			if i < len(t.shown) {
				t.fill(o.(*romRow), t.shown[i])
			}
		},
	)
	t.list.OnSelected = func(i widget.ListItemID) {
		if i < len(t.shown) {
			t.selected = t.shown[i].Name
			t.details.SetText(romDetails(t.shown[i]))
		}
	}
	t.details = widget.NewLabel("Select a game to see its details.")
	t.details.Wrapping = fyne.TextWrapWord
	t.message = widget.NewLabel("")
	t.message.Wrapping = fyne.TextWrapWord
	t.message.Hide()

	settings := glass(container.NewVBox(
		container.NewBorder(nil, nil, text("Emulator", 13, textMuted, false), t.coreButton, t.core),
		t.coreErr,
		widget.NewSeparator(),
		container.NewBorder(nil, nil, text("Folder", 13, textMuted, false), choose, t.dir),
		widget.NewSeparator(),
		container.NewBorder(nil, nil, text("Show", 13, textMuted, false), t.summary, t.filter),
		container.NewBorder(nil, nil, text("Search", 13, textMuted, false), nil, t.search),
	))
	bottom := glass(container.NewVBox(t.details, t.message, drop))
	list := glassPadded(t.list, 6, 6)
	// The MAME page pads this tab and puts its header above it.
	t.content = container.NewBorder(container.New(layout.NewCustomPaddedLayout(0, 12, 0, 0), settings),
		container.New(layout.NewCustomPaddedLayout(12, 0, 0, 0), bottom), nil, nil, list)
	return t
}

func (t *romsTab) render(st models.Status) {
	current := ""
	if t.u.opts.Games != nil {
		current = t.u.opts.Games.Current()
	}
	var lib models.Library
	if st.Library != nil {
		lib = *st.Library
	}
	if reflect.DeepEqual(lib, t.lib) && current == t.current {
		return // metrics tick: nothing in the library changed
	}
	t.lib, t.current = lib, current
	t.renderCore(lib)
	t.dir.SetText(lib.Dir)
	if lib.Core.Catalog {
		ok := 0
		for _, r := range lib.Roms {
			if playable(r) {
				ok++
			}
		}
		t.summary.SetText(fmt.Sprintf("%d of %d run on mame2003-plus", ok, len(lib.Roms)))
	} else {
		t.summary.SetText(fmt.Sprintf("%d sets (download the game list to check them)", len(lib.Roms)))
	}
	t.apply()
}

// renderCore shows whether the emulator core and its game list are
// installed. Nothing is bundled: both are downloaded only on request.
func (t *romsTab) renderCore(lib models.Library) {
	state := func(installed bool) string {
		switch {
		case installed:
			return "installed"
		case lib.Core.Downloading:
			return "downloading…"
		default:
			return "not installed"
		}
	}
	t.core.SetText(fmt.Sprintf("mame2003-plus: %s · game list: %s", state(lib.Core.Installed), state(lib.Core.Catalog)))
	t.coreErr.SetText(lib.Core.Error)
	if lib.Core.Error == "" {
		t.coreErr.Hide()
	} else {
		t.coreErr.Show()
	}
	if lib.Core.Downloading || (lib.Core.Installed && lib.Core.Catalog) {
		t.coreButton.Disable()
	} else {
		t.coreButton.Enable()
	}
}

// apply filters the list.
func (t *romsTab) apply() {
	if t.list == nil {
		return
	}
	t.shown = t.shown[:0]
	q := strings.ToLower(strings.TrimSpace(t.search.Text))
	for _, r := range t.lib.Roms {
		if q != "" && !strings.Contains(strings.ToLower(r.Name+" "+r.Title+" "+r.Maker), q) {
			continue
		}
		switch t.filter.Selected {
		case filterRuns:
			if !playable(r) {
				continue
			}
		case filterWontRun:
			if playable(r) {
				continue
			}
		}
		t.shown = append(t.shown, r)
	}
	t.list.Refresh()
}

func (t *romsTab) fill(row *romRow, r models.RomInfo) {
	title := r.Title
	if title == "" {
		title = r.Name
	}
	row.title.SetText(title)
	parts := []string{r.Name + ".zip"}
	for _, p := range []string{r.Year, r.Maker} {
		if p != "" {
			parts = append(parts, p)
		}
	}
	row.detail.SetText(strings.Join(parts, " · "))
	row.note.SetText(checkNote(r.Check))

	badge, importance := checkBadge(r.Check)
	row.badge.SetText(badge)
	row.badge.Importance = importance
	row.badge.Refresh()

	// A recycled row may still have the box of another size (Settings).
	if size := t.u.coverSize(); row.cover.MinSize() != size {
		row.cover.SetMinSize(size)
		row.Refresh()
	}
	if path, ok := t.u.opts.Library.ThumbnailPath(r.Name, t.u.opts.Library.ThumbnailKind()); ok {
		row.cover.Resource, row.cover.File = nil, path
	} else {
		row.cover.File, row.cover.Resource = "", icon("rom", textFaint)
	}
	row.cover.Refresh()

	rom := r
	row.play.OnTapped = func() { t.askPlay(rom, title) }
	switch {
	case t.u.opts.Games == nil, !t.lib.Core.Installed, !playable(r):
		row.play.Disable()
		row.play.SetText("Play")
	case t.current == r.Name:
		row.play.Disable()
		row.play.SetText("Playing")
	default:
		row.play.Enable()
		row.play.SetText("Play")
	}
}

// Choices of the Play dialog.
const (
	pictureNone = "None"
)

var pictureKinds = []struct {
	label string
	kind  thumbnails.Kind
}{{"Boxart", thumbnails.Boxart}, {"Title", thumbnails.Title}, {"Snap", thumbnails.Snap}}

// askPlay asks how to open the room: its name, voice, and which of the
// game's thumbnails pictures it. Every room is private: guests need its
// invitation and PIN.
func (t *romsTab) askPlay(rom models.RomInfo, title string) {
	name := widget.NewEntry()
	name.SetText(title)
	voice := widget.NewCheck("Voice chat between players", nil)
	voice.SetChecked(true)
	has := map[thumbnails.Kind]bool{thumbnails.Boxart: rom.Thumbs.Boxart, thumbnails.Title: rom.Thumbs.Title, thumbnails.Snap: rom.Thumbs.Snap}
	var options []string
	chosen := pictureNone
	for _, p := range pictureKinds {
		if has[p.kind] {
			options = append(options, p.label)
			if p.kind == t.u.opts.Library.ThumbnailKind() || chosen == pictureNone {
				chosen = p.label
			}
		}
	}
	picture := widget.NewSelect(append(options, pictureNone), nil)
	picture.SetSelected(chosen)
	if len(options) == 0 {
		picture.Disable()
	}
	items := []*widget.FormItem{
		widget.NewFormItem("Room name", name),
		widget.NewFormItem("", voice),
		widget.NewFormItem("Room picture", picture),
	}
	d := dialog.NewForm("Play "+title, "Start", "Cancel", items, func(ok bool) {
		if !ok {
			return
		}
		art := ""
		for _, p := range pictureKinds {
			if p.label == picture.Selected {
				art = string(p.kind)
			}
		}
		t.play(services.GameRequest{
			Rom: rom.Name, Title: strings.TrimSpace(name.Text),
			Voice: voice.Checked, Art: art,
		}, title)
	}, t.u.win)
	d.Resize(fyne.NewSize(460, 0))
	d.Show()
}

// play opens a room with a game. The device loads it first and only then
// announces the room, like Create room on the website.
func (t *romsTab) play(req services.GameRequest, title string) {
	games := t.u.opts.Games
	if games == nil {
		return
	}
	if req.Title == "" {
		req.Title = title
	}
	err := games.Create(req, func(r services.GameReply) {
		fyne.Do(func() {
			switch r.Type {
			case "room_created":
				t.say(fmt.Sprintf("Playing %s. Invite people from the room on the web: each invitation has its own PIN, good for one person.", title))
			case "room_error":
				t.say("")
				t.u.showError(errors.New(r.Error))
			}
			t.u.render(t.u.opts.Status.Snapshot())
		})
	})
	if err != nil {
		t.u.showError(err)
		return
	}
	t.say("Starting " + title + "…")
}

func (t *romsTab) chooseFolder() {
	d := dialog.NewFolderOpen(func(folder fyne.ListableURI, err error) {
		if err != nil {
			t.u.showError(err)
			return
		}
		if folder != nil {
			t.setFolder(folder.Path())
		}
	}, t.u.win)
	if dir := t.u.opts.Library.Dir(); dir != "" {
		if l, err := storage.ListerForURI(storage.NewFileURI(dir)); err == nil {
			d.SetLocation(l)
		}
	}
	d.Show()
}

// setFolder changes the ROM folder off the UI thread: the new folder is
// scanned and checked.
func (t *romsTab) setFolder(dir string) {
	t.say("Reading " + dir + "…")
	go func() {
		err := t.u.opts.Library.SetDir(dir)
		fyne.Do(func() {
			if err != nil {
				t.say("")
				t.u.showError(err)
				return
			}
			t.say("ROM folder changed.")
		})
	}()
}

// dropped handles files or a folder dropped on the window.
func (t *romsTab) dropped(uris []fyne.URI) {
	if len(uris) == 1 {
		if fi, err := os.Stat(uris[0].Path()); err == nil && fi.IsDir() {
			t.setFolder(uris[0].Path())
			return
		}
	}
	go func() {
		ok, failed := t.importFiles(uris, func(i, n int, name string) {
			fyne.Do(func() { t.say(fmt.Sprintf(importProgress, i, n, name)) })
		})
		fyne.Do(func() { t.say(importResult(ok, len(uris), failed)) })
	}()
}

// importFiles copies dropped zips into the ROM folder. The library checks
// each name and file and never replaces an existing set.
func (t *romsTab) importFiles(uris []fyne.URI, progress func(i, n int, name string)) (ok int, failed []string) {
	for i, uri := range uris {
		name := uri.Name()
		if progress != nil {
			progress(i+1, len(uris), name)
		}
		if !strings.EqualFold(uri.Extension(), ".zip") {
			failed = append(failed, name+" (not a .zip)")
			continue
		}
		f, err := os.Open(uri.Path())
		if err == nil {
			err = t.u.opts.Library.Import(name, f)
			f.Close()
		}
		if err != nil {
			failed = append(failed, fmt.Sprintf("%s (%v)", name, err))
			continue
		}
		ok++
	}
	return ok, failed
}

func importResult(ok, n int, failed []string) string {
	msg := fmt.Sprintf("Added %d of %d.", ok, n)
	if len(failed) > 0 {
		msg += " Not added: " + strings.Join(failed, ", ")
	}
	return msg
}

// say shows a short message under the list, or hides it when empty.
func (t *romsTab) say(s string) {
	t.message.SetText(s)
	if s == "" {
		t.message.Hide()
	} else {
		t.message.Show()
	}
}

// playable: the check says the core runs it, or there is no check yet.
func playable(r models.RomInfo) bool {
	return r.Check == nil || r.Check.Status == romcheck.StatusOK
}

func checkBadge(c *romcheck.Result) (string, widget.Importance) {
	if c == nil {
		return "Not checked", widget.LowImportance
	}
	switch c.Status {
	case romcheck.StatusOK:
		if c.Driver != "" {
			return "Runs (incomplete)", widget.WarningImportance
		}
		return "Runs", widget.SuccessImportance
	case romcheck.StatusMissing:
		return "Missing files", widget.DangerImportance
	case romcheck.StatusUnsupported:
		return "Not in this emulator", widget.DangerImportance
	case romcheck.StatusBIOS:
		return "BIOS", widget.LowImportance
	default:
		return "Broken zip", widget.DangerImportance
	}
}

// checkNote is the one-line reason shown under a game.
func checkNote(c *romcheck.Result) string {
	if c == nil {
		return ""
	}
	if c.Status == romcheck.StatusOK {
		if c.Driver != "" {
			return "MAME marks this game as incomplete: it may not run well."
		}
		return ""
	}
	return capitalize(c.Reason()) + "."
}

func romDetails(r models.RomInfo) string {
	title := r.Title
	if title == "" {
		title = r.Name
	}
	lines := []string{fmt.Sprintf("%s · %s.zip · %s", title, r.Name, formatBytes(uint64(r.Size)))}
	if note := checkNote(r.Check); note != "" {
		lines = append(lines, note)
	}
	if r.Check != nil && r.Check.Status == romcheck.StatusMissing && len(r.Check.Needs) == 0 {
		lines = append(lines, "The set is probably from another MAME version: mame2003-plus needs MAME 0.78 sets.")
	}
	return strings.Join(lines, "\n")
}

func capitalize(s string) string {
	for i, r := range s {
		return string(unicode.ToUpper(r)) + s[i+len(string(r)):]
	}
	return s
}

// romRow is one line of the ROM list.
type romRow struct {
	widget.BaseWidget
	cover  *canvas.Image
	title  *widget.Label
	detail *widget.Label
	note   *widget.Label
	badge  *widget.Label
	play   *widget.Button
}

// newRomRow makes a row whose image fits in cover (from Settings).
func newRomRow(cover fyne.Size) *romRow {
	r := &romRow{
		cover:  canvas.NewImageFromResource(icon("rom", textFaint)),
		title:  widget.NewLabel(""),
		detail: widget.NewLabel(""),
		note:   widget.NewLabel(""),
		badge:  widget.NewLabel(""),
		play:   widget.NewButtonWithIcon("Play", theme.MediaPlayIcon(), nil),
	}
	r.cover.FillMode = canvas.ImageFillContain
	r.cover.SetMinSize(cover)
	r.title.TextStyle.Bold = true
	r.badge.Alignment = fyne.TextAlignTrailing
	for _, l := range []*widget.Label{r.title, r.detail, r.note} {
		l.Truncation = fyne.TextTruncateEllipsis
	}
	r.detail.Importance = widget.LowImportance
	r.note.Importance = widget.DangerImportance
	r.detail.SizeName = theme.SizeNameCaptionText
	r.note.SizeName = theme.SizeNameCaptionText
	r.ExtendBaseWidget(r)
	return r
}

func (r *romRow) CreateRenderer() fyne.WidgetRenderer {
	text := container.New(&tightVBox{}, r.title, r.detail, r.note)
	// Fixed width, so badges line up and never slide under the button.
	badge := container.New(layout.NewGridWrapLayout(fyne.NewSize(170, r.badge.MinSize().Height)), r.badge)
	right := container.NewHBox(container.NewCenter(badge), container.NewCenter(r.play))
	return widget.NewSimpleRenderer(container.NewBorder(nil, nil, r.cover, right, text))
}

// tightVBox stacks labels without Fyne's default padding between them.
type tightVBox struct{}

func (*tightVBox) MinSize(objects []fyne.CanvasObject) fyne.Size {
	var s fyne.Size
	for _, o := range objects {
		m := o.MinSize()
		s.Width = max(s.Width, m.Width)
		s.Height += m.Height - 2*theme.Padding()
	}
	return s.AddWidthHeight(0, 2*theme.Padding())
}

func (*tightVBox) Layout(objects []fyne.CanvasObject, size fyne.Size) {
	y := float32(0)
	for _, o := range objects {
		h := o.MinSize().Height
		o.Move(fyne.NewPos(0, y))
		o.Resize(fyne.NewSize(size.Width, h))
		y += h - 2*theme.Padding()
	}
}
