// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The vertical shooter's lab game (rom/tools/lab/runs/vertical-climb.json):
// a shaft 1536 px tall the camera climbs, with blocks to fly around, drones
// coming down on their paths and two power-ups.

import { applyAutoArt } from "../editor/autoArt";
import { VERTICAL_RULES } from "../engine/rules";
import { layerGrid, objectLayer, tagGrid, TAG_NUMBER, type LevelObject, type Project, type TileLayer } from "../model";
import { projectFromTemplate } from "../templates";

export function verticalProject(): Project {
  const p = projectFromTemplate("empty", { title: "Shaft", layout: "slammast", players: 1, levelName: "Shaft", screens: 1, height: 1536 });
  p.genre = "vertical-shooter";
  p.settings.rules = { ...p.settings.rules, ...VERTICAL_RULES };
  const level = p.levels[0]!;
  const tags = tagGrid(level);
  const play = layerGrid(level, level.layers.find((l): l is TileLayer => l.id === "play")!);
  const paint = (c0: number, r0: number, c1: number, r1: number) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) tags.set(c, r, TAG_NUMBER.solid);
    applyAutoArt(tags, play, c0, r0, c1, r1);
  };
  // blocks on alternate sides to fly around
  paint(0, 60, 7, 61);
  paint(16, 40, 23, 41);
  paint(0, 20, 9, 21);
  tags.commit();
  play.commit();
  const items = objectLayer(level).items;
  for (const [x, y, path] of [[120, 900, "wave"], [200, 860, "straight"], [300, 700, "dive"], [160, 520, "wave"], [260, 480, "wave"], [100, 300, "dive"], [280, 200, "straight"]] as const)
    items.push({ name: `drone_${x}_${y}`, type: "enemy", x, y, kind: "trooper", facing: "left", patrol: 0, path } as LevelObject);
  items.push({ name: "power_1", type: "pickup", x: 192, y: 1100, item: "power" } as LevelObject);
  items.push({ name: "power_2", type: "pickup", x: 240, y: 620, item: "power" } as LevelObject);
  return p;
}
