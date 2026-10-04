// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The light gun's lab game (rom/tools/lab/runs/gun-range.json): the spec
// level with the light gun's rules, its targets along the route and a
// camera lock that holds a scene until its targets are down.

import { LIGHTGUN_RULES } from "../engine/rules";
import { objectLayer, type LevelObject, type Project } from "../model";
import { specProject } from "./specFixture";

export function gunProject(): Project {
  const p = specProject();
  p.genre = "light-gun";
  p.settings.rules = { ...p.settings.rules, ...LIGHTGUN_RULES };
  const items = objectLayer(p.levels[0]!).items;
  items.push({ name: "scene_lock", type: "camera_lock", x: 700, y: 224, w: 384, h: 224 } as LevelObject);
  items.push({ name: "scene_a", type: "enemy", x: 1040, y: 400, kind: "trooper", facing: "left", patrol: 0, hp: 4 } as LevelObject);
  items.push({ name: "scene_b", type: "enemy", x: 1076, y: 336, kind: "trooper", facing: "left", patrol: 0, hp: 4 } as LevelObject);
  return p;
}
