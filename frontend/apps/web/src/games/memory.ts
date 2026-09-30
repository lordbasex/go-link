// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Memory: repeat the sequence of lights on the four face buttons. It times
// each answer and counts double presses: a worn contact turns one press
// into two in a row (under 40 ms apart). A double press is counted, not
// held against the player.

import { BounceProbe } from "../tools/diagnostics";
import { rng, type Btn, type Frame } from "./input";
import type { Hud } from "./types";
import { sfx, type SfxEvent } from "./sfx";

export const FACE: readonly Btn[] = ["b1", "b2", "b3", "b4"];
const NOTES: readonly SfxEvent[] = ["note1", "note2", "note3", "note4"];
export const SHOW_ON = 420;
export const SHOW_OFF = 180;

export interface MemoryState {
  seq: number[];
  phase: "show" | "input" | "over";
  /** In "show": the step shown and when it started. */
  shown: number;
  phaseAt: number;
  pos: number;
  /** The button lit on screen and until when (a press or the show). */
  lit: number | null;
  litUntil: number;
  lastAt: number;
  reactions: number[];
  bounce: BounceProbe;
  bounces: number;
  score: number;
  /** The last light of the sequence that already made its sound. */
  sounded: number;
  next: () => number;
}

export function create(seed: number): MemoryState {
  const next = rng(seed);
  return { seq: [Math.floor(next() * 4)], phase: "show", shown: 0, phaseAt: -1, pos: 0, lit: null, litUntil: 0, lastAt: 0, reactions: [], bounce: new BounceProbe(), bounces: 0, score: 0, sounded: -1, next };
}

export function step(s: MemoryState, f: Frame): void {
  // Every frame goes through the bounce probe, in every phase.
  const held = FACE.map((b) => f.input.held[b]);
  const before = s.bounce.bounces.reduce((a, b) => a + (b ?? 0), 0);
  s.bounce.add(held, f.now);
  const after = s.bounce.bounces.reduce((a, b) => a + (b ?? 0), 0);
  const bounced = after > before;
  s.bounces = after;
  if (s.phaseAt < 0) s.phaseAt = f.now;
  if (s.lit !== null && f.now > s.litUntil) s.lit = null;
  if (s.phase === "show") {
    const t = f.now - s.phaseAt - 400;
    if (t < 0) return;
    const i = Math.floor(t / (SHOW_ON + SHOW_OFF));
    if (i >= s.seq.length) {
      s.phase = "input";
      s.pos = 0;
      s.phaseAt = s.lastAt = f.now;
      s.lit = null;
      return;
    }
    s.shown = i;
    s.lit = t - i * (SHOW_ON + SHOW_OFF) < SHOW_ON ? s.seq[i]! : null;
    if (s.lit !== null && s.sounded !== i) {
      s.sounded = i;
      sfx(NOTES[s.lit]!);
    }
    s.litUntil = f.now + 1;
    return;
  }
  if (s.phase !== "input" || bounced) return;
  const b = FACE.findIndex((name) => f.pressed.has(name));
  if (b < 0) return;
  s.lit = b;
  s.litUntil = f.now + 200;
  sfx(NOTES[b]!);
  s.reactions.push(f.now - s.lastAt);
  if (s.reactions.length > 20) s.reactions.shift();
  s.lastAt = f.now;
  if (b !== s.seq[s.pos]) {
    s.phase = "over";
    sfx("over");
    return;
  }
  s.pos++;
  if (s.pos === s.seq.length) {
    s.score = s.seq.length;
    s.seq.push(Math.floor(s.next() * 4));
    s.phase = "show";
    s.phaseAt = f.now + 300;
    s.sounded = -1;
    sfx("round");
  }
}

export function hud(s: MemoryState): Hud {
  const avg = s.reactions.length ? Math.round(s.reactions.reduce((a, b) => a + b, 0) / s.reactions.length) : null;
  return {
    score: s.score,
    over: s.phase === "over",
    stats: [
      { key: "round", value: String(s.seq.length) },
      { key: "reaction", value: avg === null ? "—" : `${avg} ms` },
      { key: "bounces", value: String(s.bounces) },
    ],
  };
}
