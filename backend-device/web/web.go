// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Package web holds the website the device serves as its local panel.
// `make panel` copies the built website into panel/dist; without it (a
// plain go build) the panel shows how to build it.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:panel
var files embed.FS

// Panel returns the panel's files: the built website, or the fallback page.
func Panel() fs.FS {
	if dist, err := fs.Sub(files, "panel/dist"); err == nil {
		if _, err := fs.Stat(dist, "index.html"); err == nil {
			return dist
		}
	}
	fallback, _ := fs.Sub(files, "panel/fallback")
	return fallback
}
