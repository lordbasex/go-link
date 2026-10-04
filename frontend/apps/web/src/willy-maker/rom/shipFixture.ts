// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The horizontal shooter's lab game (rom/tools/lab/runs/ship-flight.json):
// the spec level with the shooter's rules, its enemies flying in over the
// city and a formation in the sky.

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
  return p;
}
