// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Every way to play, merged into the engine's Controls: the keyboard, any
// controller (Gamepad API, through this browser's map for that model) and
// the on-screen touch pad.

import { Button, type InputConfig } from "@go-link/shared";
import { NO_CONTROLS, type Controls } from "../engine/controls";
import { identify } from "../../controllers/controllerModels";
import { loadPadConfig, pauseHeld, readPad } from "./pad";

/** The touch pad writes here (the UI owns it; the game reads it). */
export interface TouchState {
  moveX: number;
  down: boolean;
  up: boolean;
  jump: boolean;
  fire: boolean;
  knife: boolean;
  bazooka: boolean;
}

export const emptyTouch = (): TouchState => ({ moveX: 0, down: false, up: false, jump: false, fire: false, knife: false, bazooka: false });

const KEYS: Record<string, keyof Controls | "left" | "right"> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "jump",
  ArrowDown: "down",
  KeyS: "down",
  Space: "jump",
  KeyJ: "fire",
  KeyK: "knife",
  KeyL: "bazooka",
  KeyE: "rescue",
  ShiftLeft: "run",
  ShiftRight: "run",
  Escape: "pause",
  KeyP: "pause",
};

export class Input {
  private held = new Set<string>();
  /** Keys pressed and let go between two frames still count once. */
  private tapped = new Set<string>();
  readonly touch = emptyTouch();
  padName: string | null = null;
  /** A controller's Start is held (the briefing's "Press start"). */
  padStart = false;
  /** The site's controller maps, read once for this session. */
  private padConfig: InputConfig;
  /** Development only: controls set by a script (an automated player). */
  drive: Partial<Controls> | null = null;

  constructor(private win: Window) {
    this.padConfig = loadPadConfig(win);
    win.addEventListener("keydown", this.down, true);
    win.addEventListener("keyup", this.up, true);
    win.addEventListener("blur", this.blur);
  }

  dispose(): void {
    this.win.removeEventListener("keydown", this.down, true);
    this.win.removeEventListener("keyup", this.up, true);
    this.win.removeEventListener("blur", this.blur);
  }

  private down = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (!(e.code in KEYS) || e.metaKey || e.ctrlKey || e.altKey) return;
    // Esc also leaves dialogs; the game handles it as pause.
    e.preventDefault();
    e.stopPropagation();
    this.held.add(e.code);
    this.tapped.add(e.code);
  };

  private up = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private blur = () => {
    this.held.clear();
  };

  /** The controls for this frame. */
  read(): Controls {
    const c: Controls = { ...NO_CONTROLS };
    let left = false;
    let right = false;
    const on = new Set([...this.held, ...this.tapped]);
    this.tapped.clear();
    for (const code of on) {
      const k = KEYS[code];
      if (k === "left") left = true;
      else if (k === "right") right = true;
      else if (k && k !== "moveX") (c[k] as boolean) = true;
    }
    c.moveX = (right ? 1 : 0) - (left ? 1 : 0);
    // Controllers: stick or D-pad moves; B1 jump, B2 knife, B3 gun, B4/R2 bazooka, R1 run, Start pause.
    let name: string | null = null;
    let start = false;
    for (const gp of this.win.navigator.getGamepads?.() ?? []) {
      if (!gp || !gp.connected) continue;
      // The recognized model ("Sony DualSense"), not the browser's raw id.
      if (name === null) {
        const id = identify(gp.id);
        name = [id.brand, id.modelName].filter(Boolean).join(" ") || gp.id;
      }
      // The same buttons the controller test shows: the model's own map,
      // and a button held while the pad appeared counts once released.
      const pad = readPad(gp, this.padConfig);
      const b = (bit: number) => (pad.buttons & bit) !== 0;
      const ax = (pad.axes[0] ?? 0) / 127;
      const ay = (pad.axes[1] ?? 0) / 127;
      const dx = (b(Button.Right) ? 1 : 0) - (b(Button.Left) ? 1 : 0);
      const mx = Math.abs(ax) > 0.2 ? ax : dx;
      if (Math.abs(mx) > Math.abs(c.moveX)) c.moveX = mx;
      c.down ||= b(Button.Down) || ay > 0.55;
      c.up ||= b(Button.Up) || ay < -0.55;
      c.jump ||= b(Button.B1);
      c.knife ||= b(Button.B2);
      c.fire ||= b(Button.B3);
      c.bazooka ||= b(Button.B4) || b(Button.R2);
      c.run ||= b(Button.B6);
      c.pause ||= b(Button.Start) || pauseHeld(gp, this.padConfig);
      start ||= b(Button.Start);
    }
    this.padName = name;
    this.padStart = start;
    if (this.drive) {
      const d = this.drive;
      if (d.moveX) c.moveX = d.moveX;
      for (const k of ["up", "down", "run", "jump", "fire", "knife", "bazooka", "rescue"] as const) if (d[k]) c[k] = true;
    }
    // Touch.
    const t = this.touch;
    if (Math.abs(t.moveX) > Math.abs(c.moveX)) c.moveX = t.moveX;
    c.down ||= t.down;
    c.up ||= t.up;
    c.jump ||= t.jump;
    c.fire ||= t.fire;
    c.knife ||= t.knife;
    c.bazooka ||= t.bazooka;
    return c;
  }
}
