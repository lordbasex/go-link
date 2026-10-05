// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCREEN_W } from "../engine";
import { QS_RATE } from "../rom/sound";
import { PlayAudio } from "./audio";

// A stand-in for Web Audio: it records the sources started and their pans.
class FakeContext {
  currentTime = 0;
  started: { rate: number; pan: number; at: number; loop: boolean; length: number }[] = [];
  destination = {};
  createGain() {
    return { gain: { value: 1, setValueAtTime(v: number) { this.value = v; } }, connect() {} };
  }
  createStereoPanner() {
    const node = { pan: { value: 0 }, connect() {} };
    this.lastPan = node;
    return node;
  }
  lastPan: { pan: { value: number } } | null = null;
  createBuffer(_ch: number, length: number, rate: number) {
    expect(rate).toBe(QS_RATE);
    return { length, getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    const ctx = this;
    return {
      buffer: null as { length: number } | null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      playbackRate: { value: 1 },
      connect() {},
      start(at: number) {
        ctx.started.push({ rate: this.playbackRate.value, pan: ctx.lastPan?.pan.value ?? 0, at, loop: this.loop, length: this.buffer?.length ?? 0 });
      },
      stop() {},
    };
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

afterEach(() => vi.unstubAllGlobals());

function setup() {
  let ctx: FakeContext | null = null;
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        ctx = new FakeContext();
        return ctx;
      }
    },
  );
  const audio = new PlayAudio();
  audio.unlock();
  return { audio, ctx: () => ctx! };
}

describe("play mode's sound", () => {
  it("plays nothing before a key or a tap", () => {
    const audio = new PlayAudio();
    expect(() => audio.events([{ kind: "jump", player: 0 }], 0, () => 0)).not.toThrow();
  });

  it("plays an event's effect panned to where it happens, as the ROM does", () => {
    const { audio, ctx } = setup();
    audio.events([{ kind: "jump", player: 0 }], 1000, () => 1000 + 8);
    audio.events([{ kind: "explosion", x: 1000 + SCREEN_W - 8 }], 1000, () => 0);
    audio.events([{ kind: "cleared" }], 1000, () => 0);
    const [jump, boom] = ctx().started;
    expect(ctx().started).toHaveLength(2); // the clear has no effect: its tune plays
    expect(jump!.rate).toBe(1);
    expect(jump!.pan).toBeLessThan(-0.8);
    expect(boom!.pan).toBeGreaterThan(0.8);
  });

  it("is silent when turned off", () => {
    const { audio, ctx } = setup();
    audio.setMuted(true);
    audio.events([{ kind: "shot", player: 0 }], 0, () => 0);
    expect(ctx().started).toHaveLength(0);
  });

  it("plays a tune's rows at the chip's pitches, and the next one replaces it", () => {
    const { audio, ctx } = setup();
    audio.music("stage");
    const notes = ctx().started.length;
    expect(notes).toBeGreaterThan(0);
    // middle C's pitch is 0x1000: every rate is a power of two of a semitone
    for (const s of ctx().started) expect(Math.abs(12 * Math.log2(s.rate) - Math.round(12 * Math.log2(s.rate)))).toBeLessThan(0.01);
    audio.music(null);
    ctx().currentTime = 10;
    expect(ctx().started).toHaveLength(notes);
    audio.close();
  });
});
