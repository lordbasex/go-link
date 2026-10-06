// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The pixel editor's vector layers (ui/PixelEditor.tsx), like Scratch's
// vector costumes: shapes that stay shapes (move them, scale them, change
// their colors) and are turned into the board's pixels to show and to play
// (rasterize). "Convert to bitmap" keeps the pixels and drops the shapes.
// Coordinates are the frame's pixels; a pixel is inside a shape when its
// centre is.

import { blank, linePoints, type Color, type Pixels } from "./pixels";

export type ShapeKind = "rect" | "ellipse" | "line" | "polygon";

export interface Shape {
  kind: ShapeKind;
  /** rect, ellipse and line: two corners (or ends); polygon: every corner in order. */
  points: [number, number][];
  /** The inside's color, or null for none (a line has none). */
  fill: Color;
  /** The outline's color and width in pixels (0: no outline). */
  stroke: Color;
  width: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function put(p: Pixels, x: number, y: number, c: Color): void {
  if (c === null || x < 0 || y < 0 || x >= p.w || y >= p.h) return;
  const n = parseInt(c.slice(1), 16);
  const o = (y * p.w + x) * 4;
  p.rgba[o] = (n >> 16) & 255;
  p.rgba[o + 1] = (n >> 8) & 255;
  p.rgba[o + 2] = n & 255;
  p.rgba[o + 3] = 255;
}

/** The pixels a shape covers inside (its fill), as a mask of the frame's size. */
function insideMask(s: Shape, w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h);
  const a: [number, number] = s.points[0] ?? [0, 0];
  const b: [number, number] = s.points[1] ?? a;
  if (s.kind === "rect") {
    const [l, r] = [Math.round(Math.min(a[0], b[0])), Math.round(Math.max(a[0], b[0]))];
    const [t, bo] = [Math.round(Math.min(a[1], b[1])), Math.round(Math.max(a[1], b[1]))];
    for (let y = Math.max(0, t); y <= Math.min(h - 1, bo); y++) for (let x = Math.max(0, l); x <= Math.min(w - 1, r); x++) m[y * w + x] = 1;
  } else if (s.kind === "ellipse") {
    const [l, r] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    const [t, bo] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    const cx = (l + r) / 2;
    const cy = (t + bo) / 2;
    const rx = (r - l + 1) / 2;
    const ry = (bo - t + 1) / 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) m[y * w + x] = 1;
  } else if (s.kind === "polygon" && s.points.length >= 3) {
    // even-odd rule on each pixel's centre
    const pts = s.points;
    for (let y = 0; y < h; y++) {
      const py = y + 0.5;
      for (let x = 0; x < w; x++) {
        const px = x + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i]!.map((v) => v + 0.5) as [number, number];
          const [xj, yj] = pts[j]!.map((v) => v + 0.5) as [number, number];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) m[y * w + x] = 1;
      }
    }
  }
  return m;
}

/** The pixels of a shape's outline (or a line's body), `width` pixels wide. */
function outlinePixels(s: Shape, w: number, h: number): [number, number][] {
  if (s.width <= 0 && s.kind !== "line") return [];
  const width = Math.max(1, s.width);
  const out: [number, number][] = [];
  const thick = (x: number, y: number) => {
    const r0 = -Math.floor((width - 1) / 2);
    for (let dy = 0; dy < width; dy++) for (let dx = 0; dx < width; dx++) out.push([x + r0 + dx, y + r0 + dy]);
  };
  const round = (p: [number, number]) => [Math.round(p[0]), Math.round(p[1])] as [number, number];
  if (s.kind === "line") {
    const a = round(s.points[0] ?? [0, 0]);
    const b = round(s.points[1] ?? s.points[0] ?? [0, 0]);
    for (const [x, y] of linePoints(a[0], a[1], b[0], b[1])) thick(x, y);
    return out;
  }
  if (s.kind === "polygon") {
    const pts = s.points.map(round);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      if (pts.length < 3 && i === pts.length - 1) break;
      for (const [x, y] of linePoints(a[0], a[1], b[0], b[1])) thick(x, y);
    }
    return out;
  }
  // rect and ellipse: the inside pixels with a neighbour outside, thickened inwards by their width
  const m = insideMask(s, w, h);
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      let edge = false;
      for (let d = 1; d <= width && !edge; d++) edge = !at(x - d, y) || !at(x + d, y) || !at(x, y - d) || !at(x, y + d);
      if (edge) out.push([x, y]);
    }
  return out;
}

/** The shapes as the board's pixels, the first at the bottom. */
export function rasterize(shapes: readonly Shape[], w: number, h: number): Pixels {
  const p = blank(w, h);
  for (const s of shapes) {
    if (s.kind !== "line" && s.fill !== null) {
      const m = insideMask(s, w, h);
      for (let i = 0; i < m.length; i++) if (m[i]) put(p, i % w, Math.floor(i / w), s.fill);
    }
    const ink = s.kind === "line" ? (s.stroke ?? s.fill) : s.stroke;
    if (ink !== null) for (const [x, y] of outlinePixels(s, w, h)) put(p, x, y, ink);
  }
  return p;
}

/** The topmost shape that covers a pixel (or whose outline does), or -1. */
export function shapeAt(shapes: readonly Shape[], w: number, h: number, x: number, y: number): number {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const one = rasterize([{ ...shapes[i]!, fill: shapes[i]!.fill ?? "#000000", stroke: shapes[i]!.stroke ?? "#000000", width: Math.max(1, shapes[i]!.width) }], w, h);
    if (x >= 0 && y >= 0 && x < w && y < h && one.rgba[(y * w + x) * 4 + 3]! > 0) return i;
  }
  return -1;
}

/** The box around a shape's points. */
export function boxOf(s: Shape): Box {
  const xs = s.points.map((p) => p[0]);
  const ys = s.points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function moveShape(s: Shape, dx: number, dy: number): Shape {
  return { ...s, points: s.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
}

/** The shape stretched so its box goes from its top left corner to (x, y). */
export function resizeShape(s: Shape, x: number, y: number): Shape {
  const b = boxOf(s);
  const sx = b.w ? Math.max(1, x - b.x) / b.w : 1;
  const sy = b.h ? Math.max(1, y - b.y) / b.h : 1;
  return { ...s, points: s.points.map(([px, py]) => [Math.round(b.x + (px - b.x) * sx), Math.round(b.y + (py - b.y) * sy)] as [number, number]) };
}

/** Shapes read back from a file (bad ones are left out). */
export function cleanShapes(v: unknown): Shape[] {
  if (!Array.isArray(v)) return [];
  const color = (c: unknown): Color => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);
  return v.flatMap((s): Shape[] => {
    if (!s || typeof s !== "object") return [];
    const o = s as Record<string, unknown>;
    const kind = o.kind;
    if (kind !== "rect" && kind !== "ellipse" && kind !== "line" && kind !== "polygon") return [];
    const points = (Array.isArray(o.points) ? o.points : []).filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n))).slice(0, 64);
    if (points.length < (kind === "polygon" ? 3 : 2)) return [];
    return [{ kind, points: points.map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number]), fill: color(o.fill), stroke: color(o.stroke), width: Math.max(0, Math.min(8, Math.round(Number(o.width) || 0))) }];
  });
}
