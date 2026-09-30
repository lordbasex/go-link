// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { addKeys, addPad, emptyInput, nextFrame, numpad, rng, type Btn, type Frame, type FrameInput } from "./input";
import * as link from "./link";
import * as snake from "./snake";
import * as memory from "./memory";
import * as paddle from "./paddle";
import * as racer from "./racer";
import * as moves from "./moves";

/** A frame with some buttons held and directions on, `prev` for the edges. */
function frame(now: number, set: Partial<FrameInput> & { btn?: Btn[] } = {}, prev: FrameInput | null = null, dt = 16): Frame {
  const inp = emptyInput();
  const { btn, ...rest } = set;
  Object.assign(inp, rest);
  for (const b of btn ?? []) inp.held[b] = true;
  const f = nextFrame(prev, inp, now, now - dt);
  return f;
}

describe("input", () => {
  it("merges a controller and the keyboard", () => {
    const inp = emptyInput();
    addPad(inp, { mapping: "standard", axes: [0.1, -0.9, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0 || i === 15, value: i === 7 ? 0.4 : i === 0 || i === 15 ? 1 : 0 })) });
    addKeys(inp, new Set(["KeyS", "KeyE"]));
    expect(inp).toMatchObject({ up: true, right: true, rt: 0.4, lt: 1, lx: 0, ly: -0.9, rawLx: 0.1, hasPad: true });
    expect(inp.held.b1 && inp.held.b4).toBe(true);
  });

  it("writes directions in numpad notation", () => {
    expect(numpad({ up: false, down: true, left: false, right: true })).toBe(3);
    expect(numpad({ up: true, down: false, left: true, right: false })).toBe(7);
    expect(numpad({ up: false, down: false, left: false, right: false })).toBe(5);
  });
});

describe("link", () => {
  it("turns a tile's cable a quarter clockwise", () => {
    expect(link.rotate(link.N, 1)).toBe(link.E);
    expect(link.rotate(link.N | link.E, 1)).toBe(link.E | link.S);
    expect(link.rotate(link.W, 1)).toBe(link.N);
    expect(link.rotate(link.N | link.S, 2)).toBe(link.N | link.S);
  });

  it("always makes a board that can be solved", () => {
    for (let level = 1; level <= 10; level++) {
      for (let seed = 1; seed <= 30; seed++) {
        const b = link.makeBoard(level, rng(seed * 97 + level));
        // Unturned, every tile is as the tree made it: solved.
        expect(link.flow({ ...b, rot: b.rot.map(() => 0) }).done).toBe(true);
        expect(b.sinks.length).toBeGreaterThan(0);
        expect(b.base.every((m) => m > 0)).toBe(true);
      }
    }
  });

  it("clears a level when the last tile is turned right, then grows", () => {
    const s = link.create(5);
    expect(link.flow(s).done).toBe(false);
    // Put every tile back but one, then turn that one with the cursor.
    s.rot = s.rot.map(() => 0);
    s.rot[0] = 3;
    s.cx = 0;
    s.cy = 0;
    link.step(s, frame(1000, { btn: ["b1"] }));
    expect(s.cleared).toBe(true);
    expect(s.rotations).toBe(1);
    link.step(s, frame(1000 + link.CLEAR_MS + 1));
    expect(s.level).toBe(2);
    expect(s.cols).toBeGreaterThan(4);
  });

  it("counts the shoulders apart from the face buttons", () => {
    const s = link.create(3);
    link.step(s, frame(10, { btn: ["l"] }));
    link.step(s, frame(20, { btn: ["r"] }));
    expect(s.shoulders).toBe(2);
    expect(s.rotations).toBe(0);
  });
});

describe("snake", () => {
  it("grows when it eats and counts the directions used", () => {
    const s = snake.create(1);
    const [hx, hy] = s.body[0]!;
    s.food = [hx + 1, hy];
    snake.advance(s);
    expect(s.body).toHaveLength(4);
    expect(s.score).toBe(1);
    s.queue.push("up");
    snake.advance(s);
    expect(s.dir).toBe("up");
    expect(s.used.up).toBe(1);
  });

  it("never turns back on itself and dies at a wall", () => {
    const s = snake.create(2);
    s.queue.push("left");
    snake.advance(s);
    expect(s.dir).toBe("right");
    s.food = [0, 0];
    for (let i = 0; i < snake.SNAKE_COLS; i++) snake.advance(s);
    expect(s.alive).toBe(false);
  });

  it("dies when it bites its tail", () => {
    const s = snake.create(3);
    s.body = [
      [5, 5],
      [4, 5],
      [4, 6],
      [5, 6],
      [6, 6],
      [7, 6],
    ];
    s.dir = "right";
    s.food = [0, 0];
    s.queue.push("down");
    snake.advance(s);
    expect(s.alive).toBe(false);
  });
});

