// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The background's scenes (Level.scenes): each picture the user gave, kept
// with where it goes (x), how far down it is moved (dy) and its size (scale),
// laid out left to right into the play layer's art. Moving, scaling or lining
// up a scene lays them all out again. Each scene is scaled to its share of
// the level's height and stretched a few pixels so its width is whole 32 px
// columns (as one background always was: a growing level ends on that grid).
// Scenes may overlap (a later one is drawn over an earlier one) and each may
// have its left and right edges cut off (cropL, cropR), so a seam between two
// pictures can be hidden under the next one's edge.
// "Line up the floor" finds, where two scenes meet, each one's floor line
// (the strongest horizontal edge in the floor band, along that edge of the
// picture: the sidewalk's edge, the wall's top) and moves each scene up or
// down to meet the one before it, in a chain from the first. Pure: pixels in, pixels
// and numbers out.

import type { BackgroundScene, Level } from "../model";
import { place, scalePicture, type KeyImage, type Rgba } from "./picture";

/** A scene's size in the level (px): its height from the scale, its width from the picture's shape, on 32 px columns. */
export function sceneSize(level: Level, src: { w: number; h: number }, scale: number): { w: number; h: number } {
  const h = Math.max(16, Math.round(level.size.h * scale));
  const natural = (src.w * h) / src.h;
  return { w: Math.max(32, Math.round(natural / 32) * 32), h };
}

/** The picture scaled into board-color keys at a scene's size (magenta made see-through when `key`). */
function sceneKeys(level: Level, src: Rgba, scale: number, key: boolean): KeyImage {
  const { w, h } = sceneSize(level, src, scale);
  const pic = scalePicture(src, h, key);
  if (pic.w === w) return pic;
  // stretched (or squeezed) a few pixels to the 32 px columns
  const out: KeyImage = { w, h, keys: new Int16Array(w * h) };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out.keys[y * w + x] = pic.keys[y * pic.w + Math.min(pic.w - 1, Math.floor((x * pic.w) / w))]!;
  return out;
}

/** The part of a scene that shows (level px): its edges less the crop, top and height. */
export function sceneBox(level: Level, s: BackgroundScene, src: { w: number; h: number }): { x: number; y: number; w: number; h: number; full: number } {
  const { w, h } = sceneSize(level, src, s.scale);
  const l = Math.max(0, Math.min(w - 16, s.cropL ?? 0));
  const r = Math.max(0, Math.min(w - 16 - l, s.cropR ?? 0));
  return { x: s.x + l, y: level.size.h - h + s.dy, w: w - l - r, h, full: w };
}

/** Where the next scene goes: right after the last one's visible part (0 for the first). */
export function nextSceneX(level: Level, scenes: readonly BackgroundScene[], sources: ReadonlyMap<string, Rgba>): number {
  let end = 0;
  for (const s of scenes) {
    const src = sources.get(s.asset);
    if (!src) continue;
    const b = sceneBox(level, s, src);
    end = Math.max(end, b.x + b.w);
  }
  return end;
}

/**
 * The width of a level whose background is its scenes: where the scenes end,
 * on the 32 px grid, but never short of a zone or an object (nothing placed
 * is cut off) nor of one screen (384 px).
 */
export function scenesWidth(level: Level, scenes: readonly BackgroundScene[], sources: ReadonlyMap<string, Rgba>): number {
  let end = Math.max(384, nextSceneX(level, scenes, sources));
  for (const z of level.zones ?? []) end = Math.max(end, z.x + z.w);
  for (const l of level.layers) if (l.kind === "objects") for (const o of l.items) end = Math.max(end, o.x + 16);
  return Math.ceil(end / 32) * 32;
}

/**
 * The scenes laid out as the play layer's art: each standing on the level's
 * bottom, moved by its dy, later scenes over earlier ones, `width` px wide
 * (scenesWidth by default).
 */
export function composeScenes(level: Level, scenes: readonly BackgroundScene[], sources: ReadonlyMap<string, Rgba>, keyMagenta: (src: Rgba) => boolean, width = scenesWidth(level, scenes, sources)): { keys: KeyImage; width: number } {
  const h = level.size.h;
  const keys: KeyImage = { w: width, h, keys: new Int16Array(width * h).fill(-1) };
  for (const s of scenes) {
    const src = sources.get(s.asset);
    if (!src) continue;
    const b = sceneBox(level, s, src);
    const pic = sceneKeys(level, src, s.scale, keyMagenta(src));
    // only the columns that are not cropped
    const shown: KeyImage = { w: b.w, h: pic.h, keys: new Int16Array(b.w * pic.h) };
    const l = b.x - s.x;
    for (let y = 0; y < pic.h; y++) shown.keys.set(pic.keys.subarray(y * pic.w + l, y * pic.w + l + b.w), y * b.w);
    place(keys, shown, b.x, b.y, false);
  }
  return { keys, width };
}

