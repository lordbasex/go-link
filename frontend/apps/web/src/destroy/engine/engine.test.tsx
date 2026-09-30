// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { frameAt } from "./anim";
import { NO_CONTROLS, type Controls } from "./controls";
import { Game, TIME_LIMIT } from "./game";
import { Civilian } from "./civilian";
import { Player } from "./player";
import { ALERT_RADIUS, Enemy, enemyCount, placeEnemies } from "./enemy";
import { ENEMY_DAMAGE, HEALTH_PER_LIFE, LIVES } from "./game";
import { CHEER_TIME, LIFT_TIME, civilianCount, placeCivilians, seeded } from "./civilian";
import { SpatialGrid, rayBox } from "./grid";
import { mover, step } from "./physics";
import type { BodyInit } from "./types";
import { World } from "./world";

const box = (x: number, y: number, w: number, h: number, kind: BodyInit["kind"] = "box", parent = -1): BodyInit => ({ x, y, w, h, kind, parent, color: "#888" });
const SIZE = { width: 1000, height: 1000 };

describe("grid and rays", () => {
  it("finds what a ray crosses, and where", () => {
    expect(rayBox(0, 50, 1, 0, { x: 100, y: 40, w: 20, h: 20 })).toEqual({ tIn: 100, tOut: 120 });
    expect(rayBox(0, 10, 1, 0, { x: 100, y: 40, w: 20, h: 20 })).toBeNull();
    const g = new SpatialGrid(50);
    g.insert(7, { x: 400, y: 90, w: 10, h: 10 });
    expect(g.alongRay(0, 95, 1, 0, 500).has(7)).toBe(true);
    expect(g.alongRay(0, 400, 1, 0, 500).has(7)).toBe(false);
    g.remove(7);
    expect(g.alongRay(0, 95, 1, 0, 500).has(7)).toBe(false);
  });

  it("hits the nearest piece, a card or a word, and passes through layout bands", () => {
    const w = new World([box(200, 0, 300, 200), box(260, 80, 40, 20, "word", 0), box(700, 80, 40, 20, "word"), box(0, 400, 1000, 300, "backdrop"), box(600, 500, 40, 20, "word", 3)], SIZE);
    expect(w.raycast(0, 90, 1, 0, 1000)?.id).toBe(0);
    // Shot down from above: the card is the floor, it goes first.
    expect(w.raycast(280, -10, 0, 1, 1000)?.id).toBe(0);
    // The band is not a target: the word on it is.
    expect(w.raycast(0, 510, 1, 0, 1000)?.id).toBe(4);
  });
});

describe("damage", () => {
  it("wears a body down, then breaks it with everything on it", () => {
    const w = new World([box(0, 0, 100, 100), box(10, 10, 30, 12, "word", 0), box(500, 0, 30, 12, "word")], SIZE);
    const card = w.bodies[0]!;
    // Health by kind, whatever the size.
    expect(card.maxHp).toBe(105);
    expect(w.bodies[1]!.maxHp).toBe(12);
    expect(w.damage(0, 1, 5, 5)?.kind).toBe("hurt");
    const r = w.damage(0, card.hp, 5, 5);
    expect(r).toMatchObject({ kind: "killed", ids: [0, 1] });
    expect(w.alive).toBe(1);
    expect(w.destroyed()).toBeCloseTo((4 + 1) / (4 + 1 + 1));
    expect(w.raycast(0, 15, 1, 0, 400)).toBeNull();
  });

  it("layout bands never count and crumble once nothing is left over them", () => {
    const w = new World([box(0, 0, 1000, 100, "backdrop"), box(10, 10, 30, 12, "word"), box(0, 300, 1000, 100, "backdrop")], SIZE);
    expect(w.alive).toBe(1);
    expect(w.raycast(0, 5, 1, 0, 1000)).toBeNull();
    // The empty band goes at once; the other waits for its word.
    expect(w.collapseBackdrops()).toEqual([2]);
    w.damage(1, 99, 0, 0);
    expect(w.collapseBackdrops()).toEqual([0]);
    expect(w.alive).toBe(0);
    expect(w.destroyed()).toBe(1);
  });

  it("blasts the parts near an explosion", () => {
    const w = new World([box(100, 100, 20, 10, "word"), box(160, 100, 20, 10, "word"), box(700, 700, 20, 10, "word")], SIZE);
    // The splash (18) breaks the words (12) around the one struck (40).
    const hits = w.blast(140, 105, 80, 40, 18, 0);
    expect(hits.filter((h) => h.kind === "killed")).toHaveLength(2);
    expect(w.alive).toBe(1);
  });
});

