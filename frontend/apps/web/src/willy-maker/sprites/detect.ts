// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Frame detection on a dropped sprite sheet, pure TypeScript (no DOM):
//  - the background is keyed by a flood fill from the sheet's border, the
//    rule of scripts/destroy-atlas.mjs (framePixels): only background that
//    touches the border goes, so a black shirt inside an outline stays;
//  - magenta #FF00FF (the art spec's background) is keyed everywhere;
//  - figures are the connected shapes left, with lines and label text
//    dropped, or the cells of a fixed grid;
//  - the pivot goes on the feet: the middle of the lowest opaque rows.

export interface Rgba {
  w: number;
  h: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface KeyOptions {
  /** How far (per channel, 0-255) a pixel may be from the background color and still be background. */
  tolerance: number;
}

export interface KeyResult {
  /** 1 = the figure's pixel, 0 = background, one per sheet pixel. */
  mask: Uint8Array;
  /** The background color found on the border, or null when the border is already transparent. */
  background: [number, number, number] | null;
  /** Whether magenta was keyed everywhere. */
  magenta: boolean;
}

const MAGENTA = [255, 0, 255] as const;

const near = (d: Rgba["data"], o: number, c: readonly number[], tol: number) =>
  Math.abs(d[o]! - c[0]!) <= tol && Math.abs(d[o + 1]! - c[1]!) <= tol && Math.abs(d[o + 2]! - c[2]!) <= tol;

/** The most common opaque color on the border (quantized to 8 levels per channel), or null. */
export function borderColor(img: Rgba): [number, number, number] | null {
  const { w, h, data } = img;
  const counts = new Map<number, { n: number; sum: [number, number, number] }>();
  let transparent = 0;
  let total = 0;
  const visit = (x: number, y: number) => {
    const o = (y * w + x) * 4;
    total++;
    if (data[o + 3]! < 128) {
      transparent++;
      return;
    }
    const key = ((data[o]! >> 3) << 10) | ((data[o + 1]! >> 3) << 5) | (data[o + 2]! >> 3);
    const e = counts.get(key) ?? { n: 0, sum: [0, 0, 0] };
    e.n++;
    e.sum[0] += data[o]!;
    e.sum[1] += data[o + 1]!;
    e.sum[2] += data[o + 2]!;
    counts.set(key, e);
  };
  for (let x = 0; x < w; x++) {
    visit(x, 0);
    if (h > 1) visit(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    visit(0, y);
    if (w > 1) visit(w - 1, y);
  }
  if (transparent * 2 >= total) return null;
  let best: { n: number; sum: [number, number, number] } | null = null;
  for (const e of counts.values()) if (!best || e.n > best.n) best = e;
  if (!best) return null;
  return [Math.round(best.sum[0] / best.n), Math.round(best.sum[1] / best.n), Math.round(best.sum[2] / best.n)];
}

/** Keys the background: flood fill from the border, plus transparent pixels and magenta. */
export function keyBackground(img: Rgba, { tolerance }: KeyOptions): KeyResult {
  const { w, h, data } = img;
  const n = w * h;
  const bg = borderColor(img);
  const magenta = !!bg && near(new Uint8Array([bg[0], bg[1], bg[2]]), 0, MAGENTA, Math.max(tolerance, 24));
  const isBg = new Uint8Array(n);
  const transparentOrMagenta = (k: number) => {
    const o = k * 4;
    return data[o + 3]! < 128 || (magenta && near(data, o, MAGENTA, Math.max(tolerance, 24)));
  };
  // transparent and magenta pixels are background wherever they are
  for (let k = 0; k < n; k++) if (transparentOrMagenta(k)) isBg[k] = 1;
  if (bg && !magenta) {
    const seen = new Uint8Array(n);
    const stack: number[] = [];
    const push = (k: number) => {
      if (!seen[k]) {
        seen[k] = 1;
        stack.push(k);
      }
    };
    for (let x = 0; x < w; x++) {
      push(x);
      push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      push(y * w);
      push(y * w + w - 1);
    }
    while (stack.length) {
      const k = stack.pop()!;
      if (!isBg[k] && !near(data, k * 4, bg, tolerance)) continue;
      isBg[k] = 1;
      const kx = k % w;
      if (kx > 0) push(k - 1);
      if (kx < w - 1) push(k + 1);
      if (k >= w) push(k - w);
      if (k < n - w) push(k + w);
    }
    // Background-colored pixels next to keyed ones (anti-aliased gaps between
    // an arm and the body) go too, twice, like destroy-atlas.mjs.
    for (let pass = 0; pass < 2; pass++)
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          const k = y * w + x;
          if (isBg[k] || !near(data, k * 4, bg, tolerance)) continue;
          if (isBg[k - 1] || isBg[k + 1] || isBg[k - w] || isBg[k + w]) isBg[k] = 1;
        }
  }
  if (magenta) cleanImageAiMagenta(data, isBg, w, h);
  const mask = new Uint8Array(n);
  for (let k = 0; k < n; k++) mask[k] = isBg[k] ? 0 : 1;
  removeStrokes(mask, w, h);
  return { mask, background: bg, magenta };
}

/** A pixel with a magenta cast: red and blue well over green. */
function magentaCast(data: Uint8ClampedArray | Uint8Array, o: number): boolean {
  return data[o]! - data[o + 1]! > 40 && data[o + 2]! - data[o + 1]! > 40;
}

/** A darker or lighter magenta with no other color mixed in (red and blue alike, little green). */
function plainMagenta(data: Uint8ClampedArray | Uint8Array, o: number): boolean {
  return data[o]! > 140 && data[o + 2]! > 140 && data[o + 1]! < 70 && Math.abs(data[o]! - data[o + 2]!) < 50;
}

/** Nearly the background itself (a lighter or darker magenta): no figure is drawn in it. */
function nearMagenta(data: Uint8ClampedArray | Uint8Array, o: number): boolean {
  return data[o]! > 140 && data[o + 2]! > 140 && data[o + 1]! < 100;
}

/**
 * How much of the background a pixel holds, as a mix of a clean color and the
 * background (0 none, 1 all), or -1 when it is not such a mix.
 */
function mixOf(data: Uint8ClampedArray | Uint8Array, o: number, clean: number, bg: readonly number[]): number {
  let num = 0;
  let den = 0;
  for (let c = 0; c < 3; c++) {
    const d = bg[c]! - data[clean + c]!;
    num += (data[o + c]! - data[clean + c]!) * d;
    den += d * d;
  }
  if (den < 900) return -1;
  const t = num / den;
  let err = 0;
  for (let c = 0; c < 3; c++) {
    const e = data[o + c]! - (data[clean + c]! + t * (bg[c]! - data[clean + c]!));
    err += e * e;
  }
  return err < 40 * 40 ? t : -1;
}

/**
 * Image AIs draw on magenta with soft edges: the pixels next to the
 * background are mixed with it (pink over skin, purple over a dark outline),
 * which the board would keep as colors of their own. A fringe pixel that is
 * a mix of a clean neighbor and the background takes that neighbor's color;
 * a nearly magenta one with no clean neighbor becomes background (a purple
 * of the figure's own is neither, and stays). Twice,
 * so a two-pixel soft edge goes too. The picture's pixels change in place.
 */
export function cleanMagentaFringe(data: Uint8ClampedArray | Uint8Array, isBg: Uint8Array, w: number, h: number): void {
  const bg = [255, 0, 255];
  for (let pass = 0; pass < 2; pass++) {
    const out: [number, number][] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (isBg[k]) continue;
        const edge = (x > 0 && isBg[k - 1]) || (x < w - 1 && isBg[k + 1]) || (y > 0 && isBg[k - w]) || (y < h - 1 && isBg[k + w]);
        if (!edge) continue;
        // the clean neighbor this pixel is the likeliest mix of
        let best = -1;
        let bestT = 0.15;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (isBg[j] || magentaCast(data, j * 4)) continue;
            const t = mixOf(data, k * 4, j * 4, bg);
            if (t > bestT && t < 1) {
              bestT = t;
              best = j;
            }
          }
        if (best >= 0) out.push([k, best]);
        else if (nearMagenta(data, k * 4)) out.push([k, -1]);
      }
    if (!out.length) break;
    for (const [k, from] of out) {
      if (from < 0) isBg[k] = 1;
      else for (let c = 0; c < 3; c++) data[k * 4 + c] = data[from * 4 + c]!;
    }
  }
}

