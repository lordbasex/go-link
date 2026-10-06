// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Which animation a player's move shows, and which of its frames, for any
// character: as many frames as it has, at the speed its animation says.
// Play mode (play/renderer.ts) draws with these; the ROM's pack
// (rom/looks.ts) writes the same choices into each wm_look and
// rom/engine/engine.c (draw_player) does the same arithmetic, so both
// engines show the same frame on every game frame (docs/willy-maker/engine.md,
// "Players' looks"). Pure.

/** The engine's animations of a player, in wm_look's order: the six it began with, the moves (docs/willy-maker/moves.md), then walk (wm_data 28). */
export const LOOK_ANIMS = ["idle", "run", "jump", "knife", "gun", "bazooka", "crouch", "crawl", "land", "turn", "kick", "thumbs", "victory", "yawn", "double_jump", "jetpack", "walk"] as const;
export type LookAnimId = (typeof LOOK_ANIMS)[number];

/** Where each engine animation comes from: the first of the hero's own that has frames (the moves by the doc's names and fallbacks). */
export const LOOK_SOURCES: Record<LookAnimId, string[]> = {
  idle: ["idle"],
  run: ["run", "walk", "idle"],
  jump: ["jump", "idle"],
  knife: ["knife", "melee", "shoot", "fire", "idle"],
  gun: ["shoot", "fire", "machine_gun", "idle"],
  bazooka: ["bazooka", "special", "shoot", "fire", "idle"],
  crouch: ["crouch", "idle"],
  crawl: ["crawl", "crouch", "walk"],
  land: ["land", "idle"],
  turn: ["turn", "run"],
  kick: ["jump_kick", "knife", "jump"],
  thumbs: ["thumbs_up", "idle"],
  victory: ["victory", "thumbs_up", "idle"],
  yawn: ["yawn", "bored", "idle"],
  double_jump: ["double_jump", "jump"],
  jetpack: ["jetpack", "jump"],
  walk: ["walk", "run", "idle"],
};

/** A move whose names all miss takes the engine animation it stands in for (crawl the crouch's, turn the run's, ...). */
export const LOOK_FALLBACK: Partial<Record<LookAnimId, LookAnimId>> = { crawl: "crouch", turn: "run", kick: "jump", double_jump: "jump", jetpack: "jump" };

/** The moves that last a fixed time (rules.ts *_FRAMES): their own animation fits in it. */
export const TIMED: readonly LookAnimId[] = ["knife", "land", "turn", "kick", "thumbs"];

export interface HeroLook {
  /** The character's animation each engine animation is drawn with. */
  anims: Record<LookAnimId, string>;
  /**
   * How fast walking and running play, in halves of the animation's speed:
   * its own walk 2 (as drawn), a run standing in for a missing walk 1 (half,
   * as Willy walks), a walk standing in for a missing run 4 (twice: the hero
   * covers twice the ground).
   */
  walkRate: number;
  runRate: number;
  /** wm_look's `fit` bits (bit k = LOOK_ANIMS[k]): a timed move drawn with its own animation (the first name in its list), which then shows all its frames within the move. */
  fit: number;
}

/** A hero's engine animations from which of its animations have frames (`names`: all of them, for one to stand with when it has no idle); null when none has. */
export function heroLook(has: (name: string) => boolean, names: readonly string[] = []): HeroLook | null {
  const anims = {} as Record<LookAnimId, string>;
  let fit = 0;
  for (const id of LOOK_ANIMS) {
    const chain = id === "idle" ? ["idle", "walk", "run", ...names] : LOOK_SOURCES[id];
    const own = chain.find(has);
    const fallback = LOOK_FALLBACK[id];
    const src = own ?? (fallback ? anims[fallback] : undefined) ?? anims.idle;
    if (!src) return null;
    anims[id] = src;
    // only the move's own animation (the first name in its list) fits the move; a stand-in keeps its speed
    if (TIMED.includes(id) && own === chain[0]) fit |= 1 << LOOK_ANIMS.indexOf(id);
  }
  return { anims, walkRate: strideRate(anims.walk, "walk"), runRate: strideRate(anims.run, "run"), fit };
}

/** The speed (halves) walking or running plays its animation at, by what it is drawn with. */
function strideRate(src: string, move: "walk" | "run"): number {
  if (move === "walk") return src === "run" ? 1 : 2;
  return src === "walk" ? 4 : 2;
}

/** A looping animation's frame `t` game frames after it started (engine.c draw_anim). */
export function loopFrame(count: number, fps: number, t: number): number {
  return Math.floor((Math.max(0, Math.floor(t)) * fps) / 60) % count;
}

/**
 * A move of `duration` game frames, `t` frames in: its frame at the
 * animation's fps, held on the last; when the move is shorter than the
 * animation at that speed and `fit`, its frames are spread over the move so
 * every one shows (engine.c draw_move).
 */
export function moveFrame(count: number, fps: number, t: number, duration: number, fit: boolean): number {
  const at = Math.max(0, Math.floor(t));
  const i = fit && count * 60 > fps * duration ? Math.floor((at * count) / duration) : Math.floor((at * fps) / 60);
  return Math.min(count - 1, i);
}

/** In the air: rising fast, rising, falling, falling fast, spread over the frames after the first (the take-off) (engine.c air_frame). */
export function airFrame(count: number, vy: number): number {
  const phase = vy < -60 ? 0 : vy < 0 ? 1 : vy < 60 ? 2 : 3;
  return count > 1 ? 1 + Math.floor((phase * (count - 1)) / 4) : 0;
}
