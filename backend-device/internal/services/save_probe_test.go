// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"testing"
)

// probeWorker answers like "emulate --probe": save and load results given.
func probeWorker(save, load string) func(context.Context, []string) *exec.Cmd {
	return func(ctx context.Context, args []string) *exec.Cmd {
		answer := load
		if i := slices.Index(args, "--probe"); i >= 0 && args[i+1] == "save" {
			answer = save
		}
		// A core may print other lines first.
		return exec.CommandContext(ctx, "printf", "core says hello\n"+answer+"\n")
	}
}

func TestProbeSaves(t *testing.T) {
	for _, c := range []struct {
		name, save, load string
		want             bool
	}{
		{"whole", `{"sound":480000,"complete":true}`, `{"sound":470000,"complete":true}`, true},
		{"a CPU is missing", `{"sound":480000,"complete":false}`, `{"sound":470000,"complete":false}`, false},
		{"the sound is gone", `{"sound":480000,"complete":true}`, `{"sound":0,"complete":true}`, false},
		{"a silent game tells nothing", `{"sound":0,"complete":true}`, `{"sound":0,"complete":true}`, true},
		{"the game freezes after loading", `{"sound":480000,"changes":290,"complete":true}`, `{"sound":470000,"changes":1,"complete":true}`, false},
		{"a still screen before the save tells nothing", `{"sound":480000,"changes":3,"complete":true}`, `{"sound":470000,"changes":0,"complete":true}`, true},
	} {
		got, err := ProbeSaves(context.Background(), SaveProbeConfig{CorePath: "core", RomPath: "rom.zip", Command: probeWorker(c.save, c.load)})
		if err != nil || got != c.want {
			t.Errorf("%s: ProbeSaves = %v, %v; want %v", c.name, got, err, c.want)
		}
	}
	// A chip the core does not save: its module is missing from the save.
	qsound := SaveProbeConfig{CorePath: "core", RomPath: "xmvsf.zip", Needs: []string{"QSound"},
		Command: probeWorker(`{"sound":480000,"complete":true,"modules":["m68000","z80"]}`, `{"sound":470000,"complete":true}`)}
	if ok, _ := ProbeSaves(context.Background(), qsound); ok {
		t.Error("a save without the QSound module must be incomplete")
	}
	qsound.Command = probeWorker(`{"sound":480000,"complete":true,"modules":["m68000","z80","QSound"]}`, `{"sound":470000,"complete":true}`)
	if ok, _ := ProbeSaves(context.Background(), qsound); !ok {
		t.Error("a core that saves QSound resumes the game")
	}
	if _, err := ProbeSaves(context.Background(), SaveProbeConfig{Command: probeWorker("nothing", "nothing")}); err == nil {
		t.Error("a worker without an answer must fail")
	}
}

func TestSaveProbeCacheTestsEachGameOncePerCore(t *testing.T) {
	dir := t.TempDir()
	core := filepath.Join(dir, "core.dylib")
	writeID := func(id string) {
		if err := os.WriteFile(core+".sha256", []byte(id+"\n"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	writeID("aaa")
	probes := 0
	probe := func(_ context.Context, corePath, rom string) (bool, error) {
		probes++
		return rom == "cabal", nil
	}
	file := filepath.Join(dir, "saves.json")
	c := NewSaveProbeCache(file, func() string { return core }, probe)
	for range 2 {
		if ok, _ := c.SavesWork(context.Background(), "xmvsf"); ok {
			t.Fatal("xmvsf saves must not work")
		}
	}
	if ok, _ := c.SavesWork(context.Background(), "cabal"); !ok {
		t.Fatal("cabal saves work")
	}
	if probes != 2 {
		t.Fatalf("%d probes, want one per game", probes)
	}
	// Remembered across restarts.
	c = NewSaveProbeCache(file, func() string { return core }, probe)
	_, _ = c.SavesWork(context.Background(), "xmvsf")
	if probes != 2 {
		t.Fatal("the cache file was not used")
	}
	// A new core tests again.
	writeID("bbb")
	_, _ = c.SavesWork(context.Background(), "xmvsf")
	if probes != 3 {
		t.Fatal("a new core must test the game again")
	}
}
