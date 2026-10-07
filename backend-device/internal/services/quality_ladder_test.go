// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import "testing"

func TestQualityLadderStepsDownAtOnceAndUpSlowly(t *testing.T) {
	var l qualityLadder
	drop := 0
	clean := map[string]float64{"video_loss_pct": 1}
	if d, why := l.note(drop, clean); d != 0 || why != "" {
		t.Fatalf("a clean report moved to %d", d)
	}
	drop, why := l.note(drop, map[string]float64{"video_loss_pct": 4})
	if drop != 1 || why == "" {
		t.Fatalf("4 %% loss: drop %d", drop)
	}
	drop, _ = l.note(drop, map[string]float64{"freeze_ms": 600})
	drop, _ = l.note(drop, map[string]float64{"freeze_ms": 600})
	if drop != qualitySteps {
		t.Fatalf("went to %d, past the last step", drop)
	}
	// A hidden tab neither steps down nor counts as clean.
	for range 30 {
		drop, _ = l.note(drop, map[string]float64{"hidden": 1, "video_loss_pct": 50})
	}
	if drop != qualitySteps {
		t.Fatalf("a hidden tab moved the step to %d", drop)
	}
	for i := 1; i < qualityCleanReports; i++ {
		if d, _ := l.note(drop, clean); d != drop {
			t.Fatalf("stepped up after %d clean reports", i)
		}
	}
	if d, why := l.note(drop, clean); d != drop-1 || why == "" {
		t.Fatalf("after 20 s clean: %d", d)
	}
}
