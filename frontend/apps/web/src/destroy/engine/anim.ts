// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

/** An animation as the atlas manifest writes it. */
export interface AnimDef {
  frames: string[];
  fps: number;
  loop: boolean;
}

/** The frame an animation shows `t` seconds after it started (a one-shot holds its last frame). */
export function frameAt(anim: AnimDef, t: number): string | undefined {
  const n = anim.frames.length;
  if (!n) return undefined;
  const i = Math.floor(Math.max(0, t) * anim.fps);
  return anim.frames[anim.loop ? i % n : Math.min(n - 1, i)];
}

/** How long a one-shot animation lasts, in seconds. */
export function durationOf(anim: AnimDef): number {
  return anim.frames.length / Math.max(1, anim.fps);
}
