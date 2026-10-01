// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Play mode's controls, the same way the site reads them in a room: the
// keyboard through this browser's key map (arrows, Z X C, Enter by default)
// and every controller through its saved button map (the Game tab's "Your
// controller" remaps both). Controllers take the first seats in the order
// the browser lists them; the keyboard (and the on-screen buttons on touch
// screens) takes the next free one. On a 2-button layout, B1 + B2 together
// is the special (B3).

import {
  Button,
  DEFAULT_INPUT,
  gamepadName,
  keyboardButtons,
  loadInputConfig,
  padBits,
  padMapFor,
  readGamepad,
  type GamepadLike,
  type InputConfig,
} from "@go-link/shared";
import { Input } from "../engine";

/** Whether play mode shows the on-screen pad: on touch screens, always or never. */
export type TouchPref = "auto" | "on" | "off";
const TOUCH_KEY = "go-link.wm.touchpad";

export function loadTouchPref(storage: Storage | undefined): TouchPref {
  try {
    const v = storage?.getItem(TOUCH_KEY);
    return v === "on" || v === "off" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function saveTouchPref(storage: Storage | undefined, pref: TouchPref): void {
  try {
    if (pref === "auto") storage?.removeItem(TOUCH_KEY);
    else storage?.setItem(TOUCH_KEY, pref);
  } catch {
    // storage blocked: the choice lasts for this page only
  }
}

/** The engine's input with both buttons of a 2-button layout read as the special. */
export function comboSpecial(v: number): number {
  return (v & Input.B1) && (v & Input.B2) ? (v & ~(Input.B1 | Input.B2)) | Input.B3 : v;
}

/** Site button bits to the engine's input bits. */
export function toInput(buttons: number): number {
  let v = 0;
  if (buttons & Button.Left) v |= Input.Left;
  if (buttons & Button.Right) v |= Input.Right;
  if (buttons & Button.Up) v |= Input.Up;
  if (buttons & Button.Down) v |= Input.Down;
  if (buttons & Button.B1) v |= Input.B1;
  if (buttons & Button.B2) v |= Input.B2;
  if (buttons & Button.B3) v |= Input.B3;
  if (buttons & (Button.Start | Button.Start1)) v |= Input.Start;
  return v;
}

export interface Seat {
  player: number;
  /** "pad" with the controller's name, or "keyboard". */
  device: "pad" | "keyboard";
  name: string;
}

export interface Reading {
  inputs: number[];
  seats: Seat[];
}

export class PlayControls {
  private readonly held = new Set<string>();
  private touch = 0;
  private cfg: InputConfig = DEFAULT_INPUT;
  private detach: (() => void) | null = null;
  /** Both buttons together are the special (a 2-button layout). */
  combo = false;

  /** Starts listening to the keyboard. Keys the game uses do not scroll the page. */
  attach(win: Window): void {
    try {
      this.cfg = loadInputConfig(win.localStorage);
    } catch {
      this.cfg = DEFAULT_INPUT;
    }
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (!this.cfg.keyboard[e.code]) return;
      this.held.add(e.code);
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      this.held.delete(e.code);
    };
    const blur = () => this.held.clear();
    win.addEventListener("keydown", down);
    win.addEventListener("keyup", up);
    win.addEventListener("blur", blur);
    this.detach = () => {
      win.removeEventListener("keydown", down);
      win.removeEventListener("keyup", up);
      win.removeEventListener("blur", blur);
    };
  }

  dispose(): void {
    this.detach?.();
    this.detach = null;
    this.held.clear();
  }

  /** Buttons held on the on-screen pad (site bits). */
  setTouch(bits: number): void {
    this.touch = bits;
  }

  /** Every seat's input for this frame. */
  read(pads: readonly (GamepadLike | null)[], maxPlayers: number): Reading {
    const inputs = new Array<number>(maxPlayers).fill(0);
    const seats: Seat[] = [];
    let next = 0;
    for (const gp of pads) {
      if (!gp || next >= maxPlayers) continue;
      inputs[next] = this.fold(toInput(readGamepad(gp, padBits(padMapFor(this.cfg, gp.id))).buttons));
      seats.push({ player: next, device: "pad", name: gamepadName(gp) });
      next++;
    }
    if (next < maxPlayers) {
      inputs[next] = this.fold(toInput(keyboardButtons(this.held, this.cfg.keyboard) | this.touch));
      seats.push({ player: next, device: "keyboard", name: "" });
    }
    return { inputs, seats };
  }

  private fold(v: number): number {
    return this.combo ? comboSpecial(v) : v;
  }
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}
