// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Own backgrounds (experiment 1's verdict, T-28): a picture of any size
// becomes a background layer the board can show. It is scaled to board
// pixels (the dominant color of each block, so pixel art drawn big comes
// back sharp), its colors are fitted to the board (12-bit colors, at most
// 15 per tile, up to 32 palettes per layer chosen tile by tile), and the
// tiles are cut and deduplicated into a tileset. When the colors do not fit
// exactly, the palettes are then refined: each tile goes to the palette
// that shows it best and each palette's 15 colors are chosen again from its
// tiles' pixels, a few rounds (measured on six image AI backgrounds: the
// pixels visibly off went from 54 % to 39 %). Pure: pixels in, pixels and
// numbers out.

import { toLab } from "@go-link/cps1";
import { cleanImageAiMagenta } from "../sprites/detect";

export interface Rgba {
  w: number;
  h: number;
  data: Uint8Array | Uint8ClampedArray;
}

/** Board colors are 4 bits per channel: a color key 0-4095, or -1 for transparent. */
const key = (r: number, g: number, b: number) => (Math.round(r / 17) << 8) | (Math.round(g / 17) << 4) | Math.round(b / 17);
const rgbOfKey = (k: number): [number, number, number] => [((k >> 8) & 15) * 17, ((k >> 4) & 15) * 17, (k & 15) * 17];
export const hexOfKey = (k: number) => `#${rgbOfKey(k).map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
export const keyOfHex = (hex: string) => {
  const v = parseInt(hex.replace("#", ""), 16);
  return key((v >> 16) & 255, (v >> 8) & 255, v & 255);
};

/** Board-color keys of a picture: one per pixel, -1 where it is transparent. */
export type KeyImage = { w: number; h: number; keys: Int16Array };

/**
 * Looks for pixel art drawn big: the largest block size (2-12) at which
 * almost every block is one color. 1 when the picture is not pixel art.
 */
export function pixelSize(src: Rgba): number {
  const { w, h, data } = src;
  for (let s = 12; s >= 2; s--) {
    let blocks = 0;
    let flat = 0;
    for (let by = 0; by + s <= h && blocks < 4000; by += s * 3)
      for (let bx = 0; bx + s <= w && blocks < 4000; bx += s * 3) {
        blocks++;
        const o = (by * w + bx) * 4;
        let same = true;
        for (let y = 0; y < s && same; y++)
          for (let x = 0; x < s && same; x++) {
            const p = ((by + y) * w + bx + x) * 4;
            if (Math.abs(data[p]! - data[o]!) + Math.abs(data[p + 1]! - data[o + 1]!) + Math.abs(data[p + 2]! - data[o + 2]!) > 24) same = false;
          }
        if (same) flat++;
      }
    if (blocks >= 16 && flat / blocks >= 0.8) return s;
  }
  return 1;
}

/**
 * The picture at board scale, `height` board pixels tall (the width keeps
 * the proportion): each board pixel takes the most common board color of
 * its block, so a picture drawn at 4x comes back pixel for pixel.
 */
/** A background color an image AI was asked for (#FF00FF, give or take): read as transparent when keying. */
export function isMagenta(r: number, g: number, b: number): boolean {
  return r >= 200 && b >= 200 && g <= 72;
}

/** A copy of a picture with its magenta background (and what an image AI leaves around it) made transparent. */
function withoutAiMagenta(src: Rgba): Rgba {
  const data = new Uint8ClampedArray(src.data);
  const n = src.w * src.h;
  const isBg = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (data[k * 4 + 3]! < 128 || isMagenta(data[k * 4]!, data[k * 4 + 1]!, data[k * 4 + 2]!)) isBg[k] = 1;
  cleanImageAiMagenta(data, isBg, src.w, src.h);
  for (let k = 0; k < n; k++) if (isBg[k]) data[k * 4 + 3] = 0;
  return { w: src.w, h: src.h, data };
}

export function scalePicture(input: Rgba, height: number, keyMagenta = false): KeyImage {
  // an image AI's magenta is never flat and its soft edges are pink: clean a copy first
  const src = keyMagenta ? withoutAiMagenta(input) : input;
  const f = src.h / height;
  const w = Math.max(1, Math.round(src.w / f));
  const h = height;
  const keys = new Int16Array(w * h);
  const counts = new Map<number, number>();
  // pixel art drawn at a whole size (2x, 3x…) keeps each pixel's own color; anything else is averaged
  const exact = f < 1.01 || (Math.abs(f - Math.round(f)) < 0.01 && pixelSize(src) === Math.round(f));
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * f);
    const y1 = Math.min(src.h, Math.max(y0 + 1, Math.floor((y + 1) * f)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * f);
      const x1 = Math.min(src.w, Math.max(x0 + 1, Math.floor((x + 1) * f)));
      counts.clear();
      let clear = 0;
      let n = 0;
      // a big block samples a grid of at most 6 x 6 pixels, enough for the dominant color
      const sx = Math.max(1, Math.floor((x1 - x0) / 6));
      const sy = Math.max(1, Math.floor((y1 - y0) / 6));
      for (let yy = y0; yy < y1; yy += sy)
        for (let xx = x0; xx < x1; xx += sx) {
          const o = (yy * src.w + xx) * 4;
          n++;
          if (src.data[o + 3]! < 128 || (keyMagenta && isMagenta(src.data[o]!, src.data[o + 1]!, src.data[o + 2]!))) {
            clear++;
            continue;
          }
          const k = key(src.data[o]!, src.data[o + 1]!, src.data[o + 2]!);
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      if (clear * 2 > n) {
        keys[y * w + x] = -1;
        continue;
      }
      if (!exact) {
        // a picture that is not pixel art on an exact grid (an image AI's): the block's average color,
        // as the dominant one turns its fine detail into noise
        let r = 0;
        let g = 0;
        let b = 0;
        let m = 0;
        for (let yy = y0; yy < y1; yy++)
          for (let xx = x0; xx < x1; xx++) {
            const o = (yy * src.w + xx) * 4;
            if (src.data[o + 3]! < 128 || (keyMagenta && isMagenta(src.data[o]!, src.data[o + 1]!, src.data[o + 2]!))) continue;
            r += src.data[o]!;
            g += src.data[o + 1]!;
            b += src.data[o + 2]!;
            m++;
          }
        if (m) {
          keys[y * w + x] = key(Math.round(r / m), Math.round(g / m), Math.round(b / m));
          continue;
        }
      }
      let best = -1;
      let bc = 0;
      for (const [k, c] of counts) if (c > bc) (best = k), (bc = c);
      keys[y * w + x] = best;
    }
  }
  return { w, h, keys };
}

/** Board-color keys of an RGBA picture already at board scale. */
export function keysOf(src: Rgba): KeyImage {
  const keys = new Int16Array(src.w * src.h);
  for (let i = 0; i < keys.length; i++) {
    const o = i * 4;
    keys[i] = src.data[o + 3]! < 128 ? -1 : key(src.data[o]!, src.data[o + 1]!, src.data[o + 2]!);
  }
  return { w: src.w, h: src.h, keys };
}

/** Draws `pic` over `dst` at (x, y), transparent pixels left as they were. */
export function place(dst: KeyImage, pic: KeyImage, x: number, y = 0, repeat = false): void {
  const starts = repeat ? Array.from({ length: Math.ceil((dst.w - x) / pic.w) }, (_, i) => x + i * pic.w) : [x];
  for (const sx of starts)
    for (let py = 0; py < pic.h; py++) {
      const ty = y + py;
      if (ty < 0 || ty >= dst.h) continue;
      for (let px = 0; px < pic.w; px++) {
        const tx = sx + px;
        if (tx < 0 || tx >= dst.w) continue;
        const k = pic.keys[py * pic.w + px]!;
        if (k >= 0) dst.keys[ty * dst.w + tx] = k;
      }
    }
}

export interface FittedLayer {
  tile: number;
  cols: number;
  rows: number;
  /** Tile number per cell (row order), 0 = empty. */
  cells: Uint16Array;
  /** The unique tiles as a picture, `columns` across, in board colors with transparency. */
  tileset: { w: number; h: number; data: Uint8Array; columns: number; count: number };
  /** Each palette's colors (`#RRGGBB`, at most 15). */
  palettes: string[][];
  /** Each tile's palette (tile n at [n - 1]). */
  tilePalettes: number[];
  stats: {
    tiles: number;
    palettes: number;
    colors: number;
    /** Tiles that had more than 15 colors, or whose colors no palette had room for. */
    approximated: number;
    /** Mean color error of the approximated pixels (OKLab x 100; under 3 is hard to see). */
    meanError: number;
  };
}

