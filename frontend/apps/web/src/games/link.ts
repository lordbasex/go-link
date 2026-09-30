// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Link: turn cable tiles until the signal goes from the device (DEV, left
// edge) to every player (P1-P3, right edge). The board is made from a
// random tree over all its cells, so the answer always exists, and then
// every tile is turned at random.

import { rng, type Frame } from "./input";
import { BOARD_H, BOARD_W, type Hud } from "./types";
import { sfx } from "./sfx";

/** Connection sides as bits: north, east, south, west. */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
const SIDES = [N, E, S, W] as const;
const DX: Record<number, number> = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 };
const DY: Record<number, number> = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };
const OPPOSITE: Record<number, number> = { [N]: S, [E]: W, [S]: N, [W]: E };

/** Turns a mask a quarter clockwise, n times. */
export function rotate(mask: number, n: number): number {
  let m = mask;
  for (let i = 0; i < ((n % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
}

export interface LinkState {
  level: number;
  cols: number;
  rows: number;
  /** Each tile's cable as drawn when not turned. */
  base: number[];
  /** Each tile's quarter turns (0-3). */
  rot: number[];
  /** The row DEV plugs into, on the left of column 0. */
  source: number;
  /** The rows the players plug into, on the right of the last column. */
  sinks: number[];
  cx: number;
  cy: number;
  rotations: number;
  shoulders: number;
  score: number;
  cleared: boolean;
  clearedAt: number;
  seed: number;
  next: () => number;
}

export const tileMask = (s: LinkState, i: number) => rotate(s.base[i]!, s.rot[i]!);

/** The board for a level: bigger boards and more players as it grows. */
export function makeBoard(level: number, next: () => number): Pick<LinkState, "cols" | "rows" | "base" | "rot" | "source" | "sinks"> {
  const cols = Math.min(8, 3 + level);
  const rows = Math.min(5, 2 + Math.ceil(level / 2));
  const players = Math.min(3, rows, 1 + Math.floor((level - 1) / 2));
  const pick = <T,>(a: readonly T[]) => a[Math.floor(next() * a.length)]!;
  const source = Math.floor(next() * rows);
  const sinkRows = Array.from({ length: rows }, (_, i) => i);
  for (let i = sinkRows.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [sinkRows[i], sinkRows[j]] = [sinkRows[j]!, sinkRows[i]!];
  }
  const sinks = sinkRows.slice(0, players).sort((a, b) => a - b);
  // A random tree over every cell (depth first from DEV's cell).
  const base = new Array<number>(cols * rows).fill(0);
  const seen = new Array<boolean>(cols * rows).fill(false);
  const stack = [source * cols];
  seen[source * cols] = true;
  while (stack.length) {
    const cur = stack[stack.length - 1]!;
    const x = cur % cols;
    const y = Math.floor(cur / cols);
    const open = SIDES.filter((d) => {
      const nx = x + DX[d]!;
      const ny = y + DY[d]!;
      return nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[ny * cols + nx];
    });
    if (!open.length) {
      stack.pop();
      continue;
    }
    const d = pick(open);
    const nb = (y + DY[d]!) * cols + x + DX[d]!;
    base[cur] = base[cur]! | d;
    base[nb] = base[nb]! | OPPOSITE[d]!;
    seen[nb] = true;
    stack.push(nb);
  }
  base[source * cols] = base[source * cols]! | W;
  for (const r of sinks) base[r * cols + cols - 1] = base[r * cols + cols - 1]! | E;
  // Scramble: every tile turned at random (a turn that changes nothing is fine).
  const rot = base.map(() => Math.floor(next() * 4));
  return { cols, rows, base, rot, source, sinks };
}

/**
 * The tiles the signal reaches from DEV, how many steps from DEV each one
 * is (-1 when not reached), and whether every player is reached.
 */
export function flow(s: Pick<LinkState, "cols" | "rows" | "base" | "rot" | "source" | "sinks">): { lit: boolean[]; depth: number[]; done: boolean; reached: boolean[] } {
  const { cols, rows } = s;
  const mask = (i: number) => rotate(s.base[i]!, s.rot[i]!);
  const lit = new Array<boolean>(cols * rows).fill(false);
  const depth = new Array<number>(cols * rows).fill(-1);
  const start = s.source * cols;
  if (mask(start) & W) {
    lit[start] = true;
    depth[start] = 0;
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      const x = cur % cols;
      const y = Math.floor(cur / cols);
      for (const d of SIDES) {
        if (!(mask(cur) & d)) continue;
        const nx = x + DX[d]!;
        const ny = y + DY[d]!;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nb = ny * cols + nx;
        if (lit[nb] || !(mask(nb) & OPPOSITE[d]!)) continue;
        lit[nb] = true;
        depth[nb] = depth[cur]! + 1;
        queue.push(nb);
      }
    }
  }
  const reached = s.sinks.map((r) => lit[r * cols + cols - 1]! && !!(mask(r * cols + cols - 1) & E));
  return { lit, depth, done: reached.every(Boolean), reached };
}

function newLevel(s: LinkState, level: number): void {
  const b = makeBoard(level, s.next);
  Object.assign(s, b, { level, cx: 0, cy: b.source, cleared: false });
  // Never start already solved.
  if (flow(s).done) s.rot[0] = (s.rot[0]! + 1) % 4;
  if (flow(s).done) s.rot[s.rot.length - 1] = (s.rot[s.rot.length - 1]! + 1) % 4;
}

export function create(seed: number): LinkState {
  const s = { level: 1, rotations: 0, shoulders: 0, score: 0, cleared: false, clearedAt: 0, seed, next: rng(seed), cx: 0, cy: 0 } as LinkState;
  newLevel(s, 1);
  return s;
}

/** A level cleared waits this long before the next one. */
export const CLEAR_MS = 1200;

export function step(s: LinkState, f: Frame): void {
  if (s.cleared) {
    if (f.now - s.clearedAt > CLEAR_MS || f.pressed.has("start")) newLevel(s, s.level + 1);
    return;
  }
  const was = s.cy * s.cols + s.cx;
  if (f.turned.has("left")) s.cx = Math.max(0, s.cx - 1);
  if (f.turned.has("right")) s.cx = Math.min(s.cols - 1, s.cx + 1);
  if (f.turned.has("up")) s.cy = Math.max(0, s.cy - 1);
  if (f.turned.has("down")) s.cy = Math.min(s.rows - 1, s.cy + 1);
  const i = s.cy * s.cols + s.cx;
  if (i !== was) sfx("move");
  let turn = 0;
  if (f.pressed.has("b1") || f.pressed.has("r")) turn += 1;
  if (f.pressed.has("b2") || f.pressed.has("l")) turn += 3;
  if (f.pressed.has("b1") || f.pressed.has("b2")) s.rotations++;
  if (f.pressed.has("l") || f.pressed.has("r")) s.shoulders++;
  if (turn % 4) {
    s.rot[i] = (s.rot[i]! + turn) % 4;
    sfx("turn");
    if (flow(s).done) {
      sfx("clear", { x: BOARD_W / 2, y: BOARD_H / 2, points: s.cols * s.rows * 10, color: "accent" });
      s.cleared = true;
      s.clearedAt = f.now;
      s.score += s.cols * s.rows * 10;
    }
  }
}

export function hud(s: LinkState): Hud {
  return {
    score: s.score,
    over: false,
    cleared: s.cleared,
    stats: [
      { key: "level", value: String(s.level) },
      { key: "rotations", value: String(s.rotations) },
      { key: "shoulders", value: String(s.shoulders) },
    ],
  };
}