describe("memory", () => {
  function toInput(s: memory.MemoryState, start: number): number {
    let now = start;
    while (s.phase === "show") memory.step(s, frame((now += 16)));
    return now;
  }

  it("plays a round and grows the sequence", () => {
    const s = memory.create(4);
    let now = toInput(s, 0);
    const b = memory.FACE[s.seq[0]!]!;
    let prev = emptyInput();
    const on = frame((now += 16), { btn: [b] }, prev);
    memory.step(s, on);
    prev = on.input;
    memory.step(s, frame((now += 200), {}, prev));
    expect(s.score).toBe(1);
    expect(s.seq).toHaveLength(2);
  });

  it("counts a double press under 40 ms and doesn't take it as an answer", () => {
    const s = memory.create(9);
    s.seq = [0, 0];
    let now = toInput(s, 0);
    const press = (at: number, held: boolean, prev: FrameInput) => {
      const f = frame(at, held ? { btn: ["b1"] } : {}, prev);
      memory.step(s, f);
      return f.input;
    };
    let p = press((now += 16), true, emptyInput());
    p = press((now += 60), false, p);
    p = press((now += 20), true, p); // 20 ms after letting go: a bounce
    expect(s.bounces).toBe(1);
    expect(s.pos).toBe(1);
    p = press((now += 60), false, p);
    press((now += 200), true, p);
    expect(s.score).toBe(2);
  });

  it("ends on a wrong button", () => {
    const s = memory.create(1);
    s.seq = [0];
    const now = toInput(s, 0);
    memory.step(s, frame(now + 16, { btn: ["b2"] }));
    expect(memory.hud(s).over).toBe(true);
  });
});

describe("paddle", () => {
  it("finds a stick that keeps a small steady value", () => {
    const d = new paddle.DriftWatch();
    for (let t = 0; t <= 1200; t += 16) d.add(0.12, 0.01, t);
    expect(d.value).toBeCloseTo(0.12, 2);
    const moving = new paddle.DriftWatch();
    for (let t = 0; t <= 1200; t += 16) moving.add(0.1 + 0.05 * Math.sin(t / 50), 0, t);
    expect(moving.value).toBeNull();
    const centered = new paddle.DriftWatch();
    for (let t = 0; t <= 1200; t += 16) centered.add(0.02, 0, t);
    expect(centered.value).toBeNull();
  });

  it("launches the ball on a button and breaks a brick", () => {
    const s = paddle.create(1);
    paddle.step(s, frame(16, { btn: ["b1"] }));
    expect(s.held).toBe(false);
    s.ballX = paddle.BRICK_X + 5;
    s.ballY = paddle.BRICK_Y + 30;
    s.vx = 0;
    s.vy = -0.2;
    for (let t = 32; t < 1000 && s.score === 0; t += 16) paddle.step(s, frame(t, {}, null));
    expect(s.score).toBeGreaterThan(0);
    expect(s.bricks.filter((b) => !b)).toHaveLength(1);
  });

  it("loses a ball that falls", () => {
    const s = paddle.create(1);
    s.held = false;
    s.ballX = 10;
    s.ballY = 190;
    s.x = 250;
    s.vx = 0;
    s.vy = 0.2;
    for (let t = 16; t < 400; t += 16) paddle.step(s, frame(t));
    expect(s.lives).toBe(2);
    expect(s.held).toBe(true);
  });
});

describe("racer", () => {
  it("speeds up with R2, brakes with L2 and keeps the deepest pull", () => {
    const s = racer.create();
    for (let t = 16; t < 3000; t += 16) {
      s.x = racer.roadCenter(s.z);
      racer.step(s, frame(t, { rt: 1 }));
    }
    const fast = s.speed;
    expect(fast).toBeGreaterThan(0.05);
    for (let t = 3000; t < 3500; t += 16) {
      s.x = racer.roadCenter(s.z);
      racer.step(s, frame(t, { lt: 0.5 }));
    }
    expect(s.speed).toBeLessThan(fast);
    expect(s.r2max).toBe(1);
    expect(s.l2max).toBe(0.5);
    expect(s.l2mid).toBe(true);
    expect(s.r2mid).toBe(false);
  });

  it("is slower off the road and ends after a minute", () => {
    const s = racer.create();
    s.speed = 0.06;
    s.x = racer.roadCenter(0) + 0.9;
    racer.step(s, frame(16, { rt: 1 }));
    expect(s.offRoad).toBe(true);
    racer.step(s, frame(32, { rt: 1 }));
    expect(s.speed).toBeLessThanOrEqual(0.06 * 0.35);
    s.t = racer.RACE_MS - 10;
    racer.step(s, frame(48, { rt: 1 }));
    expect(racer.hud(s).over).toBe(true);
  });
});

