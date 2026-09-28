// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build !headless

package gui

import (
	"fmt"
	"image/color"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"github.com/lordbasex/go-link/backend-device/internal/models"
	"github.com/lordbasex/go-link/backend-device/internal/services"
)

// overviewPage is the home: what the device is doing right now.
type overviewPage struct {
	u        *ui
	content  fyne.CanvasObject
	dot      *canvas.Circle
	signal   *canvas.Text
	room     *canvas.Text
	watching *canvas.Text
	linked   *canvas.Text
	cpu      *statTile
	memory   *statTile
	network  *statTile
	stream   *statTile
	players  *statTile
	latency  *statTile
	action   *roundButton
	copyRoom *widget.Button
	message  *widget.Label
	roomID   string

	codeDialog  dialog.Dialog
	dialogCode  *canvas.Text
	refreshesAt *time.Time
}

func newOverviewPage(u *ui) *overviewPage {
	p := &overviewPage{u: u}
	p.dot = statusDot(textFaint)
	p.signal = text("", 12, textMuted, false)
	p.room = text("", 14, white, true)
	p.watching = text("", 14, white, true)
	p.linked = text("", 14, white, true)
	row := func(label string, value *canvas.Text) fyne.CanvasObject {
		return container.NewBorder(nil, nil, text(label, 14, textMuted, false), value)
	}
	info := glass(container.NewVBox(
		row("Room", p.room),
		widget.NewSeparator(),
		row("Watching", p.watching),
		widget.NewSeparator(),
		row("Linked browsers", p.linked),
	))
	intro := wrapped("Your arcade, streamed. Guests play in their browser with no ROMs: the game runs here and only video, sound and controls travel.")
	header := newAdaptiveRow(640, heroTile(violet, "joystick", 150),
		container.NewVBox(text("go-link", 30, white, true), intro, info))

	p.cpu = newStatTile("cpu", "CPU", violet, true)
	p.memory = newStatTile("memory", "Memory", violet, true)
	p.network = newStatTile("network", "Network", violet, false)
	p.stream = newStatTile("stream", "Streaming", violet, false)
	p.players = newStatTile("players", "Players", violet, false)
	p.latency = newStatTile("latency", "Browser latency", violet, false)
	tiles := newResponsiveGrid(230, 12,
		p.cpu.content, p.memory.content, p.network.content,
		p.stream.content, p.players.content, p.latency.content,
	)

	p.action = newRoundButton("Play", "play", violet, p.act)
	p.copyRoom = widget.NewButtonWithIcon("Copy room ID", icon("copy", white), func() {
		if p.roomID != "" {
			u.app.Clipboard().SetContent(p.roomID)
			p.message.SetText("Room ID copied. Guests paste it on the website, in Join a private room.")
		}
	})
	another := widget.NewButtonWithIcon("Link another browser", icon("link", white), p.showCode)
	unlink := widget.NewButtonWithIcon("Unlink all", icon("unlink", white), p.confirmUnlink)
	if u.opts.Links == nil {
		another.Hide()
		unlink.Hide()
	}
	p.message = wrapped("")
	actions := container.NewVBox(
		container.NewCenter(p.action),
		container.NewCenter(container.New(layout.NewCustomPaddedHBoxLayout(10), p.copyRoom, another, unlink)),
		p.message,
	)
	body := vstack(header, container.NewVBox(container.NewHBox(sized(p.dot, 8, 8), p.signal), tiles), actions)
	p.content = container.NewVScroll(container.New(layout.NewCustomPaddedLayout(28, 24, 32, 32), body))
	return p
}

