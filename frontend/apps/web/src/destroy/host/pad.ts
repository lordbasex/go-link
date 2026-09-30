// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Reads a controller the way the rest of the site does: through the button
// map this browser keeps for that controller model (the remap made in the
// site's controls, "go-link.input" in localStorage), so a generic USB pad
// that the controller test shows correctly works the same in the game.

import { DEFAULT_INPUT, bindingOf, loadInputConfig, padBits, padMapFor, readGamepad, type GamepadLike, type InputConfig, type Pad } from "@go-link/shared";

/** This browser's controller settings, read once per session (the defaults when storage is blocked). */
export function loadPadConfig(win: Window | undefined): InputConfig {
  try {
    return loadInputConfig(win?.localStorage);
  } catch {
    return DEFAULT_INPUT;
  }
}

/** One controller's state as button bits (Button.B1…) and stick axes (-127…127). */
export function readPad(gp: GamepadLike, cfg: InputConfig): Pad {
  return readGamepad(gp, padBits(padMapFor(cfg, gp.id)));
}

/** Whether the button this browser binds to the site's "pause" action is held (it has no pad bit). */
export function pauseHeld(gp: GamepadLike, cfg: InputConfig): boolean {
  const i = bindingOf(padMapFor(cfg, gp.id), "pause");
  const b = i === undefined ? undefined : gp.buttons[Number(i)];
  return !!b && (b.pressed || b.value > 0.5);
}
