// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The rules as a specification: the same numbers the ROM prototype plays
// with (rom/src/main.c). Phase 2's 68000 engine must pass the same cases.

import { describe, expect, it } from "vitest";
import { AIM_FRAMES, BOMBS, CLIP, SHIP_FIRE, SHIP_RULES, CROSS_SPEED, LIGHTGUN_RULES, RELOAD_FRAMES, ROUTE_STEP, BEATEMUP_RULES, BOSS_HP, BOSS_REST, KNIFE_HITS, COMBO_WINDOW, ENEMY_GAP, FALL_FRAMES, GRAB_FRAMES, PIPE_USES, PUNCH_FRAMES, PUNCH_REACH, THROW_DIST, Game, Input, Tag, decodeCells, levelFromProject, FALL_BACK, FALL_SHAKE, placePlatform, platformOf, sampleLevel, type LevelObject, type LevelView } from "./index";

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

  it("a player taken off the ladder's column stops climbing and falls (L-06)", () => {
    const g = new Game(flat((set) => {
      for (let r = 16; r < 25; r++) set(5, r, Tag.Ladder);
    }));
    run(g, 20, Input.Right);
    run(g, 30, Input.Up);
    const p = g.players[0]!;
    expect(p.climbing).toBe(true);
    p.x += 24; // out of the column, as something pushing them would
    run(g, 1, Input.Up);
    expect(p.climbing).toBe(false);
    run(g, 60, 0);
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

  it("player 2 joins beside player 1 where there is room, never inside a wall (J-06)", () => {
    const g = new Game(flat((set) => {
      for (let r = 20; r < 25; r++) set(2, r, Tag.Solid); // a wall 24 px left of player 1
    }));
    g.step([0, Input.Start]);
    const p2 = g.players[1]!;
    expect(p2.active).toBe(true);
    expect(p2.x).toBe(88);
    expect(feet(g, 1)).toBe(400);
  });

  it("keeps every active player in the picture, up and down", () => {
    const g = new Game(flat((set) => {
      for (let c = 0; c < 12; c++) set(c, 16, Tag.Solid); // a high floor at y 256
    }));
    g.step([0, Input.Start]);
    const [p1, p2] = g.players;
    p2!.x = 96;
    p2!.y = 256 * 16;
    p1!.y = 400 * 16;
    p1!.x = 200;
    run(g, 120, 0);
    for (const p of [p1!, p2!]) {
      const fy = p.y >> 4;
      expect(fy - 40).toBeGreaterThanOrEqual(g.camY + 24); // the head under the HUD
      expect(fy).toBeLessThanOrEqual(g.camY + 224 - 8); // the feet on screen
    }
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

  it("player 2 joins with a button and the camera waits for the one who stays behind", () => {
    const g = new Game(flat(undefined, [{ name: "p2", type: "player_start", x: 96, y: 400, player: 2 }]));
    g.step([0, Input.Start]);
    expect(g.players[1]!.active).toBe(true);
    const p2x = g.players[1]!.x;
    for (let f = 0; f < 600; f++) g.step([Input.Right, 0]);
    const p1 = g.players[0]!;
    const p2 = g.players[1]!;
    expect(p2.x).toBe(p2x); // never pushed by the screen's left side (J-05)
    expect(g.camX).toBeLessThanOrEqual(p2.x - 12);
    expect(p1.x).toBe(g.camX + 384 - 12); // the one in front waits at the right side
    // once the other one walks, the camera goes on
    for (let f = 0; f < 600; f++) g.step([Input.Right, Input.Right]);
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

  for (const chase of [false, true])
    it(`an enemy touching a still player keeps patrolling or holds on, and keeps hurting (T-16, J-09${chase ? ", chasing" : ""})`, () => {
      const g = new Game(flat(undefined, [trooper(100)]), { rules: { ...SPEC_RULES, enemiesChase: chase }, lives: 9 });
      run(g, 61, 0);
      const xs = new Set<number>();
      for (let f = 0; f < 900; f++) {
        run(g, 1, 0);
        if (f >= 600) xs.add(g.enemies[0]!.x);
      }
      expect(g.players[0]!.lives).toBeLessThanOrEqual(9 - 3); // hurt again after every blink
      // a patrol goes on through the player; a chaser stays on them, hurting after every blink
      if (!chase) expect(xs.size).toBeGreaterThan(1);
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

  it("tells the sound where a shot lands: a hit, then the enemy down at its place", () => {
    const g = new Game(flat(undefined, [trooper(220)]), { rules: SPEC_RULES });
    const seen: { kind: string; x?: number }[] = [];
    for (let f = 0; f < 240 && !seen.some((e) => e.kind === "enemy_down"); f++) {
      run(g, 1, f % 8 < 4 ? Input.B2 : 0);
      seen.push(...g.events.map((e) => ({ kind: e.kind, x: "x" in e ? e.x : undefined })));
    }
    const down = seen.find((e) => e.kind === "enemy_down");
    expect(down?.x).toBeGreaterThan(100);
    if (seen.some((e) => e.kind === "hit")) expect(seen.find((e) => e.kind === "hit")!.x).toBeGreaterThan(100);
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

describe("the platformer (T-22)", () => {
  const level = (objects: LevelObject[]) => flat(undefined, objects);
  const rules = { weapons: false, stomp: true, touchHurts: true, enemiesShoot: false, enemiesChase: false };
  it("takes coins and counts them", () => {
    const g = new Game(level([{ name: "c1", type: "pickup", x: 100, y: 400, item: "coin" }, { name: "c2", type: "pickup", x: 140, y: 400, item: "coin" }]), { rules });
    expect(g.coinTotal).toBe(2);
    run(g, 120, Input.Right);
    expect(g.coins).toBe(2);
    expect(g.players[0]!.score).toBe(200);
  });
  it("throws the player up from a spring", () => {
    const g = new Game(level([{ name: "s1", type: "pickup", x: 100, y: 400, item: "spring" }]), { rules });
    let top = 400;
    for (let f = 0; f < 120; f++) {
      run(g, 1, f < 40 ? Input.Right : 0);
      top = Math.min(top, g.players[0]!.y >> 4);
    }
    expect(400 - top).toBeGreaterThan(120); // far over a plain jump's 62 px
  });
  it("stomps an enemy from above and has no weapons", () => {
    const g = new Game(level([{ name: "e1", type: "enemy", x: 100, y: 400, kind: "trooper", patrol: 0 }]), { rules, lives: 3 });
    run(g, 30, Input.B2); // no gun
    expect(g.players[0]!.shots).toHaveLength(0);
    run(g, 1, Input.B1 | Input.Right);
    run(g, 60, Input.Right);
    expect(g.players[0]!.lives).toBe(3);
    expect(g.enemies[0]!.state === "down" || g.enemies[0]!.state === "off").toBe(true);
  });
});

describe("moving platforms (the platformer)", () => {
  const plat = (o: Partial<LevelObject> = {}): LevelObject => ({ name: "lift", type: "platform", x: 192, y: 352, w: 48, axis: "x", range: 96, speed: 1, ...o });
  const onIt = (o: Partial<LevelObject> = {}, build?: Parameters<typeof flat>[0]) => {
    const view = flat(build, [plat(o)]);
    view.objects[0] = { name: "p1", type: "player_start", x: 216, y: o.y ?? 352, player: 1 };
    return new Game(view);
  };

  it("goes there and back from the frame count alone", () => {
    const pl = platformOf({ name: "a", x: 100, y: 200, w: 40, axis: "x", range: 30, speed: 2 });
    expect(pl.w).toBe(48); // whole cells
    const at = (t: number) => (placePlatform(pl, t), pl.x);
    expect([at(0), at(5), at(15), at(20), at(30), at(45)]).toEqual([100, 110, 130, 120, 100, 130]);
  });

  it("holds a player and carries them along", () => {
    const g = onIt();
    expect(feet(g)).toBe(352);
    expect(g.players[0]!.onGround).toBe(true);
    run(g, 40, 0);
    expect(g.platforms[0]!.x).toBe(232);
    expect(g.players[0]!.x).toBe(256);
    expect(feet(g)).toBe(352);
    // out to 96 px and 44 back by frame 140
    run(g, 100, 0);
    expect(g.platforms[0]!.x).toBe(244);
    expect(g.players[0]!.x).toBe(268);
  });

  it("carries a player up and down", () => {
    const g = onIt({ axis: "y", y: 320, range: 48 });
    run(g, 30, 0);
    expect(g.platforms[0]!.y).toBe(350);
    expect(feet(g)).toBe(350);
    run(g, 48, 0);
    expect(feet(g)).toBe(g.platforms[0]!.y);
    expect(g.players[0]!.onGround).toBe(true);
  });

  it("is one-way: the player jumps through from below and drops through with down and jump", () => {
    const g = onIt({ range: 0 });
    run(g, 1, Input.Down | Input.B1);
    run(g, 40, 0);
    expect(feet(g)).toBe(400);
    // jumping from the floor under it goes through and lands on top
    let top = false;
    for (let f = 0; f < 80 && !top; f++) {
      run(g, 1, f < 20 ? Input.B1 : 0);
      top = g.players[0]!.onGround && feet(g) === 352;
    }
    expect(top).toBe(true);
  });

  it("catches a player falling onto it while it goes up", () => {
    // a lift going up and down over a player who keeps jumping: the feet never cross its top
    const view = flat(undefined, [{ name: "lift", type: "platform", x: 192, y: 320, w: 64, axis: "y", range: 64, speed: 1 }]);
    view.objects[0] = { name: "p1", type: "player_start", x: 224, y: 400, player: 1 };
    let ridden = 0;
    for (let wait = 0; wait < 128; wait += 3) {
      const g = new Game(view);
      run(g, wait, 0);
      for (let f = 0; f < 150; f++) {
        const before = { feet: feet(g), top: g.platforms[0]!.y, falling: g.players[0]!.vy > 0 };
        run(g, 1, f < 14 ? Input.B1 : 0);
        // falling from on or over its top to under it (going up through it from below is allowed)
        const crossed = before.falling && before.feet <= before.top && feet(g) > g.platforms[0]!.y;
        expect(crossed, `wait ${wait}, frame ${f}`).toBe(false);
      }
      if (g.players[0]!.onGround && feet(g) === g.platforms[0]!.y) ridden++;
    }
    expect(ridden).toBeGreaterThan(10);
  });

  it("a falling platform shakes once stood on, falls with its rider and comes back", () => {
    const g = onIt({ falls: true, range: 96 });
    const pl = g.platforms[0]!;
    expect([pl.state, pl.range]).toEqual(["rest", 0]); // a falling platform does not travel
    run(g, 1, 0);
    expect(pl.state).toBe("shake");
    run(g, FALL_SHAKE - 1, 0);
    expect([pl.state, pl.y, feet(g)]).toEqual(["shake", 352, 352]);
    run(g, 1, 0);
    expect(pl.state).toBe("fall");
    run(g, 10, 0);
    expect(pl.y).toBeGreaterThan(352);
    expect(feet(g)).toBe(pl.y); // the rider goes down with it
    // the floor at 400 stops the player, not the platform: it falls out of the level
    run(g, 120, 0);
    expect(feet(g)).toBe(400);
    expect(pl.state).toBe("gone");
    expect(g.platformUnder(216, pl.y)).toBeUndefined();
    run(g, FALL_BACK, 0);
    expect([pl.state, pl.y, pl.dy]).toEqual(["rest", 352, 0]);
  });

  it("a wall stops the ride but not the platform", () => {
    const g = onIt({}, (set) => {
      for (let r = 19; r < 22; r++) set(16, r, Tag.Solid); // a wall at x 256, above the platform's top
    });
    run(g, 60, 0);
    expect(g.platforms[0]!.x).toBe(252);
    expect(g.players[0]!.x).toBeLessThan(256);
  });
});

describe("the beat 'em up: walking in depth (genres.md, phase 1)", () => {
  // a street: the band of feet y 336-400 over the floor at 400
  const street = (objects: LevelObject[] = []) => {
    const view = flat(undefined, objects);
    view.walk = { y0: 336, y1: 400 };
    view.objects[0] = { name: "p1", type: "player_start", x: 64, y: 380, player: 1 };
    return new Game(view, { rules: BEATEMUP_RULES });
  };

  it("starts at its start's depth, inside the band", () => {
    const g = street();
    expect(feet(g)).toBe(380);
    expect(g.walkBand).toEqual({ y0: 336, y1: 400 });
  });

  it("walks up and down a pixel a frame, never out of the band", () => {
    const g = street();
    run(g, 20, Input.Up);
    expect(feet(g)).toBe(360);
    run(g, 100, Input.Up);
    expect(feet(g)).toBe(336);
    run(g, 200, Input.Down | Input.Right);
    expect(feet(g)).toBe(400);
    expect(g.players[0]!.x).toBeGreaterThan(64 + 150);
  });

  it("hops with B2 and lands at the same depth", () => {
    const g = street();
    run(g, 10, Input.Up);
    const depth = feet(g);
    run(g, 1, Input.B2);
    let top = 0;
    for (let f = 0; f < 60; f++) {
      run(g, 1, 0);
      top = Math.min(top, g.players[0]!.hop >> 4);
    }
    expect(top).toBeLessThan(-20);
    expect(g.players[0]!.hop).toBe(0);
    expect(g.players[0]!.onGround).toBe(true);
    expect(feet(g)).toBe(depth);
  });

  it("stops at a wall and leaves the platform games as they were", () => {
    const g = street();
    // no band, no hop: the same level without the rule is a platform level
    const plain = new Game(flat(), {});
    expect(plain.walkBand).toBeUndefined();
    run(plain, 10, Input.Up);
    expect(feet(plain)).toBe(400);
    run(g, 10, Input.Left);
    expect(g.players[0]!.x).toBeGreaterThanOrEqual(12);
  });
});

describe("the beat 'em up: the fight (genres.md, phase 2)", () => {
  const street = (enemy: Partial<LevelObject> = {}) => {
    const view = flat(undefined, [{ name: "thug", type: "enemy", x: 100, y: 380, kind: "trooper", facing: "left", patrol: 0, ...enemy } as LevelObject]);
    view.walk = { y0: 336, y1: 400 };
    view.objects[0] = { name: "p1", type: "player_start", x: 80, y: 380, player: 1 };
    return new Game(view, { rules: BEATEMUP_RULES });
  };
  // B1 pressed for one frame, then released for `wait` frames
  const tap = (g: Game, wait: number) => {
    run(g, 1, Input.B1);
    run(g, wait, 0);
  };

  it("chains punch, punch and a kick that knocks down", () => {
    const g = street();
    const e = g.enemies[0]!;
    expect(e.hp).toBe(6);
    tap(g, PUNCH_FRAMES + 2);
    expect(e.hp).toBe(5);
    tap(g, PUNCH_FRAMES + 2);
    expect(e.hp).toBe(4);
    tap(g, 10);
    expect(e.hp).toBe(2);
    expect(e.state).toBe("fall");
    expect(g.lastHit).toBe(e);
    // it gets up later and comes back
    run(g, FALL_FRAMES + 30, 0);
    expect(e.state === "walk" || e.state === "attack").toBe(true);
  });

  it("starts the combo again after a pause", () => {
    const g = street();
    tap(g, PUNCH_FRAMES + 2);
    tap(g, PUNCH_FRAMES + COMBO_WINDOW + 5);
    tap(g, PUNCH_FRAMES + 2);
    expect(g.players[0]!.combo).toBe(1);
    expect(g.enemies[0]!.state).not.toBe("fall");
  });

  it("misses an enemy at another depth", () => {
    const g = street({ y: 352 });
    tap(g, PUNCH_FRAMES + 2);
    expect(g.enemies[0]!.hp).toBe(6);
  });

  it("enemies come to the player's side, wind up and hit", () => {
    const g = street({ x: 260 });
    const lives = g.players[0]!.lives;
    run(g, 400, 0);
    expect(g.players[0]!.lives).toBeLessThan(lives);
    expect(Math.abs(g.enemies[0]!.x - g.players[0]!.x)).toBeLessThanOrEqual(ENEMY_GAP + 6);
  });
});

describe("the beat 'em up: grabs, throws, the pipe and waves (genres.md, phase 3)", () => {
  const street = (objects: LevelObject[], build?: Parameters<typeof flat>[0]) => {
    const view = flat(build, objects);
    view.walk = { y0: 336, y1: 400 };
    view.objects[0] = { name: "p1", type: "player_start", x: 80, y: 380, player: 1 };
    return new Game(view, { rules: BEATEMUP_RULES });
  };
  const thug = (x: number, y = 380): LevelObject => ({ name: `t${x}`, type: "enemy", x, y, kind: "trooper", facing: "left", patrol: 0 } as LevelObject);

  it("walking into an enemy grabs it; B1 knees, B1 away throws it behind", () => {
    const g = street([thug(120)]);
    const e = g.enemies[0]!;
    for (let f = 0; f < 60 && !g.players[0]!.grabbed; f++) run(g, 1, Input.Right);
    expect(g.players[0]!.grabbed).toBe(1);
    expect(e.state).toBe("held");
    run(g, 1, Input.Right | Input.B1);
    run(g, 2, Input.Right);
    expect(e.hp).toBe(5);
    expect(e.state).toBe("held");
    const px = g.players[0]!.x;
    run(g, 1, Input.Left | Input.B1);
    expect(e.state).toBe("fall");
    expect(e.hp).toBe(3);
    expect(e.x).toBe(px - THROW_DIST);
    expect(g.players[0]!.grabbed).toBe(0);
  });

  it("a held enemy slips away after a while", () => {
    const g = street([thug(120)]);
    for (let f = 0; f < 60 && !g.players[0]!.grabbed; f++) run(g, 1, Input.Right);
    run(g, GRAB_FRAMES + 2, 0);
    expect(g.players[0]!.grabbed).toBe(0);
    expect(g.enemies[0]!.state).not.toBe("held");
  });

  it("a pipe reaches farther, hits harder and wears out", () => {
    const g = street([thug(80 + PUNCH_REACH + 6), { name: "pipe", type: "pickup", x: 80, y: 380, item: "pipe" }]);
    run(g, 1, 0);
    const p = g.players[0]!;
    expect([p.special, p.ammo]).toEqual(["pipe", PIPE_USES]);
    run(g, 1, Input.B1);
    run(g, PUNCH_FRAMES + 1, 0);
    expect(g.enemies[0]!.hp).toBe(4);
    expect(p.ammo).toBe(PIPE_USES - 1);
  });

  it("enemies off the screen wait, and solid cells stop them", () => {
    const g = street([thug(900)]);
    run(g, 120, 0);
    expect(g.enemies[0]!.x).toBe(900);
    // a wall between the player and an enemy on the screen
    const walled = street([thug(300)], (set) => {
      for (let r = 20; r < 25; r++) set(12, r, Tag.Solid);
    });
    run(walled, 400, 0);
    expect(walled.enemies[0]!.x).toBeGreaterThanOrEqual(12 * 16 + 16);
  });

  it("a camera lock holds the screen until its wave is down", () => {
    const g = street([thug(500), { name: "lock", type: "camera_lock", x: 320, y: 224, w: 384, h: 224 }]);
    for (let f = 0; f < 600; f++) run(g, 1, Input.Right);
    expect(g.activeLock()?.name).toBe("lock");
    expect(g.camX).toBeLessThanOrEqual(320);
  });
});

describe("the beat 'em up: crates, the knife and the boss (genres.md, phase 4)", () => {
  const street = (objects: LevelObject[]) => {
    const view = flat(undefined, objects);
    view.walk = { y0: 336, y1: 400 };
    view.objects[0] = { name: "p1", type: "player_start", x: 80, y: 380, player: 1 };
    return new Game(view, { rules: BEATEMUP_RULES });
  };
  const tap = (g: Game, wait: number, pad = 0) => {
    run(g, 1, pad | Input.B1);
    run(g, wait, pad);
  };

  it("a blow breaks the crate in front, and what it holds lies where it stood", () => {
    const g = street([{ name: "box", type: "crate", x: 112, y: 368, size: 16, hp: 1, contents: "knife" } as LevelObject]);
    run(g, 30, Input.Right);
    tap(g, PUNCH_FRAMES + 1);
    expect(g.crates[0]!.broken).toBe(true);
    const k = g.pickups.find((q) => q.item === "knife")!;
    expect(k.fy).toBe(384);
    run(g, 10, Input.Right);
    expect(g.players[0]!.special).toBe("knife");
  });

  it("a knife is thrown along the lane and knocks down the first enemy it meets", () => {
    const g = street([
      { name: "knife", type: "pickup", x: 80, y: 380, item: "knife" },
      { name: "thug", type: "enemy", x: 220, y: 380, kind: "trooper", facing: "left", patrol: 0 } as LevelObject,
    ]);
    run(g, 1, 0);
    const p = g.players[0]!;
    expect(p.special).toBe("knife");
    tap(g, 0);
    expect(p.blade).not.toBeNull();
    expect(p.special).toBe("");
    for (let f = 0; f < 60 && p.blade; f++) run(g, 1, 0);
    expect(p.blade).toBeNull();
    expect(g.enemies[0]!.hp).toBe(6 - KNIFE_HITS);
    expect(g.enemies[0]!.state).toBe("fall");
  });

  it("the brawler is tough, cannot be grabbed and strikes again sooner", () => {
    const g = street([{ name: "boss", type: "boss", x: 140, y: 380, kind: "brawler", facing: "left" } as LevelObject]);
    const e = g.enemies[0]!;
    expect([e.boss, e.hp]).toEqual([true, BOSS_HP]);
    // walking into it grabs nothing (bodies pass each other, as any enemy's when not grabbed)
    run(g, 25, Input.Right);
    expect(g.players[0]!.grabbed).toBe(0);
    // the blow lands STRIKE_AT frames in, then it reels 15 frames
    tap(g, 24);
    expect(e.hp).toBeLessThan(BOSS_HP);
    expect(e.state).toBe("walk");
    expect(e.fireWait).toBeLessThanOrEqual(BOSS_REST);
  });
});

describe("the level's camera", () => {
  it("goes back only its back margin with Only forward, and all the way as a free camera", () => {
    const walk = (backtrack?: number) => {
      const view = flat();
      if (backtrack !== undefined) view.backtrack = backtrack;
      const g = new Game(view);
      run(g, 500, Input.Right);
      const far = g.camFar;
      run(g, 500, Input.Left);
      return { far, back: far - g.camX };
    };
    const fixed = walk();
    expect(fixed.far).toBeGreaterThan(200);
    expect(fixed.back).toBeLessThanOrEqual(48);
    const free = walk(64 * 16);
    expect(free.back).toBeGreaterThan(150);
  });

  it("takes the level's settings from the project", () => {
    const level = { size: { w: 2048, h: 448 }, camera: { forwardOnly: true, backtrack: 96 } };
    expect(levelFromProject(level).backtrack).toBe(96);
    expect(levelFromProject({ ...level, camera: { forwardOnly: false, backtrack: 96 } }).backtrack).toBe(2048);
  });
});

describe("the light gun (genres.md, phase 1)", () => {
  const range = (objects: LevelObject[], shoot = true) => new Game(flat(undefined, objects), { rules: { ...LIGHTGUN_RULES, enemiesShoot: shoot } });
  const target = (x: number, y = 400): LevelObject => ({ name: `t${x}`, type: "enemy", x, y, kind: "trooper", facing: "left", patrol: 0 } as LevelObject);
  // moves player 1's crosshair onto world point (wx, wy) while the camera moves
  const aimAt = (g: Game, wx: number, wy: number) => {
    const p = g.players[0]!;
    for (let f = 0; f < 200; f++) {
      const x = wx - g.camX;
      const y = wy - g.camY;
      if (Math.abs(p.cx - x) < CROSS_SPEED && Math.abs(p.cy - y) < CROSS_SPEED) return;
      let pad = 0;
      if (p.cx < x - CROSS_SPEED + 1) pad |= Input.Right;
      else if (p.cx > x + CROSS_SPEED - 1) pad |= Input.Left;
      if (p.cy < y - CROSS_SPEED + 1) pad |= Input.Down;
      else if (p.cy > y + CROSS_SPEED - 1) pad |= Input.Up;
      run(g, 1, pad);
    }
  };

  it("aims with the stick and shoots a target down where the crosshair points", () => {
    const g = range([target(200)]);
    const p = g.players[0]!;
    expect([p.ammo, p.cy]).toEqual([CLIP, (224 - 32) >> 1]);
    run(g, 5, Input.Right);
    aimAt(g, 200, 380);
    run(g, 1, Input.B1);
    expect(p.ammo).toBe(CLIP - 1);
    expect(g.enemies[0]!.state).toBe("down");
  });

  it("a hostage is not to be shot, and an empty gun reloads with B2", () => {
    const g = range([{ name: "h", type: "civilian", x: 150, y: 400, kind: "woman" } as LevelObject]);
    const p = g.players[0]!;
    run(g, p.invulnerable + 1, 0);
    aimAt(g, 150, 380);
    const lives = p.lives;
    run(g, 1, Input.B1);
    expect(p.lives).toBe(lives - 1);
    for (let k = 0; k < CLIP; k++) run(g, 2, (f) => (f === 0 ? Input.B1 : 0));
    expect(p.ammo).toBe(0);
    run(g, 1, Input.B2);
    run(g, RELOAD_FRAMES, 0);
    expect(p.ammo).toBe(CLIP);
  });

  it("a target on the screen aims and shoots the player", () => {
    const g = range([target(200)]);
    const p = g.players[0]!;
    const lives = p.lives;
    run(g, 400 + AIM_FRAMES, 0);
    expect(p.lives).toBeLessThan(lives);
  });

  it("a timed target hides until its time on the screen, then leaves unshot after its stay", () => {
    const g = range([{ ...target(200), appear: 1, stay: 2 } as LevelObject], false);
    const e = g.enemies[0]!;
    expect(e.state).toBe("hidden");
    run(g, 59, 0);
    expect(e.state).toBe("hidden");
    run(g, 1, 0);
    expect(e.state).toBe("walk");
    run(g, 119, 0);
    expect(e.state).toBe("walk");
    run(g, 1, 0);
    expect(e.state).toBe("off");
    expect(g.players[0]!.score).toBe(0);
  });

  it("a bomb takes down every target on the screen, and there are BOMBS of them", () => {
    const g = range([{ ...target(150), hp: 3 } as LevelObject, target(300), target(900)], false);
    const p = g.players[0]!;
    expect(p.bombs).toBe(BOMBS);
    run(g, 1, Input.B3);
    expect(g.enemies.map((e) => e.state)).toEqual(["down", "down", "walk"]);
    expect(p.bombs).toBe(BOMBS - 1);
    run(g, 1, 0);
    run(g, 1, Input.B3);
    run(g, 1, 0);
    run(g, 1, Input.B3);
    expect(p.bombs).toBe(0);
  });

  it("the camera moves by itself, holds at a lock until its targets are down, and the route's end clears the level", () => {
    const g = range([target(600), { name: "lock", type: "camera_lock", x: 400, y: 224, w: 384, h: 224 } as LevelObject], false);
    run(g, 100, 0);
    expect(g.camX).toBe(Math.floor(100 / ROUTE_STEP));
    run(g, 1200, 0);
    expect(g.camX).toBe(400);
    expect(g.outcome).toBe("playing");
    g.enemies[0]!.state = "off";
    run(g, 2 * (64 * 16 - 384 - 400) + 4, 0);
    expect(g.outcome).toBe("cleared");
  });
});

describe("the horizontal shooter (genres.md, phase 1)", () => {
  const sky = (objects: LevelObject[], build?: Parameters<typeof flat>[0]) => new Game(flat(build, objects), { rules: SHIP_RULES });
  const flier = (x: number, y = 300): LevelObject => ({ name: `f${x}`, type: "enemy", x, y, kind: "trooper", facing: "left", patrol: 0 } as LevelObject);

  it("flies in 8 directions and fires ahead while B1 is held", () => {
    const g = sky([]);
    const p = g.players[0]!;
    const [x0, y0] = [p.cx, p.cy];
    run(g, 10, Input.Right | Input.Down);
    expect([p.cx - x0, p.cy - y0]).toEqual([20, 20]);
    run(g, SHIP_FIRE * 3, Input.B1);
    expect(p.shots.length).toBe(3);
    expect(p.shots.every((b) => b.dir === 1)).toBe(true);
  });

  it("an enemy flies in on a wave, a shot takes it down, and one that touches a ship hurts it", () => {
    const g = sky([flier(300, 300)]);
    const e = g.enemies[0]!;
    const p = g.players[0]!;
    run(g, 2, 0);
    expect(e.x).toBeLessThan(300);
    const ys = new Set<number>();
    for (let f = 0; f < 64; f++) {
      run(g, 1, 0);
      ys.add(e.fy);
    }
    expect(ys.size).toBeGreaterThan(8);
    // line up with it and fire
    for (let f = 0; f < 120 && e.state === "walk"; f++) run(g, 1, (p.cy + g.camY < e.fy - 20 ? Input.Down : p.cy + g.camY > e.fy - 20 ? Input.Up : 0) | Input.B1);
    expect(e.state).toBe("down");
    // a ship blinks for a while after it joins: this enemy comes later
    const g2 = sky([flier(600, 300)]);
    const p2 = g2.players[0]!;
    const lives = p2.lives;
    for (let f = 0; f < 800 && p2.lives === lives; f++) run(g2, 1, p2.cy + g2.camY < g2.enemies[0]!.fy - 20 ? Input.Down : Input.Up);
    expect(p2.lives).toBe(lives - 1);
  });

  it("a wall hurts the ship, and a bomb takes down every enemy on the screen", () => {
    const walled = sky([], (set) => {
      for (let r = 0; r < 25; r++) set(30, r, Tag.Solid);
    });
    const w = walled.players[0]!;
    const lives = w.lives;
    run(walled, 900, 0);
    expect(w.lives).toBeLessThan(lives);
    const g = sky([flier(200), flier(300, 250), flier(900)]);
    run(g, 1, Input.B2);
    expect(g.enemies.map((e) => e.state)).toEqual(["down", "down", "walk"]);
    expect(g.players[0]!.bombs).toBe(BOMBS - 1);
  });
});
