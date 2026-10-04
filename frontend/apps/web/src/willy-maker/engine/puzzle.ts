// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The puzzle's well (genres.md, phase 1): pure functions over a Well, the
// same steps as the ROM's (rom/engine/engine.c, well_*), so play mode and
// the board drop, turn, match and clear gems alike, frame by frame.

import { CLEAR_FRAMES, FALL_MIN, FALL_START, FALL_STEP, GEM_COLORS, LEVEL_GEMS, PUZZLE_SEED, WELL_COLS, WELL_ROWS } from "./rules";

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

/** Marks every gem in a line of three or more of its color (rows, columns, both diagonals); returns how many. */
export function markMatches(w: Well): number {
  const dirs = [[1, 0], [0, 1], [1, 1], [-1, 1]] as const;
  const at = (c: number, r: number) => (c >= 0 && c < WELL_COLS && r >= 0 && r < WELL_ROWS ? w.cells[r * WELL_COLS + c]! : 0);
  for (let r = 0; r < WELL_ROWS; r++)
    for (let c = 0; c < WELL_COLS; c++) {
      const v = w.cells[r * WELL_COLS + c]!;
      if (!v) continue;
      for (const [dx, dy] of dirs) {
        // only from a line's first gem
        if (at(c - dx, r - dy) === v) continue;
        let n = 1;
        while (at(c + n * dx, r + n * dy) === v) n++;
        if (n >= 3) for (let k = 0; k < n; k++) w.marks[(r + k * dy) * WELL_COLS + c + k * dx] = 1;
      }
    }
  let count = 0;
  for (let i = 0; i < w.marks.length; i++) count += w.marks[i]!;
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
}
