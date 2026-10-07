// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import narration from "./narration.json";
import durations from "./narration-durations.json";

// The trailer's timeline in each language: its scenes, the narrator's line
// in each one and the subtitles, all in frames at 30 fps. Lines last
// differently in each language, so each has its own scene lengths. The
// video (Trailer.tsx) and the subtitle files (scripts/srt.ts) both read it.

export const FPS = 30;
const sec = (s: number) => Math.round(s * FPS);

export type Lang = "en" | "es" | "pt";
export const LANGS: Lang[] = ["en", "es", "pt"];

/** When the narrator starts after a cut. */
export const VOICE_LEAD = sec(0.3);

export type SceneId = keyof typeof narration.lines.en;

/** Each scene lasts its planned time, or longer when its line needs it. */
const PLANNED: { id: SceneId; len: number }[] = [
  { id: "intro", len: sec(3.6) },
  { id: "home", len: sec(5.2) },
  { id: "friends", len: sec(5.6) },
  { id: "invite", len: sec(4.6) },
  { id: "controls", len: sec(5.8) },
  { id: "phone", len: sec(5.2) },
  { id: "maker", len: sec(6.4) },
  { id: "metrics", len: sec(5.4) },
  { id: "end", len: sec(5.2) },
];

export function scenes(lang: Lang) {
  const d = durations[lang] as Record<SceneId, number>;
  let from = 0;
  return PLANNED.map((s) => {
    const len = Math.max(s.len, VOICE_LEAD + sec(d[s.id]) + sec(0.6));
    const out = { ...s, from, len, line: narration.lines[lang][s.id], voice: sec(d[s.id]) };
    from += len;
    return out;
  });
}

export type Scene = ReturnType<typeof scenes>[number];

export const total = (lang: Lang) => scenes(lang).reduce((n, s) => n + s.len, 0);

export function scene(lang: Lang, id: SceneId): Scene {
  const s = scenes(lang).find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
}

/** One subtitle: from and to are frames of the whole video. */
export interface Caption {
  from: number;
  to: number;
  text: string;
}

/** A line cut into short phrases at its punctuation (very short ones ride with the next). */
function phrases(line: string): string[] {
  const parts = line.match(/[^.:?!]+[.:?!]?/g)?.map((p) => p.trim()).filter(Boolean) ?? [line];
  const merged: string[] = [];
  for (const p of parts) {
    if (merged.length > 0 && merged[merged.length - 1]!.length < 14) merged[merged.length - 1] += ` ${p}`;
    else merged.push(p);
  }
  return merged;
}

/**
 * The subtitles of the trailer narrated in voice, written in subs: the
 * narrator's own words, or a translation already cut into phrases
 * (narration.json subtitles). Each phrase shows for its share of the
 * line's spoken time, by length.
 */
export function captions(voice: Lang, subs: Lang = voice): Caption[] {
  const out: Caption[] = [];
  const translated = (narration.subtitles as Record<string, Record<string, Record<SceneId, string[]>>>)[`${voice}-voice`]?.[subs];
  for (const s of scenes(voice)) {
    const parts = subs === voice ? phrases(s.line) : (translated?.[s.id] ?? phrases(narration.lines[subs][s.id]));
    const chars = parts.reduce((n, p) => n + p.length, 0);
    let at = s.from + VOICE_LEAD;
    parts.forEach((p, i) => {
      const len = Math.round((s.voice * p.length) / chars);
      const end = i === parts.length - 1 ? s.from + VOICE_LEAD + s.voice + sec(0.25) : at + len;
      out.push({ from: at, to: end, text: p });
      at += len;
    });
  }
  return out;
}

/** The music's volume at frame f: lower while the narrator speaks, faded in and out. */
export function musicVolume(voice: Lang, f: number, base = 0.3, duck = 0.2): number {
  let v = base;
  const list = scenes(voice);
  for (const s of list) {
    const a = s.from + VOICE_LEAD - 6;
    const b = s.from + VOICE_LEAD + s.voice + 6;
    if (f >= a - 8 && f <= b + 8) {
      // 8 frames to duck and to come back.
      const t = f < a ? (a - f) / 8 : f > b ? (f - b) / 8 : 0;
      v = Math.min(v, duck + (base - duck) * Math.min(1, t));
    }
  }
  const end = total(voice);
  const fadeIn = Math.min(1, f / sec(1.2));
  const fadeOut = Math.min(1, (end - f) / sec(2.5));
  return Math.max(0, v * fadeIn * fadeOut);
}
