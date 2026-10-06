// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Sound in play mode: the same effects, instruments and tunes Create ROM
// writes for the QSound chip (rom/sound.ts), played with Web Audio. Samples
// keep the chip's 24096 Hz and its loops; an effect is panned to where it
// happens on screen, as the ROM engine does (0 left, 16 centre, 32 right);
// the tunes run the ROM's rows at its 250 Hz tick. Nothing starts before
// the player's first key or tap (browsers keep sound off until then).

import { SCREEN_W, type GameEvent } from "../engine";
import { builtInSongs, effects, instruments, notePitch, QS_RATE, type Sample, type SfxId, type Song } from "../rom/sound";

/** A game's own effects and tunes (rom/sound.ts effects(project), projectSongs(project)). */
export interface GameSoundSet {
  effects: Record<SfxId, Sample>;
  songs: Record<string, Song>;
}

/** Which effect an engine event plays. */
const EVENT_SFX: Partial<Record<GameEvent["kind"], SfxId>> = {
  jump: "jump",
  shot: "shot",
  knife: "knife",
  kick: "kick",
  rocket: "rocket",
  land: "land",
  crate: "crate",
  enemy_down: "enemyDown",
  hit: "hit",
  rescue: "rescue",
  pickup: "pickup",
  hurt: "hurt",
  join: "start",
  explosion: "explosion",
};

/** The QSound chip's channel volume (0x0000-0x0fff) as a gain, with room for 16 channels at once. */
const gainOf = (vol: number) => (vol / 0x1000) * 0.5;

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export class PlayAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx = new Map<SfxId, { buf: AudioBuffer; s: Sample }>();
  private inst: { buf: AudioBuffer; s: Sample }[] = [];
  private songs = builtInSongs();
  private fx: Record<SfxId, Sample> = effects();
  private song: Song | null = null;
  private row = 0;
  private nextAt = 0;
  private voices: (Voice | null)[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private wanted: string | null = null;
  muted = false;

  /** Starts Web Audio (call from a key or a tap); the samples are made once. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.loadEffects();
    this.inst = instruments().map((s) => ({ buf: this.buffer(s.data), s }));
    if (this.wanted) this.music(this.wanted);
  }

  /** Plays this game's own effects and tunes from now on (its tune starts again when it changed). */
  setSound(set: GameSoundSet): void {
    this.fx = set.effects;
    this.songs = set.songs;
    if (this.ctx) this.loadEffects();
    if (this.wanted) {
      const w = this.wanted;
      this.music(null);
      this.music(w);
    }
  }

  private loadEffects(): void {
    this.sfx.clear();
    for (const id of Object.keys(this.fx) as SfxId[]) this.sfx.set(id, { buf: this.buffer(this.fx[id].data), s: this.fx[id] });
  }

  private buffer(data: Int8Array): AudioBuffer {
    const buf = this.ctx!.createBuffer(1, Math.max(1, data.length), QS_RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) ch[i] = data[i]! / 128;
    return buf;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime);
  }

  /** Plays a sample: rate from the chip's pitch, its loop, a balance 0-32. */
  private voice(entry: { buf: AudioBuffer; s: Sample }, pitch: number, pan: number, at = 0): Voice | null {
    const ctx = this.ctx;
    if (!ctx || !this.master) return null;
    const src = ctx.createBufferSource();
    src.buffer = entry.buf;
    src.playbackRate.value = pitch / 0x1000;
    if (entry.s.loop > 0) {
      src.loop = true;
      src.loopStart = (entry.s.data.length - entry.s.loop) / QS_RATE;
      src.loopEnd = entry.s.data.length / QS_RATE;
    }
    const gain = ctx.createGain();
    gain.gain.value = gainOf(entry.s.vol);
    let out: AudioNode = gain;
    if (typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, (pan - 16) / 16));
      gain.connect(p);
      out = p;
    }
    out.connect(this.master);
    src.connect(gain);
    src.start(at || ctx.currentTime);
    return { src, gain };
  }

  /** The effects of one frame's events; camX places them on screen. */
  events(list: readonly GameEvent[], camX: number, playerX: (i: number) => number): void {
    if (!this.ctx || this.muted) return;
    for (const e of list) {
      const id = EVENT_SFX[e.kind];
      const entry = id ? this.sfx.get(id) : undefined;
      if (!entry) continue;
      const x = "x" in e && typeof e.x === "number" ? e.x : "player" in e ? playerX(e.player) : camX + SCREEN_W / 2;
      this.voice(entry, 0x1000, Math.round(((x - camX) * 32) / SCREEN_W));
    }
  }

  /** Plays one effect at the centre (the Sound card's preview). */
  effect(id: SfxId): void {
    const entry = this.sfx.get(id);
    if (entry && !this.muted) this.voice(entry, 0x1000, 16);
  }

  /** Plays a tune by music slot ("stage", "clear", ...), or stops with null. */
  music(slot: string | null): void {
    this.wanted = slot;
    this.stopMusic();
    const song = slot ? this.songs[slot] : undefined;
    if (!song || !this.ctx) return;
    this.song = song;
    this.row = 0;
    this.voices = song.pans.map(() => null);
    this.nextAt = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 40);
    this.schedule();
  }

  private stopMusic(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const v of this.voices) v?.src.stop();
    this.voices = [];
    this.song = null;
  }

  /** Schedules the rows due in the next 150 ms (the ROM's rows: note 0 holds, 0xff keys off). */
  private schedule(): void {
    const ctx = this.ctx;
    const song = this.song;
    if (!ctx || !song) return;
    const rowSecs = song.tempo / 250;
    while (this.nextAt < ctx.currentTime + 0.15) {
      if (this.row >= song.rows.length) {
        if (song.loop === null) {
          this.timer && clearInterval(this.timer);
          this.timer = null;
          return;
        }
        this.row = song.loop;
      }
      song.rows[this.row]!.forEach(([note, inst], ch) => {
        if (note === 0) return;
        this.voices[ch]?.src.stop(this.nextAt);
        this.voices[ch] = null;
        if (note === 0xff) return;
        const entry = this.inst[inst];
        if (entry) this.voices[ch] = this.voice(entry, notePitch(note), song.pans[ch] ?? 16, this.nextAt);
      });
      this.row++;
      this.nextAt += rowSecs;
    }
  }

  close(): void {
    this.stopMusic();
    void this.ctx?.close();
    this.ctx = null;
  }
}
