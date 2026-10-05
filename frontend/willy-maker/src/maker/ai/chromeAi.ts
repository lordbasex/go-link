// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Chrome's built-in AI (https://developer.chrome.com/docs/ai/built-in),
// all on the user's own computer: nothing typed or said leaves it. Each
// API is found by feature detection; another browser, or a Chrome too old
// to have one, gets "unavailable" and the interface hides what needs it.
//
// - LanguageDetector + Translator (Chrome 138): the image AI prompts go out
//   in English whatever language the fields were written in.
// - Proofreader (origin trial), else the Prompt API (LanguageModel): spelling.
// - LanguageModel: a richer description.
// - SpeechRecognition with processLocally (on-device speech packs): dictation.
//   Only on-device recognition is used, never the cloud one.

export type Availability = "available" | "downloadable" | "downloading" | "unavailable";

type Monitor = { addEventListener(type: "downloadprogress", fn: (e: { loaded: number }) => void): void };
type Created = { destroy?: () => void };

interface DetectorApi {
  availability(): Promise<Availability>;
  create(o?: { monitor?: (m: Monitor) => void }): Promise<Created & { detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]> }>;
}
interface TranslatorApi {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(o: { sourceLanguage: string; targetLanguage: string; monitor?: (m: Monitor) => void }): Promise<Created & { translate(text: string): Promise<string> }>;
}
interface ProofreaderApi {
  availability(o?: { expectedInputLanguages?: string[] }): Promise<Availability>;
  create(o?: { expectedInputLanguages?: string[]; monitor?: (m: Monitor) => void }): Promise<Created & { proofread(text: string): Promise<{ correctedInput?: string; corrected?: string }> }>;
}
type LmOptions = { expectedInputs?: { type: "text"; languages: string[] }[]; expectedOutputs?: { type: "text"; languages: string[] }[]; initialPrompts?: { role: "system"; content: string }[]; monitor?: (m: Monitor) => void };
interface LanguageModelApi {
  availability(o?: LmOptions): Promise<Availability>;
  create(o?: LmOptions): Promise<Created & { prompt(text: string): Promise<string> }>;
}
interface SpeechCtor {
  new (): SpeechRec;
  available?(o: { langs: string[]; processLocally: boolean }): Promise<Availability>;
  install?(o: { langs: string[]; processLocally: boolean }): Promise<boolean>;
}
export interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const g = globalThis as unknown as {
  LanguageDetector?: DetectorApi;
  Translator?: TranslatorApi;
  Proofreader?: ProofreaderApi;
  LanguageModel?: LanguageModelApi;
  SpeechRecognition?: SpeechCtor;
  webkitSpeechRecognition?: SpeechCtor;
};

const safe = async (f: () => Promise<Availability> | undefined): Promise<Availability> => {
  try {
    return (await f()) ?? "unavailable";
  } catch {
    return "unavailable";
  }
};

/** A full BCP 47 tag for speech (es → es-ES). */
export const SPEECH_LANG: Record<string, string> = { en: "en-US", es: "es-ES", pt: "pt-BR" };

