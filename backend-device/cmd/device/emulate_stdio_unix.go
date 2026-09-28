// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build unix

package main

import (
	"os"

	"golang.org/x/sys/unix"
)

// protocolStdout returns a private copy of stdout for the worker protocol
// and points file descriptor 1 at stderr, so whatever a core prints with
// printf ends up in the log instead of corrupting the stream.
func protocolStdout() (*os.File, error) {
	fd, err := unix.Dup(1)
	if err != nil {
		return nil, err
	}
	unix.CloseOnExec(fd)
	if err := unix.Dup2(2, 1); err != nil {
		unix.Close(fd)
		return nil, err
	}
	return os.NewFile(uintptr(fd), "protocol"), nil
}
