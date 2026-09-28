// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Logic of the on-screen gamepad for phones and tablets: which directions a
// thumb on the D-pad means, and which action buttons a game shows.

import { Button } from "./stream";

/** Thumb offsets inside this fraction of the pad radius press nothing. */
export const DPAD_DEADZONE = 0.25;

/**
 * Turns a thumb position on the D-pad into direction bits. dx and dy go
 * from -1 to 1 (right and down are positive). Eight sectors of 45 degrees
 * give the diagonals; a 4-way joystick (Pac-Man) only gets the dominant
 * axis, as its real stick would.
 */
export function dpadBits(dx: number, dy: number, fourWay = false): number {
  if (Math.hypot(dx, dy) < DPAD_DEADZONE) return 0;
  if (fourWay) {
    if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? Button.Left : Button.Right;
    return dy < 0 ? Button.Up : Button.Down;
  }
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI; // 0 = right, 90 = down
  let bits = 0;
  if (angle > -67.5 && angle < 67.5) bits |= Button.Right;
  if (angle > 112.5 || angle < -112.5) bits |= Button.Left;
  if (angle > 22.5 && angle < 157.5) bits |= Button.Down;
  if (angle < -22.5 && angle > -157.5) bits |= Button.Up;
  return bits;
}

/** The action buttons of a game, in the order MAME numbers them. */
export const ACTION_BUTTONS = [Button.B1, Button.B2, Button.B3, Button.B4, Button.B5, Button.B6] as const;

/** Action button bits a game with this many buttons uses (0 to 6). */
export function actionButtons(count: number): number[] {
  return ACTION_BUTTONS.slice(0, Math.min(Math.max(Math.round(count), 0), ACTION_BUTTONS.length));
}

/** Whether the D-pad should only allow four directions. */
export function isFourWay(control: string): boolean {
  return control === "joy4way";
}

/** A browser on a touch screen (phone, tablet, iPad even in desktop mode). */
export function isTouchDevice(nav: { maxTouchPoints?: number } = navigator, mq?: (q: string) => boolean): boolean {
  const media = mq ?? ((q: string) => typeof matchMedia === "function" && matchMedia(q).matches);
  return (nav.maxTouchPoints ?? 0) > 0 || media("(any-pointer: coarse)");
}