// every board color in OKLab, worked out once (the palette fitting measures millions of distances)
let LAB: Float32Array | null = null;
function labTable(): Float32Array {
  if (!LAB) {
    LAB = new Float32Array(4096 * 3);
    for (let k = 0; k < 4096; k++) LAB.set(toLab(rgbOfKey(k)), k * 3);
  }
  return LAB;
}
function lab(k: number): [number, number, number] {
  const t = labTable();
  return [t[k * 3]!, t[k * 3 + 1]!, t[k * 3 + 2]!];
}
const dist = (a: number, b: number) => {
  const t = labTable();
  const x = t[a * 3]! - t[b * 3]!;
  const y = t[a * 3 + 1]! - t[b * 3 + 1]!;
  const z = t[a * 3 + 2]! - t[b * 3 + 2]!;
  return x * x + y * y + z * z;
};
function nearest(k: number, pool: Iterable<number>): number {
  let best = k;
  let bd = Infinity;
  for (const c of pool) {
    const d = dist(k, c);
    if (d < bd) (bd = d), (best = c);
  }
  return best;
}

/** At most `max` colors for one tile: the most used ones, then each pixel to its nearest. */
function reduceColors(counts: Map<number, number>, max: number): Map<number, number> {
  const map = new Map<number, number>();
  if (counts.size <= max) {
    for (const k of counts.keys()) map.set(k, k);
    return map;
  }
  // start from the most used, then a farthest-point pick so a small bright detail keeps its color
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const keep = sorted.slice(0, Math.ceil(max / 2));
  while (keep.length < max) {
    let far = -1;
    let fd = -1;
    for (const k of sorted) {
      if (keep.includes(k)) continue;
      const d = Math.min(...keep.map((c) => dist(k, c))) * Math.sqrt(counts.get(k)!);
      if (d > fd) (fd = d), (far = k);
    }
    if (far < 0) break;
    keep.push(far);
  }
  for (const k of counts.keys()) map.set(k, nearest(k, keep));
  return map;
}

