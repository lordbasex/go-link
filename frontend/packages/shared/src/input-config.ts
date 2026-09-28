// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// How this browser's keyboard and gamepads map to the game: which local
// player each gamepad drives, and which key or button does each action.
// Saved in the browser, per device model for gamepads.

import { Button, DEFAULT_KEYMAP, MAX_LOCAL_PLAYERS } from "./stream";

/** What a key or a gamepad button can do. "pause" stays in the browser. */
export type InputAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "b1"
  | "b2"
  | "b3"
  | "b4"
  | "b5"
  | "b6"
  | "start"
  | "coin"
  | "l2"
  | "r2"
  | "l3"
  | "r3"
  | "home"
  | "capture"
  | "start1"
  | "start2"
  | "start3"
  | "start4"
  | "pause";

/** Actions in the order the remap screen lists them, with their bit. */
export const INPUT_ACTIONS: { id: InputAction; bit: number }[] = [
  { id: "up", bit: Button.Up },
  { id: "down", bit: Button.Down },
  { id: "left", bit: Button.Left },
  { id: "right", bit: Button.Right },
  { id: "b1", bit: Button.B1 },
  { id: "b2", bit: Button.B2 },
  { id: "b3", bit: Button.B3 },
  { id: "b4", bit: Button.B4 },
  { id: "b5", bit: Button.B5 },
  { id: "b6", bit: Button.B6 },
  { id: "start", bit: Button.Start },
  { id: "coin", bit: Button.Coin },
  { id: "l2", bit: Button.L2 },
  { id: "r2", bit: Button.R2 },
  { id: "l3", bit: Button.L3 },
  { id: "r3", bit: Button.R3 },
  { id: "home", bit: Button.Home },
  { id: "capture", bit: Button.Capture },
  { id: "start1", bit: Button.Start1 },
  { id: "start2", bit: Button.Start2 },
  { id: "start3", bit: Button.Start3 },
  { id: "start4", bit: Button.Start4 },
  { id: "pause", bit: 0 },
];

const BIT: Record<InputAction, number> = Object.fromEntries(INPUT_ACTIONS.map((a) => [a.id, a.bit])) as Record<InputAction, number>;
const ACTION_OF_BIT = new Map(INPUT_ACTIONS.filter((a) => a.bit).map((a) => [a.bit, a.id]));

/** Keyboard: KeyboardEvent.code -> action. */
export type KeyMap = Record<string, InputAction>;
/** Gamepad: button index (standard mapping) -> action. */
export type PadMap = Record<number, InputAction>;

export const DEFAULT_KEYBOARD: KeyMap = {
  ...Object.fromEntries(Object.entries(DEFAULT_KEYMAP).map(([code, bit]) => [code, ACTION_OF_BIT.get(bit)!])),
  KeyP: "pause",
};

export const DEFAULT_PAD: PadMap = {
  0: "b1",
  1: "b2",
  2: "b3",
  3: "b4",
  4: "b5",
  5: "b6",
  6: "l2",
  7: "r2",
  8: "coin",
  9: "start",
  10: "l3",
  11: "r3",
  12: "up",
  13: "down",
  14: "left",
  15: "right",
  16: "home",
  17: "capture",
};

export interface InputConfig {
  keyboard: KeyMap;
  /** Remapped gamepads, by browser gamepad id (same model, same layout). */
  pads: Record<string, PadMap>;
  /** Local player (0-3) of each gamepad slot; missing means automatic. */
  players: Record<string, number>;
}

export const DEFAULT_INPUT: InputConfig = { keyboard: DEFAULT_KEYBOARD, pads: {}, players: {} };

const KEY = "go-link.input";
const ACTION_SET = new Set<string>(INPUT_ACTIONS.map((a) => a.id));

