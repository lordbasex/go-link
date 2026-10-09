// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package glhd

import "testing"

func TestDemoPaths(t *testing.T) {
	for _, d := range Demos {
		n, ok := DemoIndex(DemoPath(d))
		if !ok || n != d.Index {
			t.Fatalf("%s: %d %v", d.Name, n, ok)
		}
		if got, ok := FindDemo(d.Name); !ok || got != d {
			t.Fatalf("find %s", d.Name)
		}
	}
	for _, p := range []string{"", "/roms/game.glhd", "golinkhd-demo:", "golinkhd-demo:-1", "golinkhd-demo:x"} {
		if _, ok := DemoIndex(p); ok {
			t.Fatalf("%q is a demo", p)
		}
	}
	if BundledLibrary("linux") != "" {
		t.Fatal("a library next to the test binary")
	}
}