/** Rounds of palette refinement (each: tiles to palettes, then palettes' colors). */
const REFINE_ROUNDS = 8;

/**
 * Tiles grouped into the given palettes (at most 15 colors each) by
 * alternating: (1) each tile to the palette that shows its pixels best,
 * (2) each palette's 15 colors chosen again from the pixels of its tiles,
 * by weighted k-means in OKLab with each centre snapped to the nearest
 * color those pixels use (so exact colors stay exact). `assign` is updated
 * in place; the palettes come back.
 */
function refinePalettes(hists: Map<number, number>[], assign: number[], start: number[][], rounds: number): number[][] {
  let pals = start.map((p) => p.slice(0, 15));
  const t = labTable();
  // each tile's colors as flat arrays (key, count) for the inner loop
  const flat = hists.map((h) => ({ k: Int16Array.from(h.keys()), n: Float32Array.from(h.values()) }));
  const cost = (i: number, pal: number[], limit: number) => {
    const { k, n } = flat[i]!;
    let e = 0;
    for (let j = 0; j < k.length; j++) {
      const a = k[j]! * 3;
      let bd = Infinity;
      for (let q = 0; q < pal.length; q++) {
        const b = pal[q]! * 3;
        const x = t[a]! - t[b]!;
        const y = t[a + 1]! - t[b + 1]!;
        const z = t[a + 2]! - t[b + 2]!;
        const d = x * x + y * y + z * z;
        if (d < bd) {
          bd = d;
          if (!d) break;
        }
      }
      e += bd * n[j]!;
      // already worse than the best palette so far: stop counting
      if (e >= limit) return e;
    }
    return e;
  };
  for (let round = 0; round < rounds; round++) {
    hists.forEach((h, i) => {
      if (!h.size) return;
      let best = assign[i]! >= 0 ? assign[i]! : 0;
      let be = cost(i, pals[best]!, Infinity);
      pals.forEach((pal, pi) => {
        if (pi === best || !be) return;
        const e = cost(i, pal, be);
        if (e < be) (be = e), (best = pi);
      });
      assign[i] = best;
    });
    pals = pals.map((pal, pi) => {
      const hist = new Map<number, number>();
      hists.forEach((h, i) => {
        if (assign[i] === pi) for (const [k, n] of h) hist.set(k, (hist.get(k) ?? 0) + n);
      });
      if (!hist.size) return pal;
      if (hist.size <= 15) return [...hist.keys()];
      const keys = [...hist.keys()];
      let cent = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k]) => lab(k));
      for (let it = 0; it < 6; it++) {
        const sum = cent.map(() => [0, 0, 0, 0]);
        for (const [k, n] of hist) {
          const p = lab(k);
          let bi = 0;
          let bd = Infinity;
          cent.forEach((c, ci) => {
            const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
            if (d < bd) (bd = d), (bi = ci);
          });
          const s = sum[bi]!;
          s[0]! += p[0] * n;
          s[1]! += p[1] * n;
          s[2]! += p[2] * n;
          s[3]! += n;
        }
        cent = cent.map((c, ci) => (sum[ci]![3]! ? ([sum[ci]![0]! / sum[ci]![3]!, sum[ci]![1]! / sum[ci]![3]!, sum[ci]![2]! / sum[ci]![3]!] as [number, number, number]) : c));
      }
      const snapped = cent.map((c) => {
        let best = keys[0]!;
        let bd = Infinity;
        for (const k of keys) {
          const p = lab(k);
          const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
          if (d < bd) (bd = d), (best = k);
        }
        return best;
      });
      return [...new Set(snapped)];
    });
  }
  return pals;
}

