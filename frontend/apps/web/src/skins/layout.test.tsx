// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { BUILTIN_SKINS, smokeSkin } from "./builtin";
import { deviceOf, check, compute, placementOf } from "./layout";
import { validate } from "./model";

describe("skin layout", () => {
  it("reads the six built-in skins", () => {
    expect(BUILTIN_SKINS.map((s) => s.id)).toEqual(["violet", "red", "green", "blue", "smoke", "orange"]);
  });

  it("finds no problems in the built-in skins", () => {
    for (const s of BUILTIN_SKINS) {
      expect(check(s.layout), s.id).toEqual([]);
      expect(validate(s, []), s.id).toEqual([]);
    }
  });

  it("places Smoke on an iPhone 17 in portrait like the apps", () => {
    const p = placementOf(smokeSkin()!.layout!.portrait);
    expect(p).not.toBeNull();
    const l = compute(p!, deviceOf("iphone17").portrait, false, 4 / 3, 6, 2);
    expect(l.dpad.x).toBeCloseTo(22, 2);
    expect(l.dpad.y).toBeCloseTo(532, 2);
    expect(l.dpad.w).toBeCloseTo(166, 2);
    expect(l.screen.y).toBeCloseTo(112.25, 2);
    expect(l.screen.w).toBeCloseTo(402, 2);
    expect(l.screen.h).toBeCloseTo(301.5, 2);
  });
});