describe("physics", () => {
  it("falls through a layout band to the piece below", () => {
    const w = new World([box(0, 100, 1000, 60, "backdrop"), box(0, 400, 400, 20)], SIZE);
    const m = mover(100, 0, 10);
    for (let i = 0; i < 120; i++) step(m, w, 1 / 60, i / 60);
    expect(m.y).toBe(400);
  });

  it("lands on a ledge from above, passes it from below, and drops to the floor when it breaks", () => {
    const w = new World([box(0, 300, 400, 20)], SIZE);
    const m = mover(100, 200, 10);
    for (let i = 0; i < 120; i++) step(m, w, 1 / 60, i / 60);
    expect(m.onGround && m.ground === 0 && m.y === 300).toBe(true);
    // From below: jump through it.
    const up = mover(100, 400, 10);
    up.vy = -900;
    for (let i = 0; i < 20; i++) step(up, w, 1 / 60, i / 60);
    expect(up.y).toBeLessThan(300);
    w.damage(0, 999, 0, 0);
    for (let i = 0; i < 120; i++) step(m, w, 1 / 60, 3 + i / 60);
    expect(m.y).toBe(w.floor);
  });
});

describe("mission", () => {
  it("counts rescues and completes at 100 % with everyone saved", () => {
    const g = new Game([box(0, 400, 1000, 20), box(100, 150, 200, 200), box(600, 150, 200, 200)], SIZE, { x: 500, y: 400 }, { rand: () => 0.5 });
    expect(g.civilians).toHaveLength(6);
    const idle: Controls = { ...NO_CONTROLS };
    g.step(1 / 60, idle);
    expect(g.complete).toBe(false);
    const ev = g.finishForTest();
    expect(ev.some((e) => e.type === "rescued")).toBe(true);
    let done = false;
    for (let i = 0; i < 200 && !done; i++) done = g.step(1 / 60, idle).some((e) => e.type === "complete");
    expect(done).toBe(true);
    expect(g.stats()).toMatchObject({ rescued: 6, people: 6, left: 0, destroyed: 1 });
  });

  it("shooting down breaks the floor underfoot and the hero falls", () => {
    const g = new Game([box(0, 400, 1000, 20), box(480, 300, 60, 16, "word")], SIZE, { x: 500, y: 290 });
    const down: Controls = { ...NO_CONTROLS, fire: true, down: true };
    for (let i = 0; i < 120; i++) g.step(1 / 60, down);
    expect(g.world.bodies[1]!.alive).toBe(false);
    expect(g.player.m.y).toBeGreaterThan(300);
  });

  it("a card takes three or four rockets; a word dies from the splash", () => {
    const g = new Game([box(0, 400, 1000, 20), box(580, 320, 100, 80), box(560, 300, 30, 14, "word")], SIZE, { x: 500, y: 400 });
    let rockets = 0;
    for (let i = 0; i < 60 * 8 && g.world.bodies[1]!.alive; i++) {
      const fire = i % 60 === 0;
      if (fire) rockets++;
      g.step(1 / 60, { ...NO_CONTROLS, bazooka: fire });
    }
    expect(g.world.bodies[1]!.alive).toBe(false);
    expect(rockets).toBeGreaterThanOrEqual(3);
    expect(rockets).toBeLessThanOrEqual(4);
    expect(g.world.bodies[2]!.alive).toBe(false);
  });

  it("shows a health bar on a piece that is hit, going down with each hit", () => {
    const g = new Game([box(0, 400, 1000, 20), box(560, 330, 100, 60)], SIZE, { x: 500, y: 400 });
    for (let i = 0; i < 20; i++) g.step(1 / 60, { ...NO_CONTROLS, fire: true });
    const bar = g.bars.get(1);
    expect(bar).toBeDefined();
    expect(bar!.shown).toBeLessThan(1);
    for (let i = 0; i < 200; i++) g.step(1 / 60, NO_CONTROLS);
    expect(g.bars.has(1)).toBe(false);
  });

  it("jumps twice and flies a moment with the jetpack", () => {
    const g = new Game([box(0, 900, 1000, 20)], SIZE, { x: 500, y: 900 });
    // Nobody waiting next to the hero (there, jump would rescue instead).
    g.civilians.forEach((c) => c.rescue());
    const hold: Controls = { ...NO_CONTROLS, jump: true };
    g.step(1 / 60, hold);
    for (let i = 0; i < 20; i++) g.step(1 / 60, hold);
    g.step(1 / 60, NO_CONTROLS);
    g.step(1 / 60, hold); // the double jump
    let top = 900;
    for (let i = 0; i < 90; i++) {
      g.step(1 / 60, hold);
      top = Math.min(top, g.player.m.y);
    }
    expect(g.player.fuel).toBeLessThan(2);
    // Well above a single jump's reach.
    expect(900 - top).toBeGreaterThan(350);
  });

  it("the machine gun breaks a word in front of the hero", () => {
    const g = new Game([box(0, 400, 1000, 20), box(560, 350, 30, 14, "word")], SIZE, { x: 500, y: 400 });
    const fire: Controls = { ...NO_CONTROLS, fire: true };
    let killed = false;
    for (let i = 0; i < 120 && !killed; i++) killed = g.step(1 / 60, fire).some((e) => e.type === "hit" && e.result.kind === "killed" && e.result.ids.includes(1));
    expect(killed).toBe(true);
  });
});

