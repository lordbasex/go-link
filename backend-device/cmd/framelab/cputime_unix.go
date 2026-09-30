// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build unix

package main

import (
	"syscall"
	"time"
)

// cpuTime is the CPU time this process used so far (user + system, all
// threads).
func cpuTime() time.Duration {
	var ru syscall.Rusage
	if syscall.Getrusage(syscall.RUSAGE_SELF, &ru) != nil {
		return 0
	}
	return time.Duration(ru.Utime.Nano() + ru.Stime.Nano())
}
