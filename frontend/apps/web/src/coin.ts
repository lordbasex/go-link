// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The startup coin sound: three quick square-wave notes made with Web Audio
// (an original sound, no file). The apps play the same synthesis rendered to
// a WAV by scripts/coin-sound.mjs.

/** Note i: 880 Hz * 1.26^i, 0.07 s apart, 0.12 + 0.08 i s long. */
export const COIN_NOTES = [0, 1, 2].map((i) => ({
  offset: i * 0.07,
  freq: 880 * Math.pow(1.26, i),
  dur: 0.12 + i * 0.08,
}));
const GAIN = 0.12;

let ctx: AudioContext | null = null;

/**
 * Plays the coin now if the browser lets this page make sound without a
 * gesture (Chrome does for sites the visitor often plays media on). Resolves
 * true when it played, false when the browser keeps sound blocked.
 */
export async function tryPlayCoinNow(): Promise<boolean> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    ctx ??= new Ctx();
    if (ctx.state === "suspended") {
      await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 250))]);
    }
    if (ctx.state !== "running") return false;
    playCoin();
    return true;
  } catch {
    return false;
  }
}

/** Plays the coin. Call it from a tap or key press: browsers block sound before one. */
export function playCoin(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    ctx ??= new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
    const start = ctx.currentTime + 0.02;
    for (const note of COIN_NOTES) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = start + note.offset;
      osc.type = "square";
      osc.frequency.setValueAtTime(note.freq, t0);
      gain.gain.setValueAtTime(GAIN, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + note.dur + 0.02);
    }
  } catch {
    // no audio here (tests, old browsers): the intro is silent
  }
}
