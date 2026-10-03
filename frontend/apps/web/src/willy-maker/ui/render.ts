// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Draws a level on a Canvas 2D: its tile layers, the collision tags as
// tinted cells with a top line, the objects as labelled boxes, the grid,
// the screen frame and the reachability warnings. Only the visible part is
// drawn, pixels are never smoothed, and colors come from the site's tokens.

import { CELL, decodeCells, objectLayer, TAGS, type Layer, type Level, type LevelObject, type TagLayer, type TileLayer } from "../model";
import type { Reach } from "../editor/reach";

export interface TileImage {
  img: CanvasImageSource;
  tile: number;
  columns: number;
}

export interface Palette {
  bg: string;
  grid: string;
  gridStrong: string;
  text: string;
  textOnAccent: string;
  accent: string;
  screen: string;
  danger: string;
  dangerBg: string;
  tags: Record<string, string>;
  objects: Record<string, string>;
  font: string;
}

export const FALLBACK_PALETTE: Palette = {
  bg: "#05060a",
  grid: "rgba(255,255,255,0.06)",
  gridStrong: "rgba(255,255,255,0.14)",
  text: "#e9ecf2",
  textOnAccent: "#1a1206",
  accent: "#f2a33a",
  screen: "#4fc3d9",
  danger: "#e0627a",
  dangerBg: "#2a1519",
  tags: { solid: "#a3abbd", oneway: "#7ee2a8", ladder: "#4fc3d9", crate: "#f2a33a", breakable: "#e0627a", hazard: "#f2d23a", water: "#4f8bd9" },
  objects: { player_start: "#f2a33a", enemy: "#e0627a", civilian: "#7ee2a8", crate: "#f2a33a", pickup: "#f2d23a", platform: "#4fc3d9", camera_lock: "#9d8cf0", checkpoint: "#7ee2a8", boss: "#e0627a", exit: "#7ee2a8" },
  font: "monospace",
};

/** "#rrggbb" + alpha as rgba() (canvas styles take plain colors). */
export function withAlpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Reads the drawing colors from the tokens on `el`. */
export function paletteFrom(el: Element | null): Palette {
  if (!el || typeof getComputedStyle !== "function") return FALLBACK_PALETTE;
  const cs = getComputedStyle(el);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  const muted = v("--color-text-muted", "#a3abbd");
  const ok = v("--color-ok", "#7ee2a8");
  const voice = v("--color-voice", "#4fc3d9");
  const accent = v("--color-accent", "#f2a33a");
  const p3 = v("--color-p3", "#e0627a");
  const p4 = v("--color-p4", "#9d8cf0");
  return {
    bg: v("--color-video", FALLBACK_PALETTE.bg),
    grid: withAlpha(v("--color-text", "#ffffff"), 0.07),
    gridStrong: withAlpha(v("--color-text", "#ffffff"), 0.16),
    text: v("--color-text", FALLBACK_PALETTE.text),
    textOnAccent: v("--color-on-accent", FALLBACK_PALETTE.textOnAccent),
    accent,
    screen: voice,
    danger: p3,
    dangerBg: v("--color-danger-bg", FALLBACK_PALETTE.dangerBg),
    tags: {
      solid: muted,
      oneway: ok,
      ladder: voice,
      crate: accent,
      breakable: p3,
      hazard: v("--color-hazard", "#f2d23a"),
      water: v("--color-water", "#4f8bd9"),
    },
    objects: {
      player_start: accent,
      enemy: p3,
      civilian: ok,
      crate: accent,
      pickup: v("--color-hazard", "#f2d23a"),
      platform: v("--color-voice", "#4fc3d9"),
      camera_lock: p4,
      checkpoint: ok,
      boss: p3,
      exit: ok,
    },
    font: v("--font-mono", "monospace"),
  };
}

export interface View {
  /** World pixel at the canvas' top-left corner. */
  x: number;
  y: number;
  zoom: number;
  /** Canvas size in CSS pixels. */
  w: number;
  h: number;
}

export interface DrawOptions {
  view: View;
  dpr: number;
  palette: Palette;
  images: Map<string, TileImage>;
  /** tileset id per tile layer id comes from the layer itself. */
  showGrid: boolean;
  showScreen: boolean;
  reach: Reach | null;
  selected: string | null;
  hover: { c: number; r: number; w: number; h: number } | null;
  /** Labels of the objects, already translated. */
  label: (o: LevelObject) => string;
  /** Translated warning text for a ledge rise. */
  ledgeText: (rise: number) => string;
}

