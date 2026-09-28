// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { Chiptune } from "./chiptune";

/** A tiny AudioContext whose resume waits until the test lets it go. */
class FakeContext {
  static last: FakeContext | null = null;
  state: AudioContextState = "suspended";
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  release: () => void = () => undefined;
  constructor() {
    FakeContext.last = this;
  }
  createGain() {
    return { gain: { value: 0 }, connect: () => undefined };
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  resume() {
    return new Promise<void>((done) => {
      this.release = () => {
        this.state = "running";
        done();
      };
    });
  }
  suspend() {
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

describe("Chiptune", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts once the browser lets the audio run", async () => {
    vi.stubGlobal("AudioContext", FakeContext);
    const music = new Chiptune(performance.now());
    const playing = music.play();
    FakeContext.last!.release();
    await expect(playing).resolves.toBe(true);
    music.close();
  });

  it("does not fail when the page closes it while the browser resumes it", async () => {
    vi.stubGlobal("AudioContext", FakeContext);
    const music = new Chiptune(performance.now());
    const playing = music.play();
    music.close();
    FakeContext.last!.release();
    await expect(playing).resolves.toBe(false);
  });
});