describe("people to rescue", () => {
  const cards = (n: number): BodyInit[] => Array.from({ length: n }, (_, i) => box(100 + (i % 5) * 150, 200 + Math.floor(i / 5) * 400, 100, 90));
  it("hides one per ~800 px, each in a different piece, the same for the same seed", () => {
    expect(civilianCount(3000)).toBe(6);
    expect(civilianCount(8000)).toBe(10);
    expect(civilianCount(40000)).toBe(16);
    const size = { width: 1000, height: 8200 };
    const a = placeCivilians(new World(cards(100), size), seeded(42), 100);
    const b = placeCivilians(new World(cards(100), size), seeded(42), 100);
    const c = placeCivilians(new World(cards(100), size), seeded(7), 100);
    expect(a).toHaveLength(10);
    expect(new Set(a.map((p) => p.cage)).size).toBe(10);
    expect(a.map((p) => [p.kind, p.cage])).toEqual(b.map((p) => [p.kind, p.cage]));
    expect(a.map((p) => p.cage)).not.toEqual(c.map((p) => p.cage));
    expect(new Set(a.map((p) => p.kind)).size).toBe(4);
    // Spread from top to bottom, never in the starting sky.
    expect(Math.min(...a.map((p) => p.m.y))).toBeGreaterThan(100);
    expect(Math.max(...a.map((p) => p.m.y))).toBeGreaterThan(6000);
  });

  it("everyone rescued cheers, is lifted away by the beam and leaves the page", () => {
    const g = new Game([box(0, 900, 1000, 20), ...cards(40)], { width: 1000, height: 8200 }, { x: 500, y: 900 }, { seed: 3, enemies: false });
    g.finishForTest();
    expect(g.civilians.every((c) => c.state === "cheering")).toBe(true);
    const ev: string[] = [];
    for (let i = 0; i < 60 * (CHEER_TIME + LIFT_TIME + 0.3); i++) ev.push(...g.step(1 / 60, NO_CONTROLS).map((e) => e.type));
    expect(g.civilians.every((c) => c.state === "gone")).toBe(true);
    expect(ev.filter((e) => e === "evacuated")).toHaveLength(g.civilians.length);
    expect(g.stats().rescued).toBe(g.civilians.length);
  });
});

