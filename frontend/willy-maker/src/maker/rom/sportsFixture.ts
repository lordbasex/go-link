// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Sports' lab game (rom/tools/lab/runs/sports-match.json): a football field
// two screens wide with a goal at each end, four places.

import { shapeFieldLevel } from "../editor/puzzleLevel";
import { SPORTS_RULES } from "../engine/rules";
import type { Project } from "../model";
import { projectFromTemplate } from "../templates";

export function sportsProject(): Project {
  const p = projectFromTemplate("empty", { title: "Sports", layout: "slammast", players: 4, levelName: "Field", screens: 2, height: 224 });
  p.genre = "sports";
  p.settings.rules = { ...p.settings.rules, ...SPORTS_RULES };
  shapeFieldLevel(p.levels[0]!);
  return p;
}
