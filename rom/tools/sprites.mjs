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
//     (color.mjs). No dithering. The error is measured and reported.

import { cps1Colors, deltaE, dist2, fromLab, kmeans, toCps1, toLab } from "./color.mjs";

const TRANSPARENT = 15;

/**
 * How strongly color changes line up on a grid of period p (1.0 = not at
 * all, p = every change on the grid): the test for a native pixel grid.
 */
export function gridScore(img, frames, periods = [2, 3, 4, 5, 6, 8]) {
  const xs = [];
  for (const f of frames)
    for (let y = f.y; y < f.y + f.h; y += 2)
      for (let x = f.x + 1; x < f.x + f.w; x++) {
        const o = (y * img.w + x) * 4;
        if (img.rgba[o + 3] < 128 || img.rgba[o - 1] < 128) continue;
        const d = Math.abs(img.rgba[o] - img.rgba[o - 4]) + Math.abs(img.rgba[o + 1] - img.rgba[o - 3]) + Math.abs(img.rgba[o + 2] - img.rgba[o - 2]);
        if (d > 60) xs.push(x - f.x);
      }
  return Object.fromEntries(
    periods.map((p) => {
      const h = new Array(p).fill(0);
      for (const x of xs) h[x % p]++;
      return [p, +((Math.max(...h) / xs.length) * p).toFixed(2)];
    }),
  );
}

/** Downscale one atlas frame by the dominant color of each footprint. */
export function downscaleDominant(img, f, s) {
  const w = Math.max(1, Math.round(f.w * s));
  const h = Math.max(1, Math.round(f.h * s));
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(f.x + x / s);
      const x1 = Math.max(x0 + 1, Math.floor(f.x + (x + 1) / s));
      const y0 = Math.floor(f.y + y / s);
      const y1 = Math.max(y0 + 1, Math.floor(f.y + (y + 1) / s));
      let n = 0;
      let opaque = 0;
      const buckets = new Map();
      for (let sy = y0; sy < y1 && sy < f.y + f.h; sy++)
        for (let sx = x0; sx < x1 && sx < f.x + f.w; sx++) {
          n++;
          const o = (sy * img.w + sx) * 4;
          if (img.rgba[o + 3] < 128) continue;
          opaque++;
          const rgb = [img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]];
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
      let best = null;
      for (const b of buckets.values()) if (!best || b.n > best.n || (b.n === best.n && b.L < best.L)) best = b;
      const o = (y * w + x) * 4;
      out[o] = best.sum[0] / best.n;
      out[o + 1] = best.sum[1] / best.n;
      out[o + 2] = best.sum[2] / best.n;
      out[o + 3] = 255;
    }
  return { w, h, rgba: out, px: Math.round(f.px * s), py: Math.round(f.py * s) };
}

/** Cuts a frame into 16x16 tiles, feet on the bottom row; empty tiles dropped. */
function cutTiles(fr) {
  const nx = Math.ceil(fr.w / 16);
  const ny = Math.ceil(fr.h / 16);
  const oy = ny * 16 - fr.h;
  const tiles = [];
  for (let ty = 0; ty < ny; ty++)
    for (let tx = 0; tx < nx; tx++) {
      const px = [];
      let any = false;
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const sx = tx * 16 + x;
          const sy = ty * 16 + y - oy;
          let c = null;
          if (sx < fr.w && sy >= 0 && sy < fr.h) {
            const o = (sy * fr.w + sx) * 4;
            if (fr.rgba[o + 3]) c = [fr.rgba[o], fr.rgba[o + 1], fr.rgba[o + 2]];
          }
          if (c) any = true;
          px.push(c ? { rgb: c, lab: toLab(c) } : null);
        }
      if (any) tiles.push({ dx: tx * 16, dy: ty * 16, px });
    }
  return { nx, ny, ax: fr.px, ay: fr.py + oy, tiles };
}

/** Unique colors of some pixels with weights (count ^ 0.6: accents count more). */
function weightedPoints(pixels) {
  const m = new Map();
  for (const p of pixels) {
    const key = p.rgb.join(",");
    const e = m.get(key) || { lab: p.lab, n: 0 };
    e.n++;
    m.set(key, e);
  }
  return [...m.values()].map((e) => ({ lab: e.lab, w: e.n ** 0.6, n: e.n }));
}

