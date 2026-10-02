// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The free text fields of the prompt dialog in English: each one's language
// is detected and, when it is not English, translated on this computer with
// Chrome's built-in AI (ai/chromeAi.ts). Without it the text stays as typed.

import { useCallback, useEffect, useRef, useState } from "react";
import { chromeAi, detectLanguage, translate, translateWithModel, type OnProgress } from "./chromeAi";

export type EnglishState =
  /** nothing to translate (empty, or already English) */
  | "idle"
  | "working"
  /** at least one field was translated */
  | "done"
  /** Chrome can translate once its model is downloaded, which needs a click */
  | "needs-download"
  /** this browser cannot translate */
  | "unavailable";

const done = new Map<string, { text: string; from: string }>();
/** Languages whose translator a download was already asked for. */
const tried = new Set<string>();

/** Forgets the translations (tests). */
export function resetEnglish(): void {
  done.clear();
  tried.clear();
}

export function useEnglish<K extends string>(fields: Record<K, string>, uiLang: string) {
  const [state, setState] = useState<EnglishState>("idle");
  const [from, setFrom] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(fields);
  const latest = useRef(key);
  latest.current = key;

  useEffect(() => {
    let live = true;
    const run = async () => {
      const langs = new Set<string>();
      let need: EnglishState | null = null;
      const detector = await chromeAi.detector();
      for (const k of Object.keys(fields) as K[]) {
        const text = fields[k].trim();
        if (!text) continue;
        const hit = done.get(text);
        if (hit) {
          if (hit.from !== "en") langs.add(hit.from);
          continue;
        }
        // the detector, or the interface's language when it cannot be used yet
        let lang = detector === "available" ? await detectLanguage(text).catch(() => "und") : uiLang;
        if (lang === "und") lang = uiLang;
        if (lang === "en") {
          done.set(text, { text: fields[k], from: "en" });
          continue;
        }
        let can = await chromeAi.translator(lang);
        if (can === "downloadable" && !tried.has(lang)) {
          // typing in the dialog is the user's gesture Chrome asks for to download it: try once
          tried.add(lang);
          await translate("hola", lang).catch(() => undefined);
          can = await chromeAi.translator(lang);
        }
        let en: string | null = null;
        if (can === "available") en = await translate(text, lang).catch(() => null);
        // not downloaded yet: Chrome's language model, when it is ready, translates meanwhile
        if (en === null && (await chromeAi.modelToEnglish(lang)) === "available") en = await translateWithModel(text, lang).catch(() => null);
        if (en !== null) {
          done.set(text, { text: en, from: lang });
          langs.add(lang);
        } else if (can === "unavailable") need ??= "unavailable";
        else need = "needs-download";
      }
      if (!live || latest.current !== key) return;
      setFrom([...langs]);
      setState(need ?? (langs.size ? "done" : "idle"));
    };
    const id = setTimeout(() => {
      setState((s) => (s === "needs-download" ? s : "working"));
      void run();
    }, 350);
    return () => {
      live = false;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, uiLang, tick]);

  /** From a click: downloads the detector and the translator from the interface's language, then translates again. */
  const prepare = useCallback(async () => {
    const onProgress: OnProgress = (p) => setProgress(p);
    setProgress(0);
    try {
      if ((await chromeAi.detector()) !== "unavailable") await detectLanguage("hola", onProgress).catch(() => undefined);
      if (uiLang !== "en") await translate("hola", uiLang, "en", onProgress);
    } catch {
      // the next run says what is still missing
    }
    setProgress(null);
    setTick((n) => n + 1);
  }, [uiLang]);

  // each field in English as soon as it is known, else as typed
  const values = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, done.get((v as string).trim())?.text ?? v])) as Record<K, string>;
  const ready = state !== "working";
  return { values, state, from, progress, prepare, ready };
}
