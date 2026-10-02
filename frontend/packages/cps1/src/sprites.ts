// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Sprite conversion v2 (docs/rom/journal.md, step 2b):
//  1. Downscale by the dominant color of each footprint, never an average:
//     the sheets are painted "pixel style" without an exact pixel grid
//     (gridScore shows it), so exact block sampling is impossible, but
//     picking the most present color keeps edges and flat areas clean
//     instead of blending them into mud.
//  2. Several 15-color palettes per character, one per 16x16 tile: the
//     CPS-1 gives every sprite entry its own palette, so each tile is drawn
//     as its own entry. Tiles are grouped by the colors they use (hair and
//     skin, shirt and logo, jeans and sneakers...) and every group gets a
//     palette, shared by all frames of the character.
//  3. Colors chosen in OKLab with weights that favor small distinct
//     accents (logo, sneakers, eyes), the outline black fixed in every
//     palette, then snapped to the nearest color the CPS-1 can really show
//     (color.ts). No dithering. The error is measured and reported.

import { dist2, fromLab, kmeans, toCps1, toLab, type BoardColor, type Lab, type Rgb, type WeightedLab } from "./color.ts";

/** The pen the board never draws. */
export const TRANSPARENT = 15;

/** An RGBA picture (a Node Buffer or a browser ImageData's data both fit). */
export interface Image {
  w: number;
  h: number;
  rgba: Uint8Array | Uint8ClampedArray;
}

/** A frame of a sheet: its box and its pivot (feet), in sheet pixels. */
export interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
  px: number;
  py: number;
}

/** A downscaled frame: its pixels and its pivot, in board pixels. */
export interface ScaledFrame {
  w: number;
  h: number;
  rgba: Uint8Array;
  px: number;
  py: number;
}

interface Px {
  rgb: Rgb;
  lab: Lab;
}

export interface Tile {
  dx: number;
  dy: number;
  px: (Px | null)[];
  pal: number;
  pens: number[];
}

export interface CutFrame {
  nx: number;
  ny: number;
  ax: number;
  ay: number;
  tiles: Tile[];
}

export interface Conversion {
  palettes: (BoardColor & { err: number })[][];
  frames: CutFrame[];
  stats: {
    palettes: number;
    tiles: number;
    meanDeltaE: number;
    maxDeltaE: number;
    snapMeanDeltaE: number;
    snapMaxDeltaE: number;
  };
}

/**
 * How strongly color changes line up on a grid of period p (1.0 = not at
 * all, p = every change on the grid): the test for a native pixel grid.
 */
export function gridScore(img: Image, frames: readonly FrameBox[], periods = [2, 3, 4, 5, 6, 8]): Record<number, number> {
  const xs: number[] = [];
  const a = img.rgba;
  for (const f of frames)
    for (let y = f.y; y < f.y + f.h; y += 2)
      for (let x = f.x + 1; x < f.x + f.w; x++) {
        const o = (y * img.w + x) * 4;
        if (a[o + 3]! < 128 || a[o - 1]! < 128) continue;
        const d = Math.abs(a[o]! - a[o - 4]!) + Math.abs(a[o + 1]! - a[o - 3]!) + Math.abs(a[o + 2]! - a[o - 2]!);
        if (d > 60) xs.push(x - f.x);
      }
  return Object.fromEntries(
    periods.map((p) => {
      const h = new Array<number>(p).fill(0);
      for (const x of xs) h[x % p]!++;
      return [p, +((Math.max(...h) / xs.length) * p).toFixed(2)];
    }),
  );
}

