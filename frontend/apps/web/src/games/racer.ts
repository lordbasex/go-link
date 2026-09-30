// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Racer: R2 speeds up, L2 brakes, the stick steers along a winding road
// for 60 seconds. It keeps the deepest pull of each trigger and whether
// they answered in between (analog) or only fully on and off.

import type { Frame } from "./input";
import type { Hud } from "./types";
import { sfx } from "./sfx";

export const RACE_MS = 60_000;
export const ROAD_HALF = 0.32; // half the road's width, as a share of the board
export const MAX_SPEED = 0.06; // meters per ms (216 km/h)
const ACCEL = 0.00006;
const BRAKE = 0.00014;
const DRAG = 0.000012;

/** The road's center (-1..1 of the board's half width) at a distance. */
export function roadCenter(z: number): number {
  return 0.45 * Math.sin(z / 45) + 0.2 * Math.sin(z / 17 + 1.3);
}

export interface RacerState {
  z: number;
  speed: number;
  /** The car's place across the board, -1..1. */
  x: number;
  t: number;
  offRoad: boolean;
  r2max: number;
  l2max: number;
  /** Whether each trigger was seen between 10 % and 90 %. */
  r2mid: boolean;
  l2mid: boolean;
  r2: number;
  l2: number;
  done: boolean;
}

export function create(): RacerState {
  return { z: 0, speed: 0, x: roadCenter(0), t: 0, offRoad: false, r2max: 0, l2max: 0, r2mid: false, l2mid: false, r2: 0, l2: 0, done: false };
}

export function step(s: RacerState, f: Frame): void {
  const { input, dt } = f;
  s.r2 = input.rt;
  s.l2 = input.lt;
  s.r2max = Math.max(s.r2max, input.rt);
  s.l2max = Math.max(s.l2max, input.lt);
  if (input.rt > 0.1 && input.rt < 0.9) s.r2mid = true;
  if (input.lt > 0.1 && input.lt < 0.9) s.l2mid = true;
  if (s.done) return;
  // Up and down on the keyboard or the D-pad work too.
  const gas = Math.max(input.rt, input.up ? 1 : 0);
  const brake = Math.max(input.lt, input.down ? 1 : 0);
  s.speed += (gas * ACCEL - brake * BRAKE - DRAG) * dt;
  const top = s.offRoad ? MAX_SPEED * 0.35 : MAX_SPEED;
  s.speed = Math.max(0, Math.min(top, s.speed));
  s.z += s.speed * dt;
  // Steering: the road bends under the car, which has to follow it.
  s.x += input.lx * 0.0016 * (0.3 + s.speed / MAX_SPEED) * dt;
  s.x = Math.max(-1, Math.min(1, s.x));
  const wasOff = s.offRoad;
  s.offRoad = Math.abs(s.x - roadCenter(s.z)) > ROAD_HALF;
  if (s.offRoad && !wasOff && s.speed > 0) sfx("offroad");
  if (s.speed > 0 || s.t > 0) s.t += dt;
  if (s.t >= RACE_MS) {
    s.t = RACE_MS;
    s.done = true;
    sfx("finish");
  }
}

/** Meters driven. */
export const meters = (s: RacerState) => Math.floor(s.z);

export function hud(s: RacerState): Hud {
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  return {
    score: meters(s),
    over: s.done,
    stats: [
      { key: "time", value: `${Math.ceil((RACE_MS - s.t) / 1000)} s` },
      { key: "speed", value: `${Math.round(s.speed * 3600)} km/h` },
      { key: "r2max", value: pct(s.r2max) },
      { key: "l2max", value: pct(s.l2max) },
      { key: "analog", value: s.r2mid && s.l2mid ? "✓" : s.r2mid || s.l2mid ? "½" : "—" },
    ],
  };
}