describe("fixes from play testing", () => {
  it("a band never hides while a piece inside it (even sticking out of its box) is whole", () => {
    // The band's box is 0-100, its word sits at 150 (overflowing), still inside it on the page tree.
    const w = new World([box(0, 0, 1000, 100, "backdrop"), box(10, 150, 40, 14, "word", 0)], SIZE);
    expect(w.collapseBackdrops()).toEqual([]);
    w.damage(1, 99, 0, 0);
    expect(w.collapseBackdrops()).toEqual([0]);
  });

  it("the last baby: trapped in a piece that breaks, then reachable from the same ledge or near it, or by touching", () => {
    const w = new World([box(0, 500, 1000, 20), box(600, 440, 60, 60, "image")], SIZE);
    const baby = new Civilian("baby", 630, 500, 1, 0);
    baby.update(1 / 60, 0, w);
    expect(baby.state).toBe("trapped");
    w.damage(1, 999, 0, 0);
    baby.update(1 / 60, 0, w);
    expect(baby.state).toBe("waiting");
    // 110 px apart: out of reach; 60 px: within reach (48 px from the bodies).
    expect(baby.canBeRescued(520, 500)).toBe(false);
    expect(baby.canBeRescued(570, 500)).toBe(true);
    // From a ledge 40 px higher, too.
    expect(baby.canBeRescued(600, 460)).toBe(true);
    expect(baby.touching(630, 500)).toBe(true);
  });

  it("the last few pieces crumble by themselves when left alone", () => {
    const bodies = [box(0, 900, 1000, 20), ...Array.from({ length: 40 }, (_, i) => box(20 * i, 100, 16, 12, "word"))];
    const g = new Game(bodies, SIZE, { x: 500, y: 900 }, { seed: 1 });
    for (let i = 1; i <= 39; i++) g.world.kill(i);
    g.civilians.forEach((c) => c.rescue());
    let done = false;
    for (let i = 0; i < 60 * 25 && !done; i++) done = g.step(1 / 60, NO_CONTROLS).some((e) => e.type === "complete");
    expect(done).toBe(true);
  });

  it("the mission bar is 100 % exactly when the mission is complete", () => {
    const g = new Game([box(0, 900, 1000, 20), box(100, 100, 30, 12, "word")], SIZE, { x: 500, y: 900 }, { seed: 2 });
    g.world.kill(0);
    expect(g.progress()).toBeLessThan(1);
    g.civilians.forEach((c) => c.rescue());
    expect(g.progress()).toBeLessThan(1); // one piece left
    g.world.kill(1);
    expect(g.progress()).toBe(1);
  });

  it("ends the mission when the time runs out", () => {
    const g = new Game([box(0, 900, 1000, 20)], SIZE, { x: 500, y: 900 }, { seed: 4 });
    g.time = TIME_LIMIT - 0.01;
    expect(g.step(1 / 30, NO_CONTROLS).some((e) => e.type === "timeout")).toBe(true);
    expect(g.failed).toBe(true);
  });

  it("aims in eight directions and shows the matching pose", () => {
    const w = new World([box(0, 900, 1000, 20)], SIZE);
    const p = new Player(500, 900);
    const aim = (c: Partial<Controls>) => {
      const ev = p.update(0.2, 0, { ...NO_CONTROLS, fire: true, ...c }, { jump: false, fire: true, knife: false, bazooka: false }, w);
      const s = ev.find((e) => e.type === "shoot") as { dx: number; dy: number } | undefined;
      return { pose: p.pose().anim, dir: s && [Math.sign(Math.round(s.dx * 10)), Math.sign(Math.round(s.dy * 10))] };
    };
    expect(aim({})).toEqual({ pose: "machine_gun", dir: [1, 0] });
    expect(aim({ up: true })).toEqual({ pose: "aim_up", dir: [0, -1] });
    expect(aim({ up: true, moveX: 1 })).toEqual({ pose: "aim_up45", dir: [1, -1] });
    expect(aim({ down: true })).toEqual({ pose: "aim_down", dir: [0, 1] });
    expect(aim({ down: true, moveX: -1 })).toEqual({ pose: "aim_down45", dir: [-1, 1] });
  });

  it("yawns after a while, stays bored until any input, and turns around", () => {
    const w = new World([box(0, 900, 1000, 20)], SIZE);
    const p = new Player(500, 900);
    const idle = { jump: false, fire: false, knife: false, bazooka: false };
    for (let i = 0; i < 60 * 9; i++) p.update(1 / 60, i / 60, NO_CONTROLS, idle, w);
    expect(p.pose().anim).toBe("bored");
    p.update(1 / 60, 10, { ...NO_CONTROLS, moveX: -1 }, idle, w);
    expect(p.pose().anim).toBe("turn");
  });
});

