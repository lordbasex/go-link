// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The editor's keyboard shortcuts, in one table: the shortcuts list shows
// its rows, and the key handler runs the action of the first row whose
// `match` takes the key. Rows without `match` are pointer gestures or keys
// handled elsewhere (the wheel, Space while held, the game's keys).
// ⌘ on Apple computers is Ctrl elsewhere.

import { MOD_NAME, MOD_PREFIX } from "./state";
import type { StudioMessages } from "../../i18n";

export type ShortcutAction =
  | "tool:select"
  | "tool:zone"
  | "tool:erase"
  | "tool:hand"
  | "zoneKind"
  | "zoomIn"
  | "zoomOut"
  | "fit"
  | "actual"
  | "grid"
  | "bothPanels"
  | "rightPanel"
  | "leftPanel"
  | "undo"
  | "redo"
  | "duplicate"
  | "group"
  | "newGroup"
  | "rename"
  | "delete"
  | "nudge"
  | "background"
  | "cancel"
  | "playStop"
  | "list";

type Group = keyof StudioMessages["keys"]["groups"];
type Item = keyof StudioMessages["keys"]["items"];
type Names = StudioMessages["keys"]["names"];

export interface ShortcutRow {
  group: Group;
  item: Item;
  keys: (n: Names) => string[];
  action?: ShortcutAction;
  match?: (e: KeyboardEvent) => boolean;
}

const mod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;
const plain = (e: KeyboardEvent) => !mod(e) && !e.altKey;
const letter = (e: KeyboardEvent, k: string) => e.key.toLowerCase() === k;

export const SHORTCUTS: readonly ShortcutRow[] = [
  { group: "tools", item: "select", keys: () => ["V"], action: "tool:select", match: (e) => plain(e) && letter(e, "v") },
  { group: "tools", item: "zone", keys: () => ["B"], action: "tool:zone", match: (e) => plain(e) && letter(e, "b") },
  { group: "tools", item: "zoneKind", keys: () => ["1 … 6"], action: "zoneKind", match: (e) => plain(e) && /^[1-7]$/.test(e.key) },
  { group: "tools", item: "erase", keys: () => ["E"], action: "tool:erase", match: (e) => plain(e) && letter(e, "e") },
  { group: "tools", item: "hand", keys: () => ["H"], action: "tool:hand", match: (e) => plain(e) && letter(e, "h") },
  { group: "tools", item: "tempHand", keys: (n) => [n.space, n.drag] },

  { group: "view", item: "wheelZoom", keys: (n) => [MOD_NAME, n.wheel] },
  { group: "view", item: "wheelZoom", keys: (n) => ["Alt", n.wheel] },
  { group: "view", item: "zoomInOut", keys: () => [`${MOD_PREFIX}+`, `${MOD_PREFIX}−`] },
  { group: "view", item: "zoomInOut", keys: () => [], action: "zoomIn", match: (e) => mod(e) && (e.key === "=" || e.key === "+") },
  { group: "view", item: "zoomInOut", keys: () => [], action: "zoomOut", match: (e) => mod(e) && (e.key === "-" || e.key === "_") },
  { group: "view", item: "fit", keys: () => [`${MOD_PREFIX}0`], action: "fit", match: (e) => mod(e) && e.key === "0" },
  { group: "view", item: "actual", keys: () => [`${MOD_PREFIX}1`], action: "actual", match: (e) => mod(e) && e.key === "1" },
  { group: "view", item: "grid", keys: () => [`${MOD_PREFIX}'`], action: "grid", match: (e) => mod(e) && e.key === "'" },

  { group: "panels", item: "bothPanels", keys: () => ["Tab"], action: "bothPanels", match: (e) => e.key === "Tab" && !e.shiftKey && plain(e) },
  { group: "panels", item: "rightPanel", keys: () => ["⇧Tab"], action: "rightPanel", match: (e) => e.key === "Tab" && e.shiftKey && plain(e) },
  { group: "panels", item: "leftPanel", keys: () => ["F6"], action: "leftPanel", match: (e) => e.key === "F6" },
  { group: "panels", item: "rightPanel", keys: () => ["F7"], action: "rightPanel", match: (e) => e.key === "F7" },

  { group: "edit", item: "undo", keys: () => [`${MOD_PREFIX}Z`], action: "undo", match: (e) => mod(e) && !e.shiftKey && letter(e, "z") },
  { group: "edit", item: "redo", keys: () => [`⇧${MOD_PREFIX}Z`], action: "redo", match: (e) => mod(e) && ((e.shiftKey && letter(e, "z")) || letter(e, "y")) },
  { group: "edit", item: "duplicate", keys: () => [`${MOD_PREFIX}D`], action: "duplicate", match: (e) => mod(e) && !e.shiftKey && letter(e, "d") },
  { group: "edit", item: "group", keys: () => [`${MOD_PREFIX}G`], action: "group", match: (e) => mod(e) && !e.shiftKey && letter(e, "g") },
  { group: "edit", item: "newGroup", keys: () => [`⇧${MOD_PREFIX}N`], action: "newGroup", match: (e) => mod(e) && e.shiftKey && letter(e, "n") },
  { group: "edit", item: "rename", keys: () => ["F2"], action: "rename", match: (e) => e.key === "F2" },
  { group: "edit", item: "delete", keys: (n) => [n.del], action: "delete", match: (e) => plain(e) && (e.key === "Delete" || e.key === "Backspace") },
  { group: "edit", item: "nudge", keys: () => ["←↑↓→", "⇧"], action: "nudge", match: (e) => !mod(e) && !e.altKey && e.key.startsWith("Arrow") },
  { group: "edit", item: "background", keys: () => [`${MOD_PREFIX}O`], action: "background", match: (e) => mod(e) && letter(e, "o") },
  { group: "edit", item: "cancel", keys: () => ["Esc"], action: "cancel", match: (e) => e.key === "Escape" },

  { group: "play", item: "playStop", keys: (n) => [`${MOD_PREFIX}${n.enter}`], action: "playStop", match: (e) => mod(e) && e.key === "Enter" },
  { group: "play", item: "move", keys: () => ["←", "→"] },
  { group: "play", item: "jump", keys: () => ["Z", "X", "C"] },
  { group: "play", item: "climb", keys: () => ["↑", "↓"] },
  { group: "play", item: "quit", keys: () => ["Esc"] },

  { group: "help", item: "list", keys: () => ["?"], action: "list", match: (e) => e.key === "?" },
  { group: "help", item: "menu", keys: (n) => [n.rightClick] },
  { group: "help", item: "renameLayer", keys: (n) => [n.doubleClick] },
];

export const SHORTCUT_GROUPS: readonly Group[] = ["tools", "view", "panels", "edit", "play", "help"];

/** The action a key runs, from the table. */
export function shortcutFor(e: KeyboardEvent): ShortcutAction | null {
  return SHORTCUTS.find((r) => r.match?.(e))?.action ?? null;
}

/** The arrow keys' step: one grid cell, four with Shift. */
export function nudgeOf(e: KeyboardEvent, cell: number): { dx: number; dy: number } {
  const n = cell * (e.shiftKey ? 4 : 1);
  return { dx: e.key === "ArrowLeft" ? -n : e.key === "ArrowRight" ? n : 0, dy: e.key === "ArrowUp" ? -n : e.key === "ArrowDown" ? n : 0 };
}