export function loadInputConfig(storage: Storage | undefined): InputConfig {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return DEFAULT_INPUT;
    const v = JSON.parse(raw) as Partial<InputConfig>;
    const keyboard = upgradeStartKeys(cleanMap(v.keyboard, (k) => /^[A-Za-z0-9]{1,24}$/.test(k)));
    const pads: Record<string, PadMap> = {};
    for (const [id, map] of Object.entries(v.pads ?? {}).slice(0, 16)) {
      pads[id.slice(0, 120)] = cleanMap(map, (k) => /^\d{1,2}$/.test(k)) as PadMap;
    }
    const players: Record<string, number> = {};
    for (const [slot, p] of Object.entries(v.players ?? {}).slice(0, 16)) {
      if (Number.isInteger(p) && p >= 0 && p < MAX_LOCAL_PLAYERS) players[slot.slice(0, 130)] = p;
    }
    return { keyboard: Object.keys(keyboard).length ? keyboard : DEFAULT_KEYBOARD, pads, players };
  } catch {
    return DEFAULT_INPUT;
  }
}

/**
 * Maps saved before the panel start buttons had 1 as the player's own
 * Start and nothing on 2, 3 and 4: those get the new layout (1 to 4 are
 * the start buttons of players 1 to 4). Keys the person changed stay.
 */
function upgradeStartKeys(map: Record<string, InputAction>): Record<string, InputAction> {
  const actions = new Set(Object.values(map));
  if (map.Digit1 !== "start" || ["start1", "start2", "start3", "start4"].some((a) => actions.has(a as InputAction))) return map;
  const out: Record<string, InputAction> = { ...map, Digit1: "start1" };
  (["Digit2", "Digit3", "Digit4"] as const).forEach((key, i) => {
    if (!(key in out)) out[key] = `start${i + 2}` as InputAction;
  });
  if (!Object.values(out).includes("start") && !("Enter" in map)) out.Enter = "start";
  return out;
}

function cleanMap(v: unknown, keyOk: (k: string) => boolean): Record<string, InputAction> {
  const out: Record<string, InputAction> = {};
  if (typeof v !== "object" || v === null) return out;
  for (const [k, a] of Object.entries(v as Record<string, unknown>)) {
    if (keyOk(k) && typeof a === "string" && ACTION_SET.has(a)) out[k] = a as InputAction;
  }
  return out;
}

export function saveInputConfig(storage: Storage | undefined, cfg: InputConfig): void {
  try {
    storage?.setItem(KEY, JSON.stringify(cfg));
  } catch {
    // storage blocked: the change lasts for this page only
  }
}

/** The gamepad map for a model: its remap, or the standard layout. */
export function padMapFor(cfg: InputConfig, id: string): PadMap {
  return cfg.pads[id] ?? DEFAULT_PAD;
}

/** Button bits of the held keys. */
export function keyboardButtons(held: Iterable<string>, map: KeyMap): number {
  let bits = 0;
  for (const code of held) {
    const a = map[code];
    if (a) bits |= BIT[a];
  }
  return bits;
}

/** Button index -> bit, for readGamepad. */
export function padBits(map: PadMap): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [i, a] of Object.entries(map)) if (BIT[a]) out[Number(i)] = BIT[a];
  return out;
}

/** The key or button index bound to an action, if any. */
export function bindingOf<K extends string | number>(map: Record<K, InputAction>, action: InputAction): K | undefined {
  return (Object.keys(map) as K[]).find((k) => map[k] === action);
}

/** Binds a key or button to an action: one input per action, one action per input. */
export function bind<K extends string | number>(map: Record<K, InputAction>, input: NoInfer<K>, action: InputAction): Record<K, InputAction> {
  const next = { ...map };
  for (const k of Object.keys(next) as K[]) if (next[k] === action) delete next[k];
  next[input] = action;
  return next;
}

/**
 * The slot of each connected gamepad: its id plus its position among pads
 * of the same model, so two identical controllers keep separate players.
 */
export function gamepadSlot(id: string, nth: number): string {
  return `${id}#${nth}`;
}
