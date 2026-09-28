// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package panel

import "testing"

// The website computes the same value (packages/shared/test/hmac.test.ts).
func TestPanelProofMatchesTheWebsite(t *testing.T) {
	got := Proof("0B5C7C1E-9D7A-4B8E-8A31-2F6F3C9D1E24", "nonce-0123456789abcdef")
	if got != "kFjx9ZwjkUioq9MgKUA8EwwYT6fnxaocllhK8UStoSM" {
		t.Fatalf("proof %s", got)
	}
}
