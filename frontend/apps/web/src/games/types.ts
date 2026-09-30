// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import type { Frame } from "./input";

/** The site's colors, read from its tokens when a game starts (see palette.ts). */
export interface Palette {
  bg: string;
  grid: string;
  line: string;
  dim: string;
  text: string;
  accent: string;
  ok: string;
  p1: string;
  p2: string;
  p3: string;
  p4: string;
  /** The site's monospace font family, for numbers and signs on the board. */
  mono: string;
}

/** Every game draws on a 320 × 200 board, scaled up to the stage. */
export const BOARD_W = 320;
export const BOARD_H = 200;

export type StatKey =
  | "level"
  | "rotations"
  | "shoulders"
  | "length"
  | "up"
  | "down"
  | "left"
  | "right"
  | "round"
  | "reaction"
  | "bounces"
  | "lives"
  | "restX"
  | "meters"
  | "speed"
  | "r2max"
  | "l2max"
  | "analog"
  | "combos"
  | "diagonals"
  | "bestGap"
  | "time";

export interface Stat {
  key: StatKey;
  value: string;
}

/** A judged special move: its grade and the time from the last direction to the button. */
export interface Flash {
  kind: "perfect" | "great" | "good" | "late" | "miss";
  ms: number | null;
  at: number;
}

/** What the page shows around the board. */
export interface Hud {
  score: number;
  stats: Stat[];
  over: boolean;
  /** A level was just cleared (Link). */
  cleared?: boolean;
  /** The stick keeps a value while untouched (Paddle). */
  drift?: number | null;
  flash?: Flash | null;
  /** The game waits for the first move (Snake). */
  ready?: boolean;
  /** The ball waits on the paddle for a button (Paddle). */
  launch?: boolean;
  /** The move asked for (Special moves). */
  move?: "qcf" | "qcb" | "dp" | "hcf" | "charge";
  /** The same move written with arrows, e.g. ↓ ↘ → + 1. */
  motion?: string;
}

export interface Game<S> {
  create(seed: number): S;
  step(s: S, f: Frame): void;
  hud(s: S): Hud;
  draw(ctx: CanvasRenderingContext2D, s: S, pal: Palette, now: number): void;
}
