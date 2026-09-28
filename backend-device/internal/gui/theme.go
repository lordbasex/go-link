// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build !headless

package gui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"
)

// palette is the gradient and accent of one section, like MacDub: a deep
// gradient per section, glass cards and glossy tiles, dark by design.
type palette struct {
	top, bottom, accent color.NRGBA
}

var (
	violet  = palette{top: rgb(0.36, 0.14, 0.74), bottom: rgb(0.08, 0.05, 0.24), accent: rgb(0.78, 0.35, 1.0)}
	magenta = palette{top: rgb(0.72, 0.12, 0.55), bottom: rgb(0.22, 0.04, 0.22), accent: rgb(1.0, 0.42, 0.78)}
	azure   = palette{top: rgb(0.10, 0.32, 0.80), bottom: rgb(0.04, 0.08, 0.28), accent: rgb(0.35, 0.70, 1.0)}
	emerald = palette{top: rgb(0.08, 0.48, 0.40), bottom: rgb(0.03, 0.14, 0.14), accent: rgb(0.35, 0.90, 0.70)}
)

var (
	white       = color.NRGBA{0xff, 0xff, 0xff, 0xff}
	cardFill    = color.NRGBA{0xff, 0xff, 0xff, 0x14} // 8 %
	cardStroke  = color.NRGBA{0xff, 0xff, 0xff, 0x1a} // 10 %
	textMuted   = color.NRGBA{0xff, 0xff, 0xff, 0xa6} // 65 %
	textFaint   = color.NRGBA{0xff, 0xff, 0xff, 0x73} // 45 %
	colorOK     = color.NRGBA{0x4c, 0xd9, 0x64, 0xff}
	colorWarn   = color.NRGBA{0xff, 0xcc, 0x33, 0xff}
	colorDanger = color.NRGBA{0xff, 0x6b, 0x7a, 0xff}
)

func rgb(r, g, b float64) color.NRGBA {
	return color.NRGBA{uint8(r * 255), uint8(g * 255), uint8(b * 255), 0xff}
}

func withAlpha(c color.NRGBA, a uint8) color.NRGBA {
	c.A = a
	return c
}

// arcadeTheme is Fyne's dark theme with white text on the gradients.
type arcadeTheme struct{}

func (arcadeTheme) Color(name fyne.ThemeColorName, _ fyne.ThemeVariant) color.Color {
	switch name {
	case theme.ColorNameBackground:
		return violet.bottom
	case theme.ColorNameOverlayBackground, theme.ColorNameMenuBackground:
		return color.NRGBA{0x24, 0x16, 0x46, 0xff}
	case theme.ColorNameHeaderBackground:
		return color.NRGBA{0xff, 0xff, 0xff, 0x10}
	case theme.ColorNameInputBackground:
		return color.NRGBA{0xff, 0xff, 0xff, 0x14}
	case theme.ColorNameButton:
		return color.NRGBA{0xff, 0xff, 0xff, 0x1f}
	case theme.ColorNameDisabledButton:
		return color.NRGBA{0xff, 0xff, 0xff, 0x0d}
	case theme.ColorNameInputBorder:
		return color.NRGBA{0xff, 0xff, 0xff, 0x40}
	case theme.ColorNameSeparator:
		return cardStroke
	case theme.ColorNameForeground:
		return white
	case theme.ColorNameDisabled, theme.ColorNamePlaceHolder:
		return textFaint
	case theme.ColorNameHover:
		return color.NRGBA{0xff, 0xff, 0xff, 0x14}
	case theme.ColorNamePressed:
		return color.NRGBA{0xff, 0xff, 0xff, 0x26}
	case theme.ColorNameSelection:
		return color.NRGBA{0xff, 0xff, 0xff, 0x24}
	case theme.ColorNamePrimary, theme.ColorNameFocus:
		return violet.accent
	case theme.ColorNameForegroundOnPrimary:
		return white
	case theme.ColorNameSuccess:
		return colorOK
	case theme.ColorNameWarning:
		return colorWarn
	case theme.ColorNameError:
		return colorDanger
	case theme.ColorNameScrollBar:
		return color.NRGBA{0xff, 0xff, 0xff, 0x40}
	case theme.ColorNameShadow:
		return color.NRGBA{0, 0, 0, 0x55}
	}
	return theme.DefaultTheme().Color(name, theme.VariantDark)
}

func (arcadeTheme) Font(s fyne.TextStyle) fyne.Resource     { return theme.DefaultTheme().Font(s) }
func (arcadeTheme) Icon(n fyne.ThemeIconName) fyne.Resource { return theme.DefaultTheme().Icon(n) }

func (arcadeTheme) Size(n fyne.ThemeSizeName) float32 {
	switch n {
	case theme.SizeNameInputRadius, theme.SizeNameSelectionRadius:
		return 10
	case theme.SizeNameText:
		return 13
	}
	return theme.DefaultTheme().Size(n)
}
