// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The horizontal shooter's lab game (rom/tools/lab/runs/ship-flight.json):
// the spec level with the shooter's rules, its enemies flying in over the
// city, a formation in the sky and two power-ups.

import { SHIP_RULES } from "../engine/rules";
import { objectLayer, type LevelObject, type Project } from "../model";
import { specProject } from "./specFixture";

export function shipProject(): Project {
  const p = specProject();
  p.genre = "horizontal-shooter";
  p.settings.rules = { ...p.settings.rules, ...SHIP_RULES };
  const items = objectLayer(p.levels[0]!).items;
  for (const [x, y] of [[700, 300], [760, 270], [820, 330], [1000, 290], [1060, 310]] as const)
    items.push({ name: `wing_${x}`, type: "enemy", x, y, kind: "trooper", facing: "left", patrol: 0 } as LevelObject);
  // phase 2: two power-ups on the way (two shots, then a fan of three)
  items.push({ name: "power_1", type: "pickup", x: 520, y: 300, item: "power" } as LevelObject);
  items.push({ name: "power_2", type: "pickup", x: 940, y: 300, item: "power" } as LevelObject);
  return p;
}
