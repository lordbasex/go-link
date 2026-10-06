// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { spritesEn } from "../i18n/sprites.en";
import { bandColors, blank, colorAt, colorsOf, composite, ellipse, fill, flip, linePoints, rect, stroke, type Pixels } from "./pixels";
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

  it("lays the layers that show one over the other, bottom first", () => {
    const under = rect(blank(3, 1), 0, 0, 2, 0, R, true);
    const over = stroke(blank(3, 1), 1, 0, 1, 0, B);
    expect(row(composite([{ pic: under, visible: true }, { pic: over, visible: true }], 3, 1), 0)).toBe("RBR");
    expect(row(composite([{ pic: under, visible: false }, { pic: over, visible: true }], 3, 1), 0)).toBe(".B.");
    expect(row(composite([{ pic: over, visible: true }, { pic: under, visible: true }], 3, 1), 0)).toBe("RRR");
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

  function open(frames = [{ id: "f1", pic: frame() }], onApply = vi.fn()) {
    render(<PixelEditor t={spritesEn.pixel} anim="Standing" fps={6} frames={frames} start={0} size={{ w: 8, h: 8 }} palette={[R, B]} onApply={onApply} onCancel={() => undefined} />);
    const canvas = () => {
      const c = screen.getByRole("img", { name: /^Frame \d+ of \d+$/ }) as HTMLCanvasElement;
      // 8 × 8 pixels shown 80 × 80
      c.getBoundingClientRect = () => ({ left: 0, top: 0, width: 80, height: 80, right: 80, bottom: 80, x: 0, y: 0, toJSON: () => ({}) });
      return c;
    };
    const at = (x: number, y: number) => ({ clientX: x * 10 + 5, clientY: y * 10 + 5, button: 0, pointerId: 1 });
    return { canvas, at, onApply };
  }
  const result = (onApply: ReturnType<typeof vi.fn>) => onApply.mock.calls[0]![0] as { id: string | null; pic: Pixels; changed: boolean }[];

  it("paints with the chosen color, undoes and redoes, and gives the animation back", () => {
    const { canvas, at, onApply } = open();
    fireEvent.click(screen.getByRole("button", { name: B }));
    fireEvent.pointerDown(canvas(), at(2, 3));
    fireEvent.pointerMove(canvas(), at(5, 3));
    fireEvent.pointerUp(canvas(), at(5, 3));
    fireEvent.click(screen.getByRole("button", { name: "Undo (⌘Z)" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo (⇧⌘Z)" }));
    fireEvent.click(screen.getByRole("button", { name: "Use these frames" }));
    const out = result(onApply);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "f1", changed: true });
    expect(row(out[0]!.pic, 3)).toBe("R.BBBB.R");
  });

  it("fills with the bucket, picks a color with Alt, and switches tools with their keys", () => {
    const { canvas, at, onApply } = open();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "g" });
    expect(screen.getByRole("button", { name: "Bucket (G)" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: B }));
    fireEvent.pointerDown(canvas(), at(3, 3));
    // Alt picks the outline's red, then the bucket fills the inside again with it
    fireEvent.pointerDown(canvas(), { ...at(0, 0), altKey: true });
    fireEvent.pointerDown(canvas(), at(3, 3));
    fireEvent.click(screen.getByRole("button", { name: "Use these frames" }));
    expect(row(result(onApply)[0]!.pic, 3)).toBe("RRRRRRRR");
  });

  it("adds, duplicates, moves and removes frames, all of it undoable", () => {
    const { onApply } = open([
      { id: "f1", pic: frame() },
      { id: "f2", pic: { ...blank(8, 8), px: 4, py: 7 } },
    ]);
    expect(screen.getByText(/Frame 1 of 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate this frame" }));
    expect(screen.getByText(/Frame 2 of 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New frame (blank, after this one)" }));
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    fireEvent.click(screen.getByRole("button", { name: "Frame 4 of 4" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from the animation" }));
    // the last change undone: f2 is back
    fireEvent.click(screen.getByRole("button", { name: "Undo (⌘Z)" }));
    fireEvent.click(screen.getByRole("button", { name: "Use these frames" }));
    const out = result(onApply);
    // f1, the blank one moved up, the copy of f1, f2
    expect(out.map((f) => f.id)).toEqual(["f1", null, null, "f2"]);
    expect(out.map((f) => f.changed)).toEqual([false, true, true, false]);
    expect(row(out[2]!.pic, 0)).toBe("RRRRRRRR");
    expect(colorsOf(out[1]!.pic)).toEqual([]);
  });

  it("starts an animation with no frames on a blank one of the character's size", () => {
    const { onApply } = open([]);
    expect(screen.getByText(/Frame 1 of 1 · 8 × 8 px/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use these frames" }));
    expect(result(onApply)).toMatchObject([{ id: null, changed: true }]);
  });

  it("draws on the current layer, hides, locks, merges and marks a shirt layer", () => {
    const { canvas, at, onApply } = open();
    expect(screen.getByRole("textbox", { name: "Name of layer 1" })).toHaveValue("Base");
    fireEvent.click(screen.getByRole("button", { name: "New layer (above this one)" }));
    expect(screen.getByRole("textbox", { name: "Name of layer 2" })).toHaveValue("Layer 2");
    fireEvent.click(screen.getByRole("button", { name: B }));
    fireEvent.pointerDown(canvas(), at(3, 3));
    fireEvent.pointerUp(canvas(), at(3, 3));
    fireEvent.click(screen.getByRole("button", { name: "Shirt: Layer 2" }));
    // the base hidden: the frame is only the new layer
    fireEvent.click(screen.getByRole("button", { name: "Hide: Base" }));
    // a locked layer takes no paint
    fireEvent.click(screen.getByRole("button", { name: "Lock: Layer 2" }));
    expect(screen.getByText("This layer is locked: unlock it to draw on it.")).toBeInTheDocument();
    fireEvent.pointerDown(canvas(), at(4, 3));
    fireEvent.pointerUp(canvas(), at(4, 3));
    fireEvent.click(screen.getByRole("button", { name: "Use these frames" }));
    const f = result(onApply)[0] as unknown as { pic: Pixels; layers: { name: string; pic: Pixels; visible: boolean; locked: boolean; shirt: boolean }[] };
    expect(row(f.pic, 3)).toBe("...B....");
    expect(f.layers.map((l) => [l.name, l.visible, l.locked, l.shirt])).toEqual([
      ["Base", false, false, false],
      ["Layer 2", true, true, true],
    ]);
  });

  it("merges a layer onto the one below", () => {
    const { canvas, at, onApply } = open();
    fireEvent.click(screen.getByRole("button", { name: "New layer (above this one)" }));
    fireEvent.click(screen.getByRole("button", { name: B }));
    fireEvent.pointerDown(canvas(), at(3, 3));
    fireEvent.pointerUp(canvas(), at(3, 3));
    fireEvent.click(screen.getByRole("button", { name: "Merge onto the layer below" }));
    fireEvent.click(screen.getByRole("button", { name: "Use these frames" }));
    const f = result(onApply)[0] as unknown as { layers: { pic: Pixels }[] };
    expect(f.layers).toHaveLength(1);
    expect(row(f.layers[0]!.pic, 3)).toBe("R..B...R");
  });

  it("counts each zone's colors against the board's 15", () => {
    open();
    expect(screen.getByText("Zone 1: 1 of 15")).toBeInTheDocument();
  });
});
