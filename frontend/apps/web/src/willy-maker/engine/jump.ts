// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The jump as the engine really plays it (experiment 1, T-13): the same
// numbers gave 62 px in one ROM and 69 px in another, depending on whether
// gravity is added before or after the move, so the reach check, the Rules
// card and the AI pack measure it instead of trusting a number. A player on
// a flat floor tries the ways this game's rules allow (one jump, a second
// press in the air, B1 held for the jet pack) and the highest rise counts.

import { Game } from "./game";
import { CELL, Input, Tag, rulesWith, type GameRules } from "./rules";

export interface JumpMeasure {
  /** The highest the feet rise above the floor, in px (61.9 with the default rules). */
  peak: number;
  /** Whole rows of 16 px a player can land on: the reach check climbs this many. */
  rows: number;
  /** The highest ledge the jump reaches, in px (rows × 16). */
  ledge: number;
}

const COLS = 8;
const ROWS = 24;
const FLOOR = ROWS - 2;

function rise(rules: GameRules, pad: (frame: number) => number): number {
  const tags = new Uint8Array(COLS * ROWS);
  for (let c = 0; c < COLS; c++) tags[FLOOR * COLS + c] = Tag.Solid;
  const level = { name: "jump", width: COLS * CELL, height: ROWS * CELL, tags, objects: [{ name: "p1", type: "player_start", x: 64, y: FLOOR * CELL, player: 1 }] };
  const g = new Game(level, { rules, maxPlayers: 1 });
  const p = g.players[0]!;
  const floor = p.y;
  let top = floor;
  for (let f = 0; f < 400; f++) {
    g.step([pad(f)]);
    top = Math.min(top, p.y);
    if (f > 2 && p.onGround) break;
  }
  return (floor - top) / 16;
}

const cache = new Map<string, JumpMeasure>();

/** The jump this game's rules give, measured on play mode's engine (the ROM engine plays the same). */
export function measureJump(saved?: Partial<GameRules>): JumpMeasure {
  const rules = rulesWith(saved);
  const key = `${rules.doubleJump}:${rules.jetpack}`;
  const known = cache.get(key);
  if (known) return known;
  let peak = rise(rules, (f) => (f === 0 ? Input.B1 : 0));
  // a second press in the air, at every frame it could come
  if (rules.doubleJump) for (let k = 2; k < 60; k++) peak = Math.max(peak, rise(rules, (f) => (f === 0 || f === k ? Input.B1 : 0)));
  // B1 held, and held again after a second press
  if (rules.jetpack) {
    peak = Math.max(peak, rise(rules, () => Input.B1));
    if (rules.doubleJump) for (let k = 2; k < 60; k += 2) peak = Math.max(peak, rise(rules, (f) => (f === 0 || f >= k ? Input.B1 : 0)));
  }
  const rows = Math.floor(peak / CELL);
  const out = { peak: Math.round(peak * 10) / 10, rows, ledge: rows * CELL };
  cache.set(key, out);
  return out;
}
