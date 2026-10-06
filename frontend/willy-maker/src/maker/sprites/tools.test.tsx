// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { blank, colorAt, stroke, type Pixels } from "./pixels";
import { boxBetween, fitPicture, lift, outline, recolorBands, replaceColor, resizeCanvas, resizeOffset, rotate, stamp, zoneMerges } from "./tools";

const R = "#ff0000";
const B = "#0000ff";
const G = "#00ff00";
const row = (p: Pixels, y: number) => Array.from({ length: p.w }, (_, x) => ({ [R]: "R", [B]: "B", [G]: "G" })[colorAt(p, x, y) ?? ""] ?? ".").join("");
const dots = (p: Pixels, pts: [number, number, string][]) => pts.reduce((q, [x, y, c]) => stroke(q, x, y, x, y, c), p);

describe("the pixel editor's tools", () => {
  it("lifts a box off a picture and puts it down elsewhere, see-through pixels leaving what is under them", () => {
    const p = dots(blank(5, 2), [[0, 0, R], [1, 0, B], [4, 1, G]]);
    expect(boxBetween(p, 3, 1, -2, 0)).toEqual({ x: 0, y: 0, w: 4, h: 2 });
    const { piece, rest } = lift(p, { x: 0, y: 0, w: 2, h: 1 });
    expect(row(piece, 0)).toBe("RB");
    expect(row(rest, 0)).toBe(".....");
    expect(row(stamp(rest, piece, 3, 1), 1)).toBe("...RB");
    expect(row(stamp(p, dots(blank(2, 1), [[1, 0, G]]), 0, 0), 0)).toBe("RG...");
  });

  it("turns a picture a quarter clockwise", () => {
    const r = rotate(dots(blank(3, 1), [[0, 0, R], [2, 0, B]]));
    expect([r.w, r.h]).toEqual([1, 3]);
    expect([0, 1, 2].map((y) => row(r, y))).toEqual(["R", ".", "B"]);
  });

  it("replaces a color and outlines a drawing", () => {
    const p = dots(blank(5, 3), [[1, 1, R], [2, 1, R], [4, 0, B]]);
    expect(row(replaceColor(p, R, G), 1)).toBe(".GG..");
    expect(replaceColor(p, G, R)).toBe(p);
    const o = outline(dots(blank(5, 3), [[2, 1, R]]), B);
    expect([0, 1, 2].map((y) => row(o, y))).toEqual(["..B..", ".BRB.", "..B.."]);
  });

  it("merges a zone's least used colors into the nearest of the ones kept, over every frame", () => {
    // the feet row: R twice, G twice over the two frames, B once; two colors are kept, and B looks nearer R
    const a = dots(blank(3, 1), [[0, 0, R], [1, 0, R], [2, 0, G]]);
    const b = dots(blank(3, 1), [[0, 0, B], [1, 0, G]]);
    const merges = zoneMerges([{ pic: a, feetY: 0 }, { pic: b, feetY: 0 }], 2);
    expect([...merges[0]!]).toEqual([[B, R]]);
    expect(row(recolorBands(b, 0, merges), 0)).toBe("RG.");
    expect(zoneMerges([{ pic: a, feetY: 0 }], 15)[0]!.size).toBe(0);
  });

  it("puts a picture in a new canvas size, as centred and as far from the bottom as before", () => {
    expect(resizeOffset(8, 8, 10, 12)).toEqual({ dx: 1, dy: 4 });
    const p = resizeCanvas(dots(blank(2, 2), [[0, 1, R]]), 4, 3, 1, 1);
    expect(row(p, 2)).toBe(".R..");
  });

  it("fits a pasted picture into the frame: never larger, see-through kept, colors snapped", () => {
    const data = new Uint8Array(4 * 4 * 4);
    // two solid columns, then two see-through ones
    for (let i = 0; i < 16; i++) data.set(i % 4 < 2 ? [250, 2, 3, 255] : [0, 0, 0, 0], i * 4);
    const fit = fitPicture({ w: 4, h: 4, data }, 2, 8, () => R);
    expect([fit.w, fit.h]).toEqual([2, 2]);
    expect(row(fit, 0)).toBe("R.");
    expect(fitPicture({ w: 4, h: 4, data }, 40, 40, () => R).w).toBe(4);
  });
});
