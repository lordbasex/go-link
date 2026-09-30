// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Command framelab is the video quality lab: it records the exact picture
// a libretro core draws (the reference), pushes it through the device's
// real encoder path and a real decoder, and measures what players get.
// See docs/quality.md.
//
//	framelab capture -core CORE -rom ROM -out DIR [-frames N] [-script S] [-stills LIST] [-clip FROM:COUNT]
//	framelab extract -run RUN -out DIR (-frames LIST | -every N)
//	framelab encode  -capture DIR -variant SPEC -out DIR [-vmaf]
//	framelab compare [-down N] A B   (two PNG files, or two folders of PNGs with the same names)
//	framelab crop -in PNG -rect X,Y,W,H [-zoom N] -out PNG
//	framelab hotspot -ref PNG -img PNG [-down N] [-w 64] [-h 48]
//
// Game pictures stay on the machine that runs the lab: never commit or
// publish them.
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	var err error
	args := os.Args[2:]
	switch os.Args[1] {
	case "capture":
		err = runCapture(args)
	case "extract":
		err = runExtract(args)
	case "encode":
		err = runEncode(args)
	case "compare":
		err = runCompare(args)
	case "crop":
		err = runCrop(args)
	case "hotspot":
		err = runHotspot(args)
	default:
		usage()
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "framelab:", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `usage:
  framelab capture -core CORE -rom ROM -out DIR [-frames N] [-script S] [-stills LIST] [-clip FROM:COUNT]
  framelab extract -run RUN -out DIR (-frames LIST | -every N)
  framelab encode  -capture DIR -variant SPEC -out DIR [-vmaf]
  framelab compare [-down N] A B
  framelab crop -in PNG -rect X,Y,W,H [-zoom N] -out PNG
  framelab hotspot -ref PNG -img PNG [-down N] [-w 64] [-h 48]`)
	os.Exit(2)
}