/** Downscale one atlas frame by the dominant color of each footprint. */
export function downscaleDominant(img: Image, f: FrameBox, s: number): ScaledFrame {
  const w = Math.max(1, Math.round(f.w * s));
  const h = Math.max(1, Math.round(f.h * s));
  const out = new Uint8Array(w * h * 4);
  const a = img.rgba;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(f.x + x / s);
      const x1 = Math.max(x0 + 1, Math.floor(f.x + (x + 1) / s));
      const y0 = Math.floor(f.y + y / s);
      const y1 = Math.max(y0 + 1, Math.floor(f.y + (y + 1) / s));
      let n = 0;
      let opaque = 0;
      const buckets = new Map<string, { n: number; sum: [number, number, number]; L: number }>();
      for (let sy = y0; sy < y1 && sy < f.y + f.h; sy++)
        for (let sx = x0; sx < x1 && sx < f.x + f.w; sx++) {
          n++;
          const o = (sy * img.w + sx) * 4;
          if (a[o + 3]! < 128) continue;
          opaque++;
          const rgb: Rgb = [a[o]!, a[o + 1]!, a[o + 2]!];
          const lab = toLab(rgb);
          const key = lab.map((v) => Math.round(v * 16)).join(",");
          const b = buckets.get(key) || { n: 0, sum: [0, 0, 0], L: lab[0] };
          b.n++;
          b.sum[0] += rgb[0];
          b.sum[1] += rgb[1];
          b.sum[2] += rgb[2];
          buckets.set(key, b);
        }
      if (!n || opaque * 2 < n) continue;
      // the most present color; on a tie the darker one (keeps outlines)
      let best: { n: number; sum: [number, number, number]; L: number } | null = null;
      for (const b of buckets.values()) if (!best || b.n > best.n || (b.n === best.n && b.L < best.L)) best = b;
      if (!best) continue;
      const o = (y * w + x) * 4;
      // a Uint8Array store truncates, like the Buffer the ROM tools used
      out[o] = best.sum[0] / best.n;
      out[o + 1] = best.sum[1] / best.n;
      out[o + 2] = best.sum[2] / best.n;
      out[o + 3] = 255;
    }
  return { w, h, rgba: out, px: Math.round(f.px * s), py: Math.round(f.py * s) };
}

/**
 * Like downscaleDominant, for art that is not drawn on an exact pixel grid
 * (an image AI's): each block takes the color of its own closest to the
 * block's average. The most present color turns such art's fine detail into
 * noise, a plain average blurs its outlines away; this keeps real colors and
 * reads smooth.
 */
export function downscaleRepresentative(img: Image, f: FrameBox, s: number): ScaledFrame {
  const w = Math.max(1, Math.round(f.w * s));
  const h = Math.max(1, Math.round(f.h * s));
  const out = new Uint8Array(w * h * 4);
  const a = img.rgba;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(f.x + x / s);
      const x1 = Math.max(x0 + 1, Math.floor(f.x + (x + 1) / s));
      const y0 = Math.floor(f.y + y / s);
      const y1 = Math.max(y0 + 1, Math.floor(f.y + (y + 1) / s));
      let n = 0;
      let opaque = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let sy = y0; sy < y1 && sy < f.y + f.h; sy++)
        for (let sx = x0; sx < x1 && sx < f.x + f.w; sx++) {
          n++;
          const o = (sy * img.w + sx) * 4;
          if (a[o + 3]! < 128) continue;
          opaque++;
          sr += a[o]!;
          sg += a[o + 1]!;
          sb += a[o + 2]!;
        }
      if (!n || opaque * 2 < n) continue;
      const avg = [sr / opaque, sg / opaque, sb / opaque] as const;
      let best = -1;
      let bestD = Infinity;
      for (let sy = y0; sy < y1 && sy < f.y + f.h; sy++)
        for (let sx = x0; sx < x1 && sx < f.x + f.w; sx++) {
          const o = (sy * img.w + sx) * 4;
          if (a[o + 3]! < 128) continue;
          const d = (a[o]! - avg[0]) ** 2 + (a[o + 1]! - avg[1]) ** 2 + (a[o + 2]! - avg[2]) ** 2;
          if (d < bestD) (bestD = d), (best = o);
        }
      if (best < 0) continue;
      const o = (y * w + x) * 4;
      out[o] = a[best]!;
      out[o + 1] = a[best + 1]!;
      out[o + 2] = a[best + 2]!;
      out[o + 3] = 255;
    }
  return { w, h, rgba: out, px: Math.round(f.px * s), py: Math.round(f.py * s) };
}

