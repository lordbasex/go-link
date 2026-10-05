// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The rows of a sheet: the detected boxes grouped by height, top to bottom,
// each row left to right. A sheet made from an image AI prompt has one
// animation per row, so its rows can be given their animations in one go.

import type { SourceFrame } from "./convert";

export function rowsOf(frames: readonly SourceFrame[]): SourceFrame[][] {
  const rows: { top: number; bottom: number; items: SourceFrame[] }[] = [];
  for (const f of [...frames].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2))) {
    const mid = f.y + f.h / 2;
    // a box belongs to the row whose height range holds its middle
    const row = rows.find((r) => mid >= r.top && mid <= r.bottom);
    if (row) {
      row.items.push(f);
      row.top = Math.min(row.top, f.y);
      row.bottom = Math.max(row.bottom, f.y + f.h);
    } else rows.push({ top: f.y, bottom: f.y + f.h, items: [f] });
  }
  return rows.sort((a, b) => a.top - b.top).map((r) => r.items.sort((a, b) => a.x - b.x));
}
