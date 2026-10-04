// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build !windows

package main

import (
	"syscall"
	"time"
)

// cpuTime is the CPU this process has used, user and system (hdbench).
func cpuTime() time.Duration {
	var ru syscall.Rusage
	_ = syscall.Getrusage(syscall.RUSAGE_SELF, &ru)
	return time.Duration(ru.Utime.Nano() + ru.Stime.Nano())
}
