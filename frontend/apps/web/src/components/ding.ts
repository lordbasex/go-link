// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A short two-note chime for a new chat message, made with Web Audio so
// there is no sound file to download.

let ctx: AudioContext | null = null;
let output = "";

/** The output the chime plays on ("" = the system's default), where the browser can choose. */
export function setDingOutput(id: string): void {
  output = id;
  applyOutput();
}

function applyOutput(): void {
  const c = ctx as unknown as { setSinkId?: (id: string) => Promise<void> } | null;
  if (typeof c?.setSinkId === "function") void c.setSinkId(output).catch(() => undefined);
}

export function playDing(volume = 0.12): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!ctx) {
      ctx = new Ctx();
      if (output) applyOutput();
    }
    if (ctx.state === "suspended") void ctx.resume();
    const start = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      const t0 = start + i * 0.09;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
  } catch {
    // no audio here (tests, old browsers): the message still shows
  }
}
