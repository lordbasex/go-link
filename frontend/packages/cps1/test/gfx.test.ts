// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { GfxRegion, solid } from "../src";

describe("GfxRegion", () => {
  it("starts transparent (pen 15 everywhere)", () => {
    const g = new GfxRegion(0x1000);
    expect(g.data.every((b) => b === 0xff)).toBe(true);
  });

  it("stores 8 pixels as four bitplanes", () => {
    const g = new GfxRegion(0x100);
    g.put8(0, [1, 2, 4, 8, 0, 0, 0, 15]);
    // plane k holds bit k of each pen, pixel 0 in the top bit
    expect([...g.data.subarray(0, 4)]).toEqual([0x81, 0x41, 0x21, 0x11]);
  });

  it("places 8x8 tiles in the right half of each 8-byte row", () => {
    const g = new GfxRegion(0x1000);
    g.tile8(1, solid(8, 0));
    expect([...g.data.subarray(64, 68)]).toEqual([0xff, 0xff, 0xff, 0xff]);
    expect([...g.data.subarray(68, 72)]).toEqual([0, 0, 0, 0]);
  });

  it("writes 16x16 and 32x32 tiles at their codes", () => {
    const g = new GfxRegion(0x2000);
    g.tile16(2, solid(16, 0));
    expect(g.data.subarray(256, 384).every((b) => b === 0)).toBe(true);
    expect(g.data[255]).toBe(0xff);
    g.tile32(3, solid(32, 0));
    expect(g.data.subarray(1536, 2048).every((b) => b === 0)).toBe(true);
  });

  it("splits the region into interleaved ROM files", () => {
    const g = new GfxRegion(0x400000);
    for (let i = 0; i < 16; i++) g.data[i] = i;
    const files = g.split([
      ["a", "b", "c", "d"],
      ["e", "f", "g", "h"],
    ]);
    expect(Object.keys(files)).toHaveLength(8);
    expect(files.a!.length).toBe(0x80000);
    expect([...files.a!.subarray(0, 4)]).toEqual([0, 1, 8, 9]);
    expect([...files.d!.subarray(0, 4)]).toEqual([6, 7, 14, 15]);
    expect(files.e![0]).toBe(0xff);
  });
});
