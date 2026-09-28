// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"crypto/sha256"
	"testing"
)

// The web computes the same value (packages/shared/test/hmac.test.ts):
// both sides must agree byte for byte.
const (
	proofToken = "token-for-the-cross-language-test"
	proofNonce = "nonce-0123456789abcdef"
)

func TestLinkProofMatchesTheWebsite(t *testing.T) {
	hash := sha256.Sum256([]byte(proofToken))
	got := LinkProof(hash[:], proofNonce)
	if got != "rPH7TuI01BJG28Tw_mpKMEdt0CfB3r4d8uZkMn9YfUc" {
		t.Fatalf("proof %s", got)
	}
}
