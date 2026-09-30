// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The games' sound events. The rules (no DOM, no audio) only name what
// happened; the page plugs a sink that plays it (sound.ts). Without a sink,
// as in the tests, events go nowhere.

export type SfxEvent =
  | "move" // a cursor or a menu step
  | "turn" // a tile turned (Link)
  | "clear" // a level cleared (Link) or a wall cleared (Paddle)
  | "eat" // Snake ate a light
  | "over" // game over
  | "note1"
  | "note2"
  | "note3"
  | "note4" // Memory's four lights
  | "round" // Memory: a round repeated
  | "launch" // Paddle: the ball leaves the paddle
  | "wall" // Paddle: the ball hits a wall
  | "paddle" // Paddle: the ball hits the paddle
  | "brick" // Paddle: a brick breaks
  | "lose" // Paddle: a ball falls
  | "offroad" // Racer: the car leaves the road
  | "finish" // Racer: time is up
  | "perfect"
  | "great"
  | "good"
  | "miss"; // Special moves' grades

/** Where on the 320 × 200 board it happened, for the visual effects. */
export interface SfxAt {
  x: number;
  y: number;
  /** Points won, shown floating up. */
  points?: number;
  /** A palette color for the particles (types.ts Palette key). */
  color?: "accent" | "ok" | "p1" | "p2" | "p3" | "p4" | "text";
}

type Sink = (e: SfxEvent, at?: SfxAt) => void;
let sink: Sink | null = null;

/** Plugs (or unplugs, with null) what plays the events: the sound and the board's effects. */
export function setSfxSink(s: Sink | null): void {
  sink = s;
}

export function sfx(e: SfxEvent, at?: SfxAt): void {
  sink?.(e, at);
}
