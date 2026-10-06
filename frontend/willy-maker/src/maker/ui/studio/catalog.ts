// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The sprite picker's catalog: the game's real parts (editor/parts.ts) in
// three tabs. Heroes are the players' starts (each drawn as the hero that
// player plays), enemies are the enemies and bosses, and objects are
// items, crates, the people to rescue and the level's helpers. The game's
// own enemy and civilian characters join them: an enemy or civilian whose
// kind is a character's id is drawn from it (docs/willy-maker/engine.md).

import { BUILTIN_HERO, type LevelObject, type Project } from "../../model";
import { PARTS, type Part } from "../../editor/parts";
import { playerSlots } from "../../game/settings";
import { objectBox } from "../render";
import type { PickerTab } from "./state";

export type PlaceablePart = Extract<Part, { kind: "object" | "crate" }>;
export type Role = "hero" | "enemy" | "object";

export interface CatalogItem {
  id: string;
  tab: PickerTab;
  role: Role;
  part: PlaceablePart;
  /** Translated name. */
  name: string;
  /** Size in level pixels. */
  w: number;
  h: number;
}

/** Texts the catalog needs, from the module's i18n. */
export interface CatalogTexts {
  objects: Record<string, string>;
  kinds: Record<string, string>;
  player: (n: number, hero: string) => string;
}

export function tabOfPart(part: PlaceablePart): PickerTab {
  if (part.kind === "crate") return "objects";
  if (part.type === "player_start") return "heroes";
  if (part.type === "enemy" || part.type === "boss") return "enemies";
  return "objects";
}

export function roleOf(o: Pick<LevelObject, "type">): Role {
  if (o.type === "player_start") return "hero";
  if (o.type === "enemy" || o.type === "boss") return "enemy";
  return "object";
}

const sizeOf = (part: PlaceablePart) => {
  const b = part.kind === "crate" ? { w: 32, h: 32 } : objectBox({ name: "", type: part.type, x: 0, y: 0, ...part.props });
  return { w: b.w, h: b.h };
};

export function catalog(project: Project, t: CatalogTexts): CatalogItem[] {
  const slots = playerSlots(project);
  const heroName = (player: number) => {
    const id = slots[player - 1]?.character ?? BUILTIN_HERO;
    return id === BUILTIN_HERO ? "Willy" : (project.characters.find((c) => c.id === id)?.name ?? "Willy");
  };
  const out: CatalogItem[] = [];
  for (const part of PARTS) {
    if (part.kind !== "object" && !(part.kind === "crate" && part.id === "crate:object")) continue;
    const p = part as PlaceablePart;
    const tab = tabOfPart(p);
    let name: string;
    if (p.kind === "crate") name = t.objects.crate ?? "Crate";
    else if (p.type === "player_start") {
      const n = Number(p.props.player) || 1;
      if (n > project.settings.players) continue;
      name = t.player(n, heroName(n));
    } else {
      const kind = String(p.props.kind ?? p.props.item ?? "");
      name = (kind && t.kinds[kind]) || t.objects[p.type] || p.type;
    }
    out.push({ id: p.id, tab, role: tab === "heroes" ? "hero" : tab === "enemies" ? "enemy" : "object", part: p, name, ...sizeOf(p) });
  }
  // the game's own characters, first in their tab
  const own: CatalogItem[] = [];
  for (const c of project.characters) {
    if (c.role !== "enemy" && c.role !== "civilian") continue;
    const enemy = c.role === "enemy";
    const part: PlaceablePart = enemy
      ? { id: `enemy:own:${c.id}`, group: "enemies", kind: "object", type: "enemy", props: { kind: c.id, facing: "left", patrol: 96 }, label: c.id }
      : { id: `civilian:own:${c.id}`, group: "civilians", kind: "object", type: "civilian", props: { kind: c.id, trapped_in: "" }, label: c.id };
    own.push({ id: part.id, tab: enemy ? "enemies" : "objects", role: enemy ? "enemy" : "object", part, name: c.name || c.id, ...sizeOf(part) });
  }
  return [...own, ...out];
}

/** The catalog item an object was made from (its type and kind or item), for "Change sprite". */
export function itemOfObject(items: CatalogItem[], o: LevelObject): CatalogItem | undefined {
  return items.find((i) => {
    if (i.part.kind === "crate") return o.type === "crate";
    if (i.part.type !== o.type) return false;
    if (o.type === "player_start") return i.part.props.player === o.player;
    const k = i.part.props.kind ?? i.part.props.item;
    return k === undefined || k === (o.kind ?? o.item);
  });
}
