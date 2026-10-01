// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { TRANSPARENT, convertCharacter, downscaleDominant, gridScore, renderFrame, type Image } from "../src";

/** A w x h picture: a black outline box filled with two colors, transparent around. */
function figure(w: number, h: number): Image {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      const o = (y * w + x) * 4;
      const edge = y === 2 || y === h - 3 || x === 2 || x === w - 3;
      const c = edge ? [0, 0, 0] : y < h / 2 ? [238, 153, 102] : [34, 68, 170];
      rgba.set([...c, 255], o);
    }
  return { w, h, rgba };
}

describe("sprites", () => {
  it("downscales by the dominant color, never blending", () => {
    const img = figure(40, 80);
    const fr = downscaleDominant(img, { x: 0, y: 0, w: 40, h: 80, px: 20, py: 80 }, 0.5);
    expect(fr).toMatchObject({ w: 20, h: 40, px: 10, py: 40 });
    const colors = new Set<string>();
    for (let i = 0; i < fr.w * fr.h; i++) if (fr.rgba[i * 4 + 3]) colors.add([...fr.rgba.subarray(i * 4, i * 4 + 3)].join(","));
    expect([...colors].sort()).toEqual(["0,0,0", "238,153,102", "34,68,170"].sort());
  });

  it("converts frames to 16x16 tiles with board palettes", () => {
    const img = figure(24, 40);
    const fr = downscaleDominant(img, { x: 0, y: 0, w: 24, h: 40, px: 12, py: 40 }, 1);
    const conv = convertCharacter([fr, fr], 2);
    expect(conv.frames).toHaveLength(2);
    expect(conv.frames[0]).toMatchObject({ nx: 2, ny: 3 });
    expect(conv.palettes.length).toBeLessThanOrEqual(2);
    for (const p of conv.palettes) expect(p.length).toBeLessThanOrEqual(15);
    // these colors are all on the board: no error at all
    expect(conv.stats.meanDeltaE).toBe(0);
    const pic = renderFrame(conv, 0);
    expect(pic).toMatchObject({ w: 32, h: 48 });
    // feet on the bottom row: the picture's last opaque row is the tile grid's
    const opaqueRow = (y: number) => [...Array(pic.w).keys()].some((x) => pic.rgba[(y * pic.w + x) * 4 + 3]);
    expect(opaqueRow(pic.h - 3)).toBe(true);
    expect(conv.frames[0]!.tiles.every((t) => t.pens.length === 256)).toBe(true);
    expect(conv.frames[0]!.tiles.some((t) => t.pens.includes(TRANSPARENT))).toBe(true);
  });

  it("is deterministic", () => {
    const fr = downscaleDominant(figure(32, 32), { x: 0, y: 0, w: 32, h: 32, px: 16, py: 32 }, 1);
    expect(convertCharacter([fr], 1)).toEqual(convertCharacter([fr], 1));
  });

  it("scores a native pixel grid", () => {
    const w = 64;
    const rgba = new Uint8Array(w * 8 * 4);
    for (let y = 0; y < 8; y++) for (let x = 0; x < w; x++) rgba.set([((x >> 2) & 1) * 255, 0, 0, 255], (y * w + x) * 4);
    const s = gridScore({ w, h: 8, rgba }, [{ x: 0, y: 0, w, h: 8, px: 0, py: 0 }]);
    expect(s[4]).toBe(4);
    expect(s[3]).toBeLessThan(3);
  });
});
