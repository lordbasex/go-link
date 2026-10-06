// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { colorAt, type Pixels } from "./pixels";
import { boxOf, cleanShapes, moveShape, rasterize, resizeShape, shapeAt, type Shape } from "./vector";

const R = "#ff0000";
const B = "#0000ff";
const row = (p: Pixels, y: number) => Array.from({ length: p.w }, (_, x) => (colorAt(p, x, y) === null ? "." : colorAt(p, x, y) === R ? "R" : "B")).join("");
const rect = (fill: string | null, stroke: string | null, width: number): Shape => ({ kind: "rect", points: [[0, 0], [4, 3]], fill, stroke, width });

describe("vector shapes", () => {
  it("turns a rectangle into pixels: its fill, its outline, or both", () => {
    expect([0, 1, 3].map((y) => row(rasterize([rect(B, R, 1)], 5, 4), y))).toEqual(["RRRRR", "RBBBR", "RRRRR"]);
    expect(row(rasterize([rect(B, null, 0)], 5, 4), 0)).toBe("BBBBB");
    expect(row(rasterize([rect(null, R, 1)], 5, 4), 1)).toBe("R...R");
    // a wider outline eats into the inside
    expect(row(rasterize([{ ...rect(B, R, 2), points: [[0, 0], [5, 5]] }], 6, 6), 2)).toBe("RR..RR".replace(/\./g, "B"));
  });

  it("draws ellipses, polygons and lines, the later shapes over the earlier", () => {
    const disc: Shape = { kind: "ellipse", points: [[0, 0], [4, 4]], fill: R, stroke: null, width: 0 };
    expect(row(rasterize([disc], 5, 5), 2)).toBe("RRRRR");
    expect(row(rasterize([disc], 5, 5), 0)).toBe(".RRR.");
    const tri: Shape = { kind: "polygon", points: [[0, 4], [4, 4], [2, 0]], fill: B, stroke: null, width: 0 };
    expect(row(rasterize([tri], 5, 5), 3)).toBe(".BBB.");
    const line: Shape = { kind: "line", points: [[0, 2], [4, 2]], fill: null, stroke: R, width: 1 };
    expect(row(rasterize([tri, line], 5, 5), 2)).toBe("RRRRR");
  });

  it("finds the shape under a pixel, the top one first, and moves and resizes it", () => {
    const shapes = [rect(B, null, 0), { ...rect(R, null, 0), points: [[2, 1], [3, 2]] as [number, number][] }];
    expect(shapeAt(shapes, 5, 4, 2, 2)).toBe(1);
    expect(shapeAt(shapes, 5, 4, 0, 0)).toBe(0);
    expect(shapeAt([rect(B, null, 0)], 6, 6, 5, 5)).toBe(-1);
    expect(boxOf(moveShape(shapes[1]!, 1, 1))).toEqual({ x: 3, y: 2, w: 1, h: 1 });
    expect(boxOf(resizeShape(shapes[0]!, 8, 6))).toEqual({ x: 0, y: 0, w: 8, h: 6 });
  });

  it("reads shapes back from a file, leaving the bad ones out", () => {
    expect(cleanShapes([{ kind: "rect", points: [[0, 0], [2.4, 3]], fill: "#ABCDEF", stroke: "red", width: 99 }, { kind: "star" }, { kind: "polygon", points: [[0, 0], [1, 1]] }])).toEqual([
      { kind: "rect", points: [[0, 0], [2, 3]], fill: "#abcdef", stroke: null, width: 8 },
    ]);
  });
});
