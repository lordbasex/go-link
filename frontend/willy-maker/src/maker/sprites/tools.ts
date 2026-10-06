// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The pixel editor's extra tools (ui/PixelEditor.tsx), pure like pixels.ts:
// a selection lifted off a layer and put back (moved, flipped, turned),
// replace a color, an automatic outline, the zones brought down to the
// board's 15 colors, a new canvas size that keeps the feet, and a pasted
// picture fitted into the frame.

import { blank, colorAt, copy, type Color, type Pixels } from "./pixels";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The box between two corners, kept inside the picture (null when it is empty). */
export function boxBetween(p: Pixels, x0: number, y0: number, x1: number, y1: number): Rect | null {
  const l = Math.max(0, Math.min(x0, x1));
  const t = Math.max(0, Math.min(y0, y1));
  const r = Math.min(p.w - 1, Math.max(x0, x1));
  const b = Math.min(p.h - 1, Math.max(y0, y1));
  return r < l || b < t ? null : { x: l, y: t, w: r - l + 1, h: b - t + 1 };
}

/** The pixels of a box (the piece) and the picture with that box emptied (the rest). */
export function lift(p: Pixels, box: Rect): { piece: Pixels; rest: Pixels } {
  const piece = blank(box.w, box.h);
  const rest = copy(p);
  for (let y = 0; y < box.h; y++)
    for (let x = 0; x < box.w; x++) {
      const from = ((box.y + y) * p.w + box.x + x) * 4;
      piece.rgba.set(p.rgba.subarray(from, from + 4), (y * box.w + x) * 4);
      rest.rgba.fill(0, from, from + 4);
    }
  return { piece, rest };
}

/** A piece put down with its top left corner at (x, y): its see-through pixels leave what is under them. */
export function stamp(p: Pixels, piece: Pixels, x: number, y: number): Pixels {
  const out = copy(p);
  for (let py = 0; py < piece.h; py++)
    for (let px = 0; px < piece.w; px++) {
      const tx = x + px;
      const ty = y + py;
      if (tx < 0 || ty < 0 || tx >= p.w || ty >= p.h) continue;
      const from = (py * piece.w + px) * 4;
      if (piece.rgba[from + 3]! < 128) continue;
      out.rgba.set(piece.rgba.subarray(from, from + 4), (ty * p.w + tx) * 4);
    }
  return out;
}

/** The picture turned a quarter clockwise. */
export function rotate(p: Pixels): Pixels {
  const out = blank(p.h, p.w);
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const from = (y * p.w + x) * 4;
      out.rgba.set(p.rgba.subarray(from, from + 4), (x * out.w + (p.h - 1 - y)) * 4);
    }
  return out;
}

function put(p: Pixels, i: number, c: string): void {
  const n = parseInt(c.slice(1), 16);
  p.rgba[i] = (n >> 16) & 255;
  p.rgba[i + 1] = (n >> 8) & 255;
  p.rgba[i + 2] = n & 255;
  p.rgba[i + 3] = 255;
}

/** Every pixel of one color takes another (null: they go see-through). */
export function replaceColor(p: Pixels, from: string, to: Color): Pixels {
  const out = copy(p);
  let changed = false;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (colorAt(p, x, y) !== from) continue;
      const i = (y * p.w + x) * 4;
      if (to === null) out.rgba.fill(0, i, i + 4);
      else put(out, i, to);
      changed = true;
    }
  return changed ? out : p;
}

/** A one pixel outline around the drawing: every see-through pixel beside a drawn one (side by side) takes the color. */
export function outline(p: Pixels, c: string): Pixels {
  const out = copy(p);
  const drawn = (x: number, y: number) => x >= 0 && y >= 0 && x < p.w && y < p.h && p.rgba[(y * p.w + x) * 4 + 3]! >= 128;
  let changed = false;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (drawn(x, y)) continue;
      if (drawn(x - 1, y) || drawn(x + 1, y) || drawn(x, y - 1) || drawn(x, y + 1)) {
        put(out, (y * p.w + x) * 4, c);
        changed = true;
      }
    }
  return changed ? out : p;
}

const rgbOf = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
/** How far apart two colors look (red, green and blue weighted like the eye). */
function distance(a: string, b: string): number {
  const [r1, g1, b1] = rgbOf(a);
  const [r2, g2, b2] = rgbOf(b);
  return 2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2;
}

/** A zone's band of rows, counted `rows` at a time up from the feet (as sprites/pixels bandColors). */
const bandOf = (y: number, feetY: number, rows: number) => Math.max(0, Math.floor((feetY - y) / rows));

/**
 * For each zone with more than `max` colors, the colors to merge: the least
 * used ones go to the nearest of the `max` most used. The board gives a
 * zone one palette for all the frames, so the count takes every frame as it
 * shows (with its feet row); the merges then apply to every layer
 * (recolorBands).
 */