/** A decoded tile or tag layer, cached by its data string. */
const decoded = new WeakMap<Layer, { data: string; cells: Uint16Array }>();
function cellsOf(level: Level, layer: TileLayer | TagLayer): Uint16Array {
  const hit = decoded.get(layer);
  if (hit && hit.data === layer.data) return hit.cells;
  const cells = decodeCells(layer.data, Math.ceil(level.size.w / layer.grid) * Math.ceil(level.size.h / layer.grid));
  decoded.set(layer, { data: layer.data, cells });
  return cells;
}

/** The world rectangle of an object (points get a small box above their feet). */
export function objectBox(o: LevelObject): { x: number; y: number; w: number; h: number } {
  if (o.type === "platform") return { x: o.x, y: o.y, w: Number(o.w) || 48, h: 8 };
  if (typeof o.w === "number" && typeof o.h === "number" && o.type !== "boss") return { x: o.x, y: o.y, w: o.w, h: o.h };
  if (o.type === "crate") {
    const s = Number(o.size) || 32;
    return { x: o.x, y: o.y, w: s, h: s };
  }
  const h = o.type === "boss" ? 64 : o.type === "pickup" ? 16 : o.type === "exit" || o.type === "checkpoint" ? 48 : 44;
  const w = o.type === "boss" ? 64 : o.type === "pickup" ? 16 : 24;
  return { x: o.x - w / 2 + (o.type === "pickup" ? 8 : 0), y: o.y - h, w, h };
}

export function drawLevel(ctx: CanvasRenderingContext2D, level: Level, o: DrawOptions): void {
  const { view, dpr, palette: pal } = o;
  const z = view.zoom;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.save();
  ctx.setTransform(dpr * z, 0, 0, dpr * z, -view.x * z * dpr, -view.y * z * dpr);
  // the level's area
  const vx0 = Math.max(0, view.x);
  const vy0 = Math.max(0, view.y);
  const vx1 = Math.min(level.size.w, view.x + view.w / z);
  const vy1 = Math.min(level.size.h, view.y + view.h / z);
  ctx.fillStyle = pal.dangerBg;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(0, 0, level.size.w, level.size.h);
  ctx.globalAlpha = 1;

  for (const layer of level.layers) {
    if (layer.visible === false) continue;
    ctx.globalAlpha = layer.opacity ?? 1;
    if (layer.kind === "tiles") drawTiles(ctx, level, layer, o.images.get(layer.tileset ?? ""), vx0, vy0, vx1, vy1);
    else if (layer.kind === "tags") drawTags(ctx, level, layer, pal, z, vx0, vy0, vx1, vy1);
    else drawObjects(ctx, level, pal, z, o, vx0, vx1);
    ctx.globalAlpha = 1;
  }

  // grid
  if (o.showGrid && z >= 1) {
    ctx.lineWidth = 1 / z;
    ctx.beginPath();
    const c0 = Math.floor(vx0 / CELL);
    const c1 = Math.ceil(vx1 / CELL);
    const r0 = Math.floor(vy0 / CELL);
    const r1 = Math.ceil(vy1 / CELL);
    for (let c = c0; c <= c1; c++) {
      ctx.moveTo(c * CELL, vy0);
      ctx.lineTo(c * CELL, vy1);
    }
    for (let r = r0; r <= r1; r++) {
      ctx.moveTo(vx0, r * CELL);
      ctx.lineTo(vx1, r * CELL);
    }
    ctx.strokeStyle = pal.grid;
    ctx.stroke();
    // every screen width, a stronger line
    ctx.beginPath();
    for (let x = Math.ceil(vx0 / 384) * 384; x <= vx1; x += 384) {
      ctx.moveTo(x, vy0);
      ctx.lineTo(x, vy1);
    }
    ctx.strokeStyle = pal.gridStrong;
    ctx.stroke();
  }

  // sections
  ctx.font = `${11 / z}px ${pal.font}`;
  for (const s of level.sections) {
    if (s.x1 < vx0 || s.x0 > vx1) continue;
    ctx.fillStyle = pal.screen;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(s.x0, 0, 2 / z, level.size.h);
    ctx.globalAlpha = 1;
    ctx.fillText(s.name, s.x0 + 6 / z, 14 / z);
  }

  // reachability warnings
  if (o.reach) {
    for (const l of o.reach.ledges) {
      if (l.x1 < vx0 || l.x0 > vx1) continue;
      ctx.strokeStyle = pal.danger;
      ctx.lineWidth = 2 / z;
      ctx.setLineDash([4 / z, 3 / z]);
      ctx.strokeRect(l.x0, l.y - 3 / z, l.x1 - l.x0, 6 / z);
      ctx.setLineDash([]);
      pill(ctx, `⚠ ${o.ledgeText(l.rise)}`, l.x0, l.y - 10 / z, z, pal.dangerBg, pal.danger, pal.font);
    }
  }

  // the screen frame at the view's left edge
  if (o.showScreen) {
    const sx = Math.max(0, Math.min(level.size.w - 384, view.x + 24 / z));
    const sy = Math.max(0, Math.min(level.size.h - 224, view.y + 24 / z));
    ctx.strokeStyle = pal.screen;
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([6 / z, 4 / z]);
    ctx.strokeRect(sx, sy, 384, 224);
    ctx.setLineDash([]);
  }

  // hover
  if (o.hover) {
    ctx.strokeStyle = pal.text;
    ctx.lineWidth = 2 / z;
    ctx.strokeRect(o.hover.c * CELL, o.hover.r * CELL, o.hover.w * CELL, o.hover.h * CELL);
  }
  ctx.restore();
}

