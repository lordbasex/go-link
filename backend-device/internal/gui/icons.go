// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build !headless

package gui

import (
	"fmt"
	"image/color"
	"strings"
	"sync"

	"fyne.io/fyne/v2"
)

// Line icons (24x24, drawn with strokes) in the spirit of SF Symbols.
var iconPaths = map[string]string{
	"cpu": `<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/>
		<path d="M9 2.5v3.5M12 2.5v3.5M15 2.5v3.5M9 18v3.5M12 18v3.5M15 18v3.5M2.5 9h3.5M2.5 12h3.5M2.5 15h3.5M18 9h3.5M18 12h3.5M18 15h3.5"/>`,
	"memory": `<rect x="2.5" y="7" width="19" height="9" rx="1.5"/><rect x="5.5" y="9.5" width="3" height="4"/><rect x="10.5" y="9.5" width="3" height="4"/><rect x="15.5" y="9.5" width="3" height="4"/>
		<path d="M5 16v2.5M8 16v2.5M11 16v2.5M13 16v2.5M16 16v2.5M19 16v2.5"/>`,
	"network": `<path d="M8 20V5M8 5l-4 4M8 5l4 4M16 4v15M16 19l-4-4M16 19l4-4"/>`,
	"stream":  `<rect x="2.5" y="4.5" width="19" height="12.5" rx="2"/><path d="M10 8.5v5l4.5-2.5z"/><path d="M8 20.5h8"/>`,
	"gamepad": `<path d="M7 7h10a5 5 0 0 1 4.8 6.4l-1.2 4.2a2.4 2.4 0 0 1-4.1 1l-2.2-2.6h-4.6l-2.2 2.6a2.4 2.4 0 0 1-4.1-1l-1.2-4.2A5 5 0 0 1 7 7z"/>
		<path d="M7.5 10.5v3M6 12h3"/><circle cx="15.5" cy="11" r=".6"/><circle cx="17.5" cy="13" r=".6"/>`,
	"players":  `<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.4c2.4.1 4 1.6 4.5 4.3"/>`,
	"eye":      `<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`,
	"link":     `<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>`,
	"signal":   `<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a4.8 4.8 0 0 1 6.4 0"/><circle cx="12" cy="19.2" r=".9"/>`,
	"rom":      `<path d="M6 3h9l3 3v15H6z"/><path d="M9 7h6v5H9zM9 16h1.5M12 16h1.5M15 16h.5"/>`,
	"download": `<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5"/><path d="M4 15.5v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>`,
	"system":   `<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M9 20.5h6M12 16.5v4"/>`,
	"device":   `<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M9 20.5h6M12 16.5v4"/><path d="M8.5 10.5h7M12 7v7"/>`,
	"latency":  `<circle cx="12" cy="13" r="8"/><path d="M12 13l3.5-3.5M12 3v2"/>`,
	"queue":    `<path d="M4 6h16M4 12h16M4 18h10"/>`,
	"play":     `<path d="M8 5.5v13l10.5-6.5z" fill="#FFFFFF"/>`,
	"stop":     `<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="#FFFFFF"/>`,
	"folder":   `<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h9A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z"/>`,
	"copy":     `<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>`,
	"unlink":   `<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/><path d="M3 3l18 18"/>`,
	"arcade":   `<path d="M7 2.5h10v5l-1.5 1.5v5.5L17 21.5H7l1.5-7V9L7 7.5z"/><rect x="9.5" y="4.5" width="5" height="3" rx=".5"/><path d="M10 12h4M12 10.5v3"/>`,
	"image":    `<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 16l-5-5-8.5 8.5"/>`,
	"check":    `<path d="M5 12.5l4.5 4.5L19 7.5"/>`,
	"dash":     `<path d="M8 12h8"/>`,
	"gear": `<circle cx="12" cy="12" r="6.3"/><circle cx="12" cy="12" r="2.4"/>
		<path stroke-width="3" stroke-linecap="butt" d="M18.3 12h3M16.45 7.55l2.1-2.1M12 5.7v-3M7.55 7.55l-2.1-2.1M5.7 12h-3M7.55 16.45l-2.1 2.1M12 18.3v3M16.45 16.45l2.1 2.1"/>`,
	"joystick": `<circle cx="12" cy="6.5" r="3.3"/><path d="M12 9.8v5.2"/><path d="M4 16.5h16l-1.5 4h-13z"/><path d="M16.5 14.5h2"/>`,
}

var (
	iconMu    sync.Mutex
	iconCache = map[string]fyne.Resource{}
)

// icon returns a line icon drawn in c.
func icon(name string, c color.Color) fyne.Resource {
	r, g, b, _ := c.RGBA()
	hex := fmt.Sprintf("#%02X%02X%02X", r>>8, g>>8, b>>8)
	key := name + hex
	iconMu.Lock()
	defer iconMu.Unlock()
	if res, ok := iconCache[key]; ok {
		return res
	}
	body := strings.ReplaceAll(iconPaths[name], "#FFFFFF", hex)
	svg := `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="` + hex +
		`" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">` + body + `</svg>`
	res := fyne.NewStaticResource(name+hex+".svg", []byte(svg))
	iconCache[key] = res
	return res
}
