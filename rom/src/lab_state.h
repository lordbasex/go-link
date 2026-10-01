/* Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> */
/*
 * The lab state contract of experiment 1 (docs/experiments/harness.md):
 * one struct in work RAM, at the exported symbol "lab_state", that the
 * game fills once per frame so the harness can read the game's state
 * without knowing the rest of its memory.
 *
 * Every ROM of the experiment keeps it. The harness finds it by the
 * symbol (build/symbols.json, from the toolchain's nm) or, when a build
 * has no symbol map, by scanning work RAM (0xff0000-0xffffff) for the
 * magic "LAB1" at an even address. go-link's linker script places it at
 * 0xff0000, the start of work RAM.
 *
 * Byte layout (the 68000 is big-endian, so every field is big-endian;
 * offsets in hex, sizes in bytes; s = signed, u = unsigned):
 *
 *   00 4  magic          'L' 'A' 'B' '1' (0x4c414231)
 *   04 2  version        u16, 1
 *   06 2  size           u16, sizeof(struct lab_state) = 0xc8 (200)
 *   08 4  frame          u32, vblanks since power on
 *   0c 1  mode           u8, LAB_MODE_*
 *   0d 1  credits        u8
 *   0e 1  section_clear  u8, 1 once the section is cleared
 *   0f 1  flags          u8, LAB_FLAG_*
 *   10 2  cam_x          s16, world px of the screen's left edge
 *   12 2  cam_y          s16, world px of the screen's top edge
 *   14 2  level_w        u16, px
 *   16 2  level_h        u16, px
 *   18 2  exit_x0        s16, the exit zone's left world px (-1: none)
 *   1a 2  exit_x1        s16, its right world px (-1: none)
 *   1c 2  exit_y         s16, the feet y of its floor (-1: none)
 *   1e 1  n_enemies      u8, entries used in enemy[] (<= 8)
 *   1f 1  n_civilians    u8, entries used in civ[] (<= 4)
 *   20 4  col_map        u32, address of the collision map (0: none):
 *                        one byte per 16x16 cell, row-major, LAB_CELL_*
 *   24 2  col_cols       u16
 *   26 2  col_rows       u16
 *   28 64 player[4]      16 bytes each, at 0x28 + 16 * n:
 *         +0 1  active   u8, 1 while the player is in the game
 *         +1 1  state    u8, LAB_PL_*
 *         +2 1  facing   s8, +1 right, -1 left
 *         +3 1  energy   u8, 0-3
 *         +4 2  x        s16, world px (the body's middle)
 *         +6 2  y        s16, world px of the feet
 *         +8 4  score    u32
 *         +c 1  hurt     u8, frames of blinking left (invulnerable)
 *         +d 1  pflags   u8, LAB_PF_*
 *         +e 2  vy       s16, vertical speed in 1/16 px per frame
 *   68 64 enemy[8]       8 bytes each, at 0x68 + 8 * n:
 *         +0 1  alive    u8
 *         +1 1  hp       u8, hits left
 *         +2 2  x        s16, world px
 *         +4 2  y        s16, world px of the feet
 *         +6 1  facing   s8
 *         +7 1  estate   u8, LAB_EN_*
 *   a8 32 civ[4]         8 bytes each, at 0xa8 + 8 * n:
 *         +0 1  rescued  u8
 *         +1 1  present  u8, 1 for an entry in use
 *         +2 2  x        s16, world px
 *         +4 2  y        s16, world px of the feet
 *         +6 2  reserved u16, 0
 *   c8           end
 */
#ifndef GOLINK_LAB_STATE_H
#define GOLINK_LAB_STATE_H

#include "hw.h"

#define LAB_MAGIC   0x4c414231 /* "LAB1" */
#define LAB_VERSION 1
#define LAB_PLAYERS 4
#define LAB_ENEMIES 8
#define LAB_CIVILIANS 4

enum { LAB_MODE_BOOT, LAB_MODE_TITLE, LAB_MODE_PLAYING, LAB_MODE_CLEAR, LAB_MODE_GAME_OVER };

#define LAB_FLAG_EXIT       0x01 /* the level has an exit zone (exit_*) */
#define LAB_FLAG_RESCUE_ALL 0x02 /* the section clears when every civilian is rescued */
#define LAB_FLAG_DAMAGE     0x04 /* enemies hurt players (energy changes) */

enum { LAB_CELL_EMPTY, LAB_CELL_SOLID, LAB_CELL_ONEWAY, LAB_CELL_LADDER, LAB_CELL_CRATE };

enum {
	LAB_PL_OFF, LAB_PL_IDLE, LAB_PL_WALK, LAB_PL_RUN, LAB_PL_AIR,
	LAB_PL_CLIMB, LAB_PL_ATTACK, LAB_PL_HURT, LAB_PL_DEAD
};

#define LAB_PF_GROUND 0x01
#define LAB_PF_CLIMB  0x02
#define LAB_PF_RUN    0x04
#define LAB_PF_FIRE   0x08

enum { LAB_EN_OFF, LAB_EN_WALK, LAB_EN_HIT, LAB_EN_DOWN };

struct lab_player {
	u8 active, state;
	s8 facing;
	u8 energy;
	s16 x, y;
	u32 score;
	u8 hurt, pflags;
	s16 vy;
};

struct lab_enemy {
	u8 alive, hp;
	s16 x, y;
	s8 facing;
	u8 estate;
};

struct lab_civ {
	u8 rescued, present;
	s16 x, y;
	u16 reserved;
};

struct lab_state {
	u32 magic;
	u16 version, size;
	u32 frame;
	u8 mode, credits, section_clear, flags;
	s16 cam_x, cam_y;
	u16 level_w, level_h;
	s16 exit_x0, exit_x1, exit_y;
	u8 n_enemies, n_civilians;
	u32 col_map;
	u16 col_cols, col_rows;
	struct lab_player player[LAB_PLAYERS];
	struct lab_enemy enemy[LAB_ENEMIES];
	struct lab_civ civ[LAB_CIVILIANS];
};

/* The layout above, checked by the compiler. */
#define LAB_AT(f, off) _Static_assert(__builtin_offsetof(struct lab_state, f) == (off), "lab_state." #f)
LAB_AT(frame, 0x08);
LAB_AT(mode, 0x0c);
LAB_AT(cam_x, 0x10);
LAB_AT(exit_x0, 0x18);
LAB_AT(n_enemies, 0x1e);
LAB_AT(col_map, 0x20);
LAB_AT(col_cols, 0x24);
LAB_AT(player, 0x28);
LAB_AT(enemy, 0x68);
LAB_AT(civ, 0xa8);
_Static_assert(sizeof(struct lab_player) == 16, "lab_player");
_Static_assert(sizeof(struct lab_enemy) == 8, "lab_enemy");
_Static_assert(sizeof(struct lab_civ) == 8, "lab_civ");
_Static_assert(sizeof(struct lab_state) == 0xc8, "lab_state size");

/* In work RAM, in its own section (link.ld puts it at 0xff0000). */
extern struct lab_state lab_state;

#endif
