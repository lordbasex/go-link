// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The mission's sound, made with the Web Audio API alone like an 8-bit chip:
// an alarm siren, an action loop, and a sound for every weapon, break and
// rescue. No sound files. Browsers start audio only after a click or a key;
// the devil button's click is that gesture.

export type Sfx = "gun" | "knife" | "launch" | "explode" | "break" | "crack" | "thud" | "jump" | "double" | "jet" | "timeout" | "freed" | "foeShot" | "warn" | "foeHit" | "foeDown" | "hurt" | "lifeLost" | "pickup" | "alert" | "rescue" | "complete" | "click";

/** A MIDI note (60 = middle C), 0 = rest, -1 = hold the previous note. */
type Note = number;
const hz = (n: Note) => 440 * 2 ** ((n - 69) / 12);

// An original action loop in D minor: driving bass, a stabbing lead.
const BPM = 150;
const LEAD: Note[] = [74, 0, 74, 77, 0, 74, 0, 72, 74, 0, 0, 69, 0, 72, 74, 0, 74, 0, 74, 77, 0, 79, 0, 77, 76, -1, 74, 0, 72, 0, 69, 0];
const BASS: Note[] = [38, 38, 50, 38, 38, 50, 38, 48, 38, 38, 50, 38, 36, 36, 48, 36, 34, 34, 46, 34, 34, 46, 34, 45, 33, 33, 45, 33, 36, 36, 48, 36];
const DRUMS = "k.h.s.hkk.h.s.hsk.h.s.hkk.hhs.ss";

