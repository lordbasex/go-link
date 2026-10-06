// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Sound for Create ROM (experiment 1, T-26): the QSound chip's samples and
// the data the Z80 driver (rom/engine/sound.z80) reads. Everything is made
// here, from code, the same bytes for the same game: effects and
// instruments are synthesized as 8-bit signed PCM at the chip's 24096 Hz,
// and the songs are built-in tunes chosen per screen by its music slot
// (the Menus tab). Stereo comes from the chip's per-channel balance: the
// engine pans an effect to where it happens on screen, and each song
// channel has its own place.

import { ownSlot, type OwnEffect, type OwnSong, type Project, type SoundWave } from "../model";

/** The chip plays a sample at pitch 0x1000 at this rate (4 MHz / 166). */
export const QS_RATE = 24096;

/** Effect ids the engine sends (rom/engine/engine.c SFX_*); 0 is none. */
export const SFX = {
  shot: 1,
  knife: 2,
  jump: 3,
  hit: 4,
  enemyDown: 5,
  hurt: 6,
  crate: 7,
  pickup: 8,
  rescue: 9,
  coin: 10,
  start: 11,
  rocket: 12,
  explosion: 13,
  kick: 14,
  land: 15,
} as const;
export type SfxId = keyof typeof SFX;

/** The screens the engine plays music on, in the order of the driver's song table (0x40 + n). */
export const MUSIC_SCREENS = ["title", "hud", "clear", "continue", "gameOver"] as const;

/** Where the sound data sits in the Z80's address space (sound.z80 DATA). */
export const SOUND_DATA_ADDR = 0x4000;
export const SOUND_DATA_MAX = 0x4000;

// ---------------------------------------------------------------- synthesis

/** A seeded generator (mulberry32): the same noise every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Wave = SoundWave;
const osc = (w: Wave, ph: number, duty = 0.5) => {
  const p = ph - Math.floor(ph);
  if (w === "square") return p < duty ? 1 : -1;
  if (w === "pulse") return p < 0.125 ? 1 : -1;
  if (w === "saw") return 2 * p - 1;
  if (w === "tri") return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
  return Math.sin(2 * Math.PI * p);
};

/** Float samples (-1..1) to 8-bit signed PCM, with a soft limit. */
function pcm(f: Float32Array, gain = 1): Int8Array {
  const out = new Int8Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.round(Math.tanh(f[i]! * gain) * 120);
  return out;
}

/** A tone sweeping from f0 to f1 Hz over `sec`, with a decay. */
function sweep(sec: number, f0: number, f1: number, wave: Wave, decay = 6, noise = 0, seed = 1): Float32Array {
  const n = Math.round(sec * QS_RATE);
  const out = new Float32Array(n);
  const r = rng(seed);
  let ph = 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = f0 * Math.pow(f1 / f0, t);
    ph += f / QS_RATE;
    lp += (r() * 2 - 1 - lp) * 0.5;
    const env = Math.exp(-decay * t) * Math.min(1, i / 40);
    out[i] = env * ((1 - noise) * osc(wave, ph) + noise * lp * 1.6);
  }
  return out;
}

/** Noise through a one-pole low-pass whose cutoff falls from c0 to c1 (0-1). */
function noise(sec: number, c0: number, c1: number, decay = 5, seed = 7): Float32Array {
  const n = Math.round(sec * QS_RATE);
  const out = new Float32Array(n);
  const r = rng(seed);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const c = c0 + (c1 - c0) * t;
    lp += (r() * 2 - 1 - lp) * c;
    out[i] = lp * Math.exp(-decay * t) * Math.min(1, i / 20) * (1.5 / Math.max(0.2, Math.sqrt(c)));
  }
  return out;
}

/** Notes in sequence (Hz, seconds each). */
function notes(seq: [number, number][], wave: Wave, decay = 3): Float32Array {
  const parts = seq.map(([f, s]) => sweep(s, f, f, wave, decay));
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const mix = (...parts: Float32Array[]) => {
  const out = new Float32Array(Math.max(...parts.map((p) => p.length)));
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i]! += p[i]!;
  return out;
};

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** One effect: its samples and volume (0x0000-0x0fff). */
export interface Sample {
  data: Int8Array;
  /** Samples from the end the chip loops back over (0: plays once). */
  loop: number;
  vol: number;
}

