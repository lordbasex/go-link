// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A tune in ABC notation (abcnotation.com's text form of sheet music) as one
// of the game's own songs: its tune on one channel, the lower notes of its
// chords on a second, and from its chord names ("Am", "E7") a bass and two
// piano stabs on the beat. A row is a sixteenth note. It reads what most
// folk and tango tunes use: the header's L: M: K: (major and minor keys),
// notes with accidentals, octaves, lengths, ties, rests, staccato dots,
// triplets, chords in brackets and |: :| repeats; anything else is skipped.

import type { OwnSong, SongChannel } from "../model";

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_NAMES = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
const noteName = (m: number) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

/** The sharps (+1) and flats (-1) of a key, by letter. */
function keySignature(k: string): Record<string, number> {
  const m = /^([A-G])([#b]?)(m|min|maj|dor|mix)?/i.exec(k.trim());
  if (!m) return {};
  const minor = /^m(in)?$/i.test(m[3] ?? "");
  // the key's place on the circle of fifths: C major / A minor is 0
  const fifths: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
  const tonic = m[1]!.toUpperCase() + (m[2] ?? "");
  const n = (fifths[tonic] ?? 0) - (minor ? 3 : 0);
  const out: Record<string, number> = {};
  const sharps = "FCGDAEB";
  const flats = "BEADGCF";
  for (let i = 0; i < Math.abs(n) && i < 7; i++) out[n > 0 ? sharps[i]! : flats[i]!] = n > 0 ? 1 : -1;
  return out;
}

interface AbcEvent {
  rows: number;
  /** MIDI notes, highest first; null is a rest. */
  notes: number[] | null;
  chord: string | null;
  tie: boolean;
  staccato: boolean;
}

/** The chord name's bass notes (root, fifth, root an octave up) and two stab notes, as MIDI numbers. */
function chordNotes(name: string): { bass: [number, number, number]; stab: [number, number] } | null {
  const m = /^([A-G])([#b]?)(m(?!aj))?(7)?/.exec(name.trim());
  if (!m) return null;
  const root = STEPS[m[1]!]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  const third = m[3] ? 3 : 4;
  const low = 40 + ((root - 4 + 12) % 12); // E2..D#3
  const stabBase = 60 + root;
  const thirdNote = ((stabBase + third - 60) % 12) + 60;
  const top = m[4] ? ((stabBase + 10 - 60) % 12) + 60 : ((stabBase + 7 - 60) % 12) + 60;
  const [a, b] = thirdNote < top ? [thirdNote, top] : [thirdNote, top + 12];
  return { bass: [low, low + 7 > 52 ? low - 5 : low + 7, low + 12], stab: [a, b] };
}

/** Reads the body of an ABC tune into its bars of events. */
function parse(abc: string): { bars: AbcEvent[][]; barRows: number } {
  let unit = 2; // rows per unit note: L:1/8
  let barRows = 16;
  let key: Record<string, number> = {};
  const body: string[] = [];
  for (const line of abc.split(/\r?\n/)) {
    const h = /^([A-Za-z]):\s*(.*)$/.exec(line.trim());
    if (h) {
      const [, f, v] = h;
      if (f === "L") {
        const [a, b] = v!.split("/").map(Number);
        if (a && b) unit = (16 * a) / b;
      } else if (f === "M") {
        const [a, b] = v!.split("/").map(Number);
        if (a && b) barRows = (16 * a) / b;
        else if (/^C\|?$/.test(v!.trim())) barRows = 16;
      } else if (f === "K") key = keySignature(v!);
      continue;
    }
    if (line.trim().startsWith("%")) continue;
    body.push(line.replace(/%.*$/, ""));
  }
  const text = body.join(" ").replace(/\\/g, " ");
  const tokens = /"([^"]*)"|(\(3)|(\[(?:[_^=]?[A-Ga-g][,']*\d*\/*)+\]|[_^=]?[A-Ga-gzx][,']*)(\d*)(\/*)(-?)|(:\|\]?|\|:|\|\]|\|\||\||\[\d)|(\.)/g;
  const noteRe = /([_^=]?)([A-Ga-g])([,']*)(\d*)/g;
  const bars: AbcEvent[][] = [];
  let cur: AbcEvent[] = [];
  let accidentals: Record<string, number> = {};
  let chord: string | null = null;
  let triplet = 0;
  let staccato = false;
  let repeatFrom = 0;
  const pitch = (acc: string, letter: string, octs: string) => {
    const L = letter.toUpperCase();
    const tag = `${letter}${octs}`;
    if (acc) accidentals[tag] = acc === "^" ? 1 : acc === "_" ? -1 : 0;
    const shift = tag in accidentals ? accidentals[tag]! : (key[L] ?? 0);
    return 60 + STEPS[L]! + (letter === L ? 0 : 12) + 12 * ((octs.match(/'/g)?.length ?? 0) - (octs.match(/,/g)?.length ?? 0)) + shift;
  };
  const endBar = () => {
    if (cur.length) bars.push(cur);
    cur = [];
    accidentals = {};
  };
  for (const m of text.matchAll(tokens)) {
    if (m[1] !== undefined) {
      chord = m[1];
      continue;
    }
    if (m[2]) {
      triplet = 3;
      continue;
    }
    if (m[8]) {
      staccato = true;
      continue;
    }
    if (m[7]) {
      const bar = m[7];
      endBar();
      if (bar === "|:") repeatFrom = bars.length;
      else if (bar.startsWith(":|")) {
        bars.push(...bars.slice(repeatFrom).map((b) => b.map((e) => ({ ...e }))));
        repeatFrom = bars.length;
      }
      continue;
    }
    const [, , , item, num, slash, tie] = m;
    let notes: number[] | null = null;
    let units = num ? Number(num) : 1;
    if (item!.startsWith("[")) {
      notes = [];
      let first: number | null = null;
      for (const n of item!.slice(1, -1).matchAll(noteRe)) {
        notes.push(pitch(n[1]!, n[2]!, n[3]!));
        if (first === null) first = n[4] ? Number(n[4]) : 1;
      }
      units = num ? Number(num) : (first ?? 1);
      notes.sort((a, b) => b - a);
    } else if (item![0] !== "z" && item![0] !== "x") {
      const n = /([_^=]?)([A-Ga-g])([,']*)/.exec(item!)!;
      notes = [pitch(n[1]!, n[2]!, n[3]!)];
    }
    let rows = units * unit;
    if (slash) rows /= 2 ** slash.length;
    if (triplet) {
      // three in the time of two: the last one takes what the others leave
      const total = rows * 2;
      const each = Math.max(1, Math.floor(total / 3));
      rows = triplet === 1 ? total - 2 * each : each;
      triplet--;
    }
    cur.push({ rows: Math.max(1, Math.round(rows)), notes, chord, tie: tie === "-", staccato });
    chord = null;
    staccato = false;
  }
  endBar();
  return { bars, barRows };
}

export interface AbcOptions {
  id: string;
  name?: string;
  tempo?: number;
  /** Instruments for the tune, the second voice, the bass and the stabs. */
  tune?: string;
  second?: string;
  bass?: string;
  stabs?: string;
  /** Loop to the start (after the pickup) instead of playing once. */
  loop?: boolean;
  /** The tango's touches (on by default): the violin holds the chord where the tune has no second voice, the bass drags into a new chord, and the end is a "chan-chan". */
  tango?: boolean;
}

/** An ABC tune as a song of the game's own; throws when it has no notes. */
export function abcToSong(abc: string, o: AbcOptions): OwnSong {
  const { bars, barRows } = parse(abc);
  const tango = o.tango !== false;
  if (!bars.some((b) => b.some((e) => e.notes))) throw new Error("no notes");
  const tune: string[] = [];
  const second: string[] = [];
  const bass: string[] = [];
  const stab1: string[] = [];
  const stab2: string[] = [];
  let lastChord: string | null = null;
  let pickup = 0;
  // a tie holds its note over the bar line too
  let prevTop: number | null = null;
  let prevTie = false;
  bars.forEach((bar, bi) => {
    const len = bar.reduce((n, e) => n + e.rows, 0);
    const chordAt: (string | null)[] = [];
    let pos = 0;
    for (const e of bar) {
      if (e.chord && chordNotes(e.chord)) lastChord = e.chord;
      for (let r = 0; r < e.rows; r++) chordAt[pos + r] = lastChord;
      const hold = Array(Math.max(0, e.rows - 1)).fill(".");
      if (!e.notes) {
        tune.push("-", ...hold);
        second.push("-", ...hold);
      } else {
        const top = e.notes[0]!;
        const half = Math.max(1, e.rows >> 1);
        const short = (n: number) => (e.staccato && e.rows >= 2 ? [noteName(n), ...Array(half - 1).fill("."), "-", ...Array(e.rows - half - 1).fill(".")] : [noteName(n), ...hold]);
        tune.push(...(prevTie && prevTop === top ? Array(e.rows).fill(".") : short(top)));
        second.push(...(e.notes.length > 1 ? short(e.notes[e.notes.length - 1]!) : ["-", ...hold]));
        prevTop = top;
      }
      prevTie = e.tie;
      pos += e.rows;
    }
    // a first bar shorter than the others is the pickup: no accompaniment under it
    const full = bi > 0 || len >= barRows;
    if (bi === 0 && !full) pickup = len;
    // the violin's pad: where the bar's second voice only rests, the chord's third held for each chord
    if (tango && full) {
      const start = second.length - len;
      const quiet = second.slice(start).every((x) => x === "-" || x === ".");
      if (quiet)
        for (let r = 0; r < len; r++) {
          const c = chordNotes(chordAt[r] ?? "");
          const changed = r === 0 || chordAt[r] !== chordAt[r - 1];
          second[start + r] = c && changed ? noteName(c.stab[0] + 12) : ".";
        }
    }
    const nextChord = bars[bi + 1]?.find((e) => e.chord && chordNotes(e.chord))?.chord ?? null;
    for (let r = 0; r < len; r++) {
      const c = full ? chordNotes(chordAt[r] ?? "") : null;
      const beat = r % (barRows / 4 || 4);
      // the "arrastre": the last sixteenth drags a semitone below the next chord's root
      const next = tango && r === len - 1 && nextChord && nextChord !== chordAt[r] ? chordNotes(nextChord) : null;
      bass.push(next ? noteName(next.bass[0] - 1) : c && (r === 0 || r === 6 || r === 12) ? noteName(c.bass[r === 0 ? 0 : r === 6 ? 1 : 2]) : ".");
      stab1.push(c ? (beat === 0 ? noteName(c.stab[0]) : beat === 2 ? "-" : ".") : ".");
      stab2.push(c ? (beat === 0 ? noteName(c.stab[1]) : beat === 2 ? "-" : ".") : ".");
    }
  });
  if (tango && lastChord) {
    // "chan-chan": the dominant, a breath, the tonic, then silence (all five channels together)
    const tonic = chordNotes(lastChord)!;
    const roots = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const dominant = chordNotes(`${roots[(tonic.bass[0] + 7) % 12]}7`) ?? tonic;
    const hit = (n: number) => [noteName(n), ".", "-", ".", ".", "."];
    tune.push(...hit(dominant.stab[1] + 12), ...hit(tonic.stab[1] + 12), ".", ".", ".", ".");
    second.push(...hit(dominant.stab[0] + 12), ...hit(tonic.stab[0] + 12), ".", ".", ".", ".");
    bass.push(...hit(dominant.bass[0]), ...hit(tonic.bass[0]), ".", ".", ".", ".");
    stab1.push(...hit(dominant.stab[0]), ...hit(tonic.stab[0]), ".", ".", ".", ".");
    stab2.push(...hit(dominant.stab[1]), ...hit(tonic.stab[1]), ".", ".", ".", ".");
  }
  const channels: SongChannel[] = [
    { inst: o.tune ?? "bandoneon", pan: 12, line: tune.join(" ") },
    { inst: o.second ?? "violin", pan: 20, line: second.join(" ") },
    { inst: o.bass ?? "pizz", pan: 16, line: bass.join(" ") },
    { inst: o.stabs ?? "piano", pan: 22, line: stab1.join(" ") },
    { inst: o.stabs ?? "piano", pan: 24, line: stab2.join(" ") },
  ];
  return { id: o.id, name: o.name ?? o.id, tempo: o.tempo ?? 30, loop: o.loop ? pickup : null, channels };
}
