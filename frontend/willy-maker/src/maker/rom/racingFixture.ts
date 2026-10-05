// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Racing's lab game (rom/tools/lab/runs/racing-laps.json): the wizard's ring
// track on one screen, four places.

import { shapeTrackLevel } from "../editor/puzzleLevel";
import { RACING_RULES } from "../engine/rules";
import type { Project } from "../model";
import { projectFromTemplate } from "../templates";

export function racingProject(): Project {
  const p = projectFromTemplate("empty", { title: "Racing", layout: "slammast", players: 4, levelName: "Ring", screens: 1, height: 224 });
  p.genre = "racing";
  p.settings.rules = { ...p.settings.rules, ...RACING_RULES };
  shapeTrackLevel(p.levels[0]!);
  return p;
}