/** An own effect's samples, from its layers (model/sound.ts), louder or softer by its volume. */
export function renderEffect(e: OwnEffect): Sample {
  const parts = e.layers.map((l, k) => {
    if (l.kind === "tone") return sweep(l.seconds, l.from, l.to, l.wave, l.decay, l.noise ?? 0, 31 + k);
    if (l.kind === "noise") return noise(l.seconds, l.from, l.to, l.decay, 41 + k);
    const names = l.notes.trim().split(/\s+/).map(noteNumber).filter((n): n is number => n !== null);
    return notes(names.map((n, i) => [hz(n), i === names.length - 1 ? l.last : l.step]), l.wave, l.decay);
  });
  const vol = Math.round((Math.max(0, Math.min(100, e.volume)) / 100) * 0xfff);
  return { data: pcm(parts.length ? mix(...parts) : new Float32Array(1), 1.2), loop: 0, vol };
}

/** A note name ("c#5", "bb3") as a MIDI number, or null. */
export function noteNumber(tok: string): number | null {
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(tok.toLowerCase());
  if (!m) return null;
  const NAMES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]!]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}

/** The effects a game plays: its own where it has them, the built-in ones for the rest. */
export function effects(project?: Project): Record<SfxId, Sample> {
  const own = project?.settings.sound?.effects ?? {};
  const out = builtInEffects();
  for (const k of Object.keys(out) as SfxId[]) if (own[k]) out[k] = renderEffect(own[k]!);
  return out;
}

function builtInEffects(): Record<SfxId, Sample> {
  const one = (f: Float32Array, vol = 0x700, gain = 1.2): Sample => ({ data: pcm(f, gain), loop: 0, vol });
  return {
    shot: one(mix(noise(0.09, 0.9, 0.3, 7, 11), sweep(0.09, 1400, 300, "square", 8)), 0x900),
    knife: one(noise(0.13, 0.15, 0.9, 4, 12), 0x900),
    jump: one(sweep(0.16, 280, 760, "square", 3), 0x733),
    hit: one(mix(noise(0.08, 0.6, 0.2, 6, 13), sweep(0.08, 220, 120, "square", 5)), 0xacc),
    enemyDown: one(mix(noise(0.45, 0.7, 0.05, 4, 14), sweep(0.45, 420, 50, "saw", 3)), 0xc99),
    hurt: one(sweep(0.3, 620, 140, "square", 2), 0xacc),
    crate: one(mix(noise(0.25, 0.5, 0.1, 5, 15), sweep(0.2, 180, 90, "tri", 4)), 0xc99),
    pickup: one(notes([[hz(84), 0.06], [hz(91), 0.06], [hz(96), 0.14]], "tri", 2), 0x900),
    rescue: one(notes([[hz(72), 0.08], [hz(76), 0.08], [hz(79), 0.08], [hz(84), 0.25]], "square", 2), 0x733),
    coin: one(notes([[hz(83), 0.07], [hz(88), 0.3]], "square", 3), 0x733),
    start: one(notes([[hz(60), 0.08], [hz(64), 0.08], [hz(67), 0.08], [hz(72), 0.08], [hz(76), 0.08], [hz(79), 0.08], [hz(84), 0.3]], "square", 2), 0x733),
    rocket: one(mix(noise(0.4, 0.1, 0.6, 2, 16), sweep(0.4, 90, 400, "saw", 2)), 0xacc),
    explosion: one(noise(0.8, 0.8, 0.02, 3, 17), 0x800, 1.6),
    kick: one(mix(noise(0.1, 0.7, 0.1, 6, 18), sweep(0.1, 160, 70, "square", 6)), 0xacc),
    land: one(sweep(0.06, 140, 70, "tri", 8), 0x566),
  };
}

// ---------------------------------------------------------------- instruments

/** Middle C (MIDI 60, 261.63 Hz) plays at pitch 0x1000: 10 cycles in 921 samples. */
const LOOP = 921;

/** A looped tone at C4: one loop of whole cycles (the chip holds it until the next note or a key off). */
function tone(wave: Wave, duty = 0.5, bright = 1): Sample {
  const f = new Float32Array(LOOP);
  for (let i = 0; i < LOOP; i++) {
    const ph = (i * 10) / LOOP;
    f[i] = osc(wave, ph, duty) * bright;
  }
  return { data: pcm(f, 0.9), loop: LOOP, vol: 0x733 };
}

