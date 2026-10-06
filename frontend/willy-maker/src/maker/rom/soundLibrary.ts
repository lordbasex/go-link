// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Ready-made sound for a game to take and change (the Game tab's Sound
// card): effect recipes and songs, as plain data in the project's own form
// (model/sound.ts), so a game that takes one keeps it even if this library
// changes. The tango pack opens with La Cumparsita (its tune, from ABC);
// its own songs are in D minor with the tango's 3-3-2 accent in the
// bass, a bandoneon on the tune, piano stabs on the beat and a violin over
// the second half; its ending is the tango's "chan-chan".

import type { OwnEffect, OwnSong } from "../model";
import { abcToSong } from "./abc";

// ---------------------------------------------------------------- effects

export const EFFECT_PRESETS: Record<string, OwnEffect> = {
  revolver: {
    volume: 90,
    layers: [
      { kind: "noise", from: 1, to: 0.15, seconds: 0.16, decay: 7 },
      { kind: "tone", wave: "square", from: 320, to: 70, seconds: 0.14, decay: 7, noise: 0.3 },
    ],
  },
  laser: { volume: 70, layers: [{ kind: "tone", wave: "square", from: 1800, to: 220, seconds: 0.14, decay: 5 }] },
  robotDown: {
    volume: 95,
    layers: [
      { kind: "tone", wave: "saw", from: 900, to: 45, seconds: 0.55, decay: 3, noise: 0.25 },
      { kind: "noise", from: 0.8, to: 0.04, seconds: 0.6, decay: 4 },
      { kind: "notes", wave: "square", notes: "a4 f4 d4", step: 0.07, last: 0.2, decay: 4 },
    ],
  },
  clang: {
    volume: 85,
    layers: [
      { kind: "tone", wave: "square", from: 1400, to: 1300, seconds: 0.12, decay: 9 },
      { kind: "noise", from: 0.9, to: 0.3, seconds: 0.06, decay: 8 },
    ],
  },
  bravo: { volume: 75, layers: [{ kind: "notes", wave: "saw", notes: "d5 f#5 a5 d6", step: 0.08, last: 0.35, decay: 2 }] },
  chanChan: {
    volume: 80,
    layers: [
      { kind: "notes", wave: "saw", notes: "a4 d5", step: 0.12, last: 0.25, decay: 3 },
      { kind: "notes", wave: "square", notes: "c#5 f5", step: 0.12, last: 0.25, decay: 3 },
    ],
  },
  mateSip: { volume: 70, layers: [{ kind: "notes", wave: "tri", notes: "a5 d6 f6", step: 0.05, last: 0.14, decay: 2 }] },
  ay: { volume: 85, layers: [{ kind: "notes", wave: "square", notes: "a4 f4 d4", step: 0.09, last: 0.22, decay: 3 }] },
  hop: { volume: 60, layers: [{ kind: "tone", wave: "tri", from: 260, to: 700, seconds: 0.15, decay: 3 }] },
  boom: {
    volume: 100,
    layers: [
      { kind: "noise", from: 0.9, to: 0.02, seconds: 0.9, decay: 3 },
      { kind: "tone", wave: "sine", from: 120, to: 35, seconds: 0.6, decay: 3 },
    ],
  },
};
export type EffectPresetId = keyof typeof EFFECT_PRESETS;

/** The tango pack's effects for each of the engine's events (rom/sound.ts SFX). */
export const TANGO_EFFECTS: Record<string, EffectPresetId> = {
  shot: "revolver",
  hit: "clang",
  enemyDown: "robotDown",
  hurt: "ay",
  rescue: "bravo",
  pickup: "mateSip",
  jump: "hop",
  explosion: "boom",
  start: "chanChan",
};

// ---------------------------------------------------------------- songs

/**
 * La Cumparsita (Gerardo Hernán Matos Rodríguez, 1916), the tune only: in the public domain; its
 * lyrics are not used. The notes follow John Chambers' ABC transcription (abcnotation.com), its
 * three parts once each with the third part's repeat, ending on the last chord.
 */
