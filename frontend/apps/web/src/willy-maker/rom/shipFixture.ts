// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The horizontal shooter's lab game (rom/tools/lab/runs/ship-flight.json):
// the spec level with the shooter's rules, its enemies flying in over the
// city, a formation in the sky, two power-ups and the gunship at the end.

import { SHIP_RULES } from "../engine/rules";
import { objectLayer, type LevelObject, type Project } from "../model";
import { specProject } from "./specFixture";

export function shipProject(): Project {
  const p = specProject();
  p.genre = "horizontal-shooter";
  p.settings.rules = { ...p.settings.rules, ...SHIP_RULES };
  const items = objectLayer(p.levels[0]!).items;
  // a formation: waves, one straight and one that dives at the ship (phase 3's paths)
  for (const [x, y, path] of [[700, 300, "wave"], [760, 270, "straight"], [820, 330, "wave"], [1000, 290, "dive"], [1060, 310, "wave"]] as const)
    items.push({ name: `wing_${x}`, type: "enemy", x, y, kind: "trooper", facing: "left", patrol: 0, path } as LevelObject);
  // phase 2: two power-ups on the way (two shots, then a fan of three)
  items.push({ name: "power_1", type: "pickup", x: 520, y: 300, item: "power" } as LevelObject);
  items.push({ name: "power_2", type: "pickup", x: 940, y: 300, item: "power" } as LevelObject);
  // phase 3: the gunship behind a camera lock at the end of the route
  items.push({ name: "boss_lock", type: "camera_lock", x: 1100, y: 224, w: 384, h: 224 } as LevelObject);
  items.push({ name: "gunship", type: "boss", x: 1450, y: 330, kind: "gunship" } as LevelObject);
  return p;
}
