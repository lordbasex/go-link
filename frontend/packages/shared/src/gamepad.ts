// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Reads physical controllers with the browser Gamepad API. It works with
// USB and Bluetooth pads (Switch Pro Controller, Xbox, DualSense...)
// without drivers or permissions. Pads that report the "standard" mapping
// have the same button numbers everywhere.

import { Button, type Pad } from "./stream";

/** Standard mapping button index -> our button bit. */
const STANDARD_BUTTONS: Record<number, number> = {
  0: Button.B1, // bottom (Switch: B)
  1: Button.B2, // right (Switch: A)
  2: Button.B3, // left (Switch: Y)
  3: Button.B4, // top (Switch: X)
  4: Button.B5, // L
  5: Button.B6, // R
  6: Button.L2, // ZL
  7: Button.R2, // ZR
  8: Button.Coin, // minus / select
  9: Button.Start, // plus / start
  10: Button.L3,
  11: Button.R3,
  12: Button.Up,
  13: Button.Down,
  14: Button.Left,
  15: Button.Right,
  16: Button.Home,
  17: Button.Capture,
};

/** Stick values inside this radius count as centered. */
export const DEADZONE = 0.15;

/** Stick push that also presses the matching direction. */
const STICK_AS_DPAD = 0.5;

function axis(v: number | undefined): number {
  if (v === undefined || Math.abs(v) < DEADZONE) return 0;
  return Math.round(Math.max(-1, Math.min(1, v)) * 127);
}

/** Minimal shape of the browser's Gamepad, so tests can fake it. */
export interface GamepadLike {
  id: string;
  index: number;
  connected: boolean;
  mapping: string;
  buttons: readonly { pressed: boolean; value: number }[];
  axes: readonly number[];
}

/** Rest state of a pad without the standard mapping. */
interface Baseline {
  pressed: boolean[];
  axes: number[];
}

// Pads without the "standard" mapping (for example the Switch Pro
// Controller in Firefox on macOS) can report buttons as held and sticks off
// center while untouched. Their first reading is taken as the rest state,
// and only changes from it count, so an idle pad never sends input.
const baselines = new Map<string, Baseline>();

function padKey(gp: GamepadLike): string {
  return `${gp.index}:${gp.id}`;
}

/** Forgets the rest state of a pad, e.g. when it disconnects. */
export function forgetGamepad(gp: GamepadLike): void {
  baselines.delete(padKey(gp));
}

function isPressed(b: { pressed: boolean; value: number }): boolean {
  return b.pressed || b.value > 0.5;
}

/** Converts a browser gamepad into our pad state. buttons maps button
 * indexes to bits (a remap); the standard layout by default. */
export function readGamepad(gp: GamepadLike, map: Record<number, number> = STANDARD_BUTTONS): Pad {
  let base: Baseline | undefined;
  if (gp.mapping !== "standard") {
    base = baselines.get(padKey(gp));
    if (!base) {
      base = { pressed: gp.buttons.map(isPressed), axes: [...gp.axes] };
      baselines.set(padKey(gp), base);
    }
  }
  const stick = (i: number): number => {
    const v = gp.axes[i];
    if (v === undefined) return 0;
    const rest = base?.axes[i] ?? 0;
    // A non-standard axis that rests off center (a trigger or a hat)
    // is not a stick: ignore it rather than guess.
    if (Math.abs(rest) >= DEADZONE) return 0;
    return v;
  };
  let buttons = 0;
  gp.buttons.forEach((b, i) => {
    // A button held at the first reading (often the press that made the
    // browser list the pad) counts again once it has been let go.
    if (base?.pressed[i] && !isPressed(b)) base.pressed[i] = false;
    const bit = map[i];
    if (bit === undefined || !isPressed(b)) return;
    if (base?.pressed[i]) return; // held at rest: not a real press
    buttons |= bit;
  });
  const values = [stick(0), stick(1), stick(2), stick(3)];
  const axes: Pad["axes"] = [axis(values[0]), axis(values[1]), axis(values[2]), axis(values[3])];
  // The left stick also drives the directions: arcade games are digital.
  const lx = values[0]!;
  const ly = values[1]!;
  if (lx <= -STICK_AS_DPAD) buttons |= Button.Left;
  if (lx >= STICK_AS_DPAD) buttons |= Button.Right;
  if (ly <= -STICK_AS_DPAD) buttons |= Button.Up;
  if (ly >= STICK_AS_DPAD) buttons |= Button.Down;
  return { buttons, axes };
}

/** Short readable name, e.g. "Pro Controller". */
export function gamepadName(gp: { id: string }): string {
  const id = gp.id.replace(/\s*\((?:STANDARD GAMEPAD|Vendor:)[^)]*\)\s*/gi, " ").trim();
  return id.length > 40 ? `${id.slice(0, 40)}…` : id || "Gamepad";
}
