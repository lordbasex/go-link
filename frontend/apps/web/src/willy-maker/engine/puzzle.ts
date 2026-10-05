// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The puzzle's well (genres.md, phase 1): pure functions over a Well, the
// same steps as the ROM's (rom/engine/engine.c, well_*), so play mode and
// the board drop, turn, match and clear gems alike, frame by frame.

import { CLEAR_FRAMES, CPU_CANDIDATES, CPU_STEP, CPU_STEPS, FALL_MIN, FALL_START, FALL_STEP, GARBAGE_CHAIN, GEM_COLORS, LEVEL_GEMS, PUZZLE_SEED, STONE, WELL_COLS, WELL_ROWS } from "./rules";
import { Input } from "./rules";

export interface Well {
  /** WELL_COLS x WELL_ROWS, top row first: 0 empty, 1 to GEM_COLORS a gem. */
  cells: Uint8Array;
  /** The gems a match clears (1), shown flashing while clearT runs. */
  marks: Uint8Array;
  /** The falling trio, top to bottom, and the next one. */
  piece: [number, number, number];
  next: [number, number, number];
  /** The trio's column and the row of its bottom gem (the two above may be over the top). */
  col: number;
  row: number;
  fallT: number;
  moveT: number;
  /** Frames left of a clear's flash; while it runs no trio falls. */
  clearT: number;
  chain: number;
  seed: number;
  /** Gems this player cleared. */
  gems: number;
  /** Stones the rival sent, still to fall before the next trio. */
  pending: number;
  /** The CPU rival: the candidate it weighs next, the best so far (score, column, turns), its button timer and last pad. */
  cpuK: number;
  cpuBest: number;
  cpuCol: number;
  cpuTurns: number;
  cpuT: number;
  cpuPad: number;
}

/** The next gem's color, 1 to GEM_COLORS (a 32-bit LCG). */
export function nextGem(w: Well): number {
  w.seed = (Math.imul(w.seed, 1103515245) + 12345) >>> 0;
  return ((w.seed >>> 16) % GEM_COLORS) + 1;
}

export function newWell(index: number): Well {
  const w: Well = {
    cells: new Uint8Array(WELL_COLS * WELL_ROWS),
    marks: new Uint8Array(WELL_COLS * WELL_ROWS),
    piece: [0, 0, 0],
    next: [0, 0, 0],
    col: 0,
    row: 0,
    fallT: 0,
    moveT: 0,
    clearT: 0,
    chain: 0,
    seed: (PUZZLE_SEED + index * 7919) >>> 0,
    gems: 0,
    pending: 0,
    cpuK: 0,
    cpuBest: 0,
    cpuCol: 2,
    cpuTurns: 0,
    cpuT: 0,
    cpuPad: 0,
  };
  w.next = [nextGem(w), nextGem(w), nextGem(w)];
  return w;
}

/** Whether (c, r) is free: inside the sides and the floor, over the top or empty. */
export function wellFree(w: Well, c: number, r: number): boolean {
  if (c < 0 || c >= WELL_COLS || r >= WELL_ROWS) return false;
  return r < 0 || w.cells[r * WELL_COLS + c] === 0;
}

/** Frames a row while not held down: faster for every LEVEL_GEMS gems cleared. */
export function fallFrames(w: Well): number {
  return Math.max(FALL_MIN, FALL_START - Math.floor(w.gems / LEVEL_GEMS) * FALL_STEP);
}

/** The next trio comes in at the top of the third column; false when it cannot (the well topped out). */
export function spawnTrio(w: Well): boolean {
  dropStones(w);
  w.cpuK = 0;
  w.piece = w.next;
  w.next = [nextGem(w), nextGem(w), nextGem(w)];
  w.col = 2;
  w.row = 0;
  w.fallT = 0;
  w.chain = 0;
  return wellFree(w, w.col, 0);
}

/** Moves the trio a column when every gem of it fits there. */
export function shiftTrio(w: Well, dx: number): boolean {
  const c = w.col + dx;
  if (!wellFree(w, c, w.row) || !wellFree(w, c, w.row - 1) || !wellFree(w, c, w.row - 2)) return false;
  w.col = c;
  return true;
}

/** Turns the trio's colors: the bottom one goes to the top. */
export function turnTrio(w: Well): void {
  w.piece = [w.piece[2], w.piece[0], w.piece[1]];
}

/** Puts the trio in the well; false when a gem of it is still over the top. */
export function lockTrio(w: Well): boolean {
  if (w.row - 2 < 0) return false;
  for (let k = 0; k < 3; k++) w.cells[(w.row - 2 + k) * WELL_COLS + w.col] = w.piece[k]!;
  return true;
}

/** The stones the rival sent: up to a row of them, from the left column, each on its column's stack (lost on a full one). */
export function dropStones(w: Well): void {
  const k = Math.min(w.pending, WELL_COLS);
  for (let c = 0; c < k; c++) {
    let r = -1;
    while (r + 1 < WELL_ROWS && w.cells[(r + 1) * WELL_COLS + c] === 0) r++;
    if (r >= 0) w.cells[r * WELL_COLS + c] = STONE;
  }
  w.pending -= k;
}

/** Stones a clear of n gems at this chain step sends the rival. */
export function garbageOf(n: number, chain: number): number {
  return n - 3 + (chain - 1) * GARBAGE_CHAIN;
}

