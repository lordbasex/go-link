// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { rowsOf } from "./rows";
import { characterSheetPlan } from "../prompts/imagePrompt";
import { ANIMS } from "./presets";

const box = (id: string, x: number, y: number, w = 40, h = 60) => ({ id, x, y, w, h, px: w / 2, py: h });

describe("a sheet's rows", () => {
  it("groups boxes by height, top to bottom, each row left to right, even when a pose is lower or taller", () => {
    const rows = rowsOf([box("b2", 100, 12), box("a1", 10, 0), box("c1", 10, 100), box("b1", 55, 4, 40, 70), box("c2", 80, 130, 60, 30)]);
    expect(rows.map((r) => r.map((f) => f.id))).toEqual([["a1", "b1", "b2"], ["c1", "c2"]]);
  });

  it("knows which animations each picture of a character prompt asked for", () => {
    const plan = characterSheetPlan({ sub: "hero", anims: ["idle", "walk", "run", "jump", "land", "turn", "crouch"] }, "hero");
    expect(plan.map((s) => s.map((a) => a.name))).toEqual([["idle", "walk", "run", "jump", "land", "turn"], ["crouch"]]);
    // saved choices for another role: every animation of this one
    expect(characterSheetPlan({ sub: "enemy" }, "hero").flat().map((a) => a.name)).toEqual(ANIMS.hero.map((a) => a.name));
  });
});
