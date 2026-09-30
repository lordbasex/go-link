// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The games' sound: an 8-bit style chip made with the Web Audio API alone
// (square and triangle oscillators and a noise buffer, like the consoles
// of the 80s), no sound files. Each game has its own short music loop
// (original tunes) and every action has an effect. Browsers only start
// audio after a click or a key, so the chip unlocks on the first one.

import type { SfxEvent } from "./sfx";

/** A MIDI note number (60 = middle C), or 0 for a rest. */
type Note = number;

interface Track {
  bpm: number;
  /** Sixteenth notes; the loop is as long as the longest line. */
  lead: Note[];
  bass: Note[];
  /** k = kick, s = snare, h = hi-hat, "." = nothing. */
  drums: string;
  leadWave?: OscillatorType;
}

const hz = (n: Note) => 440 * 2 ** ((n - 69) / 12);

// Short helpers to write tunes: a note held for n sixteenths.
const hold = (n: Note, len: number): Note[] => [n, ...Array<Note>(len - 1).fill(-1)];
const line = (...parts: (Note | Note[])[]): Note[] => parts.flatMap((p) => (Array.isArray(p) ? p : [p]));

/** The music of each game (all original). -1 holds the previous note. */
const TRACKS: Record<string, Track> = {
  // Link: a calm, thinking tune in C major.
  link: {
    bpm: 96,
    lead: line(hold(72, 2), hold(76, 2), hold(79, 2), hold(76, 2), hold(74, 4), hold(71, 4), hold(72, 2), hold(74, 2), hold(76, 2), hold(79, 2), hold(77, 8), hold(76, 2), hold(74, 2), hold(72, 2), hold(71, 2), hold(69, 4), hold(71, 4), hold(72, 8), 0, 0, 0, 0, 0, 0, 0, 0),
    bass: line(hold(48, 8), hold(43, 8), hold(45, 8), hold(41, 8), hold(41, 8), hold(43, 8), hold(48, 8), hold(43, 8)),
    drums: "h...h...h...h...".repeat(4),
    leadWave: "triangle",
  },
  // Snake: bouncy and quick.
  snake: {
    bpm: 132,
    lead: line(76, 0, 79, 0, 81, 79, 76, 0, 74, 0, 76, 0, 72, 0, 0, 0, 76, 0, 79, 0, 84, 83, 81, 79, 81, 0, 79, 0, 76, 0, 0, 0),
    bass: line(48, 0, 55, 0, 48, 0, 55, 0, 45, 0, 52, 0, 45, 0, 52, 0, 41, 0, 48, 0, 41, 0, 48, 0, 43, 0, 50, 0, 43, 0, 47, 0),
    drums: "k.h.s.h.k.h.s.hh".repeat(2),
  },
  // Memory: a mysterious minor tune, slow enough to think.
  memory: {
    bpm: 104,
    lead: line(hold(69, 2), 72, 76, hold(74, 4), hold(72, 2), 71, 72, hold(69, 4), hold(64, 2), 67, 69, hold(71, 4), hold(72, 2), 71, 69, hold(68, 4)),
    bass: line(hold(45, 8), hold(41, 8), hold(43, 8), hold(40, 8)),
    drums: "k.......s.......".repeat(2),
    leadWave: "triangle",
  },
  // Paddle: an upbeat arcade loop.
  paddle: {
    bpm: 144,
    lead: line(79, 0, 79, 83, 86, 0, 83, 0, 81, 0, 81, 79, 78, 0, 74, 0, 76, 0, 76, 79, 83, 0, 79, 0, 81, 0, 79, 78, 79, 0, 0, 0),
    bass: line(43, 43, 0, 43, 50, 0, 43, 0, 38, 38, 0, 38, 45, 0, 38, 0, 40, 40, 0, 40, 47, 0, 40, 0, 38, 38, 0, 38, 43, 0, 43, 0),
    drums: "k.h.s.h.k.k.s.h.",
  },
  // Racer: a driving loop with a running bass.
  racer: {
    bpm: 156,
    lead: line(hold(81, 3), 79, hold(81, 2), 84, 0, hold(83, 4), hold(79, 4), hold(81, 3), 79, hold(76, 2), 74, 0, hold(76, 8)),
    bass: line(45, 57, 45, 57, 45, 57, 45, 57, 43, 55, 43, 55, 43, 55, 43, 55, 41, 53, 41, 53, 41, 53, 41, 53, 43, 55, 43, 55, 40, 52, 40, 52),
    drums: "k.hhs.hhk.hhs.hs".repeat(2),
  },
  // Special moves: a fighting-game style riff in E minor.
  moves: {
    bpm: 150,
    lead: line(64, 0, 64, 67, 0, 69, 0, 67, 64, 0, 71, 0, 69, 67, 69, 0, 64, 0, 64, 67, 0, 69, 0, 72, hold(71, 4), 69, 0, 67, 0),
    bass: line(40, 40, 52, 40, 40, 52, 40, 50, 40, 40, 52, 40, 43, 45, 47, 50, 40, 40, 52, 40, 40, 52, 40, 50, 36, 36, 48, 36, 38, 38, 50, 38),
    drums: "k.h.s.hkk.h.s.hs",
  },
};

