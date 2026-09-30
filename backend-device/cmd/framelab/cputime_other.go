// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build !unix

package main

import "time"

// cpuTime is not measured on this system; encode_cpu_ms reads 0.
func cpuTime() time.Duration { return 0 }
