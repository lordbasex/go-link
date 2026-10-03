// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Game Spec v1's level as a beat 'em up street (genres.md, phase 1): the
// depth rule, a walkable band of feet y 352-416 over the floor and one more
// enemy standing in the band, so walking around it shows the drawing by
// depth. Tests and the lab run rom/tools/lab/runs/street-walk.json use it.

import { BEATEMUP_RULES } from "../engine/rules";
import { objectLayer, type LevelObject, type Project } from "../model";
import { specProject } from "./specFixture";

export function streetProject(): Project {
  const p = specProject();
  p.genre = "beat-em-up";
  p.settings.rules = { ...p.settings.rules, ...BEATEMUP_RULES };
  const level = p.levels[0]!;
  level.walk = { y0: 352, y1: 416 };
  const items = objectLayer(level).items;
  Object.assign(items.find((o) => o.type === "player_start" && o.player === 1)!, { x: 64, y: 400 });
  items.push({ name: "thug", type: "enemy", x: 110, y: 384, kind: "trooper", facing: "left", patrol: 0, hp: 3 } as LevelObject);
  return p;
}
