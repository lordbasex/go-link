// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A level's parallax bands (T-26): rows of the play layer that scroll at
// their own speed with the board's row scroll. Kept in px on the 16 px grid;
// play mode, the review and Create ROM read them through here.

import type { Level, ParallaxBand } from "./types";

export const MAX_BANDS = 4;
export const BAND_SPEED = { min: 10, max: 95 } as const;

/** The level's bands, cleaned: on the grid, inside the level, in order, not overlapping, at most 4. */
export function cleanBands(level: Pick<Level, "size" | "parallax">): ParallaxBand[] {
  const rows = Math.floor(level.size.h / 16);
  const out: ParallaxBand[] = [];
  for (const b of level.parallax ?? []) {
    const r0 = Math.max(0, Math.min(rows, Math.round(Number(b.y0) / 16)));
    const r1 = Math.max(0, Math.min(rows, Math.round(Number(b.y1) / 16)));
    if (r1 <= r0) continue;
    const speed = Math.max(BAND_SPEED.min, Math.min(BAND_SPEED.max, Math.round(Number(b.speed) || 50)));
    out.push({ y0: r0 * 16, y1: r1 * 16, speed });
  }
  out.sort((a, b) => a.y0 - b.y0);
  const kept: ParallaxBand[] = [];
  for (const b of out) if (!kept.length || b.y0 >= kept[kept.length - 1]!.y1) kept.push(b);
  return kept.slice(0, MAX_BANDS);
}

/** The bands as the ROM takes them: rows of 16 px (r1 excluded) and speed in %. */
export function parallaxBands(level: Pick<Level, "size" | "parallax">): { r0: number; r1: number; speed: number }[] {
  return cleanBands(level).map((b) => ({ r0: b.y0 / 16, r1: b.y1 / 16, speed: b.speed }));
}

/** Where a band's view starts for a camera at camX (play mode and the ROM alike). */
export function bandX(camX: number, speed: number): number {
  return Math.trunc((camX * speed) / 100);
}
