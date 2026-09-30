// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Special moves: do the motion shown (a quarter circle, a dragon punch, a
// charge...) and press the button. Directions are read in numpad notation
// (2 down, 3 down-right, 6 right...) with their times, and the grade is
// the time from the motion's last direction to the button, like a
// fighting game's input window.

import { numpad, rng, type Btn, type Frame } from "./input";
import type { Flash, Hud } from "./types";
import { sfx } from "./sfx";

export const ARROWS: Record<number, string> = { 1: "↙", 2: "↓", 3: "↘", 4: "←", 6: "→", 7: "↖", 8: "↑", 9: "↗" };

export interface Move {
  id: "qcf" | "qcb" | "dp" | "hcf" | "charge";
  /** The motion in numpad notation; a charge holds its first direction. */
  motion: number[];
  button: 1 | 2 | 3 | 4;
  /** A charge: the first direction held at least this long. */
  chargeMs?: number;
}

export const MOVES: readonly Move[] = [
  { id: "qcf", motion: [2, 3, 6], button: 1 },
  { id: "qcb", motion: [2, 1, 4], button: 3 },
  { id: "dp", motion: [6, 2, 3], button: 1 },
  { id: "hcf", motion: [4, 1, 2, 3, 6], button: 2 },
  { id: "charge", motion: [4, 6], button: 3, chargeMs: 800 },
];

/** How long a whole motion may take before it no longer counts. */
export const MOTION_WINDOW = 600;
/** The grades, by the time from the last direction to the button. */
export const GRADES: [number, Flash["kind"]][] = [
  [50, "perfect"],
  [120, "great"],
  [220, "good"],
];

export interface DirEntry {
  dir: number;
  at: number;
}

/**
 * Looks for the move at the end of the direction buffer, for a button at
 * `now`. It returns the time from the motion's last direction to the
 * button, or null when the motion isn't there (in order, within the
 * window; other directions may come in between, as a real motion wobbles).
 */
export function recognize(buffer: readonly DirEntry[], move: Move, now: number): number | null {
  const m = move.motion;
  let k = m.length - 1;
  let lastAt: number | null = null;
  let firstAt = now;
  for (let i = buffer.length - 1; i >= 0 && k >= 0; i--) {
    const e = buffer[i]!;
    if (now - e.at > MOTION_WINDOW + (move.chargeMs ?? 0) + 400) break;
    if (e.dir !== m[k]) continue;
    if (k === m.length - 1) lastAt = e.at;
    if (k === 0 && move.chargeMs) {
      // Held from e.at until the next direction change.
      const end = buffer[i + 1]?.at ?? now;
      if (end - e.at < move.chargeMs) return null;
      firstAt = end;
    } else firstAt = e.at;
    k--;
  }
  if (k >= 0 || lastAt === null) return null;
  if (now - firstAt > MOTION_WINDOW) return null;
  return now - lastAt;
}

export function grade(gap: number | null): Flash["kind"] {
  if (gap === null) return "miss";
  for (const [ms, kind] of GRADES) if (gap <= ms) return kind;
  return "late";
}

const BUTTON: Record<Move["button"], Btn> = { 1: "b1", 2: "b2", 3: "b3", 4: "b4" };

export interface MovesState {
  move: Move;
  buffer: DirEntry[];
  dir: number;
  combos: number;
  diagonals: Record<1 | 3 | 7 | 9, number>;
  bestGap: number | null;
  flash: Flash | null;
  score: number;
  tries: number;
  next: () => number;
}

export function create(seed: number): MovesState {
  const next = rng(seed);
  return { move: MOVES[0]!, buffer: [], dir: 5, combos: 0, diagonals: { 1: 0, 3: 0, 7: 0, 9: 0 }, bestGap: null, flash: null, score: 0, tries: 0, next };
}

export function step(s: MovesState, f: Frame): void {
  const d = numpad(f.input);
  if (d !== s.dir) {
    s.dir = d;
    s.buffer.push({ dir: d, at: f.now });
    if (s.buffer.length > 40) s.buffer.shift();
    if (d === 1 || d === 3 || d === 7 || d === 9) s.diagonals[d]++;
  }
  const pressed = ([1, 2, 3, 4] as const).find((b) => f.pressed.has(BUTTON[b]));
  if (!pressed) return;
  s.tries++;
  const gap = pressed === s.move.button ? recognize(s.buffer, s.move, f.now) : null;
  const kind = grade(gap);
  s.flash = { kind, ms: gap === null ? null : Math.round(gap), at: f.now };
  sfx(kind === "late" ? "miss" : kind);
  if (kind === "late" || kind === "miss") return;
  s.combos++;
  s.score += kind === "perfect" ? 300 : kind === "great" ? 200 : 100;
  if (s.bestGap === null || gap! < s.bestGap) s.bestGap = Math.round(gap!);
  // The next move: never the same twice in a row.
  let n = s.move;
  while (n === s.move) n = MOVES[Math.floor(s.next() * MOVES.length)]!;
  s.move = n;
  s.buffer = [];
}

export function hud(s: MovesState): Hud {
  const diag = s.diagonals;
  return {
    score: s.score,
    over: false,
    flash: s.flash,
    move: s.move.id,
    motion: `${s.move.motion.map((d) => ARROWS[d]).join(" ")} + ${s.move.button}`,
    stats: [
      { key: "combos", value: String(s.combos) },
      { key: "diagonals", value: `↙${diag[1]} ↘${diag[3]} ↖${diag[7]} ↗${diag[9]}` },
      { key: "bestGap", value: s.bestGap === null ? "—" : `${s.bestGap} ms` },
    ],
  };
}
