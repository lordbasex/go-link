// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The rules as a specification: the same numbers the ROM prototype plays
// with (rom/src/main.c). Phase 2's 68000 engine must pass the same cases.

import { describe, expect, it } from "vitest";
import { Game, Input, Tag, decodeCells, levelFromProject, sampleLevel, type LevelObject, type LevelView } from "./index";

/** A flat test level: a floor at y 400 (row 25) over 64 × 28 cells, plus whatever `build` adds. */
function flat(build?: (set: (c: number, r: number, t: number) => void) => void, objects: LevelObject[] = []): LevelView {
  const cols = 64;
  const rows = 28;
  const tags = new Uint8Array(cols * rows);
  const set = (c: number, r: number, t: number) => {
    tags[r * cols + c] = t;
  };
  for (let c = 0; c < cols; c++) for (let r = 25; r < rows; r++) set(c, r, Tag.Solid);
  build?.(set);
  return { name: "test", width: cols * 16, height: rows * 16, tags, objects: [{ name: "p1", type: "player_start", x: 64, y: 400, player: 1 }, ...objects] };
}

function run(g: Game, frames: number, pad: number | ((f: number) => number), player = 0): void {
  for (let f = 0; f < frames; f++) {
    const inputs = [0, 0, 0, 0];
    inputs[player] = typeof pad === "number" ? pad : pad(f);
    g.step(inputs);
  }
}

const feet = (g: Game, i = 0) => g.players[i]!.y >> 4;