/**
 * What an image AI leaves on a magenta background, cleaned in place: its
 * darker or lighter parts touching the background become background (a pink
 * inside the figure is not reached and stays), then the soft edges lose
 * their pink fringe. `isBg` starts with the keyed background and grows.
 */
export function cleanImageAiMagenta(data: Uint8ClampedArray | Uint8Array, isBg: Uint8Array, w: number, h: number): void {
  const n = w * h;
  const stack: number[] = [];
  for (let k = 0; k < n; k++) if (isBg[k]) stack.push(k);
  while (stack.length) {
    const k = stack.pop()!;
    const kx = k % w;
    const next = [kx > 0 ? k - 1 : -1, kx < w - 1 ? k + 1 : -1, k >= w ? k - w : -1, k < n - w ? k + w : -1];
    for (const j of next)
      if (j >= 0 && !isBg[j] && plainMagenta(data, j * 4)) {
        isBg[j] = 1;
        stack.push(j);
      }
  }
  cleanMagentaFringe(data, isBg, w, h);
}

/**
 * Removes separator and underline strokes from the mask: long runs of ink
 * at most 7 px thick (scripts/destroy-atlas.mjs does the same), so a
 * figure standing on a line is not glued to every figure on that line.
 * Where a figure touches the line, its own pixels stay (they are thick).
 */
