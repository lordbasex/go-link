// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build windows

package services

import (
	"os/exec"
	"syscall"
)

// detachSignals starts the worker in its own process group, so a Ctrl-C
// meant for the device does not kill the game before it is saved.
func detachSignals(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP}
}