export const CUMPARSITA_ABC = `X: 1
T: La Cumparsita
C: G. H. Matos Rodríguez (1916)
R: tango
M: 4/4
L: 1/8
K: Am
E/E/ | "E7".E2.d2 .B2.^G2 | zEFE ^D2EE/E/ | "Am".E2.e2 .c2.A2 | zEFE ^D2EE/E/ | "E7".E2.d2 .B2.^G2 | zEFE ^D2EE/E/ | "Am".E2.e2 .c2.A2 | zEFE ^D2E2 |
| "Dm"=D2A2 ^G2A2 | zEFE F2^G2 | "Am"E3D/_D/ C4 | z^DED E2F2 | "E7"D3_D/C/ B,4 | zDCB, A,2^G,2 | "Am"A,3F "E7"EDCB, | "Am"A,3^G- Az3 |
| "Am"ABcz zABc | (3BcB A6 | "Am"z[ac][ac][gc] [gc][fc][fc][ec] | "E7"[e4B4] [d4B4] | z[bd][bd][ac] [ac][^gB][g2B] | z[fA][fA][e^G] [e4G] | "E7"z[dF][d2F] z[c2E][BD] | "Am"[A2C] [e6A] |
| "Am"ABcz zABc | (3BcB A6 | z[ac][ac][gB] "A7"[gB][fA][fA][eG] | "Dm"[d8F8] | df-fa a^ga2 | "Am"ce-ea a^ga2 | "E7"zeb^g ed-d^G | "Am"A2ze az3 |
|: "Am"A^GAB z[c2A2E2][B^GD] | [A2C2]E2 .a2.e2 | "Dm"[fd][e^c][fd][ge] [a3f][fd] | "Am"[e2c][c2A] .[e'2a].[c'2e2] :|
| "Am"z2[e2c] [f3d][ec] | "E7"[d3c][dB] [dB][fd][e2c] | "E7"z2[d2B] [e3c][dB] | "Am"[d3B][cA] [cA][ec][d2B] | z2[c2E] [d3F][cE] | "E7"[c3E][BD] [BD][dF][c2E] | z2[B2D] [A3C][^GB,] | "Am"[A2C]ze [aecA]z z2 |]
`;


type Chord = "Dm" | "A7" | "Gm" | "E7";
/** Root and fifth for the bass (low), and two chord tones for the stabs. */
const CHORDS: Record<Chord, { root: string; fifth: string; up: string; tones: [string, string] }> = {
  Dm: { root: "d3", fifth: "a2", up: "d3", tones: ["f4", "a4"] },
  A7: { root: "a2", fifth: "e3", up: "a2", tones: ["c#4", "g4"] },
  Gm: { root: "g2", fifth: "d3", up: "g3", tones: ["a#3", "d4"] },
  E7: { root: "e2", fifth: "b2", up: "e3", tones: ["d4", "g#4"] },
};
const bars = (list: Chord[], f: (c: Chord, i: number) => string) => list.map(f).join("  ");

/** The tango's 3-3-2 in sixteenths: accents on rows 0, 6 and 12 of a bar. */
const bass332 = (c: Chord) => `${CHORDS[c].root} . . . . . ${CHORDS[c].fifth} . . . . . ${CHORDS[c].up} . . .`;
/** A chord tone on each beat, short (the "marcato"). */
const stab = (c: Chord, k: 0 | 1) => {
  const n = CHORDS[c].tones[k];
  return `${n} . - . ${n} . - . ${n} . - . ${n} . - .`;
};
const kick332 = "c4 . . . . . c4 . . . . . c4 . . .";
const hat8 = ". . c4 . . . c4 . . . c4 . . . c4 .";

const TITLE_CHORDS: Chord[] = ["Dm", "A7", "A7", "Dm", "Gm", "Dm", "A7", "Dm"];
const TITLE_TUNE = [
  "a4 . . . d5 . . . f5 . e5 . d5 . . .",
  "c#5 . . . e5 . . . g5 . f5 . e5 . . .",
  "a5 . . . g5 . f5 . e5 . . . c#5 . . .",
  "d5 . . . . . . . - . a4 . d5 . f5 .",
  "g5 . . . a#5 . . . d6 . c6 . a#5 . . .",
  "a5 . . . f5 . . . d5 . e5 . f5 . . .",
  "e5 . . . g5 . . . c#5 . . . e5 . a4 .",
  "d5 . . . . . . . - . . . . . . .",
].join("  ");
/** The violin comes in over the second half, long notes over the tune. */
const TITLE_VIOLIN = [rest(16), rest(16), rest(16), rest(16), "d6 . . . . . . . . . . . . . . .", "a5 . . . . . . . . . . . . . . .", "c#6 . . . . . . . g5 . . . . . . .", "f5 . . . . . . . . . . . - . . ."].join("  ");
function rest(n: number) {
  return Array.from({ length: n }, () => ".").join(" ");
}