const INSTRUMENTS = {
  bass: () => ({ ...tone("saw"), vol: 0x900 }),
  lead: () => ({ ...tone("square", 0.5, 0.8), vol: 0x64c }),
  arp: () => ({ ...tone("pulse"), vol: 0x480 }),
  pad: () => ({ ...tone("tri"), vol: 0x64c }),
  kick: (): Sample => ({ data: pcm(mix(sweep(0.18, 150, 45, "sine", 5), noise(0.02, 0.9, 0.5, 8, 21)), 1.6), loop: 0, vol: 0xc99 }),
  snare: (): Sample => ({ data: pcm(mix(noise(0.16, 0.7, 0.4, 6, 22), sweep(0.1, 220, 180, "tri", 8)), 1.3), loop: 0, vol: 0x900 }),
  hat: (): Sample => ({ data: pcm(noise(0.05, 0.95, 0.9, 9, 23), 1), loop: 0, vol: 0x480 }),
  // the tango's: a reed's buzz, a bowed string, a plucked one and a struck one
  bandoneon: (): Sample => {
    const f = new Float32Array(LOOP);
    for (let i = 0; i < LOOP; i++) {
      const ph = (i * 10) / LOOP;
      f[i] = 0.55 * osc("saw", ph) + 0.35 * osc("square", ph, 0.3) + 0.2 * osc("square", ph * 2, 0.5);
    }
    return { data: pcm(f, 0.8), loop: LOOP, vol: 0x6a0 };
  },
  violin: (): Sample => {
    const f = new Float32Array(LOOP);
    for (let i = 0; i < LOOP; i++) {
      const ph = (i * 10) / LOOP;
      f[i] = 0.7 * osc("saw", ph) + 0.3 * osc("tri", ph * 2);
    }
    return { data: pcm(f, 0.8), loop: LOOP, vol: 0x5c0 };
  },
  pizz: (): Sample => ({ data: pcm(mix(sweep(0.35, 261.63, 261.63, "tri", 9), sweep(0.35, 523.25, 523.25, "sine", 12)), 1.3), loop: 0, vol: 0x9a0 }),
  piano: (): Sample => ({ data: pcm(mix(sweep(0.8, 261.63, 261.63, "tri", 5), sweep(0.8, 523.25, 523.25, "sine", 7), sweep(0.8, 784.0, 784.0, "sine", 9)), 1.1), loop: 0, vol: 0x7a0 }),
};
export type InstrumentId = keyof typeof INSTRUMENTS;
/** The instruments a song's channel can name, in the driver's order (new ones go last). */
export const INSTRUMENT_IDS = Object.keys(INSTRUMENTS) as InstrumentId[];

/** The instruments' samples, in the songs' instrument order. */
export function instruments(): Sample[] {
  return INSTRUMENT_IDS.map((k) => INSTRUMENTS[k]());
}

/** The chip's pitch of a MIDI note (middle C = 0x1000): the rate is QS_RATE × pitch / 0x1000. */
export function notePitch(note: number): number {
  return Math.min(0xffff, Math.round(0x1000 * Math.pow(2, (note - 60) / 12)));
}

/** The built-in tunes by music slot, and the clear fanfare (as the ROM plays them). */
export function builtInSongs(): Record<string, Song> {
  return songs();
}
const I = Object.fromEntries(INSTRUMENT_IDS.map((k, i) => [k, i])) as Record<InstrumentId, number>;

// ---------------------------------------------------------------- songs

/** A song: ticks per row (250 Hz), channel balances (0-32), rows of [note, instrument] per channel, and the row it loops back to. */
export interface Song {
  tempo: number;
  pans: number[];
  rows: [number, number][][];
  loop: number | null;
}

const HOLD = 0;
const OFF = 0xff;

