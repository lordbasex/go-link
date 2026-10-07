// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { FRONT_MAX, frontX, migrateProject, newProject } from "../model";
import { cropDrawn, fitFront, pieceKeys } from "./front";
import type { Rgba } from "./picture";

/** A picture: magenta around a box of `color` at (x, y, w, h). */
function boxOn(W: number, H: number, box: { x: number; y: number; w: number; h: number }, color = [30, 30, 40]): Rgba {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const inside = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
      data.set(inside ? [...color, 255] : [255, 0, 255, 255], (y * W + x) * 4);
    }
  return { w: W, h: H, data };
}

describe("the foreground", () => {
  it("crops a picture to what it draws, leaving the image AI's magenta out", () => {
    const c = cropDrawn(boxOn(100, 80, { x: 40, y: 10, w: 12, h: 60 }), true)!;
    expect([c.w, c.h]).toEqual([12, 60]);
    expect(cropDrawn(boxOn(10, 10, { x: 0, y: 0, w: 0, h: 0 }), true)).toBeNull();
  });

  it("scales a piece to its height, and shorter when it would be wider than 128 px", () => {
    expect(pieceKeys(boxOn(100, 200, { x: 45, y: 0, w: 10, h: 200 }), 160, true)!.h).toBe(160);
    const wide = pieceKeys(boxOn(400, 100, { x: 0, y: 0, w: 400, h: 100 }), 200, true)!;
    expect(wide.w).toBeLessThanOrEqual(FRONT_MAX.w);
    expect(wide.h).toBe(32);
  });

  it("fits every piece's tiles to one palette of at most 15 colors, each piece with its own cells", () => {
    const pics = [pieceKeys(boxOn(64, 64, { x: 8, y: 8, w: 20, h: 48 }, [200, 40, 40]), 48, true)!, pieceKeys(boxOn(64, 64, { x: 0, y: 0, w: 40, h: 64 }, [40, 200, 40]), 32, true)!];
    const f = fitFront(pics);
    expect(f.fit.palettes).toHaveLength(1);
    expect(f.fit.palettes[0]!.length).toBeLessThanOrEqual(15);
    expect(f.pieces.map((p) => [p.cols, p.rows])).toEqual([
      [2, 3],
      [2, 2],
    ]);
    expect(f.pieces.every((p) => p.cells.some((n) => n > 0))).toBe(true);
  });

  it("puts a piece on screen as the ROM does: where it is when the camera's middle reaches it, faster elsewhere", () => {
    // camera's middle at the piece: where the editor shows it
    expect(frontX(500, 500 - 192, 150)).toBe(192);
    // the camera 100 px further: 150 px further left at 150 %
    expect(frontX(500, 408, 150)).toBe(42);
    // truncated toward zero, as the 68000's division
    expect(frontX(500, 309, 150)).toBe(192 + Math.trunc(-1.5));
    expect(frontX(500, 307, 150)).toBe(193);
  });

  it("keeps its pieces when the project is saved and opened again, out of range values brought back", () => {
    const p = newProject({ title: "Front" });
    p.levels[0]!.front = [{ id: "a", asset: "sha256:a", name: "post.png", x: 100, y: 50, h: 160, speed: 999, cols: 2, rows: 10, cells: "0*20" }, { id: "b", asset: "nope", name: "", x: 0, y: 0, h: 16, speed: 150, cols: 1, rows: 1, cells: "" }];
    const back = migrateProject(JSON.parse(JSON.stringify(p))).levels[0]!.front!;
    expect(back).toHaveLength(1);
    expect(back[0]!.speed).toBe(250);
  });
});
