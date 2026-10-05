// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// From detected frames to what the board shows, pure TypeScript (no DOM):
//  - one scale for the whole character, so its idle pose is the art spec's
//    height, downscaled by the dominant color (@go-link/cps1, never blended);
//  - palette zones: 16 px rows counted from the feet (the board's sprite
//    tiles, as the ROM cuts them), at most 15 colors each;
//  - colors snapped to the board's 4096 (each channel a multiple of 17) by
//    perceptual distance, the error measured as delta E;
//  - the result rendered for the preview and packed into a 1:1 atlas, the
//    picture the project keeps (play mode and the ROM read it as it is).

import { deltaE, downscaleDominant, downscaleRepresentative, fromLab, hexOf, kmeans, toBoardColor, toLab, type Lab, type Rgb, type ScaledFrame } from "@go-link/cps1";
import type { Box, Rgba } from "./detect";

/** A frame of the source sheet: its box and pivot (from the box's top left), in sheet pixels. */
export interface SourceFrame extends Box {
  id: string;
  px: number;
  py: number;
}

export interface DraftAnim {
  frames: string[];
  fps: number;
  loop: boolean;
}

/** The sheet with the background made transparent (mask 0 = background). */
export function applyMask(img: Rgba, mask: Uint8Array): { w: number; h: number; rgba: Uint8Array } {
  const rgba = new Uint8Array(img.data);
  for (let k = 0; k < img.w * img.h; k++) if (!mask[k]) rgba[k * 4 + 3] = 0;
  return { w: img.w, h: img.h, rgba };
}

const median = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1]!;
};

/** The height of the character in the sheet: its idle frames (or all frames), feet to top. */
export function sourceHeight(frames: readonly SourceFrame[], anims: Record<string, DraftAnim>): number {
  const idle = new Set(anims.idle?.frames ?? []);
  const ref = frames.filter((f) => idle.has(f.id));
  return median((ref.length ? ref : frames).map((f) => f.py + 1));
}

/** The one scale of the character: its height on the board over its height in the sheet. */
export function scaleFor(frames: readonly SourceFrame[], anims: Record<string, DraftAnim>, height: number): number {
  const src = sourceHeight(frames, anims);
  return src > 0 ? height / src : 1;
}

/** Every frame at board size, by the dominant color of each footprint. */
export function scaleFrames(keyed: { w: number; h: number; rgba: Uint8Array }, frames: readonly SourceFrame[], s: number): ScaledFrame[] {
  // art drawn at a whole size (1x, 2x, 3x…) keeps each pixel's own color; anything else (an image AI's) is
  // sampled smooth, as the most present color turns its fine detail into noise
  const whole = Math.abs(1 / s - Math.round(1 / s)) < 0.01;
  return frames.map((f) => (whole ? downscaleDominant(keyed, f, s) : downscaleRepresentative(keyed, f, s)));
}

export type ZoneLevel = "ok" | "warn" | "over";

export interface ZoneColor {
  hex: string;
  rgb: Rgb;
  /** Pixels of this color in the zone, over all frames. */
  count: number;
}

export interface Zone {
  /** 0 = the top zone. */
  index: number;
  /** Rows from the top: 3 zones are head, torso and legs (a 4th one sits above the head). */
  kind: "above" | "head" | "torso" | "legs" | "body" | "top" | "bottom" | "row";
  /** Distinct board colors the zone's pixels snap to. */
  used: number;
  colors: ZoneColor[];
  /** The zone's palette: the colors themselves, or the 15 nearest when there are more. */
  palette: string[];
  level: ZoneLevel;
  /** The two most alike colors (a hint for merging) when the zone is over 15. */
  closest: { a: string; b: string; deltaE: number } | null;
}

export interface ZoneResult {
  zones: Zone[];
  /** Mean delta E from the art's colors to the board's nearest ones. */
  snapMeanDeltaE: number;
  /** Mean and worst delta E from the art to what the board shows (zone palettes included). */
  meanDeltaE: number;
  maxDeltaE: number;
  /** Every frame drawn with its zone palettes, as the board shows it. */
  frames: ScaledFrame[];
}

