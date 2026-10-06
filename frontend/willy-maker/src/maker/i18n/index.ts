// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The module's own texts, so it can move out of the site. Each part keeps
// its files: i18n/<part>.<lang>.ts (core, sprites, play…), English being the
// reference shape. The site passes its current language to the module's
// entry (`lang`), which provides it here; a part reads its texts with
// `useMessages({ en, es, pt })`.

import { createContext, useContext } from "react";
import { coreEn, type CoreMessages } from "./core.en";
import { coreEs } from "./core.es";
import { corePt } from "./core.pt";
import { exportEn, type ExportMessages } from "./export.en";
import { exportEs } from "./export.es";
import { exportPt } from "./export.pt";
import { studioEn, type StudioMessages } from "./studio.en";
import { studioEs } from "./studio.es";
import { studioPt } from "./studio.pt";

export type Lang = "en" | "es" | "pt";

const LangContext = createContext<Lang>("en");

/** Wraps the module's tree with the site's current language. */
export const LangProvider = LangContext.Provider;

/** The active language. */
export function useWmLang(): Lang {
  return useContext(LangContext);
}

/** One part's texts in the active language (English when one is missing). */
export function useMessages<T>(dicts: { en: T; es?: T; pt?: T }): T {
  const lang = useWmLang();
  return dicts[lang] ?? dicts.en;
}

/** Picks from dictionaries outside React (tests, exports). */
export function messagesFor<T>(dicts: { en: T; es?: T; pt?: T }, lang: Lang): T {
  return dicts[lang] ?? dicts.en;
}

export const CORE = { en: coreEn, es: coreEs, pt: corePt };

/** The shell's texts (home, wizard, editor, export). */
export function useCore(): CoreMessages {
  return useMessages(CORE);
}

export const EXPORT = { en: exportEn, es: exportEs, pt: exportPt };

/** The Export tab's texts (review, project .zip, AI pack, Create ROM). */
export function useExportMessages(): ExportMessages {
  return useMessages(EXPORT);
}

export const STUDIO = { en: studioEn, es: studioEs, pt: studioPt };

/** The new editor's texts (ui/studio). */
export function useStudioText(): StudioMessages {
  return useMessages(STUDIO);
}

export type { CoreMessages, ExportMessages, StudioMessages };
