// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build headless

package main

// runUI waits until the device stops: this build has no window, so the
// device is managed from the log, the CLI and the linked website.
func runUI(o uiOptions) {
	<-o.ctx.Done()
}

// guiBuilt: this build has no window, so it always runs headless.
const guiBuilt = false
