// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The game's numbers, the same as the ROM prototype (rom/src/main.c), so a
// level plays the same in the browser and on the board. Positions are world
// pixels; vertical position and speed are in 1/16 px, like the 68000 code.

/** The screen (CPS-1). */
export const SCREEN_W = 384;
export const SCREEN_H = 224;
/** The collision grid. */
export const CELL = 16;
/** Fixed step: the board runs at 60 frames per second. */
export const FRAME_MS = 1000 / 60;

/** A player's collision height and half width at the feet. */
export const BODY_H = 40;
export const HALF_W = 5;
/** Gravity, jump and fall speed, in 1/16 px per frame (jump height about 64 px). */
export const GRAVITY = 6;
export const JUMP_VY = -7 * 16;
export const MAX_FALL = 8 * 16;
/** Ladder speed: 1.5 px per frame. */
export const CLIMB_SPEED = 24;
/** The highest edge a push climbs (one 32 px crate), and how long the push takes. */
export const STEP_UP = 32;
export const PUSH_FRAMES = 10;
/** A second press toward the same side within this many frames (250 ms) runs. */
export const RUN_TAP_FRAMES = 15;
/** How far the camera may go back from the farthest point reached. */
export const BACKTRACK = 48;
/** Down + jump drops through a ledge for this many frames. */
export const DROP_FRAMES = 12;

/** Weapons. */
export const SHOTS_PER_PLAYER = 6;
export const SHOT_SPEED = 6;
export const FIRE_EVERY = 7;
export const KNIFE_FRAMES = 16;
export const KNIFE_REACH = 18;
export const BAZOOKA_FRAMES = 24;
export const BAZOOKA_AMMO = 3;

/** Enemies. */
export const ENEMY_HP = 4;
export const ENEMY_SIGHT = 170;
export const ENEMY_FIRE_EVERY = 90;
export const ENEMY_SHOT_SPEED = 3;

/** Crates and breakable walls: hits before they break (a rocket counts 9, a knife 2). */
export const CRATE_HP = 3;
export const BREAKABLE_HP = 2;

/** Lives, and the time a respawned player cannot be hurt. */
export const LIVES = 3;
export const INVULNERABLE_FRAMES = 120;

/** Score. */
export const SCORE_CRATE = 100;
export const SCORE_ENEMY = 500;
export const SCORE_RESCUE = 1000;

/**
 * The collision tags of a cell, as stored in a project's tag layer
 * (docs/willy-maker/file-format.md): 0 air, 1 solid, 2 one-way, 3 ladder,
 * 4 crate, 5 breakable, 6 hazard, 7 water.
 */
export const Tag = {
  Air: 0,
  Solid: 1,
  Oneway: 2,
  Ladder: 3,
  Crate: 4,
  Breakable: 5,
  Hazard: 6,
  Water: 7,
} as const;
export type TagValue = (typeof Tag)[keyof typeof Tag];

/** One player's controls this frame, as bits. */
export const Input = {
  Left: 1 << 0,
  Right: 1 << 1,
  Up: 1 << 2,
  Down: 1 << 3,
  B1: 1 << 4, // jump
  B2: 1 << 5, // fire (the knife when an enemy is right in front)
  B3: 1 << 6, // special: the picked-up weapon
  Start: 1 << 7,
} as const;