export function removeStrokes(mask: Uint8Array, w: number, h: number, minLength = Math.max(64, Math.round(Math.min(w, h) * 0.2))): number {
  const THIN = 7;
  let removed = 0;
  const inkAt = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  /** The ink run through (x, y) along one axis, as [start, end) or null when thicker than THIN. */
  const thin = (x: number, y: number, dx: number, dy: number): [number, number] | null => {
    let a = 0;
    while (a < THIN && inkAt(x - dx * (a + 1), y - dy * (a + 1))) a++;
    let b = 0;
    while (a + b < THIN && inkAt(x + dx * (b + 1), y + dy * (b + 1))) b++;
    if (a + b + 1 > THIN) return null;
    return [-a, b + 1];
  };
  const pass = (horizontal: boolean) => {
    const outer = horizontal ? h : w;
    const inner = horizontal ? w : h;
    const at = (i: number, o: number) => (horizontal ? [i, o] : [o, i]) as [number, number];
    for (let o = 0; o < outer; o++) {
      let i = 0;
      while (i < inner) {
        if (!inkAt(...at(i, o))) {
          i++;
          continue;
        }
        let e = i;
        while (e < inner && inkAt(...at(e, o))) e++;
        if (e - i >= minLength) {
          // thin across most of its length: a stroke
          const cuts: [number, [number, number]][] = [];
          for (let k = i; k < e; k++) {
            const [x, y] = at(k, o);
            const r = horizontal ? thin(x, y, 0, 1) : thin(x, y, 1, 0);
            if (r) cuts.push([k, r]);
          }
          if (cuts.length >= (e - i) * 0.7)
            for (const [k, [a, b]] of cuts)
              for (let t = a; t < b; t++) {
                const [x, y] = horizontal ? [k, o + t] : [o + t, k];
                if (inkAt(x, y)) {
                  mask[y * w + x] = 0;
                  removed++;
                }
              }
        }
        i = e;
      }
    }
  };
  pass(true);
  pass(false);
  return removed;
}

interface Component extends Box {
  area: number;
}

