// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build !headless && !darwin

package gui

// attachPanel is macOS only: elsewhere the panel opens where the system
// puts it and closes with another click on the tray icon.
func attachPanel(string, func()) {}

// styleWindow keeps the system title bar outside macOS.
func styleWindow(string) {}

// dragWindow and zoomWindow are not needed with a system title bar.
func dragWindow(string, bool) {}
func zoomWindow(string)       {}

// titleBarInset is zero where the title bar is the system's own.
const titleBarInset = 0