export class ChipSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private track: Track | null = null;
  private step = 0;
  private nextAt = 0;
  private timer = 0;
  private engine: { osc: OscillatorNode; gain: GainNode } | null = null;
  muted = false;
  musicOn = true;

  /** Creates or resumes the audio after a click or a key (browsers require one). */
  unlock(): void {
    if (typeof window === "undefined" || !("AudioContext" in window)) return;
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.32 : 0;
      this.musicBus.connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.7;
      this.sfxBus.connect(this.master);
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.05);
  }

  /** Starts a game's music loop (or stops it with null). */
  play(id: string | null): void {
    this.track = id ? (TRACKS[id] ?? null) : null;
    this.step = 0;
    window.clearInterval(this.timer);
    if (!this.track) return;
    this.nextAt = 0;
    // A small scheduler: every 25 ms it books the notes of the next 120 ms.
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  close(): void {
    this.play(null);
    this.engineOff();
    void this.ctx?.close();
    this.ctx = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    const tr = this.track;
    if (!ctx || !tr || ctx.state !== "running" || !this.musicBus) return;
    const sixteenth = 60 / tr.bpm / 4;
    if (this.nextAt < ctx.currentTime) this.nextAt = ctx.currentTime + 0.05;
    const length = Math.max(tr.lead.length, tr.bass.length, tr.drums.length);
    while (this.nextAt < ctx.currentTime + 0.12) {
      const i = this.step % length;
      const at = this.nextAt;
      const lead = tr.lead[i % tr.lead.length] ?? 0;
      if (lead > 0) {
        const len = 1 + countHolds(tr.lead, i);
        this.tone(this.musicBus, tr.leadWave ?? "square", hz(lead), at, sixteenth * len * 0.92, 0.16);
      }
      const bass = tr.bass[i % tr.bass.length] ?? 0;
      if (bass > 0) {
        const len = 1 + countHolds(tr.bass, i);
        this.tone(this.musicBus, "triangle", hz(bass), at, sixteenth * len * 0.9, 0.3);
      }
      const drum = tr.drums[i % tr.drums.length];
      if (drum === "k") this.kick(this.musicBus, at);
      else if (drum === "s") this.hit(this.musicBus, at, 0.12, 1800, 0.22);
      else if (drum === "h") this.hit(this.musicBus, at, 0.03, 7000, 0.08);
      this.nextAt += sixteenth;
      this.step++;
    }
  }

  /** One note with a quick attack and a soft release. */
  private tone(bus: AudioNode, wave: OscillatorType, freq: number, at: number, dur: number, vol: number, slideTo?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.005);
    g.gain.setValueAtTime(vol, at + Math.max(0.006, dur - 0.03));
    g.gain.linearRampToValueAtTime(0, at + dur);
    osc.connect(g).connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /** A burst of filtered noise: snare, hat, crash, explosion. */
  private hit(bus: AudioNode, at: number, dur: number, cutoff: number, vol: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = cutoff > 4000 ? "highpass" : "bandpass";
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
  }

  private kick(bus: AudioNode, at: number): void {
    this.tone(bus, "sine", 150, at, 0.12, 0.5, 40);
  }

  /** Plays one game event. */
  fx(e: SfxEvent): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || ctx.state !== "running") return;
    const at = ctx.currentTime + 0.005;
    const seq = (notes: Note[], step: number, wave: OscillatorType = "square", vol = 0.22) =>
      notes.forEach((n, i) => n > 0 && this.tone(bus, wave, hz(n), at + i * step, step * 0.95, vol));
    switch (e) {
      case "move":
        this.tone(bus, "square", 880, at, 0.03, 0.08);
        break;
      case "turn":
        this.tone(bus, "square", 520, at, 0.05, 0.16, 780);
        break;
      case "eat":
        seq([84, 91], 0.05);
        break;
      case "clear":
        seq([72, 76, 79, 84, 88, 91, 96], 0.06, "square", 0.2);
        break;
      case "round":
        seq([79, 84], 0.07, "triangle", 0.3);
        break;
      case "over":
        seq([67, 63, 60, 55], 0.14, "square", 0.22);
        this.hit(bus, at + 0.5, 0.4, 300, 0.2);
        break;
      case "note1":
        this.tone(bus, "square", hz(64), at, 0.28, 0.2);
        break;
      case "note2":
        this.tone(bus, "square", hz(69), at, 0.28, 0.2);
        break;
      case "note3":
        this.tone(bus, "square", hz(73), at, 0.28, 0.2);
        break;
      case "note4":
        this.tone(bus, "square", hz(76), at, 0.28, 0.2);
        break;
      case "launch":
        this.tone(bus, "square", 300, at, 0.12, 0.18, 900);
        break;
      case "wall":
        this.tone(bus, "square", 330, at, 0.04, 0.12);
        break;
      case "paddle":
        this.tone(bus, "square", 520, at, 0.06, 0.2);
        break;
      case "brick":
        this.tone(bus, "square", 988, at, 0.05, 0.16);
        this.hit(bus, at, 0.06, 5000, 0.1);
        break;
      case "lose":
        this.tone(bus, "square", 440, at, 0.45, 0.2, 80);
        break;
      case "offroad":
        this.hit(bus, at, 0.25, 250, 0.35);
        break;
      case "finish":
        seq([72, 72, 72, 79, 0, 76, 79], 0.1, "square", 0.22);
        break;
      case "perfect":
        seq([84, 88, 91, 96], 0.045, "square", 0.22);
        this.hit(bus, at, 0.2, 6000, 0.12);
        break;
      case "great":
        seq([79, 84, 88], 0.05);
        break;
      case "good":
        seq([76, 79], 0.06);
        break;
      case "miss":
        this.tone(bus, "square", 180, at, 0.18, 0.18, 120);
        break;
    }
  }

  /** The racer's engine: a buzz whose pitch follows the speed (0-1); null stops it. */
  engineAt(speed: number | null): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== "running") return;
    if (speed === null) return this.engineOff();
    if (!this.engine) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      gain.gain.value = 0;
      osc.connect(gain).connect(this.sfxBus);
      osc.start();
      this.engine = { osc, gain };
    }
    const t = ctx.currentTime;
    this.engine.osc.frequency.setTargetAtTime(45 + speed * 120, t, 0.05);
    this.engine.gain.gain.setTargetAtTime(speed > 0.01 ? 0.05 + speed * 0.05 : 0, t, 0.08);
  }

  private engineOff(): void {
    if (!this.engine) return;
    try {
      this.engine.osc.stop();
    } catch {
      // already stopped
    }
    this.engine = null;
  }
}

/** How many sixteenths a note at `i` is held for (the -1 marks after it). */
function countHolds(notes: readonly Note[], i: number): number {
  let n = 0;
  for (let k = i + 1; k < notes.length && notes[k] === -1; k++) n++;
  return n;
}
