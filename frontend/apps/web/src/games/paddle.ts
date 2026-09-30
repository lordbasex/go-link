// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Paddle: break the bricks with the ball, moving the paddle with the
// stick (the further you push, the faster it goes). A stick that keeps a
// small, steady value when nobody touches it drifts: the paddle creeps on
// its own, and the page says so.

import { rng, type Frame } from "./input";
import { BOARD_H, BOARD_W, type Hud } from "./types";
import { sfx } from "./sfx";

export const BRICK_COLS = 9;
export const BRICK_ROWS = 4;
export const BRICK_W = 32;
export const BRICK_H = 9;
export const BRICK_X = (BOARD_W - BRICK_COLS * (BRICK_W + 3) + 3) / 2;
export const BRICK_Y = 22;
export const PADDLE_W = 44;
export const PADDLE_Y = BOARD_H - 16;
const PADDLE_SPEED = 0.32; // board px per ms at full tilt
const BALL_SPEED = 0.14;

/**
 * Drift: the stick's raw value between 0.05 and 0.35 that stays almost
 * still (a thumb always moves a little) for a whole second.
 */
export class DriftWatch {
  since: number | null = null;
  lastX = 0;
  lastY = 0;
  /** The drift found, or null. It stays once found. */
  value: number | null = null;

  add(x: number, y: number, now: number): void {
    const r = Math.hypot(x, y);
    const still = Math.hypot(x - this.lastX, y - this.lastY) < 0.01;
    this.lastX = x;
    this.lastY = y;
    if (r > 0.05 && r < 0.35 && still) {
      if (this.since === null) this.since = now;
      else if (now - this.since >= 1000) this.value = Math.max(this.value ?? 0, r);
    } else this.since = null;
  }
}

export interface PaddleState {
  x: number;
  ballX: number;
  ballY: number;
  vx: number;
  vy: number;
  /** The ball waits on the paddle until a button. */
  held: boolean;
  bricks: boolean[];
  lives: number;
  score: number;
  drift: DriftWatch;
  hasPad: boolean;
  next: () => number;
}

export function create(seed: number): PaddleState {
  const s: PaddleState = { x: BOARD_W / 2 - PADDLE_W / 2, ballX: 0, ballY: 0, vx: 0, vy: 0, held: true, bricks: new Array(BRICK_COLS * BRICK_ROWS).fill(true), lives: 3, score: 0, drift: new DriftWatch(), hasPad: false, next: rng(seed) };
  return s;
}

export function step(s: PaddleState, f: Frame): void {
  const { input } = f;
  s.hasPad = input.hasPad;
  if (input.hasPad) s.drift.add(input.rawLx, input.rawLy, f.now);
  if (s.lives <= 0) return;
  // The stick as it reports, with only a tiny dead zone: a drifting stick
  // makes the paddle creep, so you see the drift as well as read it.
  const raw = Math.abs(input.rawLx) > 0.04 ? input.rawLx : 0;
  const tilt = Math.abs(input.lx) >= 1 || !input.hasPad ? input.lx : raw;
  s.x = Math.max(0, Math.min(BOARD_W - PADDLE_W, s.x + tilt * PADDLE_SPEED * f.dt));
  if (s.held) {
    s.ballX = s.x + PADDLE_W / 2;
    s.ballY = PADDLE_Y - 4;
    if (f.pressed.size) {
      s.held = false;
      sfx("launch");
      const a = -Math.PI / 2 + (s.next() - 0.5) * 0.8;
      s.vx = Math.cos(a) * BALL_SPEED;
      s.vy = Math.sin(a) * BALL_SPEED;
    }
    return;
  }
  // Small sub-steps so the ball never jumps over a brick.
  const n = Math.ceil(f.dt / 4);
  for (let i = 0; i < n && !s.held; i++) move(s, f.dt / n);
}

function move(s: PaddleState, dt: number): void {
  s.ballX += s.vx * dt;
  s.ballY += s.vy * dt;
  if (s.ballX < 2) (s.ballX = 2), (s.vx = Math.abs(s.vx)), sfx("wall");
  if (s.ballX > BOARD_W - 2) (s.ballX = BOARD_W - 2), (s.vx = -Math.abs(s.vx)), sfx("wall");
  if (s.ballY < 2) (s.ballY = 2), (s.vy = Math.abs(s.vy)), sfx("wall");
  // The paddle: where it hits sets the angle.
  if (s.vy > 0 && s.ballY >= PADDLE_Y - 2 && s.ballY <= PADDLE_Y + 3 && s.ballX >= s.x - 2 && s.ballX <= s.x + PADDLE_W + 2) {
    const off = (s.ballX - (s.x + PADDLE_W / 2)) / (PADDLE_W / 2);
    const a = -Math.PI / 2 + Math.max(-1, Math.min(1, off)) * 1.05;
    const speed = Math.min(0.24, Math.hypot(s.vx, s.vy) * 1.02);
    s.vx = Math.cos(a) * speed;
    s.vy = Math.sin(a) * speed;
    sfx("paddle");
    s.ballY = PADDLE_Y - 2;
  }
  if (s.ballY > BOARD_H + 4) {
    s.lives--;
    sfx(s.lives > 0 ? "lose" : "over");
    s.held = true;
    return;
  }
  const col = Math.floor((s.ballX - BRICK_X) / (BRICK_W + 3));
  const row = Math.floor((s.ballY - BRICK_Y) / (BRICK_H + 3));
  if (col >= 0 && col < BRICK_COLS && row >= 0 && row < BRICK_ROWS && s.bricks[row * BRICK_COLS + col]) {
    s.bricks[row * BRICK_COLS + col] = false;
    sfx("brick");
    s.vy = -s.vy;
    s.score += (BRICK_ROWS - row) * 10;
    if (s.bricks.every((b) => !b)) {
      sfx("clear");
      s.bricks.fill(true);
      s.held = true;
    }
  }
}

export function hud(s: PaddleState): Hud {
  return {
    score: s.score,
    over: s.lives <= 0,
    drift: s.drift.value,
    launch: s.held && s.lives > 0,
    stats: [
      { key: "lives", value: String(Math.max(0, s.lives)) },
      { key: "restX", value: s.hasPad ? s.drift.lastX.toFixed(2) : "—" },
    ],
  };
}