/** 15 CPS-1 colors for some pixels: k-means in OKLab, then snapped to the board. */
function makePalette(pixels, outline, keep = []) {
  // colors to keep exactly (e.g. a shirt a palette swap recolors), when used here
  const used = keep.filter((k) => pixels.some((p) => p.rgb.join(",") === k.join(","))).map(toLab);
  const centers = kmeans(weightedPoints(pixels), 15, { fixed: [...(outline ? [outline] : []), ...used] });
  const seen = new Set();
  const pal = [];
  for (const c of centers) {
    const hw = toCps1(fromLab(c));
    const key = hw.rgb.join(",");
    if (seen.has(key)) continue; // two centers on one board color
    seen.add(key);
    pal.push(hw);
  }
  return pal;
}

const nearestPen = (pal, lab) => {
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

const tileCost = (tile, pal) => tile.px.reduce((s, p) => (p ? s + nearestPen(pal, p.lab).d : s), 0);

/**
 * Converts a character: frames (already downscaled) -> palettes (each 15
 * CPS-1 colors) and, per frame, the tiles with their palette and pens.
 */
export function convertCharacter(frames, nPalettes, { keep = [] } = {}) {
  const cut = frames.map(cutTiles);
  const tiles = cut.flatMap((c) => c.tiles);
  const all = tiles.flatMap((t) => t.px.filter(Boolean));
  // the outline: the darkest color that covers at least 1 % of the pixels
  const pts = weightedPoints(all).sort((a, b) => a.lab[0] - b.lab[0]);
  const outline = (pts.find((p) => p.n >= all.length * 0.01) || pts[0]).lab;

  // group tiles by the colors they use: a histogram over 32 global colors
  const global = kmeans(weightedPoints(all), 32);
  const hist = tiles.map((t) => {
    const hgm = new Array(global.length).fill(0);
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
        hgm[bi]++;
        n++;
      }
    return hgm.map((v) => v / n);
  });
  const hd = (a, b) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
  // deterministic start: the tile with most pixels, then the farthest ones
  const sizes = tiles.map((t) => t.px.filter(Boolean).length);
  let seeds = [sizes.indexOf(Math.max(...sizes))];
  while (seeds.length < Math.min(nPalettes, tiles.length)) {
    let bi = 0;
    let bs = -1;
    hist.forEach((h, i) => {
      const s = Math.min(...seeds.map((j) => hd(h, hist[j]))) * Math.sqrt(sizes[i]);
      if (s > bs) {
        bs = s;
        bi = i;
      }
    });
    seeds.push(bi);
  }
  let centers = seeds.map((i) => hist[i].slice());
  let group = new Array(tiles.length).fill(0);
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
      return c.map((_, k) => members.reduce((s, h) => s + h[k] * sizes[hist.indexOf(h)], 0) / members.reduce((s, h) => s + sizes[hist.indexOf(h)], 0));
    });
  }
  // palettes per group, then every tile moves to the palette that draws it best
  let palettes = [];
  for (let round = 0; round < 3; round++) {
    palettes = centers.map((_, gi) => {
      const px = tiles.filter((_, i) => group[i] === gi).flatMap((t) => t.px.filter(Boolean));
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
    t.pal = group[i];
    t.pens = t.px.map((p) => {
      if (!p) return TRANSPARENT;
      const { pen, d } = nearestPen(palettes[t.pal], p.lab);
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
export function renderFrame(conv, fi) {
  const f = conv.frames[fi];
  const w = f.nx * 16;
  const h = f.ny * 16;
  const rgba = Buffer.alloc(w * h * 4);
  for (const t of f.tiles)
    t.pens.forEach((pen, i) => {
      if (pen === TRANSPARENT) return;
      const o = ((t.dy + (i >> 4)) * w + t.dx + (i & 15)) * 4;
      [rgba[o], rgba[o + 1], rgba[o + 2]] = conv.palettes[t.pal][pen].rgb;
      rgba[o + 3] = 255;
    });
  return { w, h, rgba };
}

export { cps1Colors, deltaE };
