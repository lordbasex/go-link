// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The puzzle's lab game (rom/tools/lab/runs/puzzle-gems.json): one screen
// with the two wells framed by walls, two players.

import { shapePuzzleLevel } from "../editor/puzzleLevel";
import { PUZZLE_RULES } from "../engine/rules";
import type { Project } from "../model";
import { projectFromTemplate } from "../templates";

export function puzzleProject(cpuLevel = 2): Project {
  const p = projectFromTemplate("empty", { title: "Puzzle", layout: "slammast", players: 2, levelName: "Puzzle", screens: 1, height: 224 });
  p.genre = "puzzle";
  p.settings.rules = { ...p.settings.rules, ...PUZZLE_RULES, puzzleCpuLevel: cpuLevel };
  shapePuzzleLevel(p.levels[0]!);
  return p;
}