/** Cuts a frame into 16x16 tiles, feet on the bottom row; empty tiles dropped. */
function cutTiles(fr: ScaledFrame): CutFrame {
  const nx = Math.ceil(fr.w / 16);
  const ny = Math.ceil(fr.h / 16);
  const oy = ny * 16 - fr.h;
  const tiles: Tile[] = [];
  for (let ty = 0; ty < ny; ty++)
    for (let tx = 0; tx < nx; tx++) {
      const px: (Px | null)[] = [];
      let any = false;
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const sx = tx * 16 + x;
          const sy = ty * 16 + y - oy;
          let c: Rgb | null = null;
          if (sx < fr.w && sy >= 0 && sy < fr.h) {
            const o = (sy * fr.w + sx) * 4;
            if (fr.rgba[o + 3]) c = [fr.rgba[o]!, fr.rgba[o + 1]!, fr.rgba[o + 2]!];
          }
          if (c) any = true;
          px.push(c ? { rgb: c, lab: toLab(c) } : null);
        }
      if (any) tiles.push({ dx: tx * 16, dy: ty * 16, px, pal: 0, pens: [] });
    }
  return { nx, ny, ax: fr.px, ay: fr.py + oy, tiles };
}

/** Unique colors of some pixels with weights (count ^ 0.6: accents count more). */
function weightedPoints(pixels: readonly Px[]): (WeightedLab & { n: number })[] {
  const m = new Map<string, { lab: Lab; n: number }>();
  for (const p of pixels) {
    const key = p.rgb.join(",");
    const e = m.get(key) || { lab: p.lab, n: 0 };
    e.n++;
    m.set(key, e);
  }
  return [...m.values()].map((e) => ({ lab: e.lab, w: e.n ** 0.6, n: e.n }));
}

/** 15 CPS-1 colors for some pixels: k-means in OKLab, then snapped to the board. */
function makePalette(pixels: readonly Px[], outline: Lab | null, keep: readonly Rgb[] = []): (BoardColor & { err: number })[] {
  // colors to keep exactly (e.g. a shirt a palette swap recolors), when used here
  const used = keep.filter((k) => pixels.some((p) => p.rgb.join(",") === k.join(","))).map(toLab);
  const centers = kmeans(weightedPoints(pixels), 15, { fixed: [...(outline ? [outline] : []), ...used] });
  const seen = new Set<string>();
  const pal: (BoardColor & { err: number })[] = [];
  for (const c of centers) {
    const hw = toCps1(fromLab(c));
    const key = hw.rgb.join(",");
    if (seen.has(key)) continue; // two centers on one board color
    seen.add(key);
    pal.push(hw);
  }
  return pal;
}

