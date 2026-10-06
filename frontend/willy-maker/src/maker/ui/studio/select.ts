// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// What the pointer is on, and what may be picked. Objects come first, then
// zones (with a 2 px margin, so thin ones can be caught), then the
// background. Hidden or locked items, or items of a hidden or locked group,
// are never picked.

import { groupOf, objectLayer, objectVisible, zoneVisible, type LayerGroup, type Level, type LevelObject, type Zone } from "../../model";
import { backgroundLayer, crateBox, type ItemRef } from "../../editor/zoneOps";
import { objectBox } from "../render";

export function boxOf(o: LevelObject): { x: number; y: number; w: number; h: number } {
  return o.type === "crate" ? crateBox(o) : objectBox(o);
}

export function zoneLocked(level: Level, z: Zone): boolean {
  return !!z.locked || !!groupOf(level, z, "zones")?.locked;
}

export function objectLocked(level: Level, o: LevelObject): boolean {
  return o.locked === true || !!groupOf(level, o, "objects")?.locked;
}

/** Whether the background has a picture (any tile on its play layer). */
export function hasBackgroundArt(level: Level): boolean {
  const l = backgroundLayer(level);
  return !!l && /(^|,|:)[1-9]/.test(l.data);
}

export function hitAt(level: Level, x: number, y: number): ItemRef | null {
  const inside = (r: { x: number; y: number; w: number; h: number }, pad: number) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
  const items = objectLayer(level).items;
  for (let i = items.length - 1; i >= 0; i--) {
    const o = items[i]!;
    if (objectVisible(level, o) && !objectLocked(level, o) && inside(boxOf(o), 0)) return { kind: "object", id: o.name };
  }
  const zones = level.zones ?? [];
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i]!;
    if (zoneVisible(level, z) && !zoneLocked(level, z) && inside(z, 2)) return { kind: "zone", id: z.id };
  }
  const bg = backgroundLayer(level);
  if (bg && hasBackgroundArt(level) && bg.visible !== false && !bg.locked && x >= 0 && y >= 0 && x <= level.size.w && y <= level.size.h) return { kind: "bg" };
  return null;
}

/** A group's name: the one typed, else its base group's or "Group n". */
export function groupName(g: LayerGroup | undefined, names: { objects: string; zones: string; group: (n: number) => string }): string {
  if (!g) return "";
  return g.name ?? (g.base ? names[g.base] : names.group(g.n ?? 1));
}