/**
 * A picture's floor line, as a share of its height: the row of its strongest
 * horizontal edge (brightness changing from one row to the next) in the floor
 * band (72 % to 95 % of the height), averaged over the columns from `from` to
 * `to` (shares of the width: an edge strip, where the picture meets the next).
 * Null for a picture too small to tell.
 */
export function floorLine(src: Rgba, from = 0, to = 1): number | null {
  if (src.h < 32 || src.w < 8) return null;
  const x0 = Math.max(0, Math.floor(src.w * from));
  const x1 = Math.max(x0 + 1, Math.min(src.w, Math.ceil(src.w * to)));
  const rows = new Float64Array(src.h);
  const step = Math.max(1, Math.floor((x1 - x0) / 200));
  for (let y = 0; y < src.h; y++) {
    let sum = 0;
    let n = 0;
    for (let x = x0; x < x1; x += step) {
      const i = (y * src.w + x) * 4;
      sum += src.data[i]! * 0.3 + src.data[i + 1]! * 0.59 + src.data[i + 2]! * 0.11;
      n++;
    }
    rows[y] = sum / n;
  }
  // the strong edges of the floor band (at least half the strongest), grouped into lines
  const y0 = Math.floor(src.h * 0.72);
  const y1 = Math.floor(src.h * 0.95);
  const edgeAt = (y: number) => Math.abs(rows[Math.min(src.h - 1, y + 2)]! - rows[Math.max(0, y - 2)]!);
  let max = 0;
  for (let y = y0; y < y1; y++) max = Math.max(max, edgeAt(y));
  if (!max) return null;
  const lines: number[][] = [];
  for (let y = y0; y < y1; y++) {
    if (edgeAt(y) < max / 2) continue;
    const last = lines[lines.length - 1];
    if (last && y - last[last.length - 1]! <= 3) last.push(y);
    else lines.push([y]);
  }
  const mids = lines.map((l) => (l[0]! + l[l.length - 1]!) / 2);
  // a wall's capstone: two lines about a fortieth of the height apart; the lowest such pair's top line
  const [gapMin, gapMax] = [src.h * 0.011, src.h * 0.021];
  for (let i = mids.length - 1; i > 0; i--)
    for (let j = i - 1; j >= 0; j--) {
      const d = mids[i]! - mids[j]!;
      if (d > gapMax) break;
      if (d >= gapMin) return mids[j]! / src.h;
    }
  // no capstone: the strongest edge
  let best = y0;
  for (let y = y0; y < y1; y++) if (edgeAt(y) > edgeAt(best)) best = y;
  return best / src.h;
}

/** The strip of a picture's edge where it meets its neighbour (a share of its width). */
const EDGE = 0.06;

/** Where a scene's floor line falls in the level (px) along its left or right edge (or across it), or null when its picture is unknown or has none. */
export function sceneFloor(level: Level, s: BackgroundScene, sources: ReadonlyMap<string, Rgba>, side: "left" | "right" | "all" = "all"): number | null {
  const src = sources.get(s.asset);
  if (!src) return null;
  // the visible edges, as shares of the picture's width
  const b = sceneBox(level, s, src);
  const l = (b.x - s.x) / b.full;
  const r = (b.x - s.x + b.w) / b.full;
  const f = side === "left" ? floorLine(src, l, l + EDGE) : side === "right" ? floorLine(src, r - EDGE, r) : floorLine(src, l, r);
  if (f === null) return null;
  const { h } = sceneSize(level, src, s.scale);
  return level.size.h - h + s.dy + f * h;
}

/**
 * Every scene moved up or down so the floor line along its left edge meets
 * the one before it along that one's right edge, in a chain from the
 * leftmost (which stays; a scene whose floor cannot be told stays too).
 */
export function lineUpFloors(level: Level, scenes: readonly BackgroundScene[], sources: ReadonlyMap<string, Rgba>): BackgroundScene[] {
  const out = scenes.map((s) => ({ ...s }));
  // left to right by where each one's visible part starts (the list is the drawing order)
  const left = (s: BackgroundScene) => {
    const src = sources.get(s.asset);
    return src ? sceneBox(level, s, src).x : s.x;
  };
  const order = [...out].sort((a, b) => left(a) - left(b));
  for (let i = 1; i < order.length; i++) {
    const before = sceneFloor(level, order[i - 1]!, sources, "right");
    const here = sceneFloor(level, order[i]!, sources, "left");
    if (before !== null && here !== null) order[i]!.dy = Math.round(order[i]!.dy + before - here);
  }
  return out;
}
