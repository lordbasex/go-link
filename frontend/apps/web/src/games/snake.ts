// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Snake: eat the light, don't hit a wall or your own tail. It counts how
// often each direction was used, so a direction that never answers shows.

import { rng, type Frame } from "./input";
import { BOARD_H, BOARD_W, type Hud } from "./types";
import { sfx } from "./sfx";

export const SNAKE_COLS = 32;
export const SNAKE_ROWS = 20;

type Dir = "up" | "down" | "left" | "right";
const MOVE: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

export interface SnakeState {
  body: [number, number][];
  dir: Dir;
  queue: Dir[];
  food: [number, number];
  alive: boolean;
  /** It waits for the first direction (or button) before moving. */
  started: boolean;
  /** Milliseconds per step (it speeds up as it grows). */
  interval: number;
  acc: number;
  score: number;
  used: Record<Dir, number>;
  next: () => number;
}

function placeFood(s: SnakeState): void {
  for (;;) {
    const p: [number, number] = [Math.floor(s.next() * SNAKE_COLS), Math.floor(s.next() * SNAKE_ROWS)];
    if (!s.body.some(([x, y]) => x === p[0] && y === p[1])) {
      s.food = p;
      return;
    }
  }
}

export function create(seed: number): SnakeState {
  const s: SnakeState = {
    body: [
      [8, 10],
      [7, 10],
      [6, 10],
    ],
    dir: "right",
    queue: [],
    food: [0, 0],
    alive: true,
    started: false,
    interval: 130,
    acc: 0,
    score: 0,
    used: { up: 0, down: 0, left: 0, right: 0 },
    next: rng(seed),
  };
  placeFood(s);
  return s;
}

/** One move of the snake (the head is body[0]). */
export function advance(s: SnakeState): void {
  const want = s.queue.shift();
  if (want && want !== s.dir && want !== OPP[s.dir]) {
    s.dir = want;
    s.used[want]++;
  }
  const [hx, hy] = s.body[0]!;
  const [dx, dy] = MOVE[s.dir];
  const head: [number, number] = [hx + dx, hy + dy];
  const eats = head[0] === s.food[0] && head[1] === s.food[1];
  // The tail moves away this step unless the snake grows.
  const body = eats ? s.body : s.body.slice(0, -1);
  if (head[0] < 0 || head[1] < 0 || head[0] >= SNAKE_COLS || head[1] >= SNAKE_ROWS || body.some(([x, y]) => x === head[0] && y === head[1])) {
    s.alive = false;
    sfx("over", { x: (hx + 0.5) * (BOARD_W / SNAKE_COLS), y: (hy + 0.5) * (BOARD_H / SNAKE_ROWS), color: "p3" });
    return;
  }
  s.body = [head, ...body];
  if (eats) {
    sfx("eat", { x: (head[0] + 0.5) * (BOARD_W / SNAKE_COLS), y: (head[1] + 0.5) * (BOARD_H / SNAKE_ROWS), points: 1, color: "p2" });
    s.score++;
    s.interval = Math.max(60, s.interval - 3);
    placeFood(s);
  }
}

export function step(s: SnakeState, f: Frame): void {
  if (!s.alive) return;
  for (const d of ["up", "down", "left", "right"] as const) if (f.turned.has(d) && s.queue.length < 3) s.queue.push(d);
  if (!s.started) {
    if (!f.turned.size && !f.pressed.size) return;
    s.started = true;
  }
  s.acc += f.dt;
  while (s.acc >= s.interval && s.alive) {
    s.acc -= s.interval;
    advance(s);
  }
}

export function hud(s: SnakeState): Hud {
  return {
    score: s.score,
    over: !s.alive,
    ready: !s.started,
    stats: [
      { key: "length", value: String(s.body.length) },
      { key: "up", value: String(s.used.up) },
      { key: "down", value: String(s.used.down) },
      { key: "left", value: String(s.used.left) },
      { key: "right", value: String(s.used.right) },
    ],
  };
}
