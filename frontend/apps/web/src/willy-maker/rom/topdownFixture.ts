// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The top-down run and gun's lab game (rom/tools/lab/runs/topdown-yard.json):
// a yard three screens wide and three tall, walled around, with pillars,
// enemies that come at the player, two prisoners and the exit in the far
// corner.

import { applyAutoArt } from "../editor/autoArt";
import { TOPDOWN_RULES } from "../engine/rules";
import { layerGrid, objectLayer, tagGrid, TAG_NUMBER, type LevelObject, type Project, type TileLayer } from "../model";
import { projectFromTemplate } from "../templates";

export function topdownProject(): Project {
  const p = projectFromTemplate("empty", { title: "Yard", layout: "slammast", players: 1, levelName: "Yard", screens: 3, height: 672 });
  p.genre = "top-down-shooter";
  p.settings.rules = { ...p.settings.rules, ...TOPDOWN_RULES };
  const level = p.levels[0]!;
  const tags = tagGrid(level);
  const play = layerGrid(level, level.layers.find((l): l is TileLayer => l.id === "play")!);
  const paint = (c0: number, r0: number, c1: number, r1: number) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) tags.set(c, r, TAG_NUMBER.solid);
    applyAutoArt(tags, play, c0, r0, c1, r1);
  };
  const cols = tags.cols;
  const rows = tags.rows;
  // the walls around, then pillars in the yard
  paint(0, 0, cols - 1, 1);
  paint(0, 0, 1, rows - 1);
  paint(cols - 2, 0, cols - 1, rows - 1);
  paint(0, rows - 3, cols - 1, rows - 1);
  for (const [c, r] of [[14, 8], [30, 20], [44, 10], [56, 28], [22, 30]] as const) paint(c, r, c + 2, r + 2);
  tags.commit();
  play.commit();
  const items = objectLayer(level).items;
  for (let i = items.length - 1; i >= 0; i--) if (items[i]!.type === "enemy" || items[i]!.type === "civilian" || items[i]!.type === "exit") items.splice(i, 1);
  Object.assign(items.find((o) => o.type === "player_start" && o.player === 1)!, { x: 96, y: 160 });
  for (const [x, y] of [[360, 200], [560, 120], [700, 360], [900, 260], [1000, 520], [600, 560]] as const)
    items.push({ name: `guard_${x}_${y}`, type: "enemy", x, y, kind: "trooper", facing: "left", patrol: 0 } as LevelObject);
  items.push({ name: "prisoner_a", type: "civilian", x: 420, y: 420, kind: "woman" } as LevelObject);
  items.push({ name: "prisoner_b", type: "civilian", x: 860, y: 180, kind: "child" } as LevelObject);
  items.push({ name: "exit", type: "exit", x: 1040, y: 560, w: 64, h: 64 } as LevelObject);
  return p;
}