/** 8-connected shapes of the mask, with their boxes and pixel counts. */
export function components(mask: Uint8Array, w: number, h: number): Component[] {
  const label = new Int32Array(w * h).fill(-1);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s]! >= 0) continue;
    const id = out.length;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    let area = 0;
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const k = stack.pop()!;
      const kx = k % w;
      const ky = (k / w) | 0;
      area++;
      if (kx < x0) x0 = kx;
      if (kx > x1) x1 = kx;
      if (ky < y0) y0 = ky;
      if (ky > y1) y1 = ky;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = ky + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = kx + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (mask[q] && label[q]! < 0) {
            label[q] = id;
            stack.push(q);
          }
        }
      }
    }
    out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
  }
  return out;
}

const overlaps = (a: Box, b: Box, gap: number) => a.x - gap < b.x + b.w && b.x - gap < a.x + a.w && a.y - gap < b.y + b.h && b.y - gap < a.y + a.h;

const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** Joins boxes that touch or nearly touch (within `gap` pixels), until none do. */
export function mergeBoxes<T extends Box>(boxes: readonly T[], gap: number): Box[] {
  let list: Box[] = boxes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  let changed = true;
  while (changed) {
    changed = false;
    const next: Box[] = [];
    for (const b of list) {
      const hit = next.findIndex((o) => overlaps(o, b, gap));
      if (hit >= 0) {
        next[hit] = union(next[hit]!, b);
        changed = true;
      } else next.push(b);
    }
    list = next;
  }
  return list;
}

/** Splits a box at columns with no figure pixel (merged poses side by side). */
export function splitAtEmptyColumns(mask: Uint8Array, w: number, b: Box, minWidth: number, minGap = 2): Box[] {
  const ink = (x: number) => {
    for (let y = b.y; y < b.y + b.h; y++) if (mask[y * w + x]) return true;
    return false;
  };
  // runs of ink columns separated by at least minGap empty columns
  const runs: [number, number][] = [];
  let start = -1;
  let empty = 0;
  for (let x = b.x; x < b.x + b.w; x++) {
    if (ink(x)) {
      if (start < 0) start = x;
      else if (empty >= minGap) {
        runs.push([start, x - empty]);
        start = x;
      }
      empty = 0;
    } else empty++;
  }
  if (start >= 0) runs.push([start, b.x + b.w - empty]);
  const out = runs.map(([x0, x1]) => trim(mask, w, { x: x0, y: b.y, w: x1 - x0, h: b.h }));
  // tiny slivers stay with their neighbor: only split into real poses
  if (out.length < 2 || out.some((o) => o.w < minWidth)) return [b];
  return out;
}

/** The box shrunk to its figure pixels (unchanged when it has none). */
export function trim(mask: Uint8Array, w: number, b: Box): Box {
  let x0 = b.x + b.w;
  let y0 = b.y + b.h;
  let x1 = b.x - 1;
  let y1 = b.y - 1;
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++)
      if (mask[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < x0) return b;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Boxes in reading order: rows top to bottom (by overlap), left to right in a row. */
export function readingOrder<T extends Box>(boxes: readonly T[]): T[] {
  const sorted = [...boxes].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows: { top: number; bottom: number; items: T[] }[] = [];
  for (const b of sorted) {
    const cy = b.y + b.h / 2;
    const row = rows.find((r) => cy >= r.top && cy <= r.bottom);
    if (row) {
      row.items.push(b);
      row.top = Math.min(row.top, b.y);
      row.bottom = Math.max(row.bottom, b.y + b.h);
    } else rows.push({ top: b.y, bottom: b.y + b.h, items: [b] });
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.x - b.x));
}

const median = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1]!;
};

export interface DetectOptions {
  /** Pixels between two shapes that still makes them one figure. */
  gap?: number;
}

/**
 * Finds every figure: connected shapes, with thin lines and small label
 * text left out, near shapes joined (a sword slash, a muzzle flash), and
 * poses sharing a box split where empty columns part them.
 */
