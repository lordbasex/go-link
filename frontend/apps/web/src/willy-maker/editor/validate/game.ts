// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Level 1 live rules for the Game and Menus tabs (docs/willy-maker/validation.md):
// players within the board's count, a character for every active player,
// a title on the title screen, the continue and game over screens not empty,
// and every menu line fitting the board's text layer with the font's glyphs.
// Pure: (project) => ValidationIssue[]; the messages are in i18n/game.*.ts.

import { layoutOf } from "../../board/cps1";
import type { Project, ValidationIssue } from "../../model";
import { MENU_SCREENS, menuText, screenProblems } from "../../game/menus";
import { playerSlots, slotResolves } from "../../game/settings";

export function gameIssues(project: Project): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const layout = layoutOf(project);
  const players = project.settings.players;
  if (!Number.isInteger(players) || players < 1 || players > layout.players)
    out.push({ id: "game.players", severity: "error", key: "players", params: { max: layout.players }, target: { tab: "game" } });

  const slots = playerSlots(project);
  for (let i = 0; i < Math.min(players, 4); i++)
    if (!slotResolves(project, slots[i]))
      out.push({ id: "game.character", severity: "warning", key: "character", params: { n: i + 1 }, target: { tab: "game", player: i + 1 } });

  if (!menuText(project, "title", "title").trim()) out.push({ id: "menus.title", severity: "warning", key: "noTitle", target: { tab: "menus", screen: "title", field: "title" } });
  for (const screen of ["continue", "gameOver"] as const)
    if (!menuText(project, screen, "heading").trim()) out.push({ id: "game.menus", severity: "warning", key: "empty", params: { screen }, target: { tab: "menus", screen, field: "heading" } });

  for (const screen of MENU_SCREENS)
    for (const p of screenProblems(project, screen)) {
      const target = { tab: "menus" as const, screen, field: p.field };
      if (p.kind === "overflow") out.push({ id: "menus.overflow", severity: "warning", key: "overflow", params: { screen, field: p.field }, target });
      else if (p.kind === "safe") out.push({ id: "menus.safe", severity: "info", key: "safe", params: { screen, field: p.field }, target });
      else out.push({ id: "menus.glyphs", severity: "warning", key: "glyphs", params: { screen, field: p.field, chars: p.chars.join(" ") }, target });
    }
  return out;
}
