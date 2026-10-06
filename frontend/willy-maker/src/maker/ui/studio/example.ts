// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// "Open example level": a small level (480 × 272) over a neon city picture,
// with its zones already marked (three floors, three platforms, a ladder, a
// crate and a hazard), the hero, a trooper, a bazooka and the exit, in four
// groups. It shows in a few seconds what a level is made of. The picture is
// fitted to the board like any other background, and the whole level is one
// undo step.

import { cleanGroups, newLevel, objectLayer, reconcileZones, applyZones, encodeCells, type Level, type Zone, type ZoneKind } from "../../model";
import type { EditorStore } from "../../editor/store";
import { fitBackground, putBackground } from "./background";

export const EXAMPLE_URL = "/willy-maker/examples/neon.png";
export const EXAMPLE_FILE = "neon.png";
const W = 480;
const H = 272;

/** Names of the example's own groups, in the user's language. */
export interface ExampleTexts {
  platforms: string;
  hazards: string;
  ground: string;
}

/** The example level without its picture (pure, for tests and the wizard). */
export function exampleLevel(id: string, name: string, t: ExampleTexts): Level {
  const level = newLevel({ id, name, w: W, h: H, floor: false, players: 0 });
  objectLayer(level).items.length = 0;
  for (const l of level.layers) if (l.kind === "tiles") l.data = encodeCells(new Uint16Array(Math.ceil(W / l.grid) * Math.ceil(H / l.grid)));
  level.groups = cleanGroups([
    { id: "group-objects", base: "objects" },
    { id: "group-platforms", name: t.platforms },
    { id: "group-hazards", name: t.hazards },
    { id: "group-zones", base: "zones", name: t.ground },
  ]);
  const zone = (id: string, kind: ZoneKind, n: number, x: number, y: number, w: number, h: number, group = "group-zones"): Zone => ({ id, kind, n, x, y, w, h, group });
  level.zones = [
    zone("zone-1", "floor", 1, 0, 224, 160, 48),
    zone("zone-2", "floor", 2, 176, 240, 160, 32),
    zone("zone-3", "floor", 3, 336, 224, 144, 48),
    zone("zone-4", "platform", 1, 0, 112, 144, 16, "group-platforms"),
    zone("zone-5", "ladder", 1, 16, 112, 16, 112, "group-platforms"),
    zone("zone-6", "platform", 2, 144, 128, 96, 16, "group-platforms"),
    zone("zone-7", "platform", 3, 304, 160, 176, 16, "group-platforms"),
    zone("zone-8", "crate", 1, 48, 192, 32, 32),
    zone("zone-9", "hazard", 1, 400, 192, 32, 32, "group-hazards"),
  ];
  objectLayer(level).items.push(
    { name: "p1_start", type: "player_start", x: 112, y: 224, player: 1 },
    { name: "trooper", type: "enemy", x: 272, y: 240, kind: "trooper", facing: "left", patrol: 96 },
    { name: "bazooka", type: "pickup", x: 184, y: 128, item: "bazooka" },
    // the exit covers the last column from platform 3 down to the floor, so either way ends the level
    { name: "exit", type: "exit", x: 448, y: 144, w: 32, h: 128 },
  );
  applyZones(level);
  return level;
}

/** Replaces a level with the example, picture included, as one undo step. */
export async function openExample(store: EditorStore, levelId: string, label: string, t: ExampleTexts): Promise<boolean> {
  const cur = store.level(levelId);
  if (!cur) return false;
  const level = exampleLevel(levelId, cur.name, t);
  try {
    const res = await fetch(EXAMPLE_URL);
    if (!res.ok) throw new Error(String(res.status));
    const file = new File([await res.blob()], EXAMPLE_FILE, { type: "image/png" });
    const fitted = await fitBackground(level, file, false);
    store.editProject(label, (p) => {
      const i = p.levels.findIndex((l) => l.id === levelId);
      if (i < 0) return;
      p.levels[i] = level;
      putBackground(p, fitted, EXAMPLE_FILE);
      reconcileZones(p.levels[i]!);
    });
    return true;
  } catch {
    return false;
  }
}
