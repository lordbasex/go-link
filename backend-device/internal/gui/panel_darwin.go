// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build !headless && darwin

package gui

/*
#cgo CFLAGS: -x objective-c -fblocks
#cgo LDFLAGS: -framework Cocoa
#include <stdlib.h>
void mwAttachPanel(const char *title);
void mwStyleWindow(const char *title);
void mwDragBegin(const char *title);
void mwDragMove(const char *title);
void mwZoom(const char *title);
*/
import "C"

import (
	"sync"
	"unsafe"
)

var (
	panelMu     sync.Mutex
	panelHidden func()
)

// attachPanel makes the borderless window titled title behave like a menu
// bar panel: it opens under the tray icon, floats above other windows and
// hides when the user clicks elsewhere.
func attachPanel(title string, hide func()) {
	panelMu.Lock()
	panelHidden = hide
	panelMu.Unlock()
	cs := C.CString(title)
	defer C.free(unsafe.Pointer(cs))
	C.mwAttachPanel(cs)
}

// styleWindow hides the title bar and lets the gradient run under the
// traffic lights, like MacDub.
func styleWindow(title string) {
	cs := C.CString(title)
	defer C.free(unsafe.Pointer(cs))
	C.mwStyleWindow(cs)
}

// dragWindow moves the window with the mouse: begin on the first drag
// event, then follow.
func dragWindow(title string, begin bool) {
	cs := C.CString(title)
	defer C.free(unsafe.Pointer(cs))
	if begin {
		C.mwDragBegin(cs)
	}
	C.mwDragMove(cs)
}

// zoomWindow maximizes or restores the window.
func zoomWindow(title string) {
	cs := C.CString(title)
	defer C.free(unsafe.Pointer(cs))
	C.mwZoom(cs)
}

// titleBarInset is the room the traffic lights need at the top.
const titleBarInset = 28

//export goPanelResigned
func goPanelResigned() {
	panelMu.Lock()
	hide := panelHidden
	panelMu.Unlock()
	if hide != nil {
		hide()
	}
}