/** Marks every gem in a line of three or more of its color (rows, columns, both diagonals), and the stones beside them; returns how many. */
export function markMatches(w: Well): number {
  const dirs = [[1, 0], [0, 1], [1, 1], [-1, 1]] as const;
  const at = (c: number, r: number) => (c >= 0 && c < WELL_COLS && r >= 0 && r < WELL_ROWS ? w.cells[r * WELL_COLS + c]! : 0);
  for (let r = 0; r < WELL_ROWS; r++)
    for (let c = 0; c < WELL_COLS; c++) {
      const v = w.cells[r * WELL_COLS + c]!;
      if (!v || v === STONE) continue;
      for (const [dx, dy] of dirs) {
        // only from a line's first gem
        if (at(c - dx, r - dy) === v) continue;
        let n = 1;
        while (at(c + n * dx, r + n * dy) === v) n++;
        if (n >= 3) for (let k = 0; k < n; k++) w.marks[(r + k * dy) * WELL_COLS + c + k * dx] = 1;
      }
    }
  // the stones next to a cleared gem go with it (a gem marked by a line, not a stone marked just now)
  for (let i = 0; i < w.marks.length; i++) {
    if (w.marks[i] !== 1) continue;
    const c = i % WELL_COLS;
    if (c > 0 && w.cells[i - 1] === STONE) w.marks[i - 1] = 2;
    if (c < WELL_COLS - 1 && w.cells[i + 1] === STONE) w.marks[i + 1] = 2;
    if (i >= WELL_COLS && w.cells[i - WELL_COLS] === STONE) w.marks[i - WELL_COLS] = 2;
    if (i + WELL_COLS < w.marks.length && w.cells[i + WELL_COLS] === STONE) w.marks[i + WELL_COLS] = 2;
  }
  let count = 0;
  for (let i = 0; i < w.marks.length; i++) count += w.marks[i] ? 1 : 0;
  if (count) {
    w.chain++;
    w.clearT = CLEAR_FRAMES;
  }
  return count;
}

/** Takes the marked gems out and lets the ones above fall. */
export function settleWell(w: Well): void {
  for (let c = 0; c < WELL_COLS; c++) {
    let to = WELL_ROWS - 1;
    for (let r = WELL_ROWS - 1; r >= 0; r--) {
      const i = r * WELL_COLS + c;
      const v = w.marks[i] ? 0 : w.cells[i]!;
      w.marks[i] = 0;
      w.cells[i] = 0;
      if (v) w.cells[to-- * WELL_COLS + c] = v;
    }
  }
}

/** Empties the well (a life lost to a top out). */
export function emptyWell(w: Well): void {
  w.cells.fill(0);
  w.marks.fill(0);
  w.clearT = 0;
  w.pending = 0;
}

/**
 * How good the trio (turned `turns` times) is in column c: 64 for every gem
 * of a line of three or more through it (its column once, then the row and
 * both diagonals of each of its gems; a gem two lines share counts twice),
 * 2 a row lower it lands, less a turn. Cheap on purpose: the ROM weighs one
 * a frame beside everything else.
 */
function weigh(w: Well, c: number, turns: number, lineWeight = true): number {
  let r = -1;
  while (r + 1 < WELL_ROWS && w.cells[(r + 1) * WELL_COLS + c] === 0) r++;
  if (r < 2) return -10000;
  const top = r - 2;
  const gem = (k: number) => w.piece[(k - turns + 3) % 3]!;
  const at = (cc: number, rr: number) => (cc < 0 || cc >= WELL_COLS || rr < 0 || rr >= WELL_ROWS ? 0 : cc === c && rr >= top && rr <= r ? gem(rr - top) : w.cells[rr * WELL_COLS + cc]!);
  const run = (cc: number, rr: number, dx: number, dy: number) => {
    const v = at(cc, rr);
    let n = 1;
    while (at(cc - n * dx, rr - n * dy) === v) n++;
    let m = 1;
    while (at(cc + m * dx, rr + m * dy) === v) m++;
    return n + m - 1 >= 3 ? n + m - 1 : 0;
  };
  let found = 0;
  // the column: the runs along it, each counted once (from its lowest gem)
  for (let rr = r; rr >= top; rr--) {
    if (rr < r && at(c, rr) === at(c, rr + 1)) continue;
    found += run(c, rr, 0, 1);
  }
  for (let k = 0; k < 3; k++) found += run(c, top + k, 1, 0) + run(c, top + k, 1, 1) + run(c, top + k, -1, 1);
  return (lineWeight ? found * 64 : 0) + r * 2 - turns;
}

/**
 * The CPU rival's pad this frame: while a new trio is weighed (a candidate
 * a frame), nothing; then a press every CPU_STEP frames: turn, move, and
 * Down held once the trio is in its column.
 */
export function cpuPad(w: Well, level = 2): number {
  const step = CPU_STEPS[level - 1] ?? CPU_STEP;
  if (w.clearT) return 0;
  if (w.cpuK < CPU_CANDIDATES) {
    const k = w.cpuK;
    const c = (k / 3) | 0;
    const t = k - c * 3;
    const s = weigh(w, c, t, level > 1);
    if (k === 0 || s > w.cpuBest) {
      w.cpuBest = s;
      w.cpuCol = c;
      w.cpuTurns = t;
    }
    w.cpuK++;
    return 0;
  }
  w.cpuT++;
  if (w.cpuTurns > 0) {
    if ((w.cpuT & (step - 1)) !== 0) return 0;
    w.cpuTurns--;
    return Input.B1;
  }
  if (w.col !== w.cpuCol) {
    if ((w.cpuT & (step - 1)) !== 0) return 0;
    return w.col < w.cpuCol ? Input.Right : Input.Left;
  }
  return Input.Down;
}
