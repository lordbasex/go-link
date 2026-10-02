// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { measureJump } from "./jump";
import { jumpRowsFor } from "../editor/reach";

describe("the measured jump (T-13)", () => {
  it("measures each rule set on the engine: 61.9 px, then the double jump and the jet pack", () => {
    expect(measureJump()).toEqual({ peak: 61.9, rows: 3, ledge: 48 });
    const dbl = measureJump({ doubleJump: true });
    expect(dbl.peak).toBeGreaterThanOrEqual(105);
    expect(dbl.peak).toBeLessThan(112);
    expect(dbl.rows).toBe(6);
    const jet = measureJump({ jetpack: true });
    expect(jet.peak).toBeGreaterThan(230);
    expect(jet.rows).toBe(14);
    expect(measureJump({ doubleJump: true, jetpack: true }).peak).toBeGreaterThanOrEqual(jet.peak);
  });
  it("is what the reach check climbs", () => {
    for (const r of [{}, { doubleJump: true }, { jetpack: true }, { doubleJump: true, jetpack: true }]) expect(jumpRowsFor(r)).toBe(measureJump(r).rows);
  });
});
