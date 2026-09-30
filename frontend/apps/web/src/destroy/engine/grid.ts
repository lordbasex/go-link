// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A spatial hash of the page's bodies, so a bullet or a jump only looks at
// the few bodies near it instead of the thousands on the page.

import type { Rect } from "./types";

export class SpatialGrid {
  private cells = new Map<number, Set<number>>();
  private where = new Map<number, number[]>();

  constructor(readonly cell = 96) {}

  private key(cx: number, cy: number): number {
    // Page coordinates stay well under 2^15 cells per axis.
    return (cy + 16384) * 65536 + (cx + 16384);
  }

  insert(id: number, r: Rect): void {
    const keys: number[] = [];
    const x0 = Math.floor(r.x / this.cell);
    const y0 = Math.floor(r.y / this.cell);
    const x1 = Math.floor((r.x + r.w) / this.cell);
    const y1 = Math.floor((r.y + r.h) / this.cell);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const k = this.key(cx, cy);
        let set = this.cells.get(k);
        if (!set) this.cells.set(k, (set = new Set()));
        set.add(id);
        keys.push(k);
      }
    this.where.set(id, keys);
  }

  remove(id: number): void {
    for (const k of this.where.get(id) ?? []) this.cells.get(k)?.delete(id);
    this.where.delete(id);
  }

  has(id: number): boolean {
    return this.where.has(id);
  }

  /** The ids in the cells a rectangle touches (a superset: test the boxes yourself). */
  query(r: Rect, out = new Set<number>()): Set<number> {
    const x0 = Math.floor(r.x / this.cell);
    const y0 = Math.floor(r.y / this.cell);
    const x1 = Math.floor((r.x + r.w) / this.cell);
    const y1 = Math.floor((r.y + r.h) / this.cell);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const set = this.cells.get(this.key(cx, cy));
        if (set) for (const id of set) out.add(id);
      }
    return out;
  }

  /** The ids in the cells a ray crosses, from its start up to `len` (a superset). */
  alongRay(ox: number, oy: number, dx: number, dy: number, len: number, out = new Set<number>()): Set<number> {
    // Walk the cells with small steps (half a cell): simple and exact enough.
    const step = this.cell / 2;
    const n = Math.ceil(len / step);
    let last = NaN;
    for (let i = 0; i <= n; i++) {
      const t = Math.min(len, i * step);
      const cx = Math.floor((ox + dx * t) / this.cell);
      const cy = Math.floor((oy + dy * t) / this.cell);
      const k = this.key(cx, cy);
      if (k === last) continue;
      last = k;
      // The neighbors too, so a ray grazing a cell corner is not missed.
      for (let ny = cy - 1; ny <= cy + 1; ny++)
        for (let nx = cx - 1; nx <= cx + 1; nx++) {
          const set = this.cells.get(this.key(nx, ny));
          if (set) for (const id of set) out.add(id);
        }
    }
    return out;
  }
}

/** Where a ray enters and leaves a box (slab method), or null when it misses. */
export function rayBox(ox: number, oy: number, dx: number, dy: number, r: Rect): { tIn: number; tOut: number } | null {
  let tIn = -Infinity;
  let tOut = Infinity;
  if (dx === 0) {
    if (ox < r.x || ox > r.x + r.w) return null;
  } else {
    const a = (r.x - ox) / dx;
    const b = (r.x + r.w - ox) / dx;
    tIn = Math.max(tIn, Math.min(a, b));
    tOut = Math.min(tOut, Math.max(a, b));
  }
  if (dy === 0) {
    if (oy < r.y || oy > r.y + r.h) return null;
  } else {
    const a = (r.y - oy) / dy;
    const b = (r.y + r.h - oy) / dy;
    tIn = Math.max(tIn, Math.min(a, b));
    tOut = Math.min(tOut, Math.max(a, b));
  }
  if (tOut < Math.max(0, tIn)) return null;
  return { tIn: Math.max(0, tIn), tOut };
}