func (p *overviewPage) render(st models.Status) {
	setSignal(p.dot, p.signal, st)
	current := p.current()
	if st.Room == nil {
		p.roomID = ""
		setText(p.room, "No room open")
		setText(p.watching, "—")
		p.copyRoom.Disable()
	} else {
		p.roomID = st.Room.RoomID
		name := "Test pattern"
		if current != "" {
			name = st.Room.Title
		}
		vis := "public"
		if !st.Room.Public {
			vis = "private"
		}
		setText(p.room, fmt.Sprintf("%s · %s", name, vis))
		setText(p.watching, fmt.Sprintf("%d in the room", st.Room.Viewers))
		p.copyRoom.Enable()
	}
	online := len(st.Peers)
	setText(p.linked, fmt.Sprintf("%d online · %d remembered", online, st.SavedLinks))

	if sys := st.System; sys != nil {
		u, hw := sys.Usage, sys.Hardware
		p.cpu.Set(fmt.Sprintf("%.0f %%", u.CPUPercent), fmt.Sprintf("Device %.0f %% of one core", u.ProcessCPUPercent))
		p.cpu.meter.SetValue(u.CPUPercent/100, loadColor(u.CPUPercent/100))
		if hw.MemTotal > 0 {
			frac := float64(u.MemUsed) / float64(hw.MemTotal)
			p.memory.Set(fmt.Sprintf("%.0f %%", frac*100), fmt.Sprintf("%s of %s · device %s", formatBytes(u.MemUsed), formatBytes(hw.MemTotal), formatBytes(u.ProcessRSS)))
			p.memory.meter.SetValue(frac, loadColor(frac))
		}
		p.network.Set(formatRate(u.NetSentBps)+" sent", formatRate(u.NetRecvBps)+" received · whole computer")
	}
	if s := st.Stream; s.VideoViewers > 0 {
		p.stream.Set(fmt.Sprintf("%.0f fps", s.FPS), fmt.Sprintf("%.0f kbps · %d×%d · VP8", s.VideoKbps, s.Width, s.Height))
	} else {
		p.stream.Set("Idle", "Nothing is encoded until someone watches")
	}
	if r := st.Room; r != nil {
		p.players.Set(fmt.Sprintf("%d / %d", r.Players, max(r.MaxPlayers, 4)), fmt.Sprintf("%d in queue · %d watching only", r.Queue, r.Spectators))
	} else {
		p.players.Set("—", "")
	}
	best := -1
	for _, peer := range st.Peers {
		if peer.LatencyMs != nil && (best < 0 || *peer.LatencyMs < best) {
			best = *peer.LatencyMs
		}
	}
	if best >= 0 {
		p.latency.Set(fmt.Sprintf("%d ms", best), "Round trip over WebRTC")
	} else {
		p.latency.Set("—", "No browser online")
	}

	switch {
	case p.u.opts.Games == nil:
		p.action.Set("Play", "play", true)
	case current != "":
		p.action.Set("Stop", "stop", false)
	default:
		p.action.Set("Play", "play", false)
	}
	p.refreshesAt = st.Pairing.RefreshesAt
	if p.dialogCode != nil {
		setText(p.dialogCode, codeOrDashes(st.Pairing.Code))
	}
}

func (p *overviewPage) tick() {}

func (p *overviewPage) current() string {
	if p.u.opts.Games == nil {
		return ""
	}
	return p.u.opts.Games.Current()
}

// act is the round button: stop the game, or pick one in MAME's ROMs.
func (p *overviewPage) act() {
	if p.current() == "" {
		p.u.showRoms()
		return
	}
	p.u.opts.Games.Close(func(services.GameReply) {
		fyne.Do(func() {
			p.message.SetText("Back to the test pattern.")
			p.render(p.u.opts.Status.Snapshot())
		})
	})
}

// showCode shows the pairing code to link one more browser.
func (p *overviewPage) showCode() {
	p.dialogCode = text(codeOrDashes(p.u.last.Pairing.Code), 40, white, true)
	p.dialogCode.TextStyle = fyne.TextStyle{Monospace: true}
	p.dialogCode.Alignment = fyne.TextAlignCenter
	msg := wrapped("On the other browser, open " + p.u.pairingURL() + " and type this code. Each code works once.")
	p.codeDialog = dialog.NewCustom("Link another browser", "Close", container.NewVBox(msg, p.dialogCode), p.u.win)
	p.codeDialog.SetOnClosed(func() { p.dialogCode = nil })
	p.codeDialog.Resize(fyne.NewSize(460, 220))
	p.codeDialog.Show()
}

func (p *overviewPage) confirmUnlink() {
	dialog.ShowConfirm("Unlink all browsers?",
		"Every linked browser is disconnected and will need a new code. The window goes back to the pairing code.",
		func(ok bool) {
			if ok && p.u.opts.Links != nil {
				p.u.opts.Links.UnlinkAll()
			}
		}, p.u.win)
}

func setText(t *canvas.Text, s string) {
	if t.Text != s {
		t.Text = s
		t.Refresh()
	}
}

// loadColor is green, then yellow, then red, like a level meter.
func loadColor(frac float64) color.Color {
	switch {
	case frac > 0.85:
		return colorDanger
	case frac > 0.6:
		return colorWarn
	default:
		return colorOK
	}
}
