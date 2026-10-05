// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The parts palette: what the pencil paints (collision tags, tiles) and the
// object stamps it places, grouped like the editor's left panel. Object
// types and properties follow docs/rom/art-spec.md section 4.

import type { ObjectType, Tag } from "../model";
import { BOSS_HP, GUNSHIP_HP } from "../engine/rules";

export type PartGroup = "terrain" | "objects" | "enemies" | "civilians" | "helpers" | "tiles";

export type Part =
  | { id: string; group: PartGroup; kind: "tag"; tag: Exclude<Tag, "air" | "crate"> }
  | { id: string; group: PartGroup; kind: "crate" }
  | { id: string; group: PartGroup; kind: "object"; type: ObjectType; props: Record<string, unknown>; label: string }
  | { id: string; group: "tiles"; kind: "tile"; tile: number };

export const ENEMY_KINDS = ["trooper", "shield_trooper", "spinner", "pinger", "glitch9", "vera", "jitter"] as const;
export const CIVILIAN_KINDS = ["woman", "child", "baby", "elder"] as const;
export const BOSS_KINDS = ["armored_truck", "gunship", "brawler"] as const;
export const PICKUP_ITEMS = ["bazooka", "flamethrower", "spread", "grenades", "health", "lattenza_page", "coin", "spring", "pipe", "knife", "power", "jeep"] as const;
export const CRATE_CONTENTS = ["nothing", "bazooka", "flamethrower", "spread", "grenades", "health", "pipe", "knife", "civilian"] as const;

const obj = (group: PartGroup, type: ObjectType, label: string, props: Record<string, unknown> = {}): Part => ({
  id: `${type}:${label}`,
  group,
  kind: "object",
  type,
  props,
  label,
});

export const PARTS: Part[] = [
  { id: "tag:solid", group: "terrain", kind: "tag", tag: "solid" },
  { id: "tag:oneway", group: "terrain", kind: "tag", tag: "oneway" },
  { id: "tag:ladder", group: "terrain", kind: "tag", tag: "ladder" },
  { id: "crate", group: "terrain", kind: "crate" },
  { id: "tag:breakable", group: "terrain", kind: "tag", tag: "breakable" },
  { id: "tag:hazard", group: "terrain", kind: "tag", tag: "hazard" },
  { id: "tag:water", group: "terrain", kind: "tag", tag: "water" },
  { id: "crate:object", group: "objects", kind: "crate" },
  ...PICKUP_ITEMS.map((item) => obj("objects", "pickup", item, { item })),
  obj("objects", "platform", "platform", { w: 48, axis: "x", range: 96, speed: 1 }),
  ...ENEMY_KINDS.map((kind) => obj("enemies", "enemy", kind, { kind, facing: "left", patrol: 96 })),
  // the beat 'em up's brawler is a tough enemy (engine/game.ts); the others hold an arena
  ...BOSS_KINDS.map((kind) => obj("enemies", "boss", kind, kind === "brawler" ? { kind, facing: "left", hp: BOSS_HP } : kind === "gunship" ? { kind, hp: GUNSHIP_HP } : { kind, w: 384, h: 224 })),
  ...CIVILIAN_KINDS.map((kind) => obj("civilians", "civilian", kind, { kind, trapped_in: "" })),
  ...[1, 2, 3, 4].map((player) => obj("helpers", "player_start", `p${player}`, { player })),
  obj("helpers", "checkpoint", "checkpoint"),
  obj("helpers", "camera_lock", "camera_lock", { w: 384, h: 224 }),
  obj("helpers", "exit", "exit"),
];

export const PART_GROUPS: PartGroup[] = ["terrain", "objects", "enemies", "civilians", "helpers", "tiles"];

export function partById(id: string): Part | undefined {
  if (id.startsWith("tile:")) return { id, group: "tiles", kind: "tile", tile: Number(id.slice(5)) || 1 };
  return PARTS.find((p) => p.id === id);
}

/** The reference name a new object of this part starts from. */
export function baseName(p: Part): string {
  if (p.kind === "crate") return "crate";
  if (p.kind !== "object") return "object";
  if (p.type === "player_start") return `${p.label}_start`;
  if (p.type === "enemy" || p.type === "civilian" || p.type === "boss") return String(p.props.kind ?? p.type);
  if (p.type === "pickup") return String(p.props.item ?? "pickup");
  return p.type;
}
