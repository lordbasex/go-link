// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { snapColor } from "../board/cps1";
import { colorAt } from "./pixels";
import { pathPoints, parseTransform, svgShapes } from "./svg";
import { downsampleMode } from "./tools";
import { rasterize } from "./vector";

const svg = (body: string, attrs = 'viewBox="0 0 100 100"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
const feet = { x: 16, y: 43 };

describe("SVG files as shapes", () => {
  it("reads transforms left to right", () => {
    expect(parseTransform("translate(10 5) scale(2)")).toEqual([2, 0, 0, 2, 10, 5]);
    const r = parseTransform("rotate(90)");
    expect(r.map((n) => Math.round(n))).toEqual([0, 1, -1, 0, 0, 0]);
  });

  it("cuts a path into points: lines, relative moves, curves, arcs and closed subpaths", () => {
    const [a, b] = pathPoints("M0 0 H10 V10 Z m20 0 l5 5");
    expect(a).toEqual({ points: [[0, 0], [10, 0], [10, 10]], closed: true });
    expect(b).toEqual({ points: [[20, 0], [25, 5]], closed: false });
    const curve = pathPoints("M0 0 C0 10 10 10 10 0")[0]!.points;
    expect(curve).toHaveLength(9);
    expect(curve[8]).toEqual([10, 0]);
    const arc = pathPoints("M0 0 A5 5 0 0 1 10 0")[0]!.points;
    expect(arc[arc.length - 1]!.map((n) => Math.round(n))).toEqual([10, 0]);
    // the half circle goes above the line (sweep 1 in SVG's downward y)
    expect(Math.min(...arc.map((p) => p[1]))).toBeLessThan(-4);
  });

  it("fits the drawing into the frame on its feet, in the board's colors", () => {
    const got = svgShapes(svg('<rect width="100" height="100" fill="#123456"/><circle cx="50" cy="50" r="25" fill="red" stroke="black" stroke-width="4"/>'), 32, 44, feet, snapColor)!;
    expect(got.skipped).toBe(0);
    expect(got.shapes).toHaveLength(2);
    // a square drawing as wide as the frame (32 px), standing on row 43
    expect(got.shapes[0]).toEqual({ kind: "rect", points: [[0, 12], [31, 43]], fill: "#113355", stroke: null, width: 0 });
    expect(got.shapes[1]).toMatchObject({ kind: "ellipse", fill: "#ff0000", stroke: "#000000", width: 1 });
  });

  it("follows groups, classes, style and transforms, and leaves out what the board cannot show", () => {
    const text = svg(
      `<style>.a{fill:#00ff00}</style><defs><linearGradient id="g"><stop offset="0" stop-color="#0000ff"/></linearGradient></defs>
       <g fill="#ff0000" transform="translate(50 0)"><rect class="a" width="50" height="50"/><rect y="50" width="50" height="50" style="fill:url(#g)"/></g>
       <rect width="50" height="100" transform="rotate(10)"/><text>hi</text><image href="x.png"/><rect width="10" height="10" fill-opacity="0.1"/>`,
    );
    const got = svgShapes(text, 32, 44, feet, snapColor)!;
    expect(got.skipped).toBe(2);
    expect(got.shapes.map((s) => [s.kind, s.fill])).toEqual([
      ["rect", "#00ff00"],
      ["rect", "#0000ff"],
      ["polygon", "#000000"],
    ]);
  });

  it("turns open paths without fill into lines and refuses what is not an SVG", () => {
    const got = svgShapes(svg('<polyline points="0 0 50 50 100 0" fill="none" stroke="#fff"/>'), 32, 44, feet, snapColor)!;
    expect(got.shapes.map((s) => s.kind)).toEqual(["line", "line"]);
    expect(svgShapes("<html></html>", 32, 44, feet, snapColor)).toBeNull();
    expect(svgShapes("not xml", 32, 44, feet, snapColor)).toBeNull();
  });

  it("draws an imported SVG as pixels on the board", () => {
    const got = svgShapes(svg('<circle cx="50" cy="50" r="50" fill="#ffcc00"/>'), 32, 44, feet, snapColor)!;
    const p = rasterize(got.shapes, 32, 44);
    expect(colorAt(p, 16, 30)).toBe("#ffcc00");
    expect(colorAt(p, 0, 12)).toBeNull();
  });
});

describe("an SVG drawn bigger and brought down", () => {
  it("keeps each block's most common color and drops blocks mostly see-through", () => {
    // 2 × 1 pixels drawn at 2×: the left block 3 red + 1 smoothed pink, the right block 1 red + 3 clear
    const px = (r: number, g: number, b: number, a: number) => [r, g, b, a];
    const data = [...px(255, 0, 0, 255), ...px(255, 0, 0, 255), ...px(255, 0, 0, 255), ...px(0, 0, 0, 0), ...px(255, 0, 0, 255), ...px(250, 120, 120, 255), ...px(0, 0, 0, 0), ...px(0, 0, 0, 0)];
    const out = downsampleMode({ w: 4, h: 2, data }, 2, snapColor);
    expect([colorAt(out, 0, 0), colorAt(out, 1, 0)]).toEqual(["#ff0000", null]);
  });
});
