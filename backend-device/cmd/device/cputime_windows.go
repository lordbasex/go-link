// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build windows

package main

import (
	"syscall"
	"time"
)

// cpuTime is the CPU this process has used, user and system (hdbench).
func cpuTime() time.Duration {
	var creation, exit, kernel, user syscall.Filetime
	h, err := syscall.GetCurrentProcess()
	if err != nil || syscall.GetProcessTimes(h, &creation, &exit, &kernel, &user) != nil {
		return 0
	}
	// FILETIMEs count 100 ns ticks
	ticks := func(f syscall.Filetime) int64 { return int64(f.HighDateTime)<<32 | int64(f.LowDateTime) }
	return time.Duration((ticks(kernel) + ticks(user)) * 100)
}
