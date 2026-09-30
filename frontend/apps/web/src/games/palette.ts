// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import type { Palette } from "./types";

/** The games' palette from the site's tokens, so they follow the theme. */
export function readPalette(el: Element = document.documentElement): Palette {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    bg: v("--color-video", "#05060a"),
    grid: v("--color-surface", "#161a23"),
    line: v("--color-border-strong", "#3a4256"),
    dim: v("--color-text-dim", "#5d667a"),
    text: v("--color-text", "#e9ecf2"),
    accent: v("--color-accent", "#f2a33a"),
    ok: v("--color-ok", "#7ee2a8"),
    p1: v("--color-p1", "#f2a33a"),
    p2: v("--color-p2", "#4fc3d9"),
    p3: v("--color-p3", "#e0627a"),
    p4: v("--color-p4", "#9d8cf0"),
    mono: v("--font-mono", "monospace"),
  };
}
