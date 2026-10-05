// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The rules other parts of the module add to the review: the Game and
// Menus tabs' issues (editor/validate/game.ts), turned into checks with
// their messages from the game i18n in every language.

import type { ValidationIssue } from "../../model";
import { issueTextIn } from "../../game/texts";
import { gameIssues } from "./game";
import type { Check, Rule } from ".";

/** Rule ids the review already checks itself. */
const COVERED = new Set(["game.players"]);

export function checkOfIssue(issue: ValidationIssue): Check {
  const t = issue.target;
  return {
    id: issue.id,
    severity: issue.severity,
    msg: `${issue.id}:${issue.key}`,
    params: issue.params ?? {},
    texts: { en: issueTextIn(issue, "en"), es: issueTextIn(issue, "es"), pt: issueTextIn(issue, "pt") },
    target: !t ? undefined : t.tab === "build" ? { tab: "build", level: t.level ?? "" } : t.tab === "characters" ? { tab: "characters" } : { tab: t.tab, screen: t.screen, field: t.field, player: t.player },
  };
}

export const gameRule: Rule = (project) => gameIssues(project).filter((i) => !COVERED.has(i.id)).map(checkOfIssue);

export const EXTRA_RULES: Rule[] = [gameRule];