const nearestPen = (pal: readonly BoardColor[], lab: Lab) => {
  let bi = 0;
  let bd = Infinity;
  pal.forEach((c, i) => {
    const d = dist2(c.lab, lab);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  return { pen: bi, d: bd };
};

const tileCost = (tile: Tile, pal: readonly BoardColor[]) => tile.px.reduce((s, p) => (p ? s + nearestPen(pal, p.lab).d : s), 0);

/**
 * Converts a character: frames (already downscaled) -> palettes (each 15
 * CPS-1 colors) and, per frame, the tiles with their palette and pens.
 */
export function convertCharacter(frames: readonly ScaledFrame[], nPalettes: number, { keep = [] }: { keep?: readonly Rgb[] } = {}): Conversion {
  const cut = frames.map(cutTiles);
  const tiles = cut.flatMap((c) => c.tiles);
  const all = tiles.flatMap((t) => t.px.filter((p): p is Px => !!p));
  // the outline: the darkest color that covers at least 1 % of the pixels
  const pts = weightedPoints(all).sort((a, b) => a.lab[0] - b.lab[0]);
  const outline = (pts.find((p) => p.n >= all.length * 0.01) || pts[0])?.lab ?? null;

  // group tiles by the colors they use: a histogram over 32 global colors
  const global = kmeans(weightedPoints(all), 32);
  const hist = tiles.map((t) => {
    const hgm = new Array<number>(global.length).fill(0);
    let n = 0;
    for (const p of t.px)
      if (p) {
        let bi = 0;
        let bd = Infinity;
        global.forEach((c, i) => {
          const d = dist2(c, p.lab);
          if (d < bd) {
            bd = d;
            bi = i;
          }
        });
        hgm[bi]!++;
        n++;
      }
    return hgm.map((v) => v / n);
  });
  const hd = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, i) => s + (v - b[i]!) ** 2, 0);
  // deterministic start: the tile with most pixels, then the farthest ones
  const sizes = tiles.map((t) => t.px.filter(Boolean).length);
  const seeds = [sizes.indexOf(Math.max(...sizes))];
  while (seeds.length < Math.min(nPalettes, tiles.length)) {
    let bi = 0;
    let bs = -1;
    hist.forEach((h, i) => {
      const s = Math.min(...seeds.map((j) => hd(h, hist[j]!))) * Math.sqrt(sizes[i]!);
      if (s > bs) {
        bs = s;
        bi = i;
      }
    });
    seeds.push(bi);
  }
  let centers = seeds.map((i) => hist[i]!.slice());
  let group = new Array<number>(tiles.length).fill(0);
  for (let it = 0; it < 10; it++) {
    group = hist.map((h) => {
      let bi = 0;
      let bd = Infinity;
      centers.forEach((c, i) => {
        const d = hd(h, c);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      return bi;
    });
    centers = centers.map((c, gi) => {
      const members = hist.filter((_, i) => group[i] === gi);
      if (!members.length) return c;
      return c.map((_, k) => members.reduce((s, h) => s + h[k]! * sizes[hist.indexOf(h)]!, 0) / members.reduce((s, h) => s + sizes[hist.indexOf(h)]!, 0));
    });
  }
  // palettes per group, then every tile moves to the palette that draws it best
  let palettes: (BoardColor & { err: number })[][] = [];
  for (let round = 0; round < 3; round++) {
    palettes = centers.map((_, gi) => {
      const px = tiles.filter((_, i) => group[i] === gi).flatMap((t) => t.px.filter((p): p is Px => !!p));
      return px.length ? makePalette(px, outline, keep) : makePalette(all, outline, keep);
    });
    group = tiles.map((t) => {
      let bi = 0;
      let bd = Infinity;
      palettes.forEach((p, i) => {
        const d = tileCost(t, p);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      return bi;
    });
  }
  // pens, and the error against the downscaled picture
  let errSum = 0;
  let errMax = 0;
  let n = 0;
  tiles.forEach((t, i) => {
    t.pal = group[i]!;
    t.pens = t.px.map((p) => {
      if (!p) return TRANSPARENT;
      const { pen, d } = nearestPen(palettes[t.pal]!, p.lab);
      const e = Math.sqrt(d) * 100;
      errSum += e;
      errMax = Math.max(errMax, e);
      n++;
      return pen;
    });
  });
  const snap = palettes.flat().map((c) => c.err);
  return {
    palettes,
    frames: cut,
    stats: {
      palettes: palettes.length,
      tiles: tiles.length,
      meanDeltaE: +(errSum / n).toFixed(2),
      maxDeltaE: +errMax.toFixed(1),
      snapMeanDeltaE: +(snap.reduce((a, b) => a + b, 0) / snap.length).toFixed(2),
      snapMaxDeltaE: +Math.max(...snap).toFixed(2),
    },
  };
}

/** Renders a converted frame to RGBA (previews and comparisons). */
export function renderFrame(conv: Conversion, fi: number): { w: number; h: number; rgba: Uint8Array } {
  const f = conv.frames[fi]!;
  const w = f.nx * 16;
  const h = f.ny * 16;
  const rgba = new Uint8Array(w * h * 4);
  for (const t of f.tiles)
    t.pens.forEach((pen, i) => {
      if (pen === TRANSPARENT) return;
      const o = ((t.dy + (i >> 4)) * w + t.dx + (i & 15)) * 4;
      const c = conv.palettes[t.pal]![pen]!.rgb;
      rgba[o] = c[0];
      rgba[o + 1] = c[1];
      rgba[o + 2] = c[2];
      rgba[o + 3] = 255;
    });
  return { w, h, rgba };
}