describe("Willy Maker engine", () => {
  it("starts player 1 on the floor at their start", () => {
    const g = new Game(flat());
    expect(g.players[0]!.active).toBe(true);
    expect(g.players[0]!.x).toBe(64);
    expect(feet(g)).toBe(400);
    expect(g.players[1]!.active).toBe(false);
  });

  it("jumps about 64 px high and lands back where it took off", () => {
    const g = new Game(flat());
    let top = 400;
    run(g, 1, Input.B1);
    for (let f = 0; f < 60; f++) {
      run(g, 1, 0);
      top = Math.min(top, feet(g));
    }
    expect(400 - top).toBeGreaterThanOrEqual(60);
    expect(400 - top).toBeLessThanOrEqual(66);
    expect(feet(g)).toBe(400);
    expect(g.players[0]!.onGround).toBe(true);
  });

  it("walks 1 px a frame and runs 2 px a frame after a double tap", () => {
    const g = new Game(flat());
    run(g, 30, Input.Right);
    expect(g.players[0]!.x).toBe(94);
    run(g, 2, 0);
    // tap, release, hold: within 15 frames = run
    run(g, 1, Input.Right);
    run(g, 2, 0);
    const x = g.players[0]!.x;
    run(g, 10, Input.Right);
    expect(g.players[0]!.running).toBe(true);
    expect(g.players[0]!.x - x).toBe(20);
  });

  it("does not run when the second tap is late", () => {
    const g = new Game(flat());
    run(g, 1, Input.Right);
    run(g, 20, 0);
    run(g, 5, Input.Right);
    expect(g.players[0]!.running).toBe(false);
  });

  it("climbs a 32 px crate by pushing against it", () => {
    const g = new Game(flat((set) => {
      for (const [c, r] of [[8, 23], [9, 23], [8, 24], [9, 24]] as const) set(c, r, Tag.Crate);
    }));
    run(g, 80, Input.Right);
    expect(feet(g)).toBe(368);
    expect(g.players[0]!.x).toBeGreaterThan(128);
  });

  it("does not climb a wall taller than one crate", () => {
    const g = new Game(flat((set) => {
      for (let r = 22; r < 25; r++) set(8, r, Tag.Solid);
    }));
    run(g, 120, Input.Right);
    expect(feet(g)).toBe(400);
    expect(g.players[0]!.x).toBeLessThan(128);
  });

  it("goes up a ladder and stands on its top, then comes back down", () => {
    const g = new Game(flat((set) => {
      for (let r = 16; r < 25; r++) set(5, r, Tag.Ladder);
    }));
    run(g, 20, Input.Right); // x 84: in front of the ladder (cells 80-95)
    run(g, 120, Input.Up);
    expect(g.players[0]!.climbing).toBe(false);
    expect(feet(g)).toBe(256);
    expect(g.players[0]!.onGround).toBe(true);
    run(g, 140, Input.Down);
    expect(feet(g)).toBe(400);
  });

  it("stands on a one-way platform, jumps up through it and drops with down + jump", () => {
    const g = new Game(flat((set) => {
      for (let c = 2; c < 10; c++) set(c, 22, Tag.Oneway);
    }));
    run(g, 1, Input.B1);
    run(g, 60, 0);
    expect(feet(g)).toBe(352); // jumped through from below and landed on it
    run(g, 1, Input.Down | Input.B1);
    run(g, 40, 0);
    expect(feet(g)).toBe(400);
  });

  it("solid ceilings stop a jump", () => {
    const g = new Game(flat((set) => {
      for (let c = 2; c < 10; c++) set(c, 21, Tag.Solid);
    }));
    let top = 400;
    run(g, 1, Input.B1);
    for (let f = 0; f < 60; f++) {
      run(g, 1, 0);
      top = Math.min(top, feet(g));
    }
    expect(top).toBeGreaterThanOrEqual(352 + 40 - 16);
    expect(feet(g)).toBe(400);
  });

  it("uses the knife on an adjacent enemy and the machine gun otherwise", () => {
    const near = new Game(flat(undefined, [{ name: "e", type: "enemy", x: 82, y: 400, patrol: 0 }]));
    run(near, 1, Input.B2);
    expect(near.players[0]!.knifeT).toBeGreaterThan(0);
    expect(near.enemies[0]!.hp).toBe(2);
    expect(near.players[0]!.shots).toHaveLength(0);

    const far = new Game(flat(undefined, [{ name: "e", type: "enemy", x: 300, y: 400, patrol: 0 }]));
    run(far, 1, Input.B2);
    expect(far.players[0]!.knifeT).toBe(0);
    expect(far.players[0]!.shots).toHaveLength(1);
    run(far, 80, Input.B2);
    expect(far.enemies[0]!.state).not.toBe("walk");
  });

  it("breaks a crate with three shots and drops what it holds", () => {
    const g = new Game(flat(undefined, [{ name: "box", type: "crate", x: 160, y: 368, size: 32, hp: 3, contents: "bazooka" }]));
    expect(g.cell(10, 23)).toBe(Tag.Crate);
    run(g, 60, (f) => (f % 8 < 4 ? Input.B2 : 0));
    expect(g.crates[0]!.broken).toBe(true);
    expect(g.cell(10, 23)).toBe(Tag.Air);
    expect(g.pickups.some((p) => p.item === "bazooka" && p.live)).toBe(true);
    run(g, 120, Input.Right);
    expect(g.players[0]!.special).toBe("bazooka");
    expect(g.players[0]!.ammo).toBe(3);
  });

  it("fires the bazooka with B3 and spends its ammo", () => {
    const g = new Game(flat(undefined, [{ name: "gun", type: "pickup", x: 64, y: 400, item: "bazooka" }]));
    run(g, 1, 0);
    expect(g.players[0]!.ammo).toBe(3);
    run(g, 1, Input.B3);
    expect(g.players[0]!.rocket).not.toBeNull();
    run(g, 80, 0);
    run(g, 1, Input.B3);
    run(g, 80, 0);
    run(g, 1, Input.B3);
    expect(g.players[0]!.ammo).toBe(0);
    expect(g.players[0]!.special).toBe("");
  });

  it("rescues a civilian on touch, but not while locked in a crate", () => {
    const g = new Game(flat(undefined, [
      { name: "kid", type: "civilian", x: 120, y: 400 },
      { name: "box", type: "crate", x: 192, y: 384, size: 16, hp: 1 },
      { name: "mom", type: "civilian", x: 240, y: 400, trapped_in: "box" },
    ]));
    run(g, 60, Input.Right);
    expect(g.rescued).toBe(1);
    expect(g.civilians[1]!.trappedIn).toBe("box");
  });

  it("the camera only goes forward, with 48 px of backtrack", () => {
    const g = new Game(flat());
    run(g, 400, (f) => (f === 0 || f === 2 ? Input.Right : f === 1 ? 0 : Input.Right));
    const far = g.camFar;
    expect(far).toBeGreaterThan(200);
    run(g, 400, Input.Left);
    expect(g.camX).toBe(far - 48);
    expect(g.players[0]!.x).toBe(g.camX + 12); // held at the screen's side
  });

  it("player 2 joins with a button and the camera drags the one who stays behind", () => {
    const g = new Game(flat(undefined, [{ name: "p2", type: "player_start", x: 96, y: 400, player: 2 }]));
    g.step([0, Input.Start]);
    expect(g.players[1]!.active).toBe(true);
    for (let f = 0; f < 600; f++) g.step([Input.Right, 0]);
    const p1 = g.players[0]!;
    const p2 = g.players[1]!;
    expect(p2.x).toBe(g.camX + 12); // pushed along by the screen's left side
    expect(p1.x).toBeLessThanOrEqual(g.camX + 384 - 12);
    expect(g.camX).toBeGreaterThan(200);
  });

  it("an enemy shot costs a life, and the last life ends the game", () => {
    const g = new Game(flat(undefined, [{ name: "e", type: "enemy", x: 200, y: 400, patrol: 0 }]), { lives: 1 });
    g.players[0]!.invulnerable = 0;
    run(g, 200, 0);
    expect(g.outcome).toBe("over");
  });

  it("reaching the exit clears the level", () => {
    const g = new Game(flat(undefined, [{ name: "exit", type: "exit", x: 120, y: 0, w: 32, h: 448 }]));
    run(g, 80, Input.Right);
    expect(g.outcome).toBe("cleared");
  });

  it("is deterministic: the same inputs give the same game", () => {
    const pads = (f: number) => [Input.Right, Input.Right | Input.B1, Input.B2, Input.Right | Input.B2, 0][f % 5]!;
    const a = new Game(sampleLevel(), { players: 2 });
    const b = new Game(sampleLevel(), { players: 2 });
    for (let f = 0; f < 900; f++) {
      a.step([pads(f), pads(f + 2)]);
      b.step([pads(f), pads(f + 2)]);
    }
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it("edits while playing: a painted cell is solid at once", () => {
    const g = new Game(flat());
    g.setCell(8, 24, Tag.Solid);
    g.setCell(8, 23, Tag.Solid);
    g.setCell(8, 22, Tag.Solid);
    run(g, 120, Input.Right);
    expect(g.players[0]!.x).toBeLessThan(128);
    g.addObject({ name: "late", type: "enemy", x: 100, y: 400 });
    expect(g.enemies).toHaveLength(1);
  });

  it("decodes run-length layers and maps a project level", () => {
    expect(Array.from(decodeCells("rle:0*3,1*2,2", 7))).toEqual([0, 0, 0, 1, 1, 2, 0]);
    const v = levelFromProject({
      name: "L",
      size: { w: 64, h: 32 },
      layers: [
        { kind: "tags", grid: 16, data: "rle:0*4,1*4" },
        { kind: "objects", items: [{ name: "p1", type: "player_start", x: 8, y: 16, player: 1 }] },
      ],
    });
    expect(v.width).toBe(64);
    expect(Array.from(v.tags)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(v.objects).toHaveLength(1);
  });

  it("the sample level plays: the street, the ladder and building A's roof", () => {
    const g = new Game(sampleLevel());
    expect(feet(g)).toBe(400);
    expect(g.enemies).toHaveLength(3);
    expect(g.civilians).toHaveLength(2);
    expect(g.crates).toHaveLength(5);
  });
});
