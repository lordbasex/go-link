// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build !unix

package main

import "os"

// protocolStdout returns stdout as is: redirecting a core's printf output
// is only done on Unix systems.
func protocolStdout() (*os.File, error) {
	return os.Stdout, nil
}
