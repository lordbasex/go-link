// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodePng, encodePng } from "../io/png";
import { fitLayer, hexOfKey, keysOf, layerKeys, pixelSize, place, scalePicture, type Rgba } from "./picture";

/** A picture drawn at `s` x: blocks of `s` pixels, with `colors` different colors spread over it. */
function pixelArt(w: number, h: number, s: number, colors: number): Rgba {
  const data = new Uint8Array(w * s * h * s * 4);
  for (let y = 0; y < h * s; y++)
    for (let x = 0; x < w * s; x++) {
      const c = (Math.floor(x / s) * 7 + Math.floor(y / s) * 13) % colors;
      const o = (y * w * s + x) * 4;
      data[o] = (c * 37) % 256;
      data[o + 1] = (c * 91) % 256;
      data[o + 2] = (c * 53) % 256;
      data[o + 3] = 255;
    }
  return { w: w * s, h: h * s, data };
}

describe("own backgrounds (T-28)", () => {
  it("finds the pixel size of pixel art drawn big and scales it back pixel for pixel", () => {
    const src = pixelArt(96, 56, 4, 6);
    expect(pixelSize(src)).toBe(4);
    const img = scalePicture(src, 56);
    expect([img.w, img.h]).toEqual([96, 56]);
    const exact = keysOf(pixelArt(96, 56, 1, 6));
    expect(img.keys).toEqual(exact.keys);
  });

  it("reads an image AI's #FF00FF magenta background as transparent when asked (T-29)", () => {
    const src = pixelArt(96, 56, 4, 6);
    // the left half on magenta, a little off as image AIs draw it
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w / 2; x++) src.data.set([250, 8, 246, 255], (y * src.w + x) * 4);
    const keyed = scalePicture(src, 56, true);
    expect(keyed.keys.slice(0, 48).every((k) => k < 0)).toBe(true);
    expect(keyed.keys.slice(48, 96).every((k) => k >= 0)).toBe(true);
    // without the option, magenta is a color like any other
    expect(scalePicture(src, 56).keys.slice(0, 48).every((k) => k >= 0)).toBe(true);
  });

  it("fits a layer: at most 15 colors per tile, palettes per tile, unique tiles", () => {
    const img = keysOf(pixelArt(64, 32, 1, 40));
    const fit = fitLayer(img, 16);
    expect(fit.cols).toBe(4);
    expect(fit.rows).toBe(2);
    expect(fit.palettes.every((p) => p.length <= 15)).toBe(true);
    expect(fit.tilePalettes).toHaveLength(fit.tileset.count);
    expect(fit.cells.every((n) => n >= 1 && n <= fit.tileset.count)).toBe(true);
    // every tile's colors are in its palette
    for (let n = 1; n <= fit.tileset.count; n++) {
      const pal = new Set(fit.palettes[fit.tilePalettes[n - 1]!]);
      const ox = ((n - 1) % fit.tileset.columns) * 16;
      const oy = Math.floor((n - 1) / fit.tileset.columns) * 16;
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const o = ((oy + y) * fit.tileset.w + ox + x) * 4;
          if (!fit.tileset.data[o + 3]) continue;
          const hex = `#${[0, 1, 2].map((k) => fit.tileset.data[o + k]!.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
          expect(pal.has(hex)).toBe(true);
        }
    }
  });

  it("deduplicates repeated tiles and keeps transparent cells empty", () => {
    const one = keysOf(pixelArt(16, 16, 1, 5));
    const wide = { w: 64, h: 16, keys: new Int16Array(64 * 16).fill(-1) };
    place(wide, one, 0, 0, true);
    const fit = fitLayer(wide, 16);
    expect(fit.tileset.count).toBe(1);
    expect([...fit.cells]).toEqual([1, 1, 1, 1]);
    const holes = { w: 32, h: 16, keys: new Int16Array(32 * 16).fill(-1) };
    place(holes, one, 0);
    expect([...fitLayer(holes, 16).cells]).toEqual([1, 0]);
  });

  it("reads a layer back from its tileset to compose another picture over it", () => {
    const img = keysOf(pixelArt(48, 16, 1, 9));
    const fit = fitLayer(img, 16);
    const back = layerKeys(48, 16, 16, fit.cells, fit.tileset, fit.tileset.columns);
    expect(back.keys).toEqual(img.keys);
  });

  const SAMPLE = process.env.WM_PICTURE;
  it.skipIf(!SAMPLE || !existsSync(SAMPLE))("fits a real picture (WM_PICTURE) and writes a preview", async () => {
    const png = await decodePng(new Uint8Array(readFileSync(SAMPLE!)));
    const src = { w: png.w, h: png.h, data: png.data };
    const t0 = performance.now();
    const px = pixelSize(src);
    const img = scalePicture(src, 224);
    const fit = fitLayer(img, 16);
    const ms = performance.now() - t0;
    console.log(`picture ${png.w}x${png.h}, pixel size ${px}, board ${img.w}x${img.h}: ${fit.stats.tiles} tiles, ${fit.stats.palettes} palettes, ${fit.stats.colors} colors, ${fit.stats.approximated} approximated tiles, mean error ${fit.stats.meanError.toFixed(2)}, ${Math.round(ms)} ms`);
    const back = layerKeys(img.w, img.h, 16, fit.cells, fit.tileset, fit.tileset.columns);
    const rgba = new Uint8Array(img.w * img.h * 4);
    back.keys.forEach((k, i) => {
      if (k < 0) return;
      rgba.set([((k >> 8) & 15) * 17, ((k >> 4) & 15) * 17, (k & 15) * 17, 255], i * 4);
    });
    if (process.env.WM_PICTURE_OUT) writeFileSync(process.env.WM_PICTURE_OUT, encodePng(img.w, img.h, rgba));
    expect(fit.stats.palettes).toBeLessThanOrEqual(32);
  });
});

describe("palette refinement", () => {
  it("keeps the board's limits when a picture needs more palettes than it has, and brings the colors closer", () => {
    // 80 tiles of 16 x 16, each its own band of 15 colors: far more than 32 palettes of 15 could hold exactly
    const w = 16 * 10;
    const h = 16 * 8;
    const keys = new Int16Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const t = Math.floor(y / 16) * 10 + Math.floor(x / 16);
        const r = (t * 7) % 16;
        const g = (t * 3 + (x % 16)) % 16;
        const b = (y % 16) % 15;
        keys[y * w + x] = (r << 8) | (g << 4) | b;
      }
    const f = fitLayer({ w, h, keys }, 16);
    expect(f.palettes.length).toBeLessThanOrEqual(32);
    for (const p of f.palettes) expect(p.length).toBeLessThanOrEqual(15);
    // every tile shows only its palette's colors
    const out = layerKeys(w, h, 16, f.cells, f.tileset, f.tileset.columns);
    for (let i = 0; i < f.cells.length; i++) {
      const pal = new Set(f.palettes[f.tilePalettes[f.cells[i]! - 1]!]!);
      const c = i % 10;
      const r = Math.floor(i / 10);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) expect(pal.has(hexOfKey(out.keys[(r * 16 + y) * w + c * 16 + x]!))).toBe(true);
    }
    expect(f.stats.approximated).toBeGreaterThan(0);
    expect(f.stats.meanError).toBeLessThan(12);
  });
});