export const MAX_COLORS = 15;
const ZONE_ROWS = 16;

const kindsFor = (n: number): Zone["kind"][] =>
  n === 1
    ? ["body"]
    : n === 2
      ? ["top", "bottom"]
      : n === 3
        ? ["head", "torso", "legs"]
        : // a jump or raised arms reach a fourth row over a 44 px hero
          n === 4
          ? ["above", "head", "torso", "legs"]
          : Array.from({ length: n }, () => "row" as const);

/** The zone a pixel row falls in, from the frame's bottom (the feet). */
const rowFromBottom = (h: number, y: number) => Math.floor((h - 1 - y) / ZONE_ROWS);

/** How many zones a set of frames needs: the tallest frame's 16 px rows. */
export function zoneCount(frames: readonly { h: number }[]): number {
  return Math.max(1, ...frames.map((f) => Math.ceil(f.h / ZONE_ROWS)));
}

const keyOf = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

/** Palette zones, board colors and the picture the board shows. */
export function analyzeZones(frames: readonly ScaledFrame[]): ZoneResult {
  const n = zoneCount(frames);
  const kinds = kindsFor(n);
  // snap every distinct color once
  const snapCache = new Map<number, { hex: string; rgb: Rgb; lab: Lab; err: number }>();
  const snap = (r: number, g: number, b: number) => {
    const k = keyOf(r, g, b);
    let hit = snapCache.get(k);
    if (!hit) {
      const c = toBoardColor([r, g, b]);
      hit = { hex: hexOf(c.rgb), rgb: c.rgb, lab: c.lab, err: c.err };
      snapCache.set(k, hit);
    }
    return hit;
  };
  const counts = Array.from({ length: n }, () => new Map<string, ZoneColor & { lab: Lab }>());
  let snapSum = 0;
  let pixels = 0;
  for (const f of frames)
    for (let y = 0; y < f.h; y++) {
      const z = n - 1 - rowFromBottom(f.h, y);
      for (let x = 0; x < f.w; x++) {
        const o = (y * f.w + x) * 4;
        if (!f.rgba[o + 3]) continue;
        const c = snap(f.rgba[o]!, f.rgba[o + 1]!, f.rgba[o + 2]!);
        snapSum += c.err;
        pixels++;
        const m = counts[z]!;
        const e = m.get(c.hex);
        if (e) e.count++;
        else m.set(c.hex, { hex: c.hex, rgb: c.rgb, lab: c.lab, count: 1 });
      }
    }
  // the outline: the darkest color with at least 1 % of the pixels, kept in every reduced palette
  const all = new Map<string, ZoneColor & { lab: Lab }>();
  for (const m of counts)
    for (const c of m.values()) {
      const e = all.get(c.hex);
      if (e) e.count += c.count;
      else all.set(c.hex, { ...c });
    }
  const dark = [...all.values()].sort((a, b) => a.lab[0] - b.lab[0]);
  const outline = dark.find((c) => c.count >= pixels * 0.01) ?? dark[0];

  const zones: Zone[] = counts.map((m, index) => {
    const colors = [...m.values()].sort((a, b) => b.count - a.count);
    const used = colors.length;
    let palette: string[];
    let closest: Zone["closest"] = null;
    if (used <= MAX_COLORS) palette = colors.map((c) => c.hex);
    else {
      const fixed = outline && m.has(outline.hex) ? [outline.lab] : [];
      const centers = kmeans(
        colors.map((c) => ({ lab: c.lab, w: c.count ** 0.6 })),
        MAX_COLORS,
        { fixed },
      );
      palette = [...new Set(centers.map((c) => hexOf(toBoardColor(fromLab(c)).rgb)))];
      // the most alike pair among the most used colors
      const top = colors.slice(0, 64);
      for (let i = 0; i < top.length; i++)
        for (let j = i + 1; j < top.length; j++) {
          const d = deltaE(top[i]!.lab, top[j]!.lab);
          if (!closest || d < closest.deltaE) closest = { a: top[i]!.hex, b: top[j]!.hex, deltaE: +d.toFixed(1) };
        }
    }
    const level: ZoneLevel = used > MAX_COLORS ? "over" : used >= MAX_COLORS - 1 ? "warn" : "ok";
    return { index, kind: kinds[index]!, used, colors: colors.map(({ hex, rgb, count }) => ({ hex, rgb, count })), palette: sortByLightness(palette), level, closest };
  });

  // draw every frame with its zone's palette, and measure the error
  const palLabs = zones.map((z) => z.palette.map((hex) => ({ hex, rgb: rgbOfHex(hex), lab: toLab(rgbOfHex(hex)) })));
  const fitCache = zones.map(() => new Map<number, { rgb: Rgb; err: number }>());
  let errSum = 0;
  let errMax = 0;
  const shown = frames.map((f) => {
    const rgba = new Uint8Array(f.rgba.length);
    for (let y = 0; y < f.h; y++) {
      const z = n - 1 - rowFromBottom(f.h, y);
      for (let x = 0; x < f.w; x++) {
        const o = (y * f.w + x) * 4;
        if (!f.rgba[o + 3]) continue;
        const r = f.rgba[o]!;
        const g = f.rgba[o + 1]!;
        const b = f.rgba[o + 2]!;
        const k = keyOf(r, g, b);
        let hit = fitCache[z]!.get(k);
        if (!hit) {
          const lab = toLab([r, g, b]);
          let best = palLabs[z]![0]!;
          let bd = Infinity;
          for (const p of palLabs[z]!) {
            const d = deltaE(lab, p.lab);
            if (d < bd) {
              bd = d;
              best = p;
            }
          }
          hit = { rgb: best.rgb, err: bd };
          fitCache[z]!.set(k, hit);
        }
        const { rgb, err: e } = hit;
        errSum += e;
        if (e > errMax) errMax = e;
        rgba[o] = rgb[0];
        rgba[o + 1] = rgb[1];
        rgba[o + 2] = rgb[2];
        rgba[o + 3] = 255;
      }
    }
    return { ...f, rgba };
  });

  return {
    zones,
    snapMeanDeltaE: pixels ? +(snapSum / pixels).toFixed(2) : 0,
    meanDeltaE: pixels ? +(errSum / pixels).toFixed(2) : 0,
    maxDeltaE: +errMax.toFixed(1),
    frames: shown,
  };
}

