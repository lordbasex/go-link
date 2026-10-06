// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// How each zone kind looks in the editor's chips and menus (a 10 px swatch),
// in ink and accent only, as the design system asks.

import type { ZoneKind } from "../../model";

const INK = "var(--color-text)";
const RED = "var(--color-accent)";
const mix = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;

/** The CSS background of a kind's swatch. */
export const ZONE_SWATCH: Record<ZoneKind, string> = {
  floor: mix(INK, 60),
  platform: mix(INK, 20),
  ladder: `repeating-linear-gradient(180deg, ${INK} 0 1px, transparent 1px 3px)`,
  crate: mix(INK, 30),
  breakable: "transparent",
  hazard: RED,
  water: `repeating-linear-gradient(90deg, ${mix(INK, 35)} 0 1px, transparent 1px 3px)`,
};
