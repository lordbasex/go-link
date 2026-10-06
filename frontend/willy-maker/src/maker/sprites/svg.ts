// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// An SVG file as the pixel editor's vector shapes (sprites/vector.ts): its
// rectangles, circles, ellipses, lines, polylines, polygons and paths (curves
// and arcs cut into short straight pieces), with their transforms, fill and
// stroke (attributes, style="" and simple .class rules), fitted into the frame
// standing on its feet, every color made one of the board's by its profile's
// snap. Gradients take their first color; text, embedded pictures, <use>,
// filters and masks are left out and counted. Pure apart from DOMParser.

import type { Shape } from "./vector";

type M = [number, number, number, number, number, number];
type P = [number, number];
const ID: M = [1, 0, 0, 1, 0, 0];

const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const apply = (m: M, [x, y]: P): P => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const nums = (s: string) => (s.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) ?? []).map(Number);

/** An SVG transform list, left to right. */
export function parseTransform(v: string | null): M {
  let m = ID;
  if (!v) return m;
  for (const [, name, args] of v.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const a = nums(args!);
    let t: M = ID;
    if (name === "matrix" && a.length >= 6) t = a.slice(0, 6) as M;
    else if (name === "translate") t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (name === "scale") t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (name === "rotate") {
      const r = ((a[0] ?? 0) * Math.PI) / 180;
      const [c, s] = [Math.cos(r), Math.sin(r)];
      const [cx, cy] = [a[1] ?? 0, a[2] ?? 0];
      t = mul(mul([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (name === "skewX") t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (name === "skewY") t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, t);
  }
  return m;
}

const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", lime: "#00ff00", blue: "#0000ff", yellow: "#ffff00", cyan: "#00ffff", aqua: "#00ffff",
  magenta: "#ff00ff", fuchsia: "#ff00ff", gray: "#808080", grey: "#808080", silver: "#c0c0c0", maroon: "#800000", olive: "#808000", navy: "#000080", teal: "#008080",
  purple: "#800080", orange: "#ffa500", brown: "#a52a2a", pink: "#ffc0cb", gold: "#ffd700", beige: "#f5f5dc", tan: "#d2b48c", khaki: "#f0e68c", coral: "#ff7f50",
  salmon: "#fa8072", crimson: "#dc143c", indigo: "#4b0082", violet: "#ee82ee", skyblue: "#87ceeb", darkgreen: "#006400", darkred: "#8b0000", darkblue: "#00008b",
  darkgray: "#a9a9a9", darkgrey: "#a9a9a9", lightgray: "#d3d3d3", lightgrey: "#d3d3d3", chocolate: "#d2691e", sienna: "#a0522d", peru: "#cd853f", wheat: "#f5deb3",
};

/** A paint as "#rrggbb", null for none, or undefined when it cannot be read. */
function parseColor(v: string, current: string | null, gradients: Map<string, string>): string | null | undefined {
  const s = v.trim().toLowerCase();
  if (s === "none" || s === "transparent") return null;
  if (s === "currentcolor") return current ?? "#000000";
  const url = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/.exec(s);
  if (url) return gradients.get(url[1]!) ?? "#808080";
  const hex = /^#([0-9a-f]{3,8})$/.exec(s);
  if (hex) {
    const h = hex[1]!;
    if (h.length === 3 || h.length === 4) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    if (h.length === 6 || h.length === 8) return `#${h.slice(0, 6)}`;
    return undefined;
  }
  const rgb = /^rgba?\(([^)]*)\)/.exec(s);
  if (rgb) {
    const parts = rgb[1]!.split(/[\s,/]+/).filter(Boolean).slice(0, 3);
    const ch = parts.map((p) => Math.max(0, Math.min(255, Math.round(p.endsWith("%") ? (parseFloat(p) * 255) / 100 : parseFloat(p)))));
    if (ch.length === 3 && ch.every((n) => Number.isFinite(n))) return `#${ch.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    return undefined;
  }
  return NAMED[s];
}

interface Paint {
  fill: string | null;
  stroke: string | null;
  width: number;
  color: string | null;
  opacity: number;
  fillOpacity: number;
  strokeOpacity: number;
  hidden: boolean;
}

/** A shape before it is fitted: points in the SVG's own units. */
interface Raw {
  kind: Shape["kind"];
  points: P[];
  fill: string | null;
  stroke: string | null;
  width: number;
}

export interface SvgShapes {
  shapes: Shape[];
  /** Elements left out (text, pictures, <use>…). */
  skipped: number;
}

/** The SVG's size: its width and height, or its viewBox's. */
export function svgSize(root: Element): { w: number; h: number } {
  const vb = nums(root.getAttribute("viewBox") ?? "");
  const len = (v: string | null) => (v && !v.trim().endsWith("%") ? parseFloat(v) : NaN);
  const w = len(root.getAttribute("width"));
  const h = len(root.getAttribute("height"));
  return { w: w > 0 ? w : (vb[2] ?? 100), h: h > 0 ? h : (vb[3] ?? 100) };
}

/** Parses an SVG file's text (null when it is not an SVG). */
export function parseSvg(text: string): Element | null {
  try {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return null;
    return root;
  } catch {
    return null;
  }
}

/** A path's subpaths as points (curves and arcs flattened), each with whether it was closed. */
export function pathPoints(d: string): { points: P[]; closed: boolean }[] {
  const out: { points: P[]; closed: boolean }[] = [];
  const tokens = d.match(/[a-df-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0;
  let cmd = "";
  let cur: P = [0, 0];
  let start: P = [0, 0];
  let ctrl: P | null = null;
  let qctrl: P | null = null;
  let sub: P[] = [];
  const num = () => Number(tokens[i++]);
  const flush = (closed: boolean) => {
    if (sub.length > 1) out.push({ points: sub, closed });
    sub = [];
  };
  const isNum = () => i < tokens.length && !/^[a-z]$/i.test(tokens[i]!);
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i]!)) cmd = tokens[i++]!;
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const at = (x: number, y: number): P => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    if (C === "Z") {
      flush(true);
      cur = start;
      ctrl = qctrl = null;
      // a Z takes no numbers: anything after it needs its own command
      if (isNum()) cmd = "";
      continue;
    }
    if (!isNum()) break;
    if (C === "M") {
      flush(false);
      cur = at(num(), num());
      start = cur;
      sub = [cur];
      // more pairs after a moveto are lines
      cmd = rel ? "l" : "L";
      ctrl = qctrl = null;
    } else if (C === "L") {
      cur = at(num(), num());
      sub.push(cur);
      ctrl = qctrl = null;
    } else if (C === "H") {
      const x = num();
      cur = [rel ? cur[0] + x : x, cur[1]];
      sub.push(cur);
      ctrl = qctrl = null;
    } else if (C === "V") {
      const y = num();
      cur = [cur[0], rel ? cur[1] + y : y];
      sub.push(cur);
      ctrl = qctrl = null;
    } else if (C === "C" || C === "S") {
      const c1: P = C === "C" ? at(num(), num()) : ctrl ? [2 * cur[0] - ctrl[0], 2 * cur[1] - ctrl[1]] : cur;
      const c2 = at(num(), num());
      const end = at(num(), num());
      for (let k = 1; k <= 8; k++) {
        const t = k / 8;
        const u = 1 - t;
        sub.push([u * u * u * cur[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * end[0], u * u * u * cur[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * end[1]]);
      }
      ctrl = c2;
      qctrl = null;
      cur = end;
    } else if (C === "Q" || C === "T") {
      const c: P = C === "Q" ? at(num(), num()) : qctrl ? [2 * cur[0] - qctrl[0], 2 * cur[1] - qctrl[1]] : cur;
      const end = at(num(), num());
      for (let k = 1; k <= 6; k++) {
        const t = k / 6;
        const u = 1 - t;
        sub.push([u * u * cur[0] + 2 * u * t * c[0] + t * t * end[0], u * u * cur[1] + 2 * u * t * c[1] + t * t * end[1]]);
      }
      qctrl = c;
      ctrl = null;
      cur = end;
    } else if (C === "A") {
      const rx = Math.abs(num());
      const ry = Math.abs(num());
      const phi = (num() * Math.PI) / 180;
      const large = num() !== 0;
      const sweep = num() !== 0;
      const end = at(num(), num());
      sub.push(...arcPoints(cur, end, rx, ry, phi, large, sweep));
      cur = end;
      ctrl = qctrl = null;
    } else break;
  }
  flush(false);
  return out;
}

/** An elliptical arc (SVG's endpoint form) as points, the end included. */
function arcPoints(p0: P, p1: P, rx: number, ry: number, phi: number, large: boolean, sweep: boolean): P[] {
  if (!rx || !ry || (p0[0] === p1[0] && p0[1] === p1[1])) return [p1];
  const [c, s] = [Math.cos(phi), Math.sin(phi)];
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = c * dx + s * dy;
  const y1 = -s * dx + c * dy;
  const grow = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (grow > 1) {
    rx *= Math.sqrt(grow);
    ry *= Math.sqrt(grow);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const cx = c * cx1 - s * cy1 + (p0[0] + p1[0]) / 2;
  const cy = s * cx1 + c * cy1 + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(2, Math.ceil(Math.abs(dt) / (Math.PI / 8)));
  const out: P[] = [];
  for (let k2 = 1; k2 < n; k2++) {
    const t = t1 + (dt * k2) / n;
    out.push([cx + c * rx * Math.cos(t) - s * ry * Math.sin(t), cy + s * rx * Math.cos(t) + c * ry * Math.sin(t)]);
  }
  // the end exactly where the path says
  out.push(p1);
  return out;
}

const ellipsePoints = (cx: number, cy: number, rx: number, ry: number): P[] => Array.from({ length: 24 }, (_, k) => [cx + rx * Math.cos((k / 24) * 2 * Math.PI), cy + ry * Math.sin((k / 24) * 2 * Math.PI)] as P);
/** No turn or skew: rectangles and ellipses stay what they are. */
const straight = (m: M) => Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9;

/** The SVG's shapes in its own units, painted. */
function collect(root: Element): { raws: Raw[]; skipped: number } {
  const raws: Raw[] = [];
  let skipped = 0;
  // gradients: their first stop's color
  const gradients = new Map<string, string>();
  for (const g of [...root.getElementsByTagName("linearGradient"), ...root.getElementsByTagName("radialGradient")]) {
    const stop = g.getElementsByTagName("stop")[0];
    const sc = stop ? (stop.getAttribute("stop-color") ?? /stop-color\s*:\s*([^;]+)/.exec(stop.getAttribute("style") ?? "")?.[1]) : null;
    const col = sc ? parseColor(sc, null, new Map()) : undefined;
    if (g.id && col) gradients.set(g.id, col);
  }
  // simple .class { … } rules
  const classes = new Map<string, string>();
  for (const st of root.getElementsByTagName("style"))
    for (const [, sel, body] of (st.textContent ?? "").matchAll(/([^{}]+)\{([^}]*)\}/g))
      for (const one of sel!.split(",")) {
        const m = /^\s*\.([\w-]+)\s*$/.exec(one);
        if (m) classes.set(m[1]!, (classes.get(m[1]!) ?? "") + ";" + body);
      }
  const read = (el: Element, name: string): string | null => {
    const inline = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(el.getAttribute("style") ?? "")?.[1];
    if (inline) return inline;
    for (const c of (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)) {
      const v = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(classes.get(c) ?? "")?.[1];
      if (v) return v;
    }
    return el.getAttribute(name);
  };
  const paintOf = (el: Element, up: Paint): Paint => {
    const p = { ...up, opacity: up.opacity };
    const color = read(el, "color");
    if (color) p.color = parseColor(color, up.color, gradients) ?? p.color;
    const fill = read(el, "fill");
    if (fill) {
      const v = parseColor(fill, p.color, gradients);
      if (v !== undefined) p.fill = v;
    }
    const stroke = read(el, "stroke");
    if (stroke) {
      const v = parseColor(stroke, p.color, gradients);
      if (v !== undefined) p.stroke = v;
    }
    const w = read(el, "stroke-width");
    if (w && Number.isFinite(parseFloat(w))) p.width = parseFloat(w);
    const num = (n: string) => {
      const v = read(el, n);
      return v !== null && Number.isFinite(parseFloat(v)) ? parseFloat(v) : 1;
    };
    p.opacity *= num("opacity");
    p.fillOpacity = num("fill-opacity");
    p.strokeOpacity = num("stroke-opacity");
    if (read(el, "display")?.trim() === "none" || read(el, "visibility")?.trim() === "hidden") p.hidden = true;
    return p;
  };
  const SKIP = new Set(["defs", "clippath", "mask", "symbol", "title", "desc", "metadata", "style", "lineargradient", "radialgradient", "pattern", "filter", "marker"]);
  const walk = (el: Element, m: M, up: Paint) => {
    const tag = el.nodeName.toLowerCase().replace(/^svg:/, "");
    if (SKIP.has(tag)) return;
    const paint = paintOf(el, up);
    if (paint.hidden) return;
    const mm = mul(m, parseTransform(el.getAttribute("transform")));
    const a = (n: string) => parseFloat(el.getAttribute(n) ?? "0") || 0;
    // a paint fainter than about a third does not show on the board
    const fill = paint.fill !== null && paint.opacity * paint.fillOpacity >= 0.35 ? paint.fill : null;
    const stroke = paint.stroke !== null && paint.opacity * paint.strokeOpacity >= 0.35 && paint.width > 0 ? paint.stroke : null;
    const scale = Math.sqrt(Math.abs(mm[0] * mm[3] - mm[1] * mm[2])) || 1;
    const add = (kind: Shape["kind"], pts: P[], f: string | null = fill) => {
      if (f === null && stroke === null) return;
      raws.push({ kind, points: pts.map((p) => apply(mm, p)), fill: kind === "line" ? null : f, stroke, width: stroke ? paint.width * scale : 0 });
    };
    if (tag === "svg" || tag === "g" || tag === "a" || tag === "switch") {
      // a nested svg moves its content to its x and y
      const inner = tag === "svg" && el !== root ? mul(mm, [1, 0, 0, 1, a("x"), a("y")]) : mm;
      for (const child of el.children) walk(child, inner, paint);
    } else if (tag === "rect") {
      const [x, y, w, h] = [a("x"), a("y"), a("width"), a("height")];
      if (w > 0 && h > 0) {
        if (straight(mm)) add("rect", [[x, y], [x + w, y + h]]);
        else add("polygon", [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
      }
    } else if (tag === "circle" || tag === "ellipse") {
      const rx = tag === "circle" ? a("r") : a("rx");
      const ry = tag === "circle" ? a("r") : a("ry");
      const [cx, cy] = [a("cx"), a("cy")];
      if (rx > 0 && ry > 0) {
        if (straight(mm)) add("ellipse", [[cx - rx, cy - ry], [cx + rx, cy + ry]]);
        else add("polygon", ellipsePoints(cx, cy, rx, ry));
      }
    } else if (tag === "line") {
      if (stroke) raws.push({ kind: "line", points: [apply(mm, [a("x1"), a("y1")]), apply(mm, [a("x2"), a("y2")])], fill: null, stroke, width: paint.width * scale });
    } else if (tag === "polyline" || tag === "polygon") {
      const v = nums(el.getAttribute("points") ?? "");
      const pts: P[] = [];
      for (let k = 0; k + 1 < v.length; k += 2) pts.push([v[k]!, v[k + 1]!]);
      addOutline(pts, tag === "polygon");
    } else if (tag === "path") {
      for (const sp of pathPoints(el.getAttribute("d") ?? "")) addOutline(sp.points, sp.closed);
    } else skipped++;

    // a polygon when it is closed or filled; an open one without fill is its lines
    function addOutline(pts: P[], closed: boolean) {
      if (pts.length >= 3 && (closed || fill !== null)) add("polygon", pts);
      else if (stroke) for (let k = 0; k + 1 < pts.length; k++) raws.push({ kind: "line", points: [apply(mm, pts[k]!), apply(mm, pts[k + 1]!)], fill: null, stroke, width: paint.width * scale });
    }
  };
  const vb = nums(root.getAttribute("viewBox") ?? "");
  const base: M = vb.length === 4 ? [1, 0, 0, 1, -vb[0]!, -vb[1]!] : ID;
  for (const child of root.children) walk(child, base, paintOf(root, { fill: "#000000", stroke: null, width: 1, color: null, opacity: 1, fillOpacity: 1, strokeOpacity: 1, hidden: false }));
  return { raws, skipped };
}

/**
 * An SVG's shapes fitted into a frame of `w` × `h`: as big as fits (a vector
 * drawing can grow), centred on the feet column and standing on the feet row,
 * every color snapped to the board's. Null when the text is not an SVG.
 */
export function svgShapes(text: string, w: number, h: number, feet: { x: number; y: number }, snap: (hex: string) => string): SvgShapes | null {
  const root = parseSvg(text);
  if (!root) return null;
  const { raws, skipped } = collect(root);
  const all = raws.flatMap((r) => r.points);
  if (!all.length) return { shapes: [], skipped };
  const minX = Math.min(...all.map((p) => p[0]));
  const maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1]));
  const maxY = Math.max(...all.map((p) => p[1]));
  const bw = Math.max(1e-6, maxX - minX);
  const bh = Math.max(1e-6, maxY - minY);
  // the drawing's span in pixels, as big as the frame allows above the feet row
  const s = Math.min((w - 1) / bw, Math.max(1, Math.min(h - 1, feet.y)) / bh);
  const ox = Math.max(0, Math.min(w - 1 - Math.round(bw * s), Math.round(feet.x - (bw * s) / 2)));
  const oy = feet.y - Math.round(bh * s);
  const at = ([x, y]: P): P => [Math.round(ox + (x - minX) * s), Math.round(oy + (y - minY) * s)];
  const color = (c: string | null) => (c === null ? null : snap(c).toLowerCase());
  const shapes = raws.flatMap((r): Shape[] => {
    let pts = r.points.map(at).filter((p, k, list) => k === 0 || p[0] !== list[k - 1]![0] || p[1] !== list[k - 1]![1]);
    if (r.kind === "polygon") {
      if (pts.length > 1 && pts[0]![0] === pts[pts.length - 1]![0] && pts[0]![1] === pts[pts.length - 1]![1]) pts.pop();
      // a shape keeps at most 64 corners: every n-th one
      if (pts.length > 64) pts = pts.filter((_, k) => k % Math.ceil(pts.length / 64) === 0);
      if (pts.length < 3) return [];
    } else if (pts.length < 2) pts = [pts[0]!, pts[0]!];
    const width = r.stroke ? Math.max(1, Math.min(4, Math.round(r.width * s))) : 0;
    return [{ kind: r.kind, points: pts, fill: color(r.fill), stroke: color(r.stroke), width }];
  });
  return { shapes, skipped };
}
