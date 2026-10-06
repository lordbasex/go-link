// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { airFrame, heroLook, LOOK_ANIMS, loopFrame, moveFrame } from "./anims";

const has = (names: string[]) => (n: string) => names.includes(n);
const bit = (id: (typeof LOOK_ANIMS)[number]) => 1 << LOOK_ANIMS.indexOf(id);

describe("which animation a hero's move shows", () => {
  it("walks with its own walk at its speed, and runs with it twice as fast when it has no run", () => {
    const look = heroLook(has(["idle", "walk"]))!;
    expect([look.anims.walk, look.anims.run, look.walkRate, look.runRate]).toEqual(["walk", "walk", 2, 4]);
    // nine frames at 12 fps: every one shows, one each five game frames
    const frames = Array.from({ length: 60 }, (_, t) => loopFrame(9, 12, Math.floor((t * look.walkRate) / 2)));
    expect(new Set(frames).size).toBe(9);
    expect(frames.slice(0, 11)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2]);
  });

  it("keeps Willy as he was: his run walks at half speed, and his own knife, turn, kick and thumbs up fit their moves", () => {
    const look = heroLook(has(["idle", "run", "turn", "jump", "jump_kick", "crouch", "crawl", "machine_gun", "knife", "bazooka", "yawn", "thumbs_up"]))!;
    expect([look.anims.walk, look.walkRate, look.anims.run, look.runRate]).toEqual(["run", 1, "run", 2]);
    // engine.c willy_look's fit
    expect(look.fit).toBe(0xe08);
    expect(look.anims.land).toBe("idle");
  });

  it("uses both when it has a walk and a run, and stands with any animation when it has no idle", () => {
    const look = heroLook(has(["walk", "run"]), ["walk", "run"])!;
    expect([look.anims.walk, look.walkRate, look.anims.run, look.runRate, look.anims.idle]).toEqual(["walk", 2, "run", 2, "walk"]);
    expect(heroLook(has([]))).toBeNull();
    expect(heroLook(has(["wave"]), ["wave"])!.anims.idle).toBe("wave");
  });

  it("spreads a move's own frames over it when they do not fit at their speed, never a stand-in's", () => {
    // seven frames at 14 fps in a 20 frame kick: all seven show
    expect(new Set(Array.from({ length: 20 }, (_, t) => moveFrame(7, 14, t, 20, true))).size).toBe(7);
    // without fit, the old way: the frames that fit at 14 fps (0 to 4)
    expect(Math.max(...Array.from({ length: 20 }, (_, t) => moveFrame(7, 14, t, 20, false)))).toBe(4);
    // a move that fits keeps its speed (Willy's knife: four frames at 16 fps over 16)
    expect(Array.from({ length: 16 }, (_, t) => moveFrame(4, 16, t, 16, true))).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
    expect(moveFrame(3, 10, 999, 8, true)).toBe(2);
    // the turn standing in with the run does not fit
    expect(heroLook(has(["idle", "run"]))!.fit & bit("turn")).toBe(0);
  });

  it("spreads the jump's frames over rising and falling, however many it has", () => {
    const phases = [-80, -10, 10, 80];
    expect(phases.map((vy) => airFrame(5, vy))).toEqual([1, 2, 3, 4]); // Willy's
    expect(phases.map((vy) => airFrame(3, vy))).toEqual([1, 1, 2, 2]);
    expect(phases.map((vy) => airFrame(9, vy))).toEqual([1, 3, 5, 7]);
    expect(phases.map((vy) => airFrame(1, vy))).toEqual([0, 0, 0, 0]);
  });
});
