// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { appendSheet, APPEND_GAP } from "./append";

const img = (w: number, h: number, v: number) => ({ w, h, rgba: new Uint8Array(w * h * 4).fill(v) });

describe("one more picture for a character", () => {
  it("puts the new picture under the sheet, a gap apart, on transparent ground", () => {
    const { sheet, top } = appendSheet(img(4, 2, 200), img(6, 3, 100));
    expect(top).toBe(2 + APPEND_GAP);
    expect([sheet.w, sheet.h]).toEqual([6, 2 + APPEND_GAP + 3]);
    const px = (x: number, y: number) => [...sheet.rgba.subarray((y * sheet.w + x) * 4, (y * sheet.w + x) * 4 + 4)];
    expect(px(3, 1)).toEqual([200, 200, 200, 200]);
    expect(px(5, 1)).toEqual([0, 0, 0, 0]);
    expect(px(0, 5)).toEqual([0, 0, 0, 0]);
    expect(px(5, top + 2)).toEqual([100, 100, 100, 100]);
  });
});