function drawTiles(ctx: CanvasRenderingContext2D, level: Level, layer: TileLayer, img: TileImage | undefined, vx0: number, vy0: number, vx1: number, vy1: number) {
  if (!img) return;
  const g = layer.grid;
  const cols = Math.ceil(level.size.w / g);
  const cells = cellsOf(level, layer);
  const c0 = Math.max(0, Math.floor(vx0 / g));
  const c1 = Math.min(cols - 1, Math.ceil(vx1 / g));
  const r0 = Math.max(0, Math.floor(vy0 / g));
  const r1 = Math.min(Math.ceil(level.size.h / g) - 1, Math.ceil(vy1 / g));
  const ts = img.tile;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const n = cells[r * cols + c]!;
      if (!n) continue;
      const sx = ((n - 1) % img.columns) * ts;
      const sy = Math.floor((n - 1) / img.columns) * ts;
      ctx.drawImage(img.img, sx, sy, ts, ts, c * g, r * g, g, g);
    }
}

function drawTags(ctx: CanvasRenderingContext2D, level: Level, layer: TagLayer, pal: Palette, z: number, vx0: number, vy0: number, vx1: number, vy1: number) {
  const cols = Math.ceil(level.size.w / CELL);
  const rows = Math.ceil(level.size.h / CELL);
  const cells = cellsOf(level, layer);
  const c0 = Math.max(0, Math.floor(vx0 / CELL));
  const c1 = Math.min(cols - 1, Math.ceil(vx1 / CELL));
  const r0 = Math.max(0, Math.floor(vy0 / CELL));
  const r1 = Math.min(rows - 1, Math.ceil(vy1 / CELL));
  const alpha = ctx.globalAlpha;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const t = cells[r * cols + c]!;
      if (!t) continue;
      const name = TAGS[t] ?? "solid";
      const color = pal.tags[name] ?? pal.text;
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha * (name === "oneway" ? 0.35 : 0.32);
      if (name === "oneway") ctx.fillRect(c * CELL, r * CELL, CELL, 6);
      else ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      ctx.globalAlpha = alpha;
      const above = r > 0 ? cells[(r - 1) * cols + c]! : 0;
      if (above !== t) ctx.fillRect(c * CELL, r * CELL, CELL, 2 / z);
      if (name === "ladder") {
        ctx.fillRect(c * CELL + 3, r * CELL, 1.5, CELL);
        ctx.fillRect(c * CELL + CELL - 4.5, r * CELL, 1.5, CELL);
        ctx.fillRect(c * CELL + 3, r * CELL + 7, CELL - 6, 1.5);
      } else if (name === "hazard" || name === "breakable") {
        ctx.beginPath();
        ctx.moveTo(c * CELL + 2, r * CELL + CELL - 2);
        ctx.lineTo(c * CELL + CELL - 2, r * CELL + 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 / z;
        ctx.stroke();
      }
    }
}

