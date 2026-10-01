// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The art spec's sizes and animation lists (docs/rom/art-spec.md, sections
// 1 and 2), the presets of the character importer.

import type { CharacterRole } from "../model";

export interface AnimPreset {
  name: string;
  /** Frames the art spec asks for. */
  frames: number;
  fps: number;
  loop: boolean;
}

const a = (name: string, frames: number, fps: number, loop: boolean): AnimPreset => ({ name, frames, fps, loop });

/** Animations per role; any other name can be added by hand. */
export const ANIMS: Record<CharacterRole, AnimPreset[]> = {
  hero: [
    a("idle", 4, 6, true),
    a("walk", 8, 12, true),
    a("run", 6, 14, true),
    a("jump", 3, 10, false),
    a("land", 1, 10, false),
    a("climb", 4, 10, true),
    a("climb_crate", 3, 12, false),
    a("crouch", 1, 10, false),
    a("crawl", 4, 10, true),
    a("shoot", 3, 15, true),
    a("knife", 4, 15, false),
    a("grenade", 4, 12, false),
    a("special", 2, 10, false),
    a("hit", 2, 10, false),
    a("death", 6, 10, false),
    a("thumbs_up", 3, 8, false),
    a("victory", 4, 8, false),
  ],
  enemy: [a("idle", 4, 6, true), a("walk", 6, 12, true), a("shoot", 3, 15, true), a("melee", 4, 15, false), a("hit", 2, 10, false), a("death", 6, 10, false)],
  civilian: [a("idle", 4, 6, true), a("worried", 3, 8, true), a("follow", 6, 12, true), a("thanks", 3, 8, false)],
  boss: [a("idle", 4, 6, true), a("walk", 6, 10, true), a("attack", 4, 12, false), a("hit", 2, 10, false), a("death", 6, 10, false)],
};

/** On-screen heights, in board pixels (art spec, section 1). */
export const HEIGHTS: { id: string; px: number }[] = [
  { id: "hero", px: 44 },
  { id: "android", px: 48 },
  { id: "alien", px: 46 },
  { id: "adult", px: 42 },
  { id: "child", px: 32 },
  { id: "baby", px: 20 },
  { id: "drone", px: 24 },
  { id: "boss", px: 96 },
];

export const DEFAULT_HEIGHT: Record<CharacterRole, number> = { hero: 44, enemy: 44, civilian: 42, boss: 96 };

/** The board's screen height, for the "% of the screen" note. */
export const SCREEN_H = 224;