export function zoneMerges(frames: readonly { pic: Pixels; feetY: number }[], max = 15, rows = 16): Map<string, string>[] {
  const counts: Map<string, number>[] = [];
  for (const { pic: p, feetY } of frames)
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const c = colorAt(p, x, y);
        if (!c) continue;
        const m = (counts[bandOf(y, feetY, rows)] ??= new Map());
        m.set(c, (m.get(c) ?? 0) + 1);
      }
  return Array.from({ length: counts.length }, (_, i) => {
    const merges = new Map<string, string>();
    const m = counts[i];
    if (!m || m.size <= max) return merges;
    const ranked = [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([c]) => c);
    const keep = ranked.slice(0, max);
    for (const c of ranked.slice(max)) merges.set(c, keep.reduce((best, k) => (distance(c, k) < distance(c, best) ? k : best), keep[0]!));
    return merges;
  });
}

/** A picture with each zone's merges applied (zoneMerges). */
export function recolorBands(p: Pixels, feetY: number, merges: readonly Map<string, string>[], rows = 16): Pixels {
  if (!merges.some((m) => m.size)) return p;
  const out = copy(p);
  let changed = false;
  for (let y = 0; y < p.h; y++) {
    const m = merges[bandOf(y, feetY, rows)];
    if (!m?.size) continue;
    for (let x = 0; x < p.w; x++) {
      const c = colorAt(p, x, y);
      const to = c && m.get(c);
      if (!to) continue;
      put(out, (y * p.w + x) * 4, to);
      changed = true;
    }
  }
  return changed ? out : p;
}

/** Where a picture goes in a new canvas size: as centred as before, and as far from the bottom row (the feet move with it). */
export function resizeOffset(w: number, h: number, nw: number, nh: number): { dx: number; dy: number } {
  return { dx: (nw - w) >> 1, dy: nh - h };
}

/** The picture in a canvas of another size, moved by (dx, dy) (what falls outside is cut). */
export function resizeCanvas(p: Pixels, nw: number, nh: number, dx: number, dy: number): Pixels {
  return stamp(blank(nw, nh), p, dx, dy);
}

/**
 * A pasted picture made to fit the frame: shrunk (nearest pixel, never
 * enlarged) to fit inside it, half see-through pixels made clear or solid,
 * and every color snapped to the board's by `snap`.
 */
export function fitPicture(src: { w: number; h: number; data: ArrayLike<number> }, maxW: number, maxH: number, snap: (hex: string) => string): Pixels {
  const scale = Math.min(1, maxW / src.w, maxH / src.h);
  const w = Math.max(1, Math.round(src.w * scale));
  const h = Math.max(1, Math.round(src.h * scale));
  const out = blank(w, h);
  const snapped = new Map<number, string>();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.w - 1, Math.floor((x + 0.5) / scale));
      const sy = Math.min(src.h - 1, Math.floor((y + 0.5) / scale));
      const i = (sy * src.w + sx) * 4;
      if ((src.data[i + 3] ?? 0) < 128) continue;
      const key = (src.data[i]! << 16) | (src.data[i + 1]! << 8) | src.data[i + 2]!;
      let c = snapped.get(key);
      if (!c) snapped.set(key, (c = snap(`#${key.toString(16).padStart(6, "0")}`).toLowerCase()));
      put(out, (y * w + x) * 4, c);
    }
  return out;
}

/**
 * A picture drawn `k` times bigger brought down to its size: each pixel is
 * solid when at least half of its k × k block is, and takes the block's most
 * common board color (snapped first), so a smoothed edge adds no in-between
 * colors to the zones.
 */
export function downsampleMode(src: { w: number; h: number; data: ArrayLike<number> }, k: number, snap: (hex: string) => string): Pixels {
  const w = Math.max(1, Math.floor(src.w / k));
  const h = Math.max(1, Math.floor(src.h / k));
  const out = blank(w, h);
  const snapped = new Map<number, string>();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const votes = new Map<string, number>();
      let solid = 0;
      for (let dy = 0; dy < k; dy++)
        for (let dx = 0; dx < k; dx++) {
          const i = ((y * k + dy) * src.w + x * k + dx) * 4;
          if ((src.data[i + 3] ?? 0) < 128) continue;
          solid++;
          const key = (src.data[i]! << 16) | (src.data[i + 1]! << 8) | src.data[i + 2]!;
          let c = snapped.get(key);
          if (!c) snapped.set(key, (c = snap(`#${key.toString(16).padStart(6, "0")}`).toLowerCase()));
          votes.set(c, (votes.get(c) ?? 0) + 1);
        }
      if (solid * 2 < k * k) continue;
      const best = [...votes.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
      put(out, (y * w + x) * 4, best[0]);
    }
  return out;
}
