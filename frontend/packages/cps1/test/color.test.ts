// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { cps1Colors, deltaE, fromLab, fullBrightnessColors, hexOf, kmeans, rgbOf, toBoardColor, toBoardColorExhaustive, toCps1, toLab } from "../src";

describe("color", () => {
  it("round-trips sRGB through OKLab", () => {
    for (const rgb of [
      [0, 0, 0],
      [255, 255, 255],
      [204, 51, 17],
      [17, 136, 238],
    ])
      expect(fromLab(toLab(rgb))).toEqual(rgb);
  });

  it("knows the board's colors and their palette words", () => {
    const all = cps1Colors();
    expect(all.length).toBeGreaterThan(4096);
    expect(new Set(all.map((c) => c.rgb.join(","))).size).toBe(all.length);
    // brightness 15 gives each channel value * 17
    expect(toCps1([255, 0, 0])).toMatchObject({ rgb: [255, 0, 0], err: 0 });
    expect(toCps1([255, 0, 0]).word).toBe(0xff00);
    // a low brightness reaches dark shades 17 cannot
    const dark = toCps1([6, 6, 6]);
    expect(dark.rgb).toEqual([6, 6, 6]);
    expect(dark.word >> 12).toBeLessThan(15);
  });

  it("snaps to the 4096 full-brightness colors", () => {
    expect(fullBrightnessColors()).toHaveLength(4096);
    const c = toBoardColor([250, 130, 5]);
    expect(c.rgb.every((v) => v % 17 === 0)).toBe(true);
    expect(c.word >> 12).toBe(15);
    expect(c.err).toBeLessThan(3);
    expect(hexOf(toBoardColor([255, 204, 153]).rgb)).toBe("#FFCC99");
  });

  it("the fast board snap matches the full search", () => {
    // a fixed pseudo-random walk over the color cube (no Math.random: same run every time)
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 255;
    for (let i = 0; i < 20000; i++) {
      const rgb = [next(), next(), next()];
      expect(toBoardColor(rgb).word).toBe(toBoardColorExhaustive(rgb).word);
    }
  });

  it("reads and writes hex colors", () => {
    expect(rgbOf("#ff00FF")).toEqual([255, 0, 255]);
    expect(rgbOf("nope")).toBeNull();
    expect(hexOf([1, 2, 255])).toBe("#0102FF");
  });

  it("measures delta E in OKLab x 100", () => {
    expect(deltaE(toLab([10, 10, 10]), toLab([10, 10, 10]))).toBe(0);
    expect(deltaE(toLab([0, 0, 0]), toLab([255, 255, 255]))).toBeCloseTo(100, 0);
  });

  it("k-means is deterministic and keeps fixed centers", () => {
    const pts = [
      [255, 0, 0],
      [250, 5, 5],
      [0, 0, 255],
      [5, 5, 250],
      [0, 255, 0],
    ].map((rgb, i) => ({ lab: toLab(rgb), w: i + 1 }));
    const black = toLab([0, 0, 0]);
    const a = kmeans(pts, 3, { fixed: [black] });
    expect(a).toEqual(kmeans(pts, 3, { fixed: [black] }));
    expect(a[0]).toEqual(black);
    expect(kmeans(pts.slice(0, 1), 4)).toHaveLength(1);
  });
});
