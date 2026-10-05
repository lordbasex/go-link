// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Versus fighting's lab game (rom/tools/lab/runs/versus-match.json): one
// screen with a floor, two players' corners.

import { shapeArenaLevel } from "../editor/puzzleLevel";
import { VERSUS_RULES } from "../engine/rules";
import type { Project } from "../model";
import { projectFromTemplate } from "../templates";

export function versusProject(): Project {
  const p = projectFromTemplate("empty", { title: "Versus", layout: "slammast", players: 2, levelName: "Arena", screens: 1, height: 224 });
  p.genre = "versus-fighting";
  p.settings.rules = { ...p.settings.rules, ...VERSUS_RULES };
  shapeArenaLevel(p.levels[0]!);
  return p;
}