const lmText = (lang: string): LmOptions => ({ expectedInputs: [{ type: "text", languages: [lang] }], expectedOutputs: [{ type: "text", languages: [lang] }] });
const lmEnglish = (from: string): LmOptions => ({ expectedInputs: [{ type: "text", languages: [from, "en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] });

/** Whether this browser has any of Chrome's built-in AI (false in other browsers and older Chromes). */
export function hasBuiltInAi(): boolean {
  return Boolean(g.Translator || g.LanguageDetector || g.LanguageModel || g.Proofreader);
}

export const chromeAi = {
  detector: () => safe(() => g.LanguageDetector?.availability()),
  translator: (from: string, to = "en") => safe(() => g.Translator?.availability({ sourceLanguage: from, targetLanguage: to })),
  proofreader: (lang: string) => safe(() => g.Proofreader?.availability({ expectedInputLanguages: [lang] })),
  model: (lang: string) => safe(() => g.LanguageModel?.availability(lmText(lang))),
  /** The Prompt API taking text in a language and answering in English (a translator when Translator is not ready). */
  modelToEnglish: (lang: string) => safe(() => g.LanguageModel?.availability(lmEnglish(lang))),
  speech: (lang: string) => {
    const S = g.SpeechRecognition ?? g.webkitSpeechRecognition;
    // only on-device recognition: a Chrome without available() would use the cloud
    return safe(() => S?.available?.({ langs: [SPEECH_LANG[lang] ?? lang], processLocally: true }));
  },
};

/** Download progress (0-1) while a model is fetched once to this computer. */
export type OnProgress = (loaded: number) => void;
const monitor = (p?: OnProgress) => (p ? (m: Monitor) => m.addEventListener("downloadprogress", (e) => p(e.loaded)) : undefined);

// one instance of each, made on first use (creating one may download a model: call it from a click)
const cache = new Map<string, Promise<unknown>>();
function once<T>(key: string, make: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = make();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

/** Forgets the instances (tests). */
export function resetChromeAi(): void {
  cache.clear();
}

/** The language of a text ("und" when unsure or no detector). */
export async function detectLanguage(text: string, progress?: OnProgress): Promise<string> {
  const api = g.LanguageDetector;
  if (!api || !text.trim()) return "und";
  const d = await once("detector", () => api.create({ monitor: monitor(progress) }));
  const [best] = await d.detect(text);
  return best && best.confidence >= 0.5 ? best.detectedLanguage.split("-")[0]! : "und";
}

export async function translate(text: string, from: string, to = "en", progress?: OnProgress): Promise<string> {
  const api = g.Translator;
  if (!api) throw new Error("no translator");
  const t = await once(`translator:${from}:${to}`, () => api.create({ sourceLanguage: from, targetLanguage: to, monitor: monitor(progress) }));
  return t.translate(text);
}

/** English from the Prompt API, for when Chrome's translator is not downloaded yet. */
export async function translateWithModel(text: string, from: string): Promise<string> {
  const lm = await once(`toEnglish:${from}`, () =>
    g.LanguageModel!.create({
      ...lmEnglish(from),
      initialPrompts: [{ role: "system", content: "Translate the user's text into natural English. Keep its meaning, add nothing, and reply with the translation only." }],
    }),
  );
  return (await lm.prompt(text)).trim();
}

/** The text with its spelling and grammar fixed: the Proofreader API, else the Prompt API. */
export async function proofread(text: string, lang: string, progress?: OnProgress): Promise<string> {
  if ((await chromeAi.proofreader(lang)) !== "unavailable" && g.Proofreader) {
    const p = await once(`proof:${lang}`, () => g.Proofreader!.create({ expectedInputLanguages: [lang], monitor: monitor(progress) }));
    const r = await p.proofread(text);
    return r.correctedInput ?? r.corrected ?? text;
  }
  const lm = await once(`lm:${lang}`, () =>
    g.LanguageModel!.create({
      ...lmText(lang),
      monitor: monitor(progress),
      initialPrompts: [{ role: "system", content: "You fix spelling and grammar. Reply with the corrected text only, in the same language, keeping its meaning and wording." }],
    }),
  );
  return (await lm.prompt(text)).trim();
}

/** A richer description for an image AI, in English, from a short one in any language. */
export async function enrich(text: string, what: string, lang: string, progress?: OnProgress): Promise<string> {
  const lm = await once(`enrich:${lang}`, () =>
    g.LanguageModel!.create({
      ...lmEnglish(lang),
      monitor: monitor(progress),
      initialPrompts: [
        {
          role: "system",
          content:
            "You help write art direction for 2D side-scrolling arcade game pixel art. Given a short idea, write 2 to 4 vivid English sentences describing only what is seen: shapes, materials, colors, details, mood. No camera, size, resolution, style names, game names, brands or logos. Reply with the description only.",
        },
      ],
    }),
  );
  return (await lm.prompt(`${what}: ${text}`)).trim();
}

/** On-device dictation; null when this browser cannot do it on the computer. */
export function speechRecognizer(lang: string): SpeechRec | null {
  const S = g.SpeechRecognition ?? g.webkitSpeechRecognition;
  if (!S?.available) return null;
  const r = new S();
  r.lang = SPEECH_LANG[lang] ?? lang;
  r.processLocally = true;
  r.continuous = true;
  r.interimResults = true;
  return r;
}

/** Downloads the on-device speech pack (from a click). */
export async function installSpeech(lang: string): Promise<boolean> {
  const S = g.SpeechRecognition ?? g.webkitSpeechRecognition;
  try {
    return (await S?.install?.({ langs: [SPEECH_LANG[lang] ?? lang], processLocally: true })) ?? false;
  } catch {
    return false;
  }
}
