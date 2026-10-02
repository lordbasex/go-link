// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// What the play engine (engine/game.ts) does with each part the editor
// offers: the one source of truth for the "Coming soon" badges, the
// inspector's options and the validator's `part.soon` and `part.shared`
// rules. "works" parts play in the editor as they will on the board,
// "soon" parts are kept in the project but have no effect yet, and
// "rom-only" settings are saved for the ROM and ignored by play mode.

import type { LevelObject } from "../model";
import { BOSS_KINDS, CIVILIAN_KINDS, CRATE_CONTENTS, ENEMY_KINDS, PICKUP_ITEMS } from "./parts";

export type SupportStatus = "works" | "soon" | "rom-only";

/** Why a part is not in the game yet: the key of its text in the core i18n (`support.reasons`). */
export type SupportReason =
  | "water"
  | "flamethrower"
  | "spread"
  | "grenades"
  | "health"
  | "page"
  | "crateCivilian"
  | "boss"
  | "checkpoint"
  | "difficulty"
  | "freePlay"
  | "demoSound"
  | "timer";

export interface Support {
  status: SupportStatus;
  reason?: SupportReason;
  /** Works, but plays exactly like the other parts of its group (every enemy kind today). */
  shared?: boolean;
}

const works: Support = { status: "works" };
const soon = (reason: SupportReason): Support => ({ status: "soon", reason });
const romOnly = (reason: SupportReason): Support => ({ status: "rom-only", reason });

const WEAPON_SOON: Partial<Record<string, SupportReason>> = { flamethrower: "flamethrower", spread: "spread", grenades: "grenades", health: "health" };

/**
 * Every part id of parts.ts, every option of the inspector's selects
 * (`item:`, `contents:`, `kind:`) and the settings only the ROM reads.
 */
export const SUPPORT: Record<string, Support> = {
  "tag:solid": works,
  "tag:oneway": works,
  "tag:ladder": works,
  crate: works,
  "tag:breakable": works,
  "tag:hazard": works,
  "tag:water": soon("water"),
  "crate:object": works,
  ...Object.fromEntries(PICKUP_ITEMS.map((i) => [`pickup:${i}`, i === "bazooka" ? works : i === "lattenza_page" ? soon("page") : soon(WEAPON_SOON[i]!)])),
  ...Object.fromEntries(ENEMY_KINDS.map((k) => [`enemy:${k}`, { status: "works", shared: true } satisfies Support])),
  ...Object.fromEntries(BOSS_KINDS.map((k) => [`boss:${k}`, soon("boss")])),
  ...Object.fromEntries(CIVILIAN_KINDS.map((k) => [`civilian:${k}`, works])),
  "player_start:p1": works,
  "player_start:p2": works,
  "player_start:p3": works,
  "player_start:p4": works,
  "checkpoint:checkpoint": soon("checkpoint"),
  "camera_lock:camera_lock": works,
  "exit:exit": works,
  // the inspector's options
  ...Object.fromEntries(PICKUP_ITEMS.map((i) => [`item:${i}`, i === "bazooka" ? works : i === "lattenza_page" ? soon("page") : soon(WEAPON_SOON[i]!)])),
  ...Object.fromEntries(CRATE_CONTENTS.map((c) => [`contents:${c}`, c === "nothing" || c === "bazooka" ? works : c === "civilian" ? soon("crateCivilian") : soon(WEAPON_SOON[c]!)])),
  // settings play mode does not use (the Game tab's switches, a level's timer)
  "dip:difficulty": romOnly("difficulty"),
  "dip:lives": works,
  "dip:freePlay": romOnly("freePlay"),
  "dip:demoSound": romOnly("demoSound"),
  "level:timer": romOnly("timer"),
};

/** A part's support (unknown ids, like tiles, work). */
export function partSupport(partId: string): Support {
  return SUPPORT[partId] ?? works;
}

/** The support of one inspector option: `item`, `contents` or an object type's `kind`. */
export function optionSupport(field: "item" | "contents" | "kind", value: string, type?: string): Support {
  if (field === "kind") return SUPPORT[`${type}:${value}`] ?? works;
  return SUPPORT[`${field}:${value}`] ?? works;
}

/** What a placed object does in the game: its type, then the kind, item or contents it carries. */
export function objectSupport(o: LevelObject): Support {
  switch (o.type) {
    case "pickup":
      return optionSupport("item", String(o.item ?? "bazooka"));
    case "crate":
      return optionSupport("contents", String(o.contents ?? "nothing"));
    case "enemy":
    case "boss":
    case "civilian":
      return optionSupport("kind", String(o.kind ?? ""), o.type);
    case "checkpoint":
      return SUPPORT["checkpoint:checkpoint"]!;
    default:
      return works;
  }
}
