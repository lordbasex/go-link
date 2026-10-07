// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import narration from "./narration.json";
import durations from "./narration-durations.json";

// The trailer's timeline: its scenes, the narrator's line in each one and
// the subtitles, all in frames at 30 fps. The video (Trailer.tsx) and the
// subtitle file (scripts/srt.ts) both read it, so they never drift apart.

export const FPS = 30;
const sec = (s: number) => Math.round(s * FPS);

/** When the narrator starts after a cut. */
export const VOICE_LEAD = sec(0.3);

type SceneId = keyof typeof narration.lines;

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

export const SCENES = PLANNED.map((s) => ({
  ...s,
  len: Math.max(s.len, VOICE_LEAD + sec(durations[s.id]) + sec(0.6)),
  line: narration.lines[s.id],
  voice: sec(durations[s.id]),
}));

export type Scene = (typeof SCENES)[number];

export const TOTAL = SCENES.reduce((n, s) => n + s.len, 0);

export function scene(id: SceneId): Scene & { from: number } {
  let from = 0;
  for (const s of SCENES) {
    if (s.id === id) return { ...s, from };
    from += s.len;
  }
  throw new Error(id);
}

/** One subtitle: from and to are frames of the whole video. */
export interface Caption {
  from: number;
  to: number;
  text: string;
}

/**
 * The subtitles: each line split into short phrases at its punctuation,
 * each shown for its share of the line's spoken time (by length), so two
 * lines of text at most are ever on screen.
 */
export function captions(): Caption[] {
  const out: Caption[] = [];
  for (const s of SCENES) {
    const { from } = scene(s.id);
    const phrases = s.line.match(/[^.:?!]+[.:?!]?/g)?.map((p) => p.trim()).filter(Boolean) ?? [s.line];
    // Very short phrases ride with the next one.
    const merged: string[] = [];
    for (const p of phrases) {
      if (merged.length > 0 && merged[merged.length - 1]!.length < 14) merged[merged.length - 1] += ` ${p}`;
      else merged.push(p);
    }
    const chars = merged.reduce((n, p) => n + p.length, 0);
    let at = from + VOICE_LEAD;
    merged.forEach((p, i) => {
      const len = Math.round((s.voice * p.length) / chars);
      const end = i === merged.length - 1 ? from + VOICE_LEAD + s.voice + sec(0.25) : at + len;
      out.push({ from: at, to: end, text: p });
      at += len;
    });
  }
  return out;
}

/** The music's volume at frame f: lower while the narrator speaks, faded in and out. */
export function musicVolume(f: number, base = 0.5, duck = 0.16): number {
  let v = base;
  for (const s of SCENES) {
    const { from } = scene(s.id);
    const a = from + VOICE_LEAD - 6;
    const b = from + VOICE_LEAD + s.voice + 6;
    if (f >= a - 8 && f <= b + 8) {
      // 8 frames to duck and to come back.
      const t = f < a ? (a - f) / 8 : f > b ? (f - b) / 8 : 0;
      v = Math.min(v, duck + (base - duck) * Math.min(1, t));
    }
  }
  const fadeIn = Math.min(1, f / sec(1.2));
  const fadeOut = Math.min(1, (TOTAL - f) / sec(2.5));
  return Math.max(0, v * fadeIn * fadeOut);
}