export function detectFigures(mask: Uint8Array, w: number, h: number, { gap = 2 }: DetectOptions = {}): Box[] {
  // separator lines and underlines (long, at most 3 px thick) and lone specks go first
  const comps = components(mask, w, h).filter((c) => !(Math.min(c.w, c.h) <= 3 && Math.max(c.w, c.h) >= 12) && c.area >= 4);
  if (!comps.length) return [];
  // near shapes become one figure (a muzzle flash, a slash, a loose foot)
  const merged = mergeBoxes(comps, gap);
  // the figures' height: the typical one among the tall boxes
  const maxH = Math.max(...merged.map((b) => b.h));
  const figH = median(merged.filter((b) => b.h >= maxH * 0.35).map((b) => b.h));
  // label text and small effects are much shorter than the figures
  const kept = merged.filter((b) => b.h >= figH * 0.3);
  const minWidth = Math.max(4, Math.round(figH * 0.2));
  const parts = kept.flatMap((b) => splitAtEmptyColumns(mask, w, b, minWidth));
  const figW = median(parts.filter((b) => b.h >= figH * 0.6).map((b) => b.w));
  return readingOrder(parts.flatMap((b) => splitWide(mask, w, b, figW)));
}

/**
 * Splits a box several figures wide where poses touch: at the column with
 * the least ink near each expected border, when that column is nearly
 * empty (at most a tenth of the height: a foot or a hand crossing over).
 */
export function splitWide(mask: Uint8Array, w: number, b: Box, figW: number): Box[] {
  if (figW < 4) return [b];
  const n = Math.round(b.w / (figW * 1.15));
  if (n < 2) return [b];
  const inkIn = (x: number) => {
    let c = 0;
    for (let y = b.y; y < b.y + b.h; y++) if (mask[y * w + x]) c++;
    return c;
  };
  const cuts: number[] = [];
  for (let i = 1; i < n; i++) {
    const mid = Math.round(b.x + (i * b.w) / n);
    const span = Math.round(figW * 0.35);
    let best = -1;
    let bc = Infinity;
    for (let x = Math.max(b.x + 1, mid - span); x <= Math.min(b.x + b.w - 2, mid + span); x++) {
      const c = inkIn(x);
      if (c < bc) {
        bc = c;
        best = x;
      }
    }
    if (best >= 0 && bc <= b.h * 0.1) cuts.push(best);
  }
  if (!cuts.length) return [b];
  const edges = [b.x, ...cuts, b.x + b.w];
  const out: Box[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const part = { x: edges[i]!, y: b.y, w: edges[i + 1]! - edges[i]!, h: b.h };
    if (part.w > 0) out.push(trim(mask, w, part));
  }
  return out;
}

/** The cells of a fixed grid that hold any figure pixel, each trimmed to its figure. */
export function gridBoxes(mask: Uint8Array, w: number, h: number, cellW: number, cellH: number, { trimCells = false } = {}): Box[] {
  const out: Box[] = [];
  if (cellW < 1 || cellH < 1) return out;
  for (let y = 0; y + 1 <= h; y += cellH)
    for (let x = 0; x + 1 <= w; x += cellW) {
      const cell = { x, y, w: Math.min(cellW, w - x), h: Math.min(cellH, h - y) };
      const t = trim(mask, w, cell);
      if (t === cell) continue; // empty
      out.push(trimCells ? t : cell);
    }
  return out;
}

/** The pivot of a box: the middle of the lowest figure rows, on its last row (file-format.md). */
export function feetPivot(mask: Uint8Array, w: number, b: Box): { px: number; py: number } {
  for (let y = b.y + b.h - 1; y >= b.y; y--) {
    let x0 = -1;
    let x1 = -1;
    // the lowest row with pixels, plus two above it (single pixels lie)
    for (let yy = y; yy >= Math.max(b.y, y - 2); yy--)
      for (let x = b.x; x < b.x + b.w; x++)
        if (mask[yy * w + x]) {
          if (x0 < 0 || x < x0) x0 = x;
          if (x > x1) x1 = x;
        }
    if (x0 >= 0) return { px: Math.round((x0 + x1 + 1) / 2) - b.x, py: b.h - 1 };
  }
  return { px: Math.round(b.w / 2), py: b.h - 1 };
}
