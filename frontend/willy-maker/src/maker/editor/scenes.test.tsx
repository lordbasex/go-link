// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { migrateProject, newProject, type BackgroundScene, type Level } from "../model";
import type { Rgba } from "./picture";
import { composeScenes, floorLine, lineUpFloors, nextSceneX, sceneBox, sceneFloor, sceneSize } from "./scenes";

/** A picture: dark above, a bright floor from `floor` (share of the height) down. */
function picture(w: number, h: number, floor: number, color = [200, 160, 60]): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set(y >= Math.round(floor * h) ? [...color, 255] : [10, 10, 40, 255], (y * w + x) * 4);
  return { w, h, data };
}
const level = (): Level => {
  const l = newProject({ title: "Scenes" }).levels[0]!;
  l.size = { w: 480, h: 272 };
  return l;
};
const scene = (id: string, x: number, dy = 0, scale = 1): BackgroundScene => ({ id, asset: `sha256:${id}`, name: `${id}.png`, x, dy, scale });

describe("the background's scenes", () => {
  it("sizes a scene by its share of the level's height, its width on 32 px columns", () => {
    expect(sceneSize(level(), { w: 1672, h: 941 }, 1)).toEqual({ w: 480, h: 272 });
    expect(sceneSize(level(), { w: 1672, h: 941 }, 0.5)).toEqual({ w: 256, h: 136 });
  });

  it("lays scenes out left to right, standing on the bottom, moved down by dy, and grows the level to their end", () => {
    const l = level();
    const sources = new Map([
      ["sha256:a", picture(1672, 941, 0.8, [200, 0, 0])],
      ["sha256:b", picture(1672, 941, 0.8, [0, 0, 200])],
    ]);
    const scenes = [scene("a", 0), scene("b", nextSceneX(l, [scene("a", 0)], sources), 16)];
    expect(scenes[1]!.x).toBe(480);
    const { keys, width } = composeScenes(l, scenes, sources, () => false);
    expect(width).toBe(960);
    // b moved 16 px down: its first 16 rows are empty
    expect(keys.keys[8 * width + 600]).toBe(-1);
    expect(keys.keys[20 * width + 600]).not.toBe(-1);
    expect(keys.keys[20 * width + 100]).not.toBe(-1);
  });

  it("lets a later scene lie over an earlier one, its cut edge showing the one behind", () => {
    const l = level();
    const sources = new Map([
      ["sha256:a", picture(1672, 941, 0.8, [200, 0, 0])],
      ["sha256:b", picture(1672, 941, 0.8, [0, 0, 200])],
    ]);
    // b starts 100 px inside a, its first 40 px cut off: a shows until 420, b from there
    const b = { ...scene("b", 380), cropL: 40 };
    expect(sceneBox(l, b, sources.get("sha256:b")!)).toMatchObject({ x: 420, w: 440 });
    const { keys, width } = composeScenes(l, [scene("a", 0), b], sources, () => false);
    expect(width).toBe(864);
    const at = (x: number) => keys.keys[260 * width + x];
    expect(at(410)).toBe(at(10));
    expect(at(430)).toBe(at(700));
    expect(at(410)).not.toBe(at(430));
    expect(nextSceneX(l, [scene("a", 0), b], sources)).toBe(860);
  });

  it("finds a picture's floor line and lines every scene's up with the first one's", () => {
    expect(floorLine(picture(400, 941, 0.867))).toBeCloseTo(0.867, 2);
    const l = level();
    const sources = new Map([
      ["sha256:a", picture(1672, 941, 0.867)],
      // drawn higher, as the image AI drew screens 5 and 6
      ["sha256:b", picture(1672, 941, 0.792)],
    ]);
    const scenes = [scene("a", 0), scene("b", 480)];
    const lined = lineUpFloors(l, scenes, sources);
    expect(Math.abs(lined[1]!.dy - 20.4)).toBeLessThan(1.5);
    expect(Math.abs(sceneFloor(l, lined[1]!, sources)! - sceneFloor(l, lined[0]!, sources)!)).toBeLessThan(1);
  });

  it("are kept when the project is saved and opened again, bad ones left out", () => {
    const p = newProject({ title: "Kept" });
    p.levels[0]!.scenes = [scene("a", 0, 12, 0.9), { ...scene("b", 480), asset: "not-an-asset" }];
    const back = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(back.levels[0]!.scenes).toEqual([scene("a", 0, 12, 0.9)]);
  });
});