describe("the Lag gang", () => {
  const floor = box(0, 500, 1000, 20);
  it("shoots only with a clear line of sight, after a warning", () => {
    const w = new World([floor], SIZE);
    const e = new Enemy("robot", 700, 500, 0, () => 0.5, w);
    const hero = { x: 400, y: 500 };
    let events: string[] = [];
    for (let i = 0; i < 60 * 4; i++) events.push(...e.update(1 / 60, i / 60, w, hero).map((x) => x.type));
    expect(events).toContain("telegraph");
    expect(events.indexOf("telegraph")).toBeLessThan(events.indexOf("shot"));
    // A whole card between them: no shots.
    const w2 = new World([floor, box(530, 380, 60, 120)], SIZE);
    const e2 = new Enemy("robot", 700, 500, 0, () => 0.5, w2);
    events = [];
    for (let i = 0; i < 60 * 4; i++) events.push(...e2.update(1 / 60, i / 60, w2, hero).map((x) => x.type));
    expect(events).not.toContain("shot");
    expect(e2.sees(w2, hero.x, hero.y)).toBe(false);
    // Out of range or far above: not seen.
    expect(e.sees(w, 50, 500)).toBe(false);
    expect(e.sees(w, 600, 200)).toBe(false);
  });

  it("moves to another spot when the pieces around it are broken", () => {
    const cover = Array.from({ length: 6 }, (_, i) => box(640 + i * 12, 420, 10, 60, "word"));
    const w = new World([floor, box(100, 300, 200, 20), ...cover, box(120, 250, 60, 40)], SIZE);
    const e = new Enemy("blonde", 700, 500, 0, () => 0.5, w);
    const hero = { x: 50, y: 100 }; // far and out of sight
    for (let i = 0; i < 10; i++) e.update(1 / 60, i / 60, w, hero);
    expect(e.state).toBe("patrol");
    for (let i = 0; i < 6; i++) w.kill(2 + i);
    const seen: string[] = [];
    for (let i = 0; i < 30; i++) seen.push(...e.update(1 / 60, i / 60, w, hero).map((x) => x.type));
    expect(seen).toContain("relocate");
    expect(e.state).toBe("relocate");
  });

  it("takes damage, flinches and is defeated", () => {
    const w = new World([floor], SIZE);
    const e = new Enemy("blonde", 700, 500, 0, () => 0.5, w);
    expect(e.hurt(30, 1)).toBe(false);
    expect(e.state).toBe("hit");
    expect(e.hurt(60, 2)).toBe(true);
    expect(e.alive).toBe(false);
  });

  it("are placed at random for the run, the same for the same seed", () => {
    expect(enemyCount(7000)).toBe(10);
    const cards = Array.from({ length: 40 }, (_, i) => box(100 + (i % 5) * 150, 300 + Math.floor(i / 5) * 900, 100, 90));
    const size = { width: 1000, height: 8000 };
    const a = placeEnemies(new World(cards, size), seeded(9), 100, []);
    const b = placeEnemies(new World(cards, size), seeded(9), 100, []);
    expect(a.map((e) => [e.kind, Math.round(e.m.x), e.m.y])).toEqual(b.map((e) => [e.kind, Math.round(e.m.x), e.m.y]));
    expect(Math.min(...a.map((e) => e.m.y))).toBeGreaterThan(300);
  });
});

