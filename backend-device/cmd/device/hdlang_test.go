// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package main

import "testing"

func TestGameLanguage(t *testing.T) {
	if got := gameLanguage("pt"); got != "pt" {
		t.Fatalf("device language: %q", got)
	}
	t.Setenv("GO_LINK_LANG", "es")
	if got := gameLanguage(""); got != "es" {
		t.Fatalf("computer's language: %q", got)
	}
	t.Setenv("GO_LINK_LANG", "fr")
	if got := gameLanguage("de"); !supportedGameLanguage(got) {
		t.Fatalf("unsupported language: %q", got)
	}
}