/**
 * A board-scale picture as a background layer: tiles of `tile` px with at
 * most 15 colors each, spread over at most `maxPalettes` palettes of 15.
 */
export function fitLayer(img: KeyImage, tile: 16 | 32, maxPalettes = 32): FittedLayer {
  const cols = Math.ceil(img.w / tile);
  const rows = Math.ceil(img.h / tile);
  type T = { keys: Int16Array; colors: Map<number, number>; source: Int16Array; hist: Map<number, number> };
  const tiles: T[] = [];
  let approximated = 0;
  let errSum = 0;
  let errN = 0;
  // 1. each tile's colors, at most 15
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const keys = new Int16Array(tile * tile).fill(-1);
      const counts = new Map<number, number>();
      for (let y = 0; y < tile; y++)
        for (let x = 0; x < tile; x++) {
          const px = c * tile + x;
          const py = r * tile + y;
          if (px >= img.w || py >= img.h) continue;
          const k = img.keys[py * img.w + px]!;
          keys[y * tile + x] = k;
          if (k >= 0) counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      const source = keys.slice();
      const hist = new Map(counts);
      if (counts.size > 15) {
        approximated++;
        const map = reduceColors(counts, 15);
        const next = new Map<number, number>();
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i]!;
          if (k < 0) continue;
          const m = map.get(k)!;
          if (m !== k) (errSum += Math.sqrt(dist(k, m)) * 100), errN++;
          keys[i] = m;
          next.set(m, (next.get(m) ?? 0) + 1);
        }
        tiles.push({ keys, colors: next, source, hist });
      } else tiles.push({ keys, colors: counts, source, hist });
    }

  // 2. palettes: each tile into the palette that grows least; a new one while there is room
  const palettes: Set<number>[] = [];
  const tilePal = new Array<number>(tiles.length).fill(-1);
  const order = tiles.map((_, i) => i).filter((i) => tiles[i]!.colors.size).sort((a, b) => tiles[b]!.colors.size - tiles[a]!.colors.size);
  for (const i of order) {
    const set = tiles[i]!.colors;
    let best = -1;
    let grow = Infinity;
    palettes.forEach((p, pi) => {
      let add = 0;
      for (const k of set.keys()) if (!p.has(k)) add++;
      if (p.size + add <= 15 && (add < grow || (add === grow && best >= 0 && p.size < palettes[best]!.size))) (grow = add), (best = pi);
    });
    if (best >= 0 && (grow === 0 || palettes.length >= maxPalettes || grow <= 2)) {
      for (const k of set.keys()) palettes[best]!.add(k);
      tilePal[i] = best;
    } else if (palettes.length < maxPalettes) {
      palettes.push(new Set(set.keys()));
      tilePal[i] = palettes.length - 1;
    } else if (best >= 0) {
      for (const k of set.keys()) palettes[best]!.add(k);
      tilePal[i] = best;
    } else tilePal[i] = -2; // no room anywhere: mapped below
  }
  // a tile nothing could take goes to the palette that shows it best, its colors mapped to it
  for (const i of order) {
    if (tilePal[i] !== -2) continue;
    approximated++;
    const t = tiles[i]!;
    let best = 0;
    let be = Infinity;
    palettes.forEach((p, pi) => {
      let e = 0;
      for (const [k, n] of t.colors) e += dist(k, nearest(k, p)) * n;
      if (e < be) (be = e), (best = pi);
    });
    tilePal[i] = best;
    const pool = palettes[best]!;
    for (let j = 0; j < t.keys.length; j++) {
      const k = t.keys[j]!;
      if (k < 0 || pool.has(k)) continue;
      const m = nearest(k, pool);
      errSum += Math.sqrt(dist(k, m)) * 100;
      errN++;
      t.keys[j] = m;
    }
  }

  // 2b. when the colors did not fit exactly, refine the palettes from the tiles' own colors
  if (approximated) {
    const pals = refinePalettes(
      tiles.map((t) => t.hist),
      tilePal,
      palettes.map((p) => [...p]),
      REFINE_ROUNDS,
    );
    errSum = 0;
    errN = 0;
    tiles.forEach((t, i) => {
      if (!t.hist.size) return;
      const pool = pals[tilePal[i]!]!;
      const next = new Map<number, number>();
      for (let j = 0; j < t.keys.length; j++) {
        const k = t.source[j]!;
        if (k < 0) continue;
        const m = pool.includes(k) ? k : nearest(k, pool);
        if (m !== k) (errSum += Math.sqrt(dist(k, m)) * 100), errN++;
        t.keys[j] = m;
        next.set(m, (next.get(m) ?? 0) + 1);
      }
      t.colors = next;
    });
    palettes.splice(0, palettes.length, ...pals.map((p) => new Set(p)));
  }

  // 3. unique tiles, numbered from 1; an empty tile is 0
  const cells = new Uint16Array(cols * rows);
  const seen = new Map<string, number>();
  const unique: { keys: Int16Array; pal: number }[] = [];
  tiles.forEach((t, i) => {
    if (!t.colors.size) return;
    const pal = tilePal[i]!;
    const id = `${pal}:${t.keys.join(",")}`;
    let n = seen.get(id);
    if (n === undefined) {
      unique.push({ keys: t.keys, pal });
      n = unique.length;
      seen.set(id, n);
    }
    cells[i] = n;
  });
  const columns = 16;
  const tw = columns * tile;
  const th = Math.max(1, Math.ceil(unique.length / columns)) * tile;
  const data = new Uint8Array(tw * th * 4);
  unique.forEach((u, n) => {
    const ox = (n % columns) * tile;
    const oy = Math.floor(n / columns) * tile;
    for (let y = 0; y < tile; y++)
      for (let x = 0; x < tile; x++) {
        const k = u.keys[y * tile + x]!;
        if (k < 0) continue;
        const o = ((oy + y) * tw + ox + x) * 4;
        const [r, g, b] = rgbOfKey(k);
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
  });
  const allColors = new Set<number>();
  for (const p of palettes) for (const k of p) allColors.add(k);
  return {
    tile,
    cols,
    rows,
    cells,
    tileset: { w: tw, h: th, data, columns, count: unique.length },
    palettes: palettes.map((p) => [...p].map(hexOfKey)),
    tilePalettes: unique.map((u) => u.pal),
    stats: { tiles: unique.length, palettes: palettes.length, colors: allColors.size, approximated, meanError: errN ? errSum / errN : 0 },
  };
}

/** A layer's current art as board-color keys at level size (from its tileset picture and cells), to compose a new picture over it. */
export function layerKeys(w: number, h: number, tile: number, cells: ArrayLike<number>, tileset: Rgba | null, columns: number): KeyImage {
  const out: KeyImage = { w, h, keys: new Int16Array(w * h).fill(-1) };
  if (!tileset) return out;
  const cols = Math.ceil(w / tile);
  for (let i = 0; i < cells.length; i++) {
    const n = cells[i]!;
    if (!n) continue;
    const sx = ((n - 1) % columns) * tile;
    const sy = Math.floor((n - 1) / columns) * tile;
    const dx = (i % cols) * tile;
    const dy = Math.floor(i / cols) * tile;
    for (let y = 0; y < tile; y++)
      for (let x = 0; x < tile; x++) {
        const tx = dx + x;
        const ty = dy + y;
        if (tx >= w || ty >= h || sx + x >= tileset.w || sy + y >= tileset.h) continue;
        const o = ((sy + y) * tileset.w + sx + x) * 4;
        if (tileset.data[o + 3]! < 128) continue;
        out.keys[ty * w + tx] = key(tileset.data[o]!, tileset.data[o + 1]!, tileset.data[o + 2]!);
      }
  }
  return out;
}
