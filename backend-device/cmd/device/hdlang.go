// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package main

import (
	"os"
	"strings"

	"github.com/jeandeaual/go-locale"
)

// gameLanguage is the language go-link HD's games show their texts and
// dialogs in: the device's own (device.json language), else the
// computer's, else English. The engine speaks en, es and pt.
func gameLanguage(device string) string {
	if supportedGameLanguage(device) {
		return device
	}
	if v := os.Getenv("GO_LINK_LANG"); supportedGameLanguage(v) {
		return v
	}
	if tags, err := locale.GetLocales(); err == nil {
		for _, t := range tags {
			l := strings.ToLower(strings.SplitN(strings.SplitN(t, "-", 2)[0], "_", 2)[0])
			if supportedGameLanguage(l) {
				return l
			}
		}
	}
	return "en"
}

func supportedGameLanguage(l string) bool { return l == "en" || l == "es" || l == "pt" }