/** Builds a song from one string per channel: "a4 . . - c5", "." holds, "-" is a key off, notes are name + octave. */
function song(tempo: number, loop: number | null, chans: { inst: InstrumentId; pan: number; line: string }[]): Song {
  const NAMES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const parse = (tok: string): number => {
    if (tok === ".") return HOLD;
    if (tok === "-") return OFF;
    const m = /^([a-g])(#|b)?(\d)$/.exec(tok);
    if (!m) throw new Error(`song: bad note ${tok}`);
    return 12 * (Number(m[3]) + 1) + NAMES[m[1]!]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  };
  const lines = chans.map((c) => c.line.trim().split(/\s+/).map(parse));
  const n = Math.max(...lines.map((l) => l.length));
  const rows: [number, number][][] = [];
  for (let r = 0; r < n; r++) rows.push(chans.map((c, k) => [lines[k]![r] ?? HOLD, I[c.inst]]));
  return { tempo, pans: chans.map((c) => c.pan), rows, loop };
}

/** One of the game's own songs in the driver's form; throws an Error naming the first thing it cannot read. */
export function compileSong(own: OwnSong): Song {
  if (!own.channels.length) throw new Error("no channels");
  for (const c of own.channels) if (!INSTRUMENT_IDS.includes(c.inst as InstrumentId)) throw new Error(`unknown instrument ${c.inst}`);
  const out = song(own.tempo, own.loop, own.channels.map((c) => ({ inst: c.inst as InstrumentId, pan: c.pan, line: c.line || "." })));
  if (own.loop !== null && own.loop >= out.rows.length) throw new Error(`loop row ${own.loop} is past the end (${out.rows.length} rows)`);
  return out;
}

/** What is wrong with an own song, or null when it plays. */
export function songProblem(own: OwnSong): string | null {
  try {
    compileSong(own);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message.replace(/^song: /, "") : String(e);
  }
}

/** The tunes a game can play, by music slot: the built-in ones and its own ("own:<id>") that can be read. */
export function projectSongs(project?: Project): Record<string, Song> {
  const out = songs();
  for (const own of project?.settings.sound?.songs ?? []) {
    try {
      out[ownSlot(own.id)] = compileSong(own);
    } catch {
      // a song that cannot be read is silent; the review says why
    }
  }
  return out;
}

const rep = (s: string, n: number) => Array.from({ length: n }, () => s).join(" ");
const drums = (bars: number) => ({
  kick: rep("c4 . . . . . . . c4 . . . . . . .", bars),
  snare: rep(". . . . c4 . . . . . . . c4 . . .", bars),
  hat: rep(". . c4 . . . c4 . . . c4 . . . c4 .", bars),
});

/** The built-in tunes, by music slot (MUSIC_SLOTS in game/menus.ts) and the clear fanfare. */
function songs(): Record<string, Song> {
  // A minor: Am F C G, a bar of 16 rows each
  const bass = "a2 . a3 . a2 . a3 . a2 . a3 . a2 . a3 . f2 . f3 . f2 . f3 . f2 . f3 . f2 . f3 . c3 . c4 . c3 . c4 . c3 . c4 . c3 . c4 . g2 . g3 . g2 . g3 . g2 . g3 . g2 . g3 .";
  const arp = "a4 c5 e5 a5 e5 c5 a4 c5 e5 a5 e5 c5 a4 c5 e5 c5 f4 a4 c5 f5 c5 a4 f4 a4 c5 f5 c5 a4 f4 a4 c5 a4 c4 e4 g4 c5 g4 e4 c4 e4 g4 c5 g4 e4 c4 e4 g4 e4 g4 b4 d5 g5 d5 b4 g4 b4 d5 g5 d5 b4 g4 b4 d5 b4";
  const lead = "e5 . . . a5 . . . c6 . b5 . a5 . g5 . a5 . . . . . . - c5 . d5 . e5 . f5 . g5 . . . e5 . . . c5 . d5 . e5 . . . d5 . . . b4 . . . g4 . a4 . b4 . d5 . . -";
  const d = drums(4);
  const stage = song(27, 0, [
    { inst: "bass", pan: 16, line: bass },
    { inst: "lead", pan: 6, line: lead },
    { inst: "arp", pan: 27, line: arp },
    { inst: "kick", pan: 16, line: d.kick },
    { inst: "snare", pan: 14, line: d.snare },
    { inst: "hat", pan: 26, line: d.hat },
  ]);
  const title = song(34, 0, [
    { inst: "bass", pan: 16, line: "a2 . . . . . . . a2 . . . . . . . f2 . . . . . . . f2 . . . . . . . c3 . . . . . . . c3 . . . . . . . g2 . . . . . . . g2 . . . e2 . . ." },
    { inst: "pad", pan: 6, line: "c5 . . . . . . . . . . . . . . . a4 . . . . . . . . . . . . . . . g4 . . . . . . . . . . . . . . . b4 . . . . . . . . . . . . . . ." },
    { inst: "lead", pan: 26, line: "a4 . . . c5 . e5 . a5 . . . g5 . e5 . f5 . . . . . e5 . c5 . . . a4 . . . g4 . . . c5 . e5 . g5 . . . e5 . c5 . d5 . . . . . b4 . g4 . . . . . . -" },
    { inst: "kick", pan: 16, line: rep("c4 . . . . . . . . . . . . . . .", 4) },
    { inst: "hat", pan: 26, line: rep(". . . . c4 . . . . . . . c4 . . .", 4) },
  ]);
  const clear = song(20, null, [
    { inst: "lead", pan: 12, line: "c5 . e5 . g5 . c6 . . . g5 . c6 . . . . . . . -" },
    { inst: "arp", pan: 20, line: "e4 . g4 . c5 . e5 . . . c5 . e5 . . . . . . . -" },
    { inst: "bass", pan: 16, line: "c3 . . . c3 . . . g2 . . . c3 . . . . . . . -" },
    { inst: "kick", pan: 16, line: "c4 . . . c4 . . . c4 . . . c4 . . ." },
  ]);
  const gameOver = song(40, null, [
    { inst: "lead", pan: 14, line: "e5 . d5 . c5 . b4 . a4 . . . . . . -" },
    { inst: "pad", pan: 18, line: "a3 . . . f3 . . . e3 . . . . . . -" },
    { inst: "bass", pan: 16, line: "a2 . . . f2 . . . e2 . . . a1 . . -" },
  ]);
  const cont = song(31, 0, [
    { inst: "bass", pan: 16, line: "a2 . - . a2 . - . a2 . - . g#2 . - ." },
    { inst: "arp", pan: 22, line: "a4 c5 e5 c5 a4 c5 e5 c5 a4 c5 e5 c5 g#4 b4 e5 b4" },
    { inst: "hat", pan: 20, line: "c4 . c4 . c4 . c4 . c4 . c4 . c4 . c4 ." },
  ]);
  const boss = song(24, 0, [
    { inst: "bass", pan: 16, line: rep("e2 e2 e3 e2 e2 e3 e2 e3", 2) + " " + rep("f2 f2 f3 f2 f2 f3 f2 f3", 2) },
    { inst: "lead", pan: 11, line: "e5 . . . g5 . . . f#5 . . . d#5 . . . f5 . . . a5 . . . g#5 . . . e5 . . -" },
    { inst: "kick", pan: 16, line: rep("c4 . c4 . c4 . c4 .", 4) },
    { inst: "snare", pan: 14, line: rep(". . c4 . . . c4 .", 4) },
  ]);
  return { title, stage, boss, continue: cont, "game-over": gameOver, select: title, "high-scores": title, clear };
}

/** The music slot each engine screen plays (the Menus tab; "none" for silence). */
export function screenSongs(project: Project): (string | null)[] {
  const menus = project.settings.menus as unknown as Record<string, { music?: string } | undefined>;
  const slot = (screen: string, d: string) => {
    const m = menus?.[screen]?.music ?? d;
    return m === "none" ? null : m;
  };
  const clear = project.settings.sound?.clear;
  return [slot("title", "title"), slot("hud", "stage"), clear && clear !== "none" ? clear : clear === "none" ? null : "clear", slot("continue", "continue"), slot("gameOver", "game-over")];
}

// ---------------------------------------------------------------- the ROM's data

export interface SoundPack {
  /** The QSound sample region (the 8 mb_q files back to back). */
  samples: Uint8Array;
  /** The Z80's view of the data at SOUND_DATA_ADDR. */
  data: Uint8Array;
  stats: { effects: number; instruments: number; songs: number; sampleBytes: number; dataBytes: number };
}

/** The bytes of the driver's data a game needs (packSound's data, without making the samples): at most SOUND_DATA_MAX. */
export function soundDataBytes(project: Project): number {
  const all = projectSongs(project);
  const entry = 12;
  let n = 16 + Object.keys(SFX).length * entry + INSTRUMENT_IDS.length * entry + 128 * 2;
  const bySlot = screenSongs(project).map((slot) => (slot ? (all[slot] ?? all.stage!) : null));
  n += bySlot.length * 2;
  for (const s of bySlot) if (s && s.rows.length) n += 16 + s.rows.length * s.pans.length * 2;
  return n;
}

/** Builds the samples and the driver's data for a game. */
export function packSound(project: Project, regionSize = 0x400000): SoundPack {
  const region = new Uint8Array(regionSize);
  let at = 0;
  // places a sample inside one 64 KB bank (the chip's addresses are 16-bit), one byte ahead of its start
  const place = (s: Sample): number[] => {
    const len = s.data.length + 1;
    if ((at & 0xffff) + len >= 0x10000) at = (at + 0xffff) & ~0xffff;
    if (at + len > regionSize) throw new Error("sound: the samples do not fit the QSound ROMs");
    const start = at;
    region.set(new Uint8Array(s.data.buffer, s.data.byteOffset, s.data.length), start + 1);
    at = start + len;
    const bank = start >> 16;
    const addr = start & 0xffff;
    const end = addr + len;
    return [bank, addr, end, s.loop, 0x1000, s.vol];
  };
  const fx = effects(project);
  const fxEntries = (Object.keys(SFX) as SfxId[]).sort((a, b) => SFX[a] - SFX[b]).map((k) => place(fx[k]));
  const instEntries = INSTRUMENT_IDS.map((k) => place(INSTRUMENTS[k]()));
  const all = projectSongs(project);
  const bySlot = screenSongs(project).map((slot) => (slot ? (all[slot] ?? all.stage!) : null));

  // the data, little-endian, at SOUND_DATA_ADDR
  const out: number[] = [];
  const u8 = (v: number) => out.push(v & 0xff);
  const u16 = (v: number) => {
    u8(v);
    u8(v >> 8);
  };
  const addr = () => SOUND_DATA_ADDR + out.length;
  const patch16 = (off: number, v: number) => {
    out[off] = v & 0xff;
    out[off + 1] = (v >> 8) & 0xff;
  };
  u8(0x51); // "Q"
  u8(0x53); // "S"
  u8(1);
  u8(0);
  u16(0); // 4: effects table
  u8(fxEntries.length); // 6
  u8(bySlot.length); // 7
  u16(0); // 8: song pointers
  u16(0); // 10: instruments
  u16(0); // 12: note pitches
  u16(0);
  const entry = (e: number[]) => {
    u8(e[0]!);
    u8(0);
    for (const v of e.slice(1)) u16(v);
  };
  patch16(4, addr());
  fxEntries.forEach(entry);
  patch16(10, addr());
  instEntries.forEach(entry);
  patch16(12, addr());
  for (let n = 0; n < 128; n++) u16(notePitch(n));
  patch16(8, addr());
  const ptrAt = out.length;
  for (let i = 0; i < bySlot.length; i++) u16(0);
  bySlot.forEach((s, i) => {
    if (!s || !s.rows.length) return;
    patch16(ptrAt + i * 2, addr());
    const chans = s.pans.length;
    const head = addr();
    u8(s.tempo);
    u8(chans);
    u16(s.rows.length);
    const loopAt = out.length;
    u16(0);
    u16(s.loop === null ? 0 : s.rows.length - s.loop);
    for (let c = 0; c < 8; c++) u8(s.pans[c] ?? 16);
    const rowsAt = head + 16;
    if (s.loop !== null) patch16(loopAt, rowsAt + s.loop * chans * 2);
    for (const row of s.rows) for (const [note, inst] of row) {
      u8(note);
      u8(inst);
    }
  });
  if (out.length > SOUND_DATA_MAX) throw new Error(`sound: ${out.length} bytes of data, at most ${SOUND_DATA_MAX}`);
  return {
    samples: region,
    data: Uint8Array.from(out),
    stats: { effects: fxEntries.length, instruments: instEntries.length, songs: bySlot.filter(Boolean).length, sampleBytes: at, dataBytes: out.length },
  };
}