function rgbOfHex(hex: string): Rgb {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function sortByLightness(hexes: string[]): string[] {
  return [...hexes].sort((a, b) => toLab(rgbOfHex(a))[0] - toLab(rgbOfHex(b))[0]);
}

export interface AtlasRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  px: number;
  py: number;
}

/**
 * Packs frames into one picture, in rows (shelves), 2 px apart so a scaled
 * draw never bleeds into the next frame. Transparent where no figure is.
 */
export function packAtlas(frames: readonly ScaledFrame[], ids: readonly string[], maxWidth = 512): { w: number; h: number; rgba: Uint8Array; rects: AtlasRect[] } {
  const GAP = 2;
  const rects: AtlasRect[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let w = 1;
  frames.forEach((f, i) => {
    if (x > 0 && x + f.w > maxWidth) {
      x = 0;
      y += rowH + GAP;
      rowH = 0;
    }
    rects.push({ id: ids[i]!, x, y, w: f.w, h: f.h, px: f.px, py: f.py });
    x += f.w + GAP;
    rowH = Math.max(rowH, f.h);
    w = Math.max(w, x - GAP);
  });
  const h = Math.max(1, y + rowH);
  const rgba = new Uint8Array(w * h * 4);
  frames.forEach((f, i) => {
    const r = rects[i]!;
    for (let yy = 0; yy < f.h; yy++) rgba.set(f.rgba.subarray(yy * f.w * 4, (yy + 1) * f.w * 4), ((r.y + yy) * w + r.x) * 4);
  });
  return { w, h, rgba, rects };
}
