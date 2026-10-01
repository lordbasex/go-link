// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Game and Menus tabs' dictionaries, the {name} filler, and the text
// of a validation issue in any language (the Export review uses it too).

import { messagesFor, useMessages, type Lang } from "../i18n";
import { gameEn, type GameMessages } from "../i18n/game.en";
import { gameEs } from "../i18n/game.es";
import { gamePt } from "../i18n/game.pt";
import { menusEn, type MenusMessages } from "../i18n/menus.en";
import { menusEs } from "../i18n/menus.es";
import { menusPt } from "../i18n/menus.pt";
import type { ValidationIssue } from "../model";

export const GAME = { en: gameEn, es: gameEs, pt: gamePt };
export const MENUS = { en: menusEn, es: menusEs, pt: menusPt };

export function useGameText(): GameMessages {
  return useMessages(GAME);
}

export function useMenusText(): MenusMessages {
  return useMessages(MENUS);
}

export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

/** An issue of editor/validate/game.ts as a sentence. */
export function issueText(issue: ValidationIssue, g: GameMessages, m: MenusMessages): string {
  const template = (g.issues as Record<string, string>)[issue.key] ?? issue.key;
  const params: Record<string, string | number> = { ...(issue.params ?? {}) };
  const screen = params.screen as keyof MenusMessages["screens"] | undefined;
  if (screen && m.screens[screen]) params.screen = m.screens[screen];
  const field = params.field as keyof MenusMessages["fields"] | undefined;
  if (field && m.fields[field]) params.field = m.fields[field].toLowerCase();
  return fill(template, params);
}

/** The same, outside React. */
export function issueTextIn(issue: ValidationIssue, lang: Lang): string {
  return issueText(issue, messagesFor(GAME, lang), messagesFor(MENUS, lang));
}
