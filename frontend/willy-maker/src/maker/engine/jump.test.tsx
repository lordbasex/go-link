// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Game } from "./game";
import { DIFFICULTY, Tag, Input, bodyFor, type Difficulty } from "./rules";
import { measureJump } from "./jump";
import { jumpRowsFor, rowsForHeroes } from "../editor/reach";

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

describe("the difficulty (T-15)", () => {
  it("is the same table in play mode and in the ROM engine", () => {
    const c = readFileSync(resolve(__dirname, "../../../../../rom/engine/engine.c"), "utf8");
    const arr = (name: string) => /\{([^}]*)\}/.exec(c.slice(c.indexOf(name)))![1]!.split(",").map((x) => Number(x.trim()));
    const byBits = (Object.values(DIFFICULTY) as { fireEvery: number; shotSpeed: number; bits: number }[]).sort((a, b) => a.bits - b.bits);
    expect(arr("fire_every_of[4] =")).toEqual(byBits.map((d) => d.fireEvery));
    expect(arr("shot_speed_of[4] =")).toEqual(byBits.map((d) => d.shotSpeed));
  });
  it("makes enemies fire more often and their shots faster as it goes up", () => {
    const shotsBy = (difficulty: Difficulty) => {
      const cols = 40;
      const rows = 14;
      const tags = new Uint8Array(cols * rows);
      for (let c = 0; c < cols; c++) tags[12 * cols + c] = Tag.Solid;
      const level = { name: "t", width: cols * 16, height: rows * 16, tags, objects: [{ name: "p1", type: "player_start", x: 64, y: 192, player: 1 }, { name: "e", type: "enemy", x: 200, y: 192, patrol: 0 }] };
      const g = new Game(level, { difficulty, rules: { enemiesChase: false } });
      let fired = 0;
      let before = 0;
      for (let f = 0; f < 600; f++) {
        g.players[0]!.invulnerable = 999;
        g.step([0]);
        if (g.enemyShots.length > before) fired++;
        before = g.enemyShots.length;
      }
      return fired;
    };
    expect(shotsBy("easy")).toBeLessThan(shotsBy("normal"));
    expect(shotsBy("normal")).toBeLessThan(shotsBy("hard"));
    expect(shotsBy("hard")).toBeLessThan(shotsBy("lag"));
  });
});

describe("taller heroes (T-26)", () => {
  it("keeps Willy's body exactly and scales a taller one", () => {
    expect(bodyFor(44)).toMatchObject({ h: 40, crouchH: 24, halfW: 5, jumpVy: -112, doubleVy: -96, kickReach: 24, shotY: 27, crouchShotY: 12 });
    const ff = bodyFor(96);
    expect(ff.h).toBe(87);
    expect(ff.halfW).toBe(11);
    expect(ff.jumpVy).toBeLessThan(-112);
    // the jump rises in proportion to the hero: about 61.9 × 96 / 44
    const peak = measureJump({}, 96).peak;
    expect(peak).toBeGreaterThan(125);
    expect(peak).toBeLessThan(145);
  });
  it("gives a tall hero its own headroom: under a 64 px ceiling Willy walks and a 96 px hero does not", () => {
    const cols = 30;
    const rows = 16;
    const tags = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) tags[14 * cols + c] = Tag.Solid;
    for (let c = 12; c < cols; c++) tags[9 * cols + c] = Tag.Solid; // a ceiling 64 px over the floor from x 192
    const level = { name: "t", width: cols * 16, height: rows * 16, tags, objects: [{ name: "p1", type: "player_start", x: 64, y: 224, player: 1 }] };
    const walkRight = (height?: number) => {
      const g = new Game(level, { heights: [height] });
      for (let f = 0; f < 300; f++) g.step([Input.Right]);
      return g.players[0]!.x;
    };
    expect(walkRight()).toBeGreaterThan(300);
    expect(walkRight(96)).toBeLessThan(192);
  });
  it("plans the level for every hero: the tallest's headroom and the lowest jump", () => {
    expect(rowsForHeroes({}, [44])).toEqual({ jumpRows: 3, bodyRows: 3 });
    expect(rowsForHeroes({}, [96])).toEqual({ jumpRows: 8, bodyRows: 6 });
    expect(rowsForHeroes({}, [44, 96])).toEqual({ jumpRows: 3, bodyRows: 6 });
  });
});
