// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The maze's lab game (rom/tools/lab/runs/maze-dots.json): one screen, 24 x
// 14 cells, walled around (the top and bottom rows sit under the HUD) with
// pillars in a grid, three chasers in the middle, two power pickups.

import { applyAutoArt } from "../editor/autoArt";
import { MAZE_RULES } from "../engine/rules";
import { layerGrid, objectLayer, tagGrid, TAG_NUMBER, type LevelObject, type Project, type TileLayer } from "../model";
import { projectFromTemplate } from "../templates";

export function mazeProject(): Project {
  const p = projectFromTemplate("empty", { title: "Maze", layout: "slammast", players: 1, levelName: "Maze", screens: 1, height: 224 });
  p.genre = "maze";
  p.settings.rules = { ...p.settings.rules, ...MAZE_RULES };
  const level = p.levels[0]!;
  const tags = tagGrid(level);
  const play = layerGrid(level, level.layers.find((l): l is TileLayer => l.id === "play")!);
  for (let r = 0; r < tags.rows; r++)
    for (let c = 0; c < tags.cols; c++) {
      const wall = r === 0 || r >= tags.rows - 1 || c === 0 || c === tags.cols - 1 || (r % 2 === 0 && c % 3 === 2 && r < tags.rows - 2);
      tags.set(c, r, wall ? TAG_NUMBER.solid : TAG_NUMBER.air);
      play.set(c, r, 0);
    }
  applyAutoArt(tags, play, 0, 0, tags.cols - 1, tags.rows - 1);
  tags.commit();
  play.commit();
  const items = objectLayer(level).items;
  for (let i = items.length - 1; i >= 0; i--) if (items[i]!.type !== "player_start") items.splice(i, 1);
  Object.assign(items.find((o) => o.type === "player_start" && o.player === 1)!, { x: 12 * 16 + 8, y: 12 * 16 + 16 });
  for (const [x, y] of [[11, 5], [12, 7], [13, 5]] as const)
    items.push({ name: `chaser_${x}_${y}`, type: "enemy", x: x * 16 + 8, y: y * 16 + 16, kind: "trooper", facing: "left", patrol: 0 } as LevelObject);
  items.push({ name: "power_a", type: "pickup", x: 1 * 16 + 8, y: 1 * 16 + 16, item: "power" } as LevelObject);
  items.push({ name: "power_b", type: "pickup", x: 22 * 16 + 8, y: 11 * 16 + 16, item: "power" } as LevelObject);
  return p;
}