describe("special moves", () => {
  const qcf = moves.MOVES.find((m) => m.id === "qcf")!;
  const charge = moves.MOVES.find((m) => m.id === "charge")!;
  const buf = (...e: [number, number][]) => e.map(([dir, at]) => ({ dir, at }));

  it("recognizes a quarter circle and times the button", () => {
    expect(moves.recognize(buf([2, 0], [3, 40], [6, 80]), qcf, 122)).toBe(42);
    expect(moves.grade(42)).toBe("perfect");
    expect(moves.grade(100)).toBe("great");
    expect(moves.grade(300)).toBe("late");
    // A wobble in between still counts.
    expect(moves.recognize(buf([2, 0], [1, 20], [2, 30], [3, 60], [6, 90]), qcf, 100)).toBe(10);
  });

  it("refuses a motion out of order or too slow", () => {
    expect(moves.recognize(buf([6, 0], [3, 40], [2, 80]), qcf, 100)).toBeNull();
    expect(moves.recognize(buf([2, 0], [3, 400], [6, 800]), qcf, 820)).toBeNull();
  });

  it("needs a charge held long enough", () => {
    expect(moves.recognize(buf([4, 0], [6, 900]), charge, 930)).toBe(30);
    expect(moves.recognize(buf([4, 0], [6, 300]), charge, 330)).toBeNull();
  });

  it("scores a move done in the game and asks for another one", () => {
    const s = moves.create(1);
    s.move = qcf;
    let prev: FrameInput | null = null;
    const go = (now: number, set: Partial<FrameInput> & { btn?: Btn[] }) => {
      const f = frame(now, set, prev);
      moves.step(s, f);
      prev = f.input;
    };
    go(0, { down: true });
    go(30, { down: true, right: true });
    go(60, { right: true });
    go(90, { right: true, btn: ["b1"] });
    expect(s.flash?.kind).toBe("perfect");
    expect(s.flash?.ms).toBe(30);
    expect(s.combos).toBe(1);
    expect(s.diagonals[3]).toBe(1);
    expect(s.move.id).not.toBe("qcf");
  });
});

describe("sound events", () => {
  it("the rules name what happened, and nothing plays without a sink", async () => {
    const { setSfxSink } = await import("./sfx");
    const heard: string[] = [];
    setSfxSink((e) => heard.push(e));
    try {
      const s = snake.create(1);
      const [hx, hy] = s.body[0]!;
      s.food = [hx + (s.dir === "right" ? 1 : s.dir === "left" ? -1 : 0), hy + (s.dir === "down" ? 1 : s.dir === "up" ? -1 : 0)];
      snake.advance(s);
      expect(heard).toContain("eat");
      heard.length = 0;
      for (let i = 0; i < 100 && s.alive; i++) snake.advance(s);
      expect(heard.at(-1)).toBe("over");
    } finally {
      setSfxSink(null);
    }
  });
});

describe("touch pad", () => {
  it("feeds the frame like a controller, and a quick tap lasts one frame", async () => {
    const { addTouch, emptyTouch } = await import("./input");
    const t = emptyTouch();
    t.tapped.add("b1");
    t.tappedDirs.add("up");
    t.lx = -0.6;
    t.rt = 0.8;
    const a = emptyInput();
    addTouch(a, t);
    expect(a.held.b1).toBe(true);
    expect(a.up).toBe(true);
    expect(a.lx).toBeCloseTo(-0.6);
    expect(a.rawLx).toBeCloseTo(-0.6);
    expect(a.rt).toBeCloseTo(0.8);
    const b = emptyInput();
    addTouch(b, t);
    expect(b.held.b1).toBe(false);
    expect(b.up).toBe(false);
  });
});

describe("board effects", () => {
  it("bursts, pops points and fades out; reduced motion never shakes", async () => {
    const { BoardFx } = await import("./fx");
    const pal = { bg: "#000", grid: "#111", line: "#222", dim: "#333", text: "#fff", accent: "#f80", ok: "#0f0", p1: "#f80", p2: "#0cf", p3: "#f06", p4: "#96f", mono: "monospace" };
    const fx = new BoardFx();
    fx.on("brick", { x: 100, y: 30, points: 40, color: "p2" }, pal, 0);
    expect(fx.counts.particles).toBeGreaterThan(5);
    expect(fx.counts.pops).toBe(1);
    fx.on("over", undefined, pal, 0);
    expect(fx.offset(10)).not.toEqual([0, 0]);
    const ctx = { fillRect() {}, fillText() {}, set globalAlpha(_: number) {}, set fillStyle(_: string) {}, set font(_: string) {}, set textAlign(_: string) {}, set textBaseline(_: string) {} } as unknown as CanvasRenderingContext2D;
    fx.draw(ctx, pal, 5000);
    expect(fx.counts).toEqual({ particles: 0, pops: 0 });
    const calm = new BoardFx(true);
    calm.on("over", undefined, pal, 0);
    expect(calm.offset(10)).toEqual([0, 0]);
  });
});
