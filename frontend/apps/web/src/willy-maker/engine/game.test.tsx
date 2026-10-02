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

  const crate32 = (set: (c: number, r: number, t: number) => void) => {
    for (const [c, r] of [[8, 23], [9, 23], [8, 24], [9, 24]] as const) set(c, r, Tag.Crate);
  };

  it("climbs a 32 px crate by pushing against it with the push rule", () => {
    const g = new Game(flat(crate32), { rules: { crateClimb: "push" } });
    run(g, 80, Input.Right);
    expect(feet(g)).toBe(368);
    expect(g.players[0]!.x).toBeGreaterThan(128);
  });

  it("by default a 32 px crate is jumped onto, not climbed by walking into it", () => {
    const g = new Game(flat(crate32));
    expect(g.rules.crateClimb).toBe("jump");
    run(g, 80, Input.Right);
    expect(feet(g)).toBe(400);
    expect(g.players[0]!.x).toBeLessThan(128);
    run(g, 1, Input.Right | Input.B1);
    run(g, 40, Input.Right);
    expect(feet(g)).toBe(368);
    expect(g.players[0]!.x).toBeGreaterThan(128);
  });

  it("opposite directions held together count as neither", () => {
    const g = new Game(flat());
    run(g, 30, Input.Left | Input.Right);
    expect(g.players[0]!.x).toBe(64);
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

  it("drops nothing from an empty crate", () => {
    const g = new Game(flat(undefined, [{ name: "box", type: "crate", x: 160, y: 368, size: 32, hp: 1, contents: "nothing" }]));
    run(g, 30, (f) => (f % 8 < 4 ? Input.B2 : 0));
    expect(g.crates[0]!.broken).toBe(true);
    expect(g.pickups).toHaveLength(0);
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

describe("how high a jump reaches (experiment 1, case C)", () => {
  /** A one-way ledge `up` px above the floor (y 400), 4 cells right of the start; true when a jump toward it lands on it. */
  function lands(up: number): boolean {
    const row = (400 - up) / 16;
    const g = new Game(flat((set) => {
      for (let c = 6; c < 14; c++) set(c, row, Tag.Oneway);
    }));
    run(g, 1, Input.B1 | Input.Right);
    for (let f = 0; f < 90; f++) {
      run(g, 1, Input.Right);
      if (g.players[0]!.onGround && feet(g) === 400 - up) return true;
    }
    return false;
  }

  it("lands on a ledge 48 px up but not on one 64 px up: the jump peaks at 61.9 px", () => {
    expect(lands(48)).toBe(true);
    expect(lands(64)).toBe(false);
  });
});

describe("the Rules card (Game Spec v1's numbers)", () => {
  const SPEC_RULES = { enemyHp: 3, enemyScore: 100, rescueScore: 500, touchHurts: true, enemiesChase: false, enemiesShoot: false, exitNeedsEnemies: true, respawnOnHurt: false, hurtFrames: 60 };
  const trooper = (x: number): LevelObject => ({ name: `t${x}`, type: "enemy", x, y: 400, kind: "trooper", facing: "left", patrol: 96 });

  it("keeps the prototype's rules when a game has none", () => {
    const g = new Game(flat(undefined, [trooper(300)]));
    expect(g.rules.enemyHp).toBe(4);
    expect(g.enemies[0]!.hp).toBe(4);
    expect(g.rules.touchHurts).toBe(false);
  });

  it("enemies keep their 96 px patrol and turn at its ends when they do not chase", () => {
    const g = new Game(flat(undefined, [trooper(200)]), { rules: SPEC_RULES });
    let min = 200;
    let max = 200;
    for (let f = 0; f < 600; f++) {
      run(g, 1, 0);
      min = Math.min(min, g.enemies[0]!.x);
      max = Math.max(max, g.enemies[0]!.x);
    }
    expect([min, max]).toEqual([152, 248]);
    expect(g.enemyShots).toHaveLength(0);
  });

  it("an enemy takes 3 shots and gives 100 points", () => {
    const g = new Game(flat(undefined, [trooper(200)]), { rules: SPEC_RULES });
    for (let f = 0; f < 120 && g.enemies[0]!.state !== "down"; f++) run(g, 1, f % 8 < 4 ? Input.B2 : 0);
    expect(g.enemies[0]!.state).toBe("down");
    expect(g.players[0]!.score).toBe(100);
  });

  it("touching an enemy costs 1 of 3 energy and blinks 1 s in place", () => {
    const g = new Game(flat(undefined, [trooper(80)]), { rules: SPEC_RULES, lives: 3 });
    run(g, 61, 0); // the join's own blink ends
    const x = g.players[0]!.x;
    let hurtAt = -1;
    for (let f = 0; f < 120 && hurtAt < 0; f++) {
      run(g, 1, 0);
      if (g.players[0]!.lives < 3) hurtAt = f;
    }
    expect(hurtAt).toBeGreaterThanOrEqual(0);
    expect(g.players[0]!.lives).toBe(2);
    expect(g.players[0]!.x).toBe(x);
    expect(g.players[0]!.invulnerable).toBe(60);
  });

  it("the exit clears only with every enemy down", () => {
    const view = flat(undefined, [trooper(900), { name: "exit", type: "exit", x: 70, y: 400, w: 64 }]);
    const g = new Game(view, { rules: SPEC_RULES });
    run(g, 30, Input.Right);
    expect(g.outcome).toBe("playing");
    const free = new Game(view, { rules: { ...SPEC_RULES, exitNeedsEnemies: false } });
    run(free, 30, Input.Right);
    expect(free.outcome).toBe("cleared");
  });

  it("says why the exit does not open while enemies are left", () => {
    const g = new Game(flat(undefined, [trooper(900), { name: "exit", type: "exit", x: 70, y: 400, w: 64 }]), { rules: SPEC_RULES });
    const seen: string[] = [];
    for (let f = 0; f < 30; f++) {
      run(g, 1, Input.Right);
      seen.push(...g.events.map((e) => e.kind));
    }
    expect(seen.filter((k) => k === "exit_closed")).toHaveLength(1);
    expect(g.snapshot().exitClosed).toBe(true);
    expect(g.snapshot().enemiesLeft).toBe(1);
  });
});

describe("crates (experiment 1's hanging crate, J-03)", () => {
  // a stack of two 32 px crates at cells 8-9: rows 21-22 on top of rows 23-24
  const stack = (breakable = true): LevelObject[] => [
    { name: "low", type: "crate", x: 128, y: 368, size: 32, hp: 1, breakable },
    { name: "top", type: "crate", x: 128, y: 336, size: 32, hp: 1 },
  ];

  it("a crate resting on a broken crate breaks too, so none hangs in the air", () => {
    const g = new Game(flat(undefined, stack()), { rules: { crateClimb: "jump" } });
    run(g, 20, (f) => (f % 2 ? 0 : Input.B2));
    expect(g.crates.map((k) => k.broken)).toEqual([true, true]);
    expect(g.cell(8, 22)).toBe(Tag.Air);
    expect(g.cell(8, 24)).toBe(Tag.Air);
  });

  it("a crate that is not breakable stops shots and stays", () => {
    const g = new Game(flat(undefined, stack(false)));
    run(g, 40, (f) => (f % 2 ? 0 : Input.B2));
    expect(g.crates[0]!.broken).toBe(false);
    expect(g.crates[1]!.broken).toBe(false);
    expect(g.cell(8, 24)).toBe(Tag.Crate);
  });
});

describe("the moves (docs/willy-maker/moves.md, T-25)", () => {
  const top = (g: Game, frames: number, pad: (f: number) => number) => {
    const y0 = feet(g);
    let best = y0;
    for (let f = 0; f < frames; f++) {
      g.step([pad(f), 0, 0, 0]);
      best = Math.min(best, feet(g));
    }
    return y0 - best;
  };
  const tall = (): LevelView => {
    const cols = 64;
    const rows = 60;
    const tags = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) for (let r = 57; r < rows; r++) tags[r * cols + c] = Tag.Solid;
    return { name: "tall", width: cols * 16, height: rows * 16, tags, objects: [{ name: "p1", type: "player_start", x: 64, y: 912, player: 1 }] };
  };

  it("crouches on Down, crawls 1 px every 2 frames, and enemy shots at standing height pass over", () => {
    const g = new Game(flat());
    run(g, 1, Input.Down);
    expect(g.players[0]!.crouching).toBe(true);
    expect(g.snapshot().players[0]!.state).toBe("crouching");
    const x = g.players[0]!.x;
    run(g, 20, Input.Down | Input.Right);
    expect(g.players[0]!.x - x).toBe(10);
    expect(g.snapshot().players[0]!.state).toBe("crawling");
    run(g, 1, 0);
    expect(g.players[0]!.crouching).toBe(false);
  });

  it("crawls under a ceiling 32 px over the floor and stays crouched there", () => {
    const g = new Game(flat((set) => {
      for (let c = 8; c < 12; c++) set(c, 22, Tag.Solid); // the ceiling's bottom at y 368, 32 px over the floor at 400
    }));
    run(g, 60, Input.Right);
    const stopped = g.players[0]!.x;
    expect(stopped).toBeLessThan(128);
    run(g, 60, Input.Down | Input.Right);
    // under the ceiling (x 128-191) now
    expect(g.players[0]!.x).toBeGreaterThan(140);
    expect(g.players[0]!.x).toBeLessThan(185);
    run(g, 1, 0);
    expect(g.players[0]!.crouching).toBe(true);
  });

  it("jump kicks an enemy in front once, for 2 hits", () => {
    const g = new Game(flat(undefined, [{ name: "e", type: "enemy", x: 84, y: 400, kind: "trooper", facing: "left", patrol: 0, hp: 3 }]), { rules: { enemiesShoot: false, enemiesChase: false } });
    run(g, 1, Input.B1);
    run(g, 2, 0);
    run(g, 1, Input.Down | Input.B2);
    expect(g.players[0]!.kickT).toBeGreaterThan(0);
    run(g, 20, Input.Down);
    expect(g.enemies[0]!.hp).toBe(1);
  });

  it("lands, turns, yawns after 5 s, and gives a thumbs up on a rescue", () => {
    const g = new Game(flat(undefined, [{ name: "v", type: "civilian", x: 120, y: 400, kind: "woman" }]));
    run(g, 1, Input.B1);
    let landed = false;
    for (let f = 0; f < 60 && !landed; f++) {
      run(g, 1, 0);
      landed = g.players[0]!.landT > 0;
    }
    expect(landed).toBe(true);
    run(g, 1, Input.Left);
    expect(g.players[0]!.turnT).toBeGreaterThan(0);
    run(g, 60, Input.Right);
    expect(g.players[0]!.thumbsT).toBeGreaterThan(0);
    run(g, 300, 0);
    expect(g.players[0]!.idleT).toBeGreaterThanOrEqual(300);
  });

  it("measures the jumps the reach check counts on: 62, 107 and 239 px", () => {
    expect(top(new Game(tall()), 120, (f) => (f === 0 ? Input.B1 : 0))).toBe(62);
    expect(top(new Game(tall()), 120, (f) => (f === 0 ? Input.B1 : 0))).toBeGreaterThanOrEqual(48);
    expect(top(new Game(tall(), { rules: { doubleJump: true } }), 160, (f) => (f === 0 || f === 18 ? Input.B1 : 0))).toBe(107);
    expect(top(new Game(tall(), { rules: { jetpack: true } }), 400, () => Input.B1)).toBe(239);
    // without the rules, a second press and a held B1 do nothing more
    expect(top(new Game(tall()), 160, (f) => (f === 0 || f === 18 ? Input.B1 : 0))).toBe(62);
    expect(top(new Game(tall()), 400, () => Input.B1)).toBe(62);
  });
});
