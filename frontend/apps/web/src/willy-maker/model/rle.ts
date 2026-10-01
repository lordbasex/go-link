// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Cell data of tile and tag layers is stored as run-length encoded text
// ("rle:" then "value*count" runs joined by commas, or a bare value for a
// run of one), in row order. Long empty stretches cost a few bytes.

const PREFIX = "rle:";

export function encodeCells(cells: ArrayLike<number>): string {
  const out: string[] = [];
  let i = 0;
  while (i < cells.length) {
    const v = cells[i]!;
    let n = 1;
    while (i + n < cells.length && cells[i + n] === v) n++;
    out.push(n === 1 ? String(v) : `${v}*${n}`);
    i += n;
  }
  return PREFIX + out.join(",");
}

/** Decodes into exactly `count` cells (missing cells are 0, extra ones dropped). */
export function decodeCells(data: string, count: number): Uint16Array {
  const out = new Uint16Array(count);
  if (!data.startsWith(PREFIX)) return out;
  const body = data.slice(PREFIX.length);
  if (!body) return out;
  let i = 0;
  for (const run of body.split(",")) {
    const star = run.indexOf("*");
    const v = Number(star < 0 ? run : run.slice(0, star));
    const n = star < 0 ? 1 : Number(run.slice(star + 1));
    if (!Number.isFinite(v) || !Number.isFinite(n) || n < 0) continue;
    for (let k = 0; k < n && i < count; k++) out[i++] = v;
    if (i >= count) break;
  }
  return out;
}
