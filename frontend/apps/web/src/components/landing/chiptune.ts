// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { setAudioSession } from "./audioSession";

// The landing page's music: an original 8-bit loop made with Web Audio
// (square and triangle waves and a noise drum, no audio files, no known
// tune) plus a hit sound on every blow of the fight animation. Quiet on
// purpose, and only on that page.

const TEMPO = 132; // beats per minute
const STEP = 60 / TEMPO / 2; // eighth notes, in seconds
const LOOP_STEPS = 32;
const VOLUME = 0.07;
// The fight animation lasts 6 s and lands its blows at these moments
// (lp-spark* keyframes in global.css).
const FIGHT_LOOP = 6;
const HITS = [1.26, 3.54, 4.92];

// MIDI notes of a four bar loop in A minor (0 = rest).
const LEAD = [
  69, 0, 72, 76, 0, 74, 72, 0, 71, 0, 72, 74, 0, 72, 71, 67,
  69, 0, 72, 76, 0, 79, 77, 76, 74, 0, 72, 71, 0, 71, 72, 0,
];
const BASS = [45, 45, 57, 45, 41, 41, 53, 41, 43, 43, 55, 43, 40, 40, 52, 40];

const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

export class Chiptune {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private step = 0;
  private nextAt = 0;
  private nextHit = 0;
  private hitIndex = 0;

  /**
   * @param fightStart performance.now() when the fight animation started,
   *   so the hits land with the sparks.
   */
  constructor(private readonly fightStart: number) {}

  /** Starts (or resumes) the music. Needs a tap or key first in most browsers. */
  async play(): Promise<boolean> {
    setAudioSession("playback");
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.out = this.ctx.createGain();
      this.out.gain.value = VOLUME;
      this.out.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate / 4, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const ctx = this.ctx;
    try {
      await ctx.resume();
    } catch {
      return false;
    }
    // The page may have closed the music while the browser was resuming it.
    if (this.ctx !== ctx || ctx.state !== "running") return false;
    if (!this.timer) {
      this.nextAt = ctx.currentTime + 0.05;
      this.syncHits();
      this.timer = window.setInterval(() => this.schedule(), 50);
    }
    return true;
  }

  /** Silences it (the page stays, the music can start again). */
  pause(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    void this.ctx?.suspend().catch(() => undefined);
    setAudioSession("auto");
  }

  /** Stops for good (leaving the page). */
  close(): void {
    this.pause();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  /** Finds the next blow of the animation, in the audio clock. */
  private syncHits() {
    if (!this.ctx) return;
    const elapsed = ((performance.now() - this.fightStart) / 1000) % FIGHT_LOOP;
    const loopStart = this.ctx.currentTime - elapsed;
    this.hitIndex = HITS.findIndex((h) => h > elapsed);
    if (this.hitIndex < 0) {
      this.hitIndex = 0;
      this.nextHit = loopStart + FIGHT_LOOP + HITS[0]!;
    } else {
      this.nextHit = loopStart + HITS[this.hitIndex]!;
    }
  }

  /** Schedules the notes of the next few tenths of a second. */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const horizon = ctx.currentTime + 0.25;
    while (this.nextAt < horizon) {
      const i = this.step % LOOP_STEPS;
      const lead = LEAD[i]!;
      if (lead) this.tone("square", hz(lead), this.nextAt, STEP * 0.9, 0.5);
      if (i % 2 === 0) this.tone("triangle", hz(BASS[(i / 2) % BASS.length]!), this.nextAt, STEP * 1.8, 0.9);
      if (i % 4 === 2) this.drum(this.nextAt, 0.05, 6000, 0.35); // hi-hat
      if (i % 8 === 0) this.drum(this.nextAt, 0.12, 900, 0.6); // kick
      this.nextAt += STEP;
      this.step++;
    }
    while (this.nextHit < horizon) {
      this.hit(Math.max(this.nextHit, ctx.currentTime));
      const prev = HITS[this.hitIndex]!;
      this.hitIndex = (this.hitIndex + 1) % HITS.length;
      const next = HITS[this.hitIndex]!;
      this.nextHit += next > prev ? next - prev : FIGHT_LOOP - prev + next;
    }
  }

  private tone(type: OscillatorType, freq: number, at: number, length: number, level: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(level, at);
    env.gain.exponentialRampToValueAtTime(0.001, at + length);
    osc.connect(env).connect(this.out!);
    osc.start(at);
    osc.stop(at + length + 0.02);
  }

  private drum(at: number, length: number, cutoff: number, level: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = cutoff > 2000 ? "highpass" : "lowpass";
    filter.frequency.value = cutoff;
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, at);
    env.gain.exponentialRampToValueAtTime(0.001, at + length);
    src.connect(filter).connect(env).connect(this.out!);
    src.start(at);
    src.stop(at + length + 0.02);
  }

  /** A blow: a burst of noise and a falling square wave. */
  private hit(at: number) {
    this.drum(at, 0.18, 1800, 1.4);
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(420, at);
    osc.frequency.exponentialRampToValueAtTime(60, at + 0.16);
    env.gain.setValueAtTime(0.9, at);
    env.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
    osc.connect(env).connect(this.out!);
    osc.start(at);
    osc.stop(at + 0.2);
  }
}
