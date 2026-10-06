// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The four first steps (add a background, mark the floor, place the hero,
// try it), read from the level as it is, so they stay right after an undo.

import { objectLayer, tagLayer, tileLayers, TAG_NUMBER, decodeCells, type Level } from "../../model";

/** Whether a level has a picture of its own: any tile drawn on its far or play layer. */
export function hasBackground(level: Level): boolean {
  return tileLayers(level).some((l) => (l.id === "far" || l.id === "play") && decodeCells(l.data, Math.ceil(level.size.w / l.grid) * Math.ceil(level.size.h / l.grid)).some((v) => v > 0));
}

/** Whether something is solid ground: a floor zone, or solid cells in a level without zones. */
export function hasFloor(level: Level): boolean {
  if (level.zones) return level.zones.some((z) => z.kind === "floor" && !z.hidden);
  const l = tagLayer(level);
  const cells = decodeCells(l.data, Math.ceil(level.size.w / 16) * Math.ceil(level.size.h / 16));
  return cells.includes(TAG_NUMBER.solid);
}

export function hasHero(level: Level): boolean {
  return objectLayer(level).items.some((o) => o.type === "player_start");
}

/** Done flags of the four steps, in order. */
export function firstSteps(level: Level, played: boolean): [boolean, boolean, boolean, boolean] {
  return [hasBackground(level), hasFloor(level), hasHero(level), played];
}