function drawObjects(ctx: CanvasRenderingContext2D, level: Level, pal: Palette, z: number, o: DrawOptions, vx0: number, vx1: number) {
  for (const obj of objectLayer(level).items) {
    const b = objectBox(obj);
    if (b.x + b.w < vx0 - 200 || b.x > vx1 + 200) continue;
    const color = pal.objects[obj.type] ?? pal.text;
    const isRect = obj.type === "camera_lock";
    ctx.strokeStyle = color;
    ctx.lineWidth = (obj.name === o.selected ? 3 : 1.5) / z;
    if (isRect) ctx.setLineDash([8 / z, 5 / z]);
    ctx.fillStyle = color;
    ctx.globalAlpha = isRect ? 0.06 : 0.22;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.globalAlpha = 1;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);
    if (obj.type === "platform") {
      // its track: where it goes and comes back
      const range = Math.max(0, Number(obj.range) || 0);
      const across = obj.axis !== "y";
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([4 / z, 4 / z]);
      ctx.strokeRect(b.x, b.y, b.w + (across ? range : 0), b.h + (across ? 0 : range));
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (obj.type === "boss" && typeof obj.w === "number" && typeof obj.h === "number") {
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([3 / z, 4 / z]);
      ctx.strokeRect(obj.x - obj.w / 2, obj.y - obj.h, obj.w, obj.h);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (obj.name === o.selected) {
      ctx.strokeStyle = pal.text;
      ctx.lineWidth = 1 / z;
      ctx.strokeRect(b.x - 3 / z, b.y - 3 / z, b.w + 6 / z, b.h + 6 / z);
    }
    if (z >= 0.75 || obj.name === o.selected) pill(ctx, o.label(obj), b.x, b.y - 4 / z, z, pal.bg, color, pal.font);
  }
}

/** A small rounded label at (x, bottom y), sized for the zoom. */
function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, z: number, bg: string, fg: string, font: string) {
  ctx.font = `${11 / z}px ${font}`;
  const w = ctx.measureText(text).width + 10 / z;
  const h = 16 / z;
  ctx.fillStyle = bg;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.roundRect?.(x, y - h, w, h, 5 / z);
  if (!ctx.roundRect) ctx.rect(x, y - h, w, h);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = fg;
  ctx.fillText(text, x + 5 / z, y - 4 / z);
}

/** A small picture of the whole level: tags as colored cells (the minimap, thumbnails). */
export function drawOverview(ctx: CanvasRenderingContext2D, level: Level, w: number, h: number, pal: Palette, images?: Map<string, TileImage>): void {
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);
  const s = Math.min(w / level.size.w, h / level.size.h);
  ctx.save();
  ctx.scale(s, s);
  for (const layer of level.layers) {
    if (layer.kind !== "tiles" || layer.visible === false || !images) continue;
    drawTiles(ctx, level, layer, images.get(layer.tileset ?? ""), 0, 0, level.size.w, level.size.h);
  }
  const tags = level.layers.find((l): l is TagLayer => l.kind === "tags");
  if (tags) {
    const cols = Math.ceil(level.size.w / CELL);
    const cells = cellsOf(level, tags);
    for (let i = 0; i < cells.length; i++) {
      const t = cells[i]!;
      if (!t) continue;
      ctx.fillStyle = pal.tags[TAGS[t] ?? "solid"] ?? pal.text;
      ctx.globalAlpha = images ? 0.35 : 0.9;
      ctx.fillRect((i % cols) * CELL, Math.floor(i / cols) * CELL, CELL, CELL);
    }
    ctx.globalAlpha = 1;
  }
  for (const o of objectLayer(level).items) {
    if (!["enemy", "boss", "civilian", "exit", "player_start"].includes(o.type)) continue;
    ctx.fillStyle = pal.objects[o.type] ?? pal.text;
    const b = objectBox(o);
    ctx.fillRect(b.x, b.y, Math.max(b.w, 48), Math.max(b.h, 48));
  }
  ctx.restore();
}