describe("angry villains", () => {
  const floor = box(0, 900, 3000, 20);
  it("the first hit makes a villain angry for good and warns the ones nearby, not the far ones", () => {
    const g = new Game([floor], { width: 3000, height: 1000 }, { x: 100, y: 900 }, { seed: 1, enemies: false });
    const mk = (x: number) => new Enemy("robot", x, 900, 0, () => 0.5, g.world);
    const near = mk(1200);
    const close = mk(1200 + ALERT_RADIUS - 50);
    const far = mk(1200 + ALERT_RADIUS + 300);
    g.enemies.push(near, close, far);
    const ev: { type: string; index?: number }[] = [];
    // Hurt the first one with a bullet's worth of damage.
    (g as unknown as { hurtEnemy: (i: number, a: number, x: number, y: number, ev: unknown[]) => void }).hurtEnemy(0, 4, 1200, 860, ev);
    expect(near.angry).toBe(true);
    expect(close.angry).toBe(true);
    expect(far.angry).toBe(false);
    expect(ev.filter((e) => e.type === "enraged").map((e) => e.index)).toEqual([0, 1]);
    // Angry, it chases the hero instead of walking its beat.
    for (let i = 0; i < 60; i++) near.update(1 / 60, i / 60, g.world, { x: 300, y: 900 });
    expect(near.m.x).toBeLessThan(1200 - 60);
  });

  it("at most three villains shoot at the same time", () => {
    const g = new Game([floor], { width: 3000, height: 1000 }, { x: 1500, y: 900 }, { seed: 2, enemies: false });
    for (let i = 0; i < 6; i++) g.enemies.push(new Enemy("alien", 1200 + i * 40, 900, 0, () => 0.5, g.world));
    let most = 0;
    for (let i = 0; i < 60 * 6; i++) {
      g.step(1 / 60, NO_CONTROLS);
      most = Math.max(most, g.enemies.filter((e) => e.shooting).length);
    }
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(3);
  });
});

describe("the hero's lives", () => {
  it("loses health to hits, then a life (blinking, respawned), then the mission", () => {
    const g = new Game([box(0, 900, 1000, 20), box(0, 600, 1000, 20)], SIZE, { x: 500, y: 900 }, { seed: 5, enemies: false });
    const ev: { type: string }[] = [];
    g.hurtPlayer(ENEMY_DAMAGE.shot, ev as never);
    expect(g.health).toBe(HEALTH_PER_LIFE - ENEMY_DAMAGE.shot);
    for (let i = 0; i < 10; i++) {
      g.time += 1.1; // past the short grace after each hit
      g.hurtPlayer(ENEMY_DAMAGE.shot, ev as never);
    }
    expect(g.lives).toBe(LIVES - 1);
    expect(ev.map((e) => e.type)).toContain("lifeLost");
    // Untouchable right after.
    g.hurtPlayer(50, ev as never);
    expect(g.health).toBe(HEALTH_PER_LIFE);
    g.time += 3;
    for (let life = 0; life < LIVES - 1; life++) {
      for (let i = 0; i < 10; i++) {
        g.time += 1.1;
        g.hurtPlayer(ENEMY_DAMAGE.melee, ev as never);
      }
      g.time += 3;
    }
    expect(g.failed).toBe(true);
    expect(g.failure).toBe("dead");
  });

  it("wins only with every piece broken, everyone rescued and the gang defeated", () => {
    const g = new Game([box(0, 900, 1000, 20), ...Array.from({ length: 8 }, (_, i) => box(50 + i * 110, 700, 90, 60))], { width: 1000, height: 3000 }, { x: 500, y: 100 }, { seed: 6 });
    expect(g.enemies.length).toBeGreaterThan(0);
    for (const b of g.world.bodies) if (b.alive) g.world.kill(b.id);
    g.civilians.forEach((c) => c.rescue());
    let done = false;
    for (let i = 0; i < 30 && !done; i++) done = g.step(1 / 60, NO_CONTROLS).some((e) => e.type === "complete");
    expect(done).toBe(false);
    expect(g.progress()).toBeLessThan(1);
    g.enemies.forEach((e) => e.hurt(Infinity, 0));
    for (let i = 0; i < 30 && !done; i++) done = g.step(1 / 60, NO_CONTROLS).some((e) => e.type === "complete");
    expect(done).toBe(true);
  });
});

describe("animations", () => {
  it("loops or holds the last frame", () => {
    const loop = { frames: ["a", "b", "c"], fps: 10, loop: true };
    expect(frameAt(loop, 0)).toBe("a");
    expect(frameAt(loop, 0.25)).toBe("c");
    expect(frameAt(loop, 0.31)).toBe("a");
    expect(frameAt({ ...loop, loop: false }, 5)).toBe("c");
  });
});