/** The stage's tune: the title's, an octave of variation and a run in the last bar to loop on. */
const STAGE_TUNE = [
  "d5 . f5 . a5 . . . g5 . f5 . e5 . d5 .",
  "c#5 . e5 . a5 . . . g5 . . . e5 . . .",
  "f5 . e5 . d5 . c#5 . d5 . e5 . f5 . g5 .",
  "a5 . . . . . d5 . . . . . f5 . . .",
  "a#5 . a5 . g5 . . . d5 . . . g5 . . .",
  "f5 . e5 . d5 . . . a4 . . . d5 . . .",
  "e5 . f5 . g5 . a5 . a#5 . a5 . g5 . e5 .",
  "d5 . . . . . a4 . . . . . d5 e5 f5 g5",
].join("  ");

/** The tango pack: La Cumparsita for the title, songs for the level, the level clear, continue and game over, and one more tango. */
export function tangoSongs(): OwnSong[] {
  const title: OwnSong = {
    id: "tango-title",
    name: "Puerto Madero Tango",
    tempo: 34,
    loop: 0,
    channels: [
      { inst: "bandoneon", pan: 12, line: TITLE_TUNE },
      { inst: "pizz", pan: 16, line: bars(TITLE_CHORDS, bass332) },
      { inst: "piano", pan: 22, line: bars(TITLE_CHORDS, (c) => stab(c, 0)) },
      { inst: "piano", pan: 24, line: bars(TITLE_CHORDS, (c) => stab(c, 1)) },
      { inst: "violin", pan: 8, line: TITLE_VIOLIN },
    ],
  };
  const stage: OwnSong = {
    id: "tango-stage",
    name: "Dockside Milonga",
    tempo: 26,
    loop: 0,
    channels: [
      { inst: "bandoneon", pan: 11, line: STAGE_TUNE },
      { inst: "bass", pan: 16, line: bars(TITLE_CHORDS, bass332) },
      { inst: "piano", pan: 22, line: bars(TITLE_CHORDS, (c) => stab(c, 0)) },
      { inst: "piano", pan: 24, line: bars(TITLE_CHORDS, (c) => stab(c, 1)) },
      { inst: "kick", pan: 16, line: bars(TITLE_CHORDS, () => kick332) },
      { inst: "hat", pan: 26, line: bars(TITLE_CHORDS, () => hat8) },
    ],
  };
  const clear: OwnSong = {
    id: "tango-clear",
    name: "Chan-chan!",
    tempo: 26,
    loop: null,
    channels: [
      { inst: "bandoneon", pan: 12, line: "d4 f4 a4 d5 f5 a5 d6 . . . . . - . . .  . . . . . . . ." },
      { inst: "piano", pan: 20, line: ". . . . . . . . . . . . . . . .  c#5 . . - . . d5 . . . . -" },
      { inst: "piano", pan: 22, line: ". . . . . . . . . . . . . . . .  g4 . . - . . f4 . . . . -" },
      { inst: "pizz", pan: 16, line: "d3 . . . . . a2 . . . . . d3 . . .  a2 . . - . . d2 . . . . -" },
    ],
  };
  const cont: OwnSong = {
    id: "tango-continue",
    name: "Waiting",
    tempo: 31,
    loop: 0,
    channels: [
      { inst: "bandoneon", pan: 12, line: "e5 g5 e5 g5 e5 g5 e5 g5 e5 g5 e5 g5 e5 g5 e5 g5  f5 a5 f5 a5 f5 a5 f5 a5 f5 a5 f5 a5 f5 a5 f5 a5" },
      { inst: "pizz", pan: 16, line: `${bass332("A7")}  ${bass332("Dm")}` },
    ],
  };
  const over: OwnSong = {
    id: "tango-over",
    name: "Farewell",
    tempo: 40,
    loop: null,
    channels: [
      { inst: "bandoneon", pan: 12, line: "d5 . c#5 . d5 . a4 . f4 . e4 . d4 . . .  . . . . . . . . - . . ." },
      { inst: "violin", pan: 20, line: "f4 . . . . . . . e4 . . . . . . .  d4 . . . . . . . - . . ." },
      { inst: "piano", pan: 22, line: ". . . . . . . . . . . . . . . .  c#4 . . - . . d4 . . . . -" },
      { inst: "pizz", pan: 16, line: "d3 . . . . . a2 . . . . . d3 . . .  a2 . . - . . d2 . . . . -" },
    ],
  };
  const cumparsita = abcToSong(CUMPARSITA_ABC, { id: "la-cumparsita", name: "La Cumparsita", tempo: 30, loop: true });
  return [cumparsita, title, stage, clear, cont, over];
}

/** Where the tango pack's songs go: the menu screens' music slots and the level clear. */
export const TANGO_SCREENS = { title: "la-cumparsita", hud: "tango-stage", clear: "tango-clear", continue: "tango-continue", gameOver: "tango-over" } as const;
