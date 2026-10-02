// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Game and Menus tabs' data: the action table the board layout fixes,
// the players' characters, and every change as an undoable command on the
// editor store (store.editSettings), so undo/redo and autosave cover them.

import type { SetLayout } from "../board/cps1";
import {
  BUILTIN_HERO,
  clampRunTap,
  defaultMenus,
  defaultPlayerSlots,
  GAME_ACTIONS,
  type DipSettings,
  type GameActionId,
  type MenuBackground,
  type MenuScreen,
  type PlayerSlot,
  type Project,
} from "../model";
import type { EditorStore } from "../editor/store";
import type { GameRules } from "../engine/rules";
import type { MenuScreenId } from "./menus";

export interface ActionRow {
  id: GameActionId;
  /** The board input that does it: fixed by the layout. */
  input: string;
}

/**
 * The actions and the board inputs that do them. On a 3-button layout
 * (slammast) the special has its own button; on a 2-button one (captcomm)
 * it is both buttons together.
 */
export function actionRows(layout: SetLayout): ActionRow[] {
  const input: Record<GameActionId, string> = {
    jump: "B1",
    fire: "B2",
    special: layout.buttons >= 3 ? "B3" : "B1+B2",
    run: "→ →",
    climb: "↑ ↓",
    start: "START",
    coin: "COIN",
  };
  return GAME_ACTIONS.map((id) => ({ id, input: input[id] }));
}

/** The action's label: the game's own, or `fallback` (its default name). */
export function actionLabel(project: Project, id: GameActionId, fallback: string): string {
  const v = project.settings.actionLabels?.[id];
  return v && v.trim() ? v : fallback;
}

export function runTapMs(project: Project): number {
  return clampRunTap(project.settings.runTapMs);
}

/** The run window in 60 Hz frames, for the engine. */
export function runTapFrames(ms: number): number {
  return Math.max(1, Math.round((clampRunTap(ms) * 60) / 1000));
}

/** All four player slots (defaults where the game has none). */
export function playerSlots(project: Project): PlayerSlot[] {
  const saved = project.settings.playerSlots ?? [];
  return defaultPlayerSlots().map((d, i) => saved[i] ?? d);
}

/** Whether a slot's character exists: the built-in hero or one of the project's. */
export function slotResolves(project: Project, slot: PlayerSlot | undefined): boolean {
  if (!slot || !slot.character) return false;
  return slot.character === BUILTIN_HERO || project.characters.some((c) => c.id === slot.character);
}

/** The characters a player can be: the built-in Willy and the project's heroes. */
export function heroChoices(project: Project): { id: string; name: string }[] {
  const own = project.characters.filter((c) => c.role === "hero").map((c) => ({ id: c.id, name: c.name }));
  return [{ id: BUILTIN_HERO, name: "Willy" }, ...own];
}

// ------------------------------------------------------------- commands

export function setPlayers(store: EditorStore, n: number, max: number, label: string): void {
  const players = Math.max(1, Math.min(max, Math.round(n)));
  store.editSettings(label, (s) => {
    s.players = players;
  });
}

export function setActionLabel(store: EditorStore, id: GameActionId, text: string, label: string): void {
  store.editSettings(
    label,
    (s) => {
      const next = { ...(s.actionLabels ?? {}) };
      if (text) next[id] = text.slice(0, 24);
      else delete next[id];
      s.actionLabels = next;
    },
    `action:${id}`,
  );
}

export function setRunTap(store: EditorStore, ms: number, label: string): void {
  store.editSettings(label, (s) => {
    s.runTapMs = clampRunTap(ms);
  }, "runTap");
}

export function setPlayerSlot(store: EditorStore, index: number, slot: PlayerSlot, label: string): void {
  store.editSettings(label, (s) => {
    const slots = defaultPlayerSlots().map((d, i) => s.playerSlots?.[i] ?? d);
    slots[index] = { ...slot, variant: Math.max(0, Math.min(3, Math.round(slot.variant))) };
    s.playerSlots = slots;
  });
}

export function setDip(store: EditorStore, patch: Partial<DipSettings>, label: string): void {
  store.editSettings(label, (s) => {
    s.dip = { ...s.dip, ...patch };
  });
}

export function setRules(store: EditorStore, patch: Partial<GameRules> | null, label: string): void {
  store.editSettings(label, (s) => {
    s.rules = patch === null ? undefined : { ...(s.rules ?? {}), ...patch };
    if (s.rules === undefined) delete s.rules;
  });
}

export function setCredits(store: EditorStore, text: string, label: string): void {
  store.editSettings(label, (s) => {
    s.credits = text.slice(0, 48);
  }, "credits");
}

function editScreen(store: EditorStore, screen: MenuScreenId, label: string, fn: (m: MenuScreen) => void, merge?: string): void {
  store.editSettings(
    label,
    (s) => {
      const cur: MenuScreen = { ...defaultMenus()[screen], ...(s.menus[screen] ?? {}) };
      fn(cur);
      s.menus = { ...s.menus, [screen]: cur };
    },
    merge,
  );
}

/** A field's text; `null` goes back to the field's default. */
export function setMenuText(store: EditorStore, screen: MenuScreenId, field: string, text: string | null, label: string): void {
  editScreen(
    store,
    screen,
    label,
    (m) => {
      const texts = { ...(m.texts ?? {}) };
      if (text === null) delete texts[field];
      else texts[field] = text.slice(0, 48);
      m.texts = texts;
    },
    `menu:${screen}:${field}`,
  );
}

export function setMenuBackground(store: EditorStore, screen: MenuScreenId, bg: MenuBackground, label: string): void {
  editScreen(store, screen, label, (m) => {
    m.background = bg;
  });
}

export function setMenuMusic(store: EditorStore, screen: MenuScreenId, music: string, label: string): void {
  editScreen(store, screen, label, (m) => {
    m.music = music;
  });
}

export function setMenuCredits(store: EditorStore, screen: MenuScreenId, on: boolean, label: string): void {
  editScreen(store, screen, label, (m) => {
    m.credits = on;
  });
}

export function setDemoLevel(store: EditorStore, levelId: string, label: string): void {
  editScreen(store, "attract", label, (m) => {
    m.demoLevel = levelId;
  });
}
