// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build !windows

package main

import (
	"os"
	"os/signal"
	"runtime/pprof"
	"syscall"
)

// dumpOnSignal writes every goroutine's stack to stderr on SIGUSR1
// (kill -USR1 <pid>), without stopping the device: a way to see where it
// is stuck.
func dumpOnSignal() {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGUSR1)
	go func() {
		for range ch {
			_ = pprof.Lookup("goroutine").WriteTo(os.Stderr, 2)
		}
	}()
}
