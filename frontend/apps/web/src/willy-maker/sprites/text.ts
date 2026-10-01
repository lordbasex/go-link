// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import { messagesFor, useMessages, type Lang } from "../i18n";
import { spritesEn, type SpritesMessages } from "../i18n/sprites.en";
import { spritesEs } from "../i18n/sprites.es";
import { spritesPt } from "../i18n/sprites.pt";

export const SPRITES = { en: spritesEn, es: spritesEs, pt: spritesPt };

/** The importer's texts in the module's language. */
export function useSpritesText(): SpritesMessages {
  return useMessages(SPRITES);
}

export function spritesText(lang: Lang): SpritesMessages {
  return messagesFor(SPRITES, lang);
}

/** Fills {name} placeholders. */
export function fmt(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

/** A number in the page's language style (decimal comma in es and pt). */
export function num(v: number, lang: Lang, digits = 1): string {
  const s = v.toFixed(digits);
  return lang === "en" ? s : s.replace(".", ",");
}