export class DestroySound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private fx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private step = 0;
  private nextAt = 0;
  private siren: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  muted = false;
  private sirenTimer = 0;
  /** The loop plays faster when time is short. */
  fast = false;

  /** Creates or resumes the audio (call from a click or key). */
  unlock(): void {
    if (typeof window === "undefined" || !("AudioContext" in window)) return;
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(ctx.destination);
      this.music = ctx.createGain();
      this.music.gain.value = 0.26;
      this.music.connect(this.master);
      this.fx = ctx.createGain();
      this.fx.gain.value = 0.7;
      this.fx.connect(this.master);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.03);
  }

  /** The alarm: a two-tone siren for `seconds` (two or three wails), or until stopped. */
  alarm(on: boolean, seconds = 2.5): void {
    window.clearTimeout(this.sirenTimer);
    if (on && seconds > 0) this.sirenTimer = window.setTimeout(() => this.alarm(false), seconds * 1000);
    const ctx = this.ctx;
    if (!ctx || !this.fx) return;
    if (!on) {
      if (this.siren) {
        const s = this.siren;
        s.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        window.setTimeout(() => {
          s.osc.stop();
          s.lfo.stop();
        }, 300);
        this.siren = null;
      }
      return;
    }
    if (this.siren) return;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 700;
    const lfo = ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 1.6;
    const depth = ctx.createGain();
    depth.gain.value = 180;
    lfo.connect(depth).connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0.07;
    osc.connect(gain).connect(this.fx);
    osc.start();
    lfo.start();
    this.siren = { osc, lfo, gain };
  }

  /** The action loop (null stops it). */
  playMusic(on: boolean): void {
    window.clearInterval(this.timer);
    if (!on) return;
    this.step = 0;
    this.nextAt = 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  close(): void {
    this.playMusic(false);
    this.alarm(false);
    const ctx = this.ctx;
    this.ctx = null;
    window.setTimeout(() => void ctx?.close(), 400);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.music || ctx.state !== "running") return;
    const sixteenth = 60 / (this.fast ? BPM * 1.3 : BPM) / 4;
    if (this.nextAt < ctx.currentTime) this.nextAt = ctx.currentTime + 0.05;
    while (this.nextAt < ctx.currentTime + 0.12) {
      const i = this.step % LEAD.length;
      const at = this.nextAt;
      const lead = LEAD[i]!;
      if (lead > 0) this.tone(this.music, "square", hz(lead), at, sixteenth * (LEAD[(i + 1) % LEAD.length] === -1 ? 2 : 1) * 0.9, 0.13);
      const bass = BASS[i % BASS.length]!;
      if (bass > 0) this.tone(this.music, "triangle", hz(bass), at, sixteenth * 0.9, 0.32);
      const d = DRUMS[i % DRUMS.length];
      if (d === "k") this.tone(this.music, "sine", 150, at, 0.12, 0.5, 40);
      else if (d === "s") this.hit(this.music, at, 0.12, 1800, 0.22);
      else if (d === "h") this.hit(this.music, at, 0.03, 7000, 0.08);
      this.nextAt += sixteenth;
      this.step++;
    }
  }

  private tone(bus: AudioNode, wave: OscillatorType, freq: number, at: number, dur: number, vol: number, slideTo?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.004);
    g.gain.setValueAtTime(vol, at + Math.max(0.005, dur - 0.03));
    g.gain.linearRampToValueAtTime(0, at + dur);
    osc.connect(g).connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private hit(bus: AudioNode, at: number, dur: number, cutoff: number, vol: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = cutoff > 4000 ? "highpass" : cutoff < 400 ? "lowpass" : "bandpass";
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
  }

  /** Plays one effect; `volume` scales it (the gun is quieter than a blast). */
  play(e: Sfx, volume = 1): void {
    const ctx = this.ctx;
    const bus = this.fx;
    if (!ctx || !bus || ctx.state !== "running") return;
    const at = ctx.currentTime + 0.003;
    const v = volume;
    const seq = (notes: Note[], step: number, wave: OscillatorType = "square", vol = 0.2) => notes.forEach((n, i) => n > 0 && this.tone(bus, wave, hz(n), at + i * step, step * 0.95, vol * v));
    switch (e) {
      case "gun":
        this.hit(bus, at, 0.05, 2500, 0.16 * v);
        this.tone(bus, "square", 220, at, 0.04, 0.06 * v, 90);
        break;
      case "knife":
        this.hit(bus, at, 0.12, 5000, 0.18 * v);
        this.tone(bus, "sawtooth", 900, at, 0.1, 0.05 * v, 1800);
        break;
      case "launch":
        this.tone(bus, "sawtooth", 180, at, 0.3, 0.12 * v, 520);
        this.hit(bus, at, 0.25, 900, 0.2 * v);
        break;
      case "explode":
        this.hit(bus, at, 0.8, 200, 0.6 * v);
        this.hit(bus, at, 0.35, 1200, 0.35 * v);
        this.tone(bus, "sine", 120, at, 0.4, 0.4 * v, 30);
        break;
      case "break":
        // Glass and bricks: bright shards over a thump.
        this.hit(bus, at, 0.22, 6000, 0.22 * v);
        seq([96, 91, 98], 0.025, "square", 0.05);
        this.hit(bus, at, 0.12, 500, 0.2 * v);
        break;
      case "crack":
        this.hit(bus, at, 0.06, 3200, 0.1 * v);
        break;
      case "thud":
        this.tone(bus, "sine", 110, at, 0.09, 0.25 * v, 60);
        break;
      case "jump":
        this.tone(bus, "square", 300, at, 0.1, 0.07 * v, 620);
        break;
      case "double":
        this.tone(bus, "square", 420, at, 0.12, 0.08 * v, 900);
        break;
      case "jet":
        // A short rumble, repeated while the pack burns.
        this.hit(bus, at, 0.09, 700, 0.12 * v);
        break;
      case "timeout":
        // A sad fall: the mission is lost.
        seq([67, 66, 65, 64, 0, 60], 0.22, "triangle", 0.3);
        break;
      case "foeShot":
        this.tone(bus, "sawtooth", 700, at, 0.16, 0.09 * v, 220);
        break;
      case "warn":
        seq([88, 0, 88], 0.05, "square", 0.08);
        break;
      case "foeHit":
        this.tone(bus, "square", 160, at, 0.05, 0.12 * v, 110);
        break;
      case "foeDown":
        seq([60, 55, 48], 0.08, "square", 0.2);
        this.hit(bus, at, 0.4, 400, 0.3 * v);
        break;
      case "hurt":
        this.tone(bus, "square", 330, at, 0.14, 0.2 * v, 140);
        break;
      case "lifeLost":
        seq([72, 67, 64, 60, 55], 0.1, "triangle", 0.3);
        break;
      case "alert":
        // An angry shout: two harsh rising notes.
        this.tone(bus, "sawtooth", 220, at, 0.12, 0.14 * v, 440);
        this.tone(bus, "sawtooth", 330, at + 0.13, 0.14, 0.14 * v, 660);
        break;
      case "pickup":
        seq([76, 81, 88], 0.05, "square", 0.18);
        break;
      case "freed":
        seq([72, 79], 0.06, "triangle", 0.25);
        break;
      case "rescue":
        seq([72, 76, 79, 84, 0, 79, 84], 0.07, "square", 0.18);
        break;
      case "complete":
        seq([72, 72, 72, 79, 0, 76, 79, 0, 84, 83, 84, 88], 0.11, "square", 0.2);
        break;
      case "click":
        this.tone(bus, "square", 880, at, 0.03, 0.08 * v);
        break;
    }
  }
}
