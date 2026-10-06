// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The pixel editor's drawing (ui/PixelEditor.tsx): a frame as RGBA at its
// size on the board, and the tools that change it, each a pure function
// that returns a new picture (the editor keeps the old ones for undo).
// Colors are "#rrggbb" or null for a transparent pixel.

export interface Pixels {
  w: number;
  h: number;
  rgba: Uint8Array;
}

export type Color = string | null;

export function blank(w: number, h: number): Pixels {
  return { w, h, rgba: new Uint8Array(w * h * 4) };
}

export function copy(p: Pixels): Pixels {
  return { w: p.w, h: p.h, rgba: new Uint8Array(p.rgba) };
}

const hex2 = (n: number) => n.toString(16).padStart(2, "0");

/** The color of a pixel, or null when it is transparent (or outside). */
export function colorAt(p: Pixels, x: number, y: number): Color {
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return null;
  const o = (y * p.w + x) * 4;
  if (p.rgba[o + 3]! < 128) return null;
  return `#${hex2(p.rgba[o]!)}${hex2(p.rgba[o + 1]!)}${hex2(p.rgba[o + 2]!)}`;
}

function put(p: Pixels, x: number, y: number, c: Color): void {
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return;
  const o = (y * p.w + x) * 4;
  if (c === null) {
    p.rgba.fill(0, o, o + 4);
    return;
  }
  const n = parseInt(c.slice(1), 16);
  p.rgba[o] = (n >> 16) & 255;
  p.rgba[o + 1] = (n >> 8) & 255;
  p.rgba[o + 2] = n & 255;
  p.rgba[o + 3] = 255;
}

/** A square brush of `size` pixels centred on each point. */
function dab(p: Pixels, x: number, y: number, c: Color, size: number): void {
  const r0 = -Math.floor((size - 1) / 2);
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) put(p, x + r0 + dx, y + r0 + dy, c);
}

/** The points of a straight line, both ends included (Bresenham). */
export function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/** A stroke of the pencil (a color) or the eraser (null) from one point to the next. */
export function stroke(p: Pixels, x0: number, y0: number, x1: number, y1: number, c: Color, size = 1): Pixels {
  const out = copy(p);
  for (const [x, y] of linePoints(x0, y0, x1, y1)) dab(out, x, y, c, size);
  return out;
}

/** A rectangle between two corners, its outline or filled. */
export function rect(p: Pixels, x0: number, y0: number, x1: number, y1: number, c: Color, filled: boolean): Pixels {
  const out = copy(p);
  const [l, r] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [t, b] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) if (filled || x === l || x === r || y === t || y === b) put(out, x, y, c);
  return out;
}

/** An ellipse inside the box of two corners, its outline or filled (the pixels whose centres fall inside). */
export function ellipse(p: Pixels, x0: number, y0: number, x1: number, y1: number, c: Color, filled: boolean): Pixels {
  const out = copy(p);
  const [l, r] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [t, b] = [Math.min(y0, y1), Math.max(y0, y1)];
  const cx = (l + r) / 2;
  const cy = (t + b) / 2;
  const rx = (r - l + 1) / 2;
  const ry = (b - t + 1) / 2;
  const inside = (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  for (let y = t; y <= b; y++)
    for (let x = l; x <= r; x++) {
      if (!inside(x, y)) continue;
      // the outline: an inside pixel with a neighbour outside
      if (filled || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) put(out, x, y, c);
    }
  return out;
}

/** The bucket: the area of one color around a pixel (side by side, not corner to corner) takes another. */
export function fill(p: Pixels, x: number, y: number, c: Color): Pixels {
  const target = colorAt(p, x, y);
  if (x < 0 || y < 0 || x >= p.w || y >= p.h || target === c) return p;
  const out = copy(p);
  const seen = new Uint8Array(p.w * p.h);
  const stack: number[] = [y * p.w + x];
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    const px = i % p.w;
    const py = (i - px) / p.w;
    if (colorAt(p, px, py) !== target) continue;
    put(out, px, py, c);
    if (px > 0) stack.push(i - 1);
    if (px < p.w - 1) stack.push(i + 1);
    if (py > 0) stack.push(i - p.w);
    if (py < p.h - 1) stack.push(i + p.w);
  }
  return out;
}

/** The picture mirrored left to right, or top to bottom. */
export function flip(p: Pixels, vertical = false): Pixels {
  const out = blank(p.w, p.h);
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const sx = vertical ? x : p.w - 1 - x;
      const sy = vertical ? p.h - 1 - y : y;
      out.rgba.set(p.rgba.subarray((sy * p.w + sx) * 4, (sy * p.w + sx) * 4 + 4), (y * p.w + x) * 4);
    }
  return out;
}

/** The distinct colors of a picture, most used first. */
export function colorsOf(p: Pixels): string[] {
  const counts = new Map<string, number>();
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const c = colorAt(p, x, y);
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

/**
 * The colors of each band of `rows` rows (the board's sprite tile: 16 on the
 * CPS-1) counted from the feet up, the zones the board gives a palette each,
 * bottom band first.
 */
export function bandColors(p: Pixels, feetY: number, rows = 16): string[][] {
  const bands: Set<string>[] = [];
  for (let y = 0; y < p.h; y++) {
    const band = Math.max(0, Math.floor((feetY - y) / rows));
    const set = (bands[band] ??= new Set());
    for (let x = 0; x < p.w; x++) {
      const c = colorAt(p, x, y);
      if (c) set.add(c);
    }
  }
  return Array.from({ length: bands.length }, (_, i) => [...(bands[i] ?? [])]);
}

/** One layer of a frame: its pixels and whether it shows. */
export interface LayerPixels {
  pic: Pixels;
  visible: boolean;
}

/** The layers that show, bottom first, one over the other: what the frame looks like (and what the game gets). */
export function composite(layers: readonly LayerPixels[], w: number, h: number): Pixels {
  const out = blank(w, h);
  for (const l of layers) {
    if (!l.visible) continue;
    const src = l.pic.rgba;
    for (let i = 0; i < w * h * 4; i += 4) if (src[i + 3]! >= 128) out.rgba.set(src.subarray(i, i + 4), i);
  }
  return out;
}
