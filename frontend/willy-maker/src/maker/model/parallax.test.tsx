// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { bandX, cleanBands, newProject, objectLayer, parallaxBands, tagGrid, TAG_NUMBER } from ".";
import { levelFromProject } from "../engine/level";
import { reviewProject } from "../editor/validate";

describe("parallax bands (T-26)", () => {
  it("keeps bands on the grid, inside the level, in order, apart and at most 4", () => {
    const size = { w: 1536, h: 224 };
    expect(cleanBands({ size, parallax: [{ y0: 70, y1: 120, speed: 50 }] })).toEqual([{ y0: 64, y1: 128, speed: 50 }]);
    expect(cleanBands({ size, parallax: [{ y0: 96, y1: 128, speed: 200 }, { y0: 0, y1: 48, speed: 1 }, { y0: 32, y1: 64, speed: 50 }] })).toEqual([
      { y0: 0, y1: 48, speed: 10 },
      { y0: 96, y1: 128, speed: 95 },
    ]);
    expect(parallaxBands({ size, parallax: [{ y0: 16, y1: 64, speed: 40 }] })).toEqual([{ r0: 1, r1: 4, speed: 40 }]);
    expect(bandX(1000, 50)).toBe(500);
  });
  it("reaches the engine's view, and the review keeps collision and objects out of them", () => {
    const p = newProject({ title: "Neon Docks", players: 1 });
    const level = p.levels[0]!;
    level.parallax = [{ y0: 0, y1: 64, speed: 50 }];
    expect(levelFromProject(level).bands).toEqual([{ r0: 0, r1: 4, speed: 50 }]);
    expect(reviewProject(p).checks.find((c) => c.msg === "level.parallax")).toBeUndefined();
    const tags = tagGrid(level);
    tags.set(10, 2, TAG_NUMBER.solid);
    tags.commit();
    expect(reviewProject(p).checks.find((c) => c.msg === "level.parallax")).toMatchObject({ severity: "warning", params: { y0: 0, y1: 64, x: 160 } });
    tags.set(10, 2, 0);
    tags.commit();
    objectLayer(level).items.push({ name: "e1", type: "enemy", x: 300, y: 48, kind: "trooper" });
    expect(reviewProject(p).checks.find((c) => c.msg === "level.parallax")?.params).toMatchObject({ x: 300 });
  });
});
