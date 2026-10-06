// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { spritesEn } from "../i18n/sprites.en";
import { bandColors, blank, colorAt, colorsOf, ellipse, fill, flip, linePoints, rect, stroke, type Pixels } from "./pixels";
import { PixelEditor } from "./ui/PixelEditor";

const R = "#ff0000";
const B = "#0000ff";
const row = (p: Pixels, y: number) => Array.from({ length: p.w }, (_, x) => (colorAt(p, x, y) === null ? "." : colorAt(p, x, y) === R ? "R" : "B")).join("");

describe("pixels", () => {
  it("draws a line pixel by pixel, both ends included", () => {
    expect(linePoints(0, 0, 3, 1)).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 1],
    ]);
    const p = stroke(blank(4, 1), 0, 0, 3, 0, R);
    expect(row(p, 0)).toBe("RRRR");
    // a wider brush and the eraser
    expect(row(stroke(blank(5, 3), 2, 1, 2, 1, R, 3), 0)).toBe(".RRR.");
    expect(row(stroke(p, 1, 0, 2, 0, null), 0)).toBe("R..R");
  });

  it("draws rectangles and ellipses, outlined or filled, and never changes the picture it gets", () => {
    const base = blank(5, 5);
    const outline = rect(base, 0, 0, 4, 4, R, false);
    expect([0, 2, 4].map((y) => row(outline, y))).toEqual(["RRRRR", "R...R", "RRRRR"]);
    expect(row(rect(base, 4, 4, 0, 0, R, true), 2)).toBe("RRRRR");
    expect(colorsOf(base)).toEqual([]);
    const disc = ellipse(blank(5, 5), 0, 0, 4, 4, B, true);
    expect([0, 2].map((y) => row(disc, y))).toEqual([".BBB.", "BBBBB"]);
    expect(row(ellipse(blank(5, 5), 0, 0, 4, 4, B, false), 2)).toBe("B...B");
  });

  it("fills an area of one color, side by side only, and flips", () => {
    let p = rect(blank(5, 3), 0, 0, 4, 2, R, false);
    p = fill(p, 2, 1, B);
    expect(row(p, 1)).toBe("RBBBR");
    // the corners do not leak: a diagonal wall holds
    const wall = stroke(blank(3, 3), 0, 2, 2, 0, R);
    expect(row(fill(wall, 0, 0, B), 0)).toBe("BBR");
    expect(row(fill(wall, 0, 0, B), 2)).toBe("R..");
    expect(row(flip(stroke(blank(3, 1), 0, 0, 0, 0, R)), 0)).toBe("..R");
    expect(row(flip(stroke(blank(1, 3), 0, 0, 0, 0, R), true), 2)).toBe("R");
  });

  it("counts the colors of each 16 px zone from the feet up", () => {
    let p = blank(2, 40);
    p = stroke(p, 0, 39, 0, 39, R);
    p = stroke(p, 1, 20, 1, 20, B);
    p = stroke(p, 0, 5, 0, 5, R);
    // feet on the last row: rows 24-39 are zone 1, 8-23 zone 2, 0-7 zone 3
    expect(bandColors(p, 39)).toEqual([[R], [B], [R]]);
    expect(colorsOf(p)[0]).toBe(R);
  });
});

describe("the pixel editor", () => {
  afterEach(cleanup);
  const frame = () => ({ ...rect(blank(8, 8), 0, 0, 7, 7, R, false), px: 4, py: 7 });

  function open(onApply = vi.fn()) {
    render(<PixelEditor t={spritesEn.pixel} name="Standing 1" frame={frame()} palette={[R, B]} onApply={onApply} onCancel={() => undefined} />);
    const canvas = screen.getByRole("img", { name: "Edit frame · Standing 1" }) as HTMLCanvasElement;
    // 8 × 8 pixels shown 80 × 80
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 80, height: 80, right: 80, bottom: 80, x: 0, y: 0, toJSON: () => ({}) });
    const at = (x: number, y: number) => ({ clientX: x * 10 + 5, clientY: y * 10 + 5, button: 0, pointerId: 1 });
    return { canvas, at, onApply };
  }

  it("paints with the chosen color, undoes and redoes, and gives the frame back", () => {
    const { canvas, at, onApply } = open();
    fireEvent.click(screen.getByRole("button", { name: B }));
    fireEvent.pointerDown(canvas, at(2, 3));
    fireEvent.pointerMove(canvas, at(5, 3));
    fireEvent.pointerUp(canvas, at(5, 3));
    fireEvent.click(screen.getByRole("button", { name: "Undo (⌘Z)" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo (⇧⌘Z)" }));
    fireEvent.click(screen.getByRole("button", { name: "Use this frame" }));
    const p = onApply.mock.calls[0]![0] as Pixels;
    expect(row(p, 3)).toBe("R.BBBB.R");
  });

  it("fills with the bucket, picks a color with Alt, and switches tools with their keys", () => {
    const { canvas, at, onApply } = open();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "g" });
    expect(screen.getByRole("button", { name: "Bucket (G)" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: B }));
    fireEvent.pointerDown(canvas, at(3, 3));
    // Alt picks the outline's red, then the bucket fills the inside again with it
    fireEvent.pointerDown(canvas, { ...at(0, 0), altKey: true });
    fireEvent.pointerDown(canvas, at(3, 3));
    fireEvent.click(screen.getByRole("button", { name: "Use this frame" }));
    expect(row(onApply.mock.calls[0]![0] as Pixels, 3)).toBe("RRRRRRRR");
  });

  it("counts each zone's colors against the board's 15", () => {
    open();
    expect(screen.getByText("Zone 1: 1 of 15")).toBeInTheDocument();
  });
});
