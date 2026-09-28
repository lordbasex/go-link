// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build !headless

package gui

import (
	"fmt"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"github.com/lordbasex/go-link/backend-device/internal/models"
)

// systemTab shows the machine, its live usage and the device's identity.
type systemTab struct {
	u        *ui
	content  fyne.CanvasObject
	platform *widget.Label
	cpu      *widget.Label
	memory   *widget.Label
	cpuBar   *widget.ProgressBar
	ramBar   *widget.ProgressBar
	process  *widget.Label
	deviceID *widget.Label
	version  *widget.Label
	signal   *widget.Label
	ice      *widget.Label
	web      *widget.Label
}

func newSystemTab(u *ui) *systemTab {
	t := &systemTab{u: u}
	mono := func() *widget.Label {
		l := widget.NewLabel("")
		l.TextStyle.Monospace = true
		l.Wrapping = fyne.TextWrapBreak
		return l
	}
	t.platform, t.cpu, t.memory = widget.NewLabel(""), widget.NewLabel(""), widget.NewLabel("")
	t.cpu.Wrapping = fyne.TextWrapWord
	t.cpuBar, t.ramBar = widget.NewProgressBar(), widget.NewProgressBar()
	t.cpuBar.TextFormatter = func() string { return fmt.Sprintf("CPU %.0f %%", t.cpuBar.Value*100) }
	t.ramBar.TextFormatter = func() string { return fmt.Sprintf("RAM %.0f %%", t.ramBar.Value*100) }
	t.process = widget.NewLabel("")
	t.deviceID, t.version, t.signal, t.ice, t.web = mono(), widget.NewLabel(""), mono(), mono(), mono()
	t.web.SetText(u.pairingURL())

	intro := wrapped("This computer and its live usage. Hardware data never goes to room guests: only to browsers linked with the code.")
	header := newAdaptiveRow(560, heroTile(azure, "cpu", 120),
		container.NewVBox(text("System", 30, white, true), intro))
	body := vstack(
		header,
		glass(widget.NewForm(
			widget.NewFormItem("System", t.platform),
			widget.NewFormItem("CPU", t.cpu),
			widget.NewFormItem("Memory", t.memory),
		)),
		glass(container.NewVBox(text("Usage", 16, white, true), t.cpuBar, t.ramBar, t.process)),
		glass(widget.NewForm(
			widget.NewFormItem("Device ID", t.deviceID),
			widget.NewFormItem("Version", t.version),
			widget.NewFormItem("Signaling", t.signal),
			widget.NewFormItem("STUN / TURN", t.ice),
			widget.NewFormItem("Website", t.web),
		)),
	)
	t.content = container.NewVScroll(container.New(layout.NewCustomPaddedLayout(24, 24, 28, 28), body))
	return t
}

func (t *systemTab) render(st models.Status) {
	if sys := st.System; sys != nil {
		hw, use := sys.Hardware, sys.Usage
		t.platform.SetText(fmt.Sprintf("%s · %s", hw.Platform, hw.Arch))
		t.cpu.SetText(fmt.Sprintf("%s · %d cores", hw.CPUModel, hw.Cores))
		t.memory.SetText(formatBytes(hw.MemTotal))
		t.cpuBar.SetValue(use.CPUPercent / 100)
		if hw.MemTotal > 0 {
			t.ramBar.SetValue(float64(use.MemUsed) / float64(hw.MemTotal))
		}
		t.process.SetText(fmt.Sprintf("This device: CPU %.0f %% (of one core) · RAM %s", use.ProcessCPUPercent, formatBytes(use.ProcessRSS)))
	} else {
		t.platform.SetText("Measuring…")
	}
	t.deviceID.SetText(st.DeviceID)
	t.version.SetText(st.Version)
	t.signal.SetText(st.Signal.URL)
	if len(st.Signal.ICEURLs) == 0 {
		t.ice.SetText("Not received yet (they come from the signaling server)")
	} else {
		t.ice.SetText(strings.Join(st.Signal.ICEURLs, "\n"))
	}
}
