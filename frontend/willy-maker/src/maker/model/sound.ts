// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A game's own sound (settings.sound): effects made from a recipe instead
// of the built-in ones, songs of its own in the tracker form the QSound
// driver plays, and the song of the level clear. rom/sound.ts turns them
// into the chip's samples and data; play mode plays the same. Read and
// checked on load: a file is never trusted.

export type SoundWave = "square" | "saw" | "tri" | "sine" | "pulse";
export const SOUND_WAVES: readonly SoundWave[] = ["square", "saw", "tri", "sine", "pulse"];

/** One layer of an effect; the layers play together. */
export type EffectLayer =
  /** A tone sweeping from `from` to `to` Hz, with some noise mixed in (0-1). */
  | { kind: "tone"; wave: SoundWave; from: number; to: number; seconds: number; decay: number; noise?: number }
  /** Noise whose brightness goes from `from` to `to` (0-1). */
  | { kind: "noise"; from: number; to: number; seconds: number; decay: number }
  /** Notes one after the other ("c5 e5 g5"), `step` seconds each, the last one `last` seconds. */
  | { kind: "notes"; wave: SoundWave; notes: string; step: number; last: number; decay: number };

export interface OwnEffect {
  layers: EffectLayer[];
  /** 0-100. */
  volume: number;
}

/** One channel of a song: an instrument, its place (0 left, 16 centre, 32 right) and its notes ("a4 . . - c5"). */
export interface SongChannel {
  inst: string;
  pan: number;
  line: string;
}

export interface OwnSong {
  id: string;
  name: string;
  /** Ticks of 1/250 s per row: 31 is a sixteenth at about 120 beats a minute. */
  tempo: number;
  /** The row it plays again from, or null to play once. */
  loop: number | null;
  channels: SongChannel[];
}

export interface GameSound {
  /** Effects by id (rom/sound.ts SFX): a missing one is the built-in effect. */
  effects?: Record<string, OwnEffect>;
  songs?: OwnSong[];
  /** The music slot or "own:<id>" of the level clear; the built-in fanfare when missing. */
  clear?: string;
}

/** A menu's music slot that names one of the game's own songs. */
export const ownSlot = (id: string) => `own:${id}`;
export const ownSongId = (slot: string | undefined | null): string | null => (slot && slot.startsWith("own:") ? slot.slice(4) : null);

export const MAX_SONG_CHANNELS = 8;
export const MAX_EFFECT_LAYERS = 4;

const num = (v: unknown, min: number, max: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d;
};
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const wave = (v: unknown): SoundWave => (SOUND_WAVES.includes(v as SoundWave) ? (v as SoundWave) : "square");

function cleanLayer(v: unknown): EffectLayer | null {
  if (!isRecord(v)) return null;
  const seconds = num(v.seconds, 0.01, 2, 0.2);
  const decay = num(v.decay, 0, 20, 4);
  if (v.kind === "tone") return { kind: "tone", wave: wave(v.wave), from: num(v.from, 20, 12000, 440), to: num(v.to, 20, 12000, 440), seconds, decay, noise: num(v.noise, 0, 1, 0) };
  if (v.kind === "noise") return { kind: "noise", from: num(v.from, 0.01, 1, 0.5), to: num(v.to, 0.01, 1, 0.1), seconds, decay };
  if (v.kind === "notes" && typeof v.notes === "string") return { kind: "notes", wave: wave(v.wave), notes: v.notes.slice(0, 200), step: num(v.step, 0.02, 1, 0.08), last: num(v.last, 0.02, 2, 0.2), decay };
  return null;
}

/** The sound settings as far as they can be read, or undefined when there is nothing of ours. */
export function cleanSound(v: unknown): GameSound | undefined {
  if (!isRecord(v)) return undefined;
  const out: GameSound = {};
  if (isRecord(v.effects)) {
    const effects: Record<string, OwnEffect> = {};
    for (const [id, e] of Object.entries(v.effects)) {
      if (!isRecord(e) || !Array.isArray(e.layers)) continue;
      const layers = e.layers.map(cleanLayer).filter((l): l is EffectLayer => l !== null).slice(0, MAX_EFFECT_LAYERS);
      if (layers.length) effects[id.slice(0, 32)] = { layers, volume: num(e.volume, 0, 100, 70) };
    }
    out.effects = effects;
  }
  if (Array.isArray(v.songs)) {
    const ids = new Set<string>();
    out.songs = v.songs.filter(isRecord).flatMap((s): OwnSong[] => {
      const id = typeof s.id === "string" && /^[\w-]{1,40}$/.test(s.id) ? s.id : "";
      if (!id || ids.has(id) || !Array.isArray(s.channels)) return [];
      ids.add(id);
      const channels = s.channels
        .filter(isRecord)
        .slice(0, MAX_SONG_CHANNELS)
        .map((c) => ({ inst: typeof c.inst === "string" ? c.inst.slice(0, 20) : "lead", pan: Math.round(num(c.pan, 0, 32, 16)), line: typeof c.line === "string" ? c.line.slice(0, 8000) : "" }));
      const loop = s.loop === null || s.loop === undefined ? null : Math.round(num(s.loop, 0, 4096, 0));
      return [{ id, name: typeof s.name === "string" ? s.name.slice(0, 40) : id, tempo: Math.round(num(s.tempo, 4, 120, 31)), loop, channels }];
    });
  }
  if (typeof v.clear === "string") out.clear = v.clear.slice(0, 50);
  return out;
}
