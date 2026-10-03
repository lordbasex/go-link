/* Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> */
/*
 * Willy Maker's game data (docs/willy-maker/engine.md): what "Create ROM"
 * packs at WM_DATA_ADDR, in the 68000's program ROM, next to the prebuilt
 * engine (rom/engine/engine.c). The engine never changes from game to game:
 * a game is this block plus its graphics.
 *
 * Big-endian, like the 68000. Pointers are absolute 68000 addresses. The
 * same layout is written by frontend/apps/web/src/willy-maker/rom/pack.ts;
 * every offset is checked here at compile time and there by a test.
 */
#ifndef GOLINK_WMDATA_H
#define GOLINK_WMDATA_H

#include "hw.h"
#include "gfx.h" /* Tile, Frame, Anim: the engine's sprite records, also the looks' */

#define WM_DATA_ADDR 0x100000 /* the data block: after the engine, up to 0x1fffff */
#define WM_MAGIC 0x574d4431   /* "WMD1" */
#define WM_VERSION 11

/* graphics the packer writes (the engine only names the codes) */
#define WM_FONT_BIG 0x0080   /* 8x8: double-size glyph quadrants, 4 per glyph from '!' */
#define WM_EMPTY16 0x0400    /* 16x16: all pen 15 */
#define WM_EMPTY32 0x0200    /* 32x32: all pen 15 */
#define WM_SPRITES 0x1000    /* 16x16: the engine's own characters (engine-gfx) */
#define WM_FAR_TILES 0x0800  /* 32x32: the far layer's tiles */
#define WM_PLAY_TILES 0x4000 /* 16x16: the play layer's tiles */

/* collision tags, as Willy Maker stores them (file-format.md) */
enum { T_AIR, T_SOLID, T_ONEWAY, T_LADDER, T_CRATE, T_BREAKABLE, T_HAZARD, T_WATER };

/* the game's rules (the Game tab's Rules card): 16 bytes */
struct wm_rules {
	u8 energy;             /* +00 hits a player takes (1-9) */
	u8 enemy_hp;           /* +01 hits an enemy takes when the object gives none */
	u8 touch_hurts;        /* +02 touching an enemy hurts */
	u8 enemies_chase;      /* +03 enemies walk toward a player on their floor */
	u8 enemies_shoot;      /* +04 enemies shoot at a player on their floor */
	u8 exit_needs_enemies; /* +05 the exit clears only with every enemy down */
	u8 respawn_on_hurt;    /* +06 a hurt player comes back near the camera's left */
	u8 run_tap;            /* +07 the double-tap window, frames */
	u16 hurt_frames;       /* +08 blinking (cannot be hurt) after a hit */
	u16 enemy_score;       /* +0a */
	u16 rescue_score;      /* +0c */
	u16 crate_score;       /* +0e */
};

/* one object: 12 bytes; the fields' meaning depends on its list */
struct wm_object {
	s16 x, y; /* world px; y = the feet (crates: col, row) */
	s16 a, b, c, d;
};
/* enemy:    a = patrol min x, b = patrol max x, c = hits, d = facing (1 right, -1 left) */
/* civilian: a = 1 for a child */
/* crate:    a = size in cells (1 or 2), b = hits (0: never breaks from shots), c = contents (WM_ITEM_*) */
/* pickup:   a = item (WM_ITEM_*) */
/* lock:     (x, y) its top left, a = width, b = height: the camera stops there while enemies stand in its x range */
/* platform: (x, y) its top left at frame 0, a = width px (32-128, 16s), b = axis (0 across, 1 up and down),
             c = range px (0-512), d = speed px per frame (1-4); it goes there and back */
enum { WM_ITEM_NONE, WM_ITEM_BAZOOKA, WM_ITEM_HEALTH, WM_ITEM_COIN, WM_ITEM_SPRING, WM_ITEM_PIPE };

/* text screens */
enum { WM_SCR_TITLE, WM_SCR_HUD, WM_SCR_CLEAR, WM_SCR_CONTINUE, WM_SCR_GAMEOVER, WM_SCR_JOIN, WM_SCR_AMMO, WM_SCR_COIN, WM_SCR_END = 0xff };
/* a text line: screen, row, col, attr, length, then the characters (padded to even) */
#define WM_TXT_INK 0x03   /* 0 accent, 1 white, 2 cyan, 3 red */
#define WM_TXT_BIG 0x10   /* double size: 2 x 2 cells per character */
#define WM_TXT_COUNT 0x20 /* the engine writes a count after it (rescued) */
#define WM_TXT_BLINK 0x40 /* blinks; the title's prompt */

#define WM_F_FREE_PLAY 0x0001
#define WM_F_PUSH_CLIMB 0x0002 /* a 32 px edge is climbed by walking into it (else by jumping) */
#define WM_F_SOON 0x0004       /* Start on a port past the game's players shows "nP COMING SOON" */
#define WM_F_DOUBLE_JUMP 0x0008 /* B1 again in the air jumps once more (docs/willy-maker/moves.md) */
#define WM_F_JETPACK 0x0010     /* B1 held in the air lifts the player, 90 frames of fuel */
#define WM_F_DIFFICULTY 0x0060  /* bits 5-6, the DIP switch's difficulty: 0 normal, 1 easy, 2 hard, 3 lag */
#define WM_F_NO_WEAPONS 0x0080  /* the platformer (T-22): no gun, knife, kick or bazooka */
#define WM_F_STOMP 0x0100       /* landing on an enemy from above takes it down */
#define WM_F_DEPTH 0x0200       /* the beat 'em up: walking a street in depth (walk_y0-walk_y1), B2 hops */

struct wm_data {
	u32 magic;                /* 00 */
	u16 version;              /* 04 */
	u16 size;                 /* 06 sizeof(struct wm_data) */
	u16 players;              /* 08 the most players at once, 1-4 */
	u16 flags;                /* 0a WM_F_* */
	u16 level_w, level_h;     /* 0c, 0e px */
	u16 cols, rows;           /* 10, 12 16 px cells */
	u16 far_cols, far_rows;   /* 14, 16 32 px cells */
	u32 tags;                 /* 18 u8[cols * rows] */
	u32 play;                 /* 1c u16 tile codes [cols * rows] */
	u32 far;                  /* 20 u16 tile codes [far_cols * far_rows] */
	u32 palettes;             /* 24 u16[16 x (n_play_pals + n_far_pals)]: the play layer's palettes, then the far layer's */
	u32 objects;              /* 28 wm_object[]: enemies, civilians, crates, pickups */
	u32 texts;                /* 2c text lines */
	u16 n_enemies, n_civs;    /* 30, 32 */
	u16 n_crates, n_pickups;  /* 34, 36 */
	s16 start_x[4];           /* 38 -1 = none */
	s16 start_y[4];           /* 40 */
	s16 exit_x, exit_y;       /* 48, 4a */
	s16 exit_w, exit_h;       /* 4c, 4e exit_w 0 = no exit */
	u16 slots[4];             /* 50 Willy's shirt per player (looks[i] 0): 0 his own, 1-3 a recruit's */
	u16 bg_color;             /* 58 the color behind every layer */
	u16 backtrack;            /* 5a px the camera may go back */
	struct wm_rules rules;    /* 5c */
	u32 title;                /* 6c the game's title (zero-terminated), for the record */
	u32 looks;                /* 70 u32[4], one per player slot: 0 = Willy with slots[i]'s shirt, else a wm_look */
	u16 n_play_pals;          /* 74 palettes loaded into the scroll2 bank (1-32) */
	u16 n_far_pals;           /* 76 palettes loaded into the scroll3 bank (1-32) */
	u32 play_pal;             /* 78 u8[n_play_codes]: the palette of play tile code WM_PLAY_TILES + i */
	u32 far_pal;              /* 7c u8[n_far_codes]: the palette of far tile code WM_FAR_TILES + i */
	u16 n_play_codes;         /* 80 codes past the table use palette 0 (the empty tile, the exit door) */
	u16 n_far_codes;          /* 82 */
	u16 n_bands;              /* 84 parallax bands of the play layer (0-4, T-26) */
	struct wm_band {
		u16 r0, r1;           /* its rows of 16 px, r1 excluded */
		u16 speed;            /* % of the camera's speed */
	} bands[4];               /* 86 */
	u32 enemy_looks;          /* 9e u32[n_enemies]: an enemy's own look (wm_look), 0 = the engine's android (T-30) */
	u32 civ_looks;            /* a2 u32[n_civs]: a civilian's own look, 0 = the engine's woman or child */
	u32 platforms;            /* a6 wm_object[n_platforms]: the moving platforms (the platformer) */
	u16 n_platforms;          /* aa 0-16 */
	u16 pad;                  /* ac */
	u32 pickup_looks;         /* ae u32[n_pickups]: a pickup's own look (its idle animation), 0 = the engine's icon */
	u16 walk_y0, walk_y1;     /* b2, b4 the beat 'em up's walkable band: feet y, px (WM_F_DEPTH) */
	u32 locks;                /* b6 wm_object[n_locks]: the camera locks (a beat 'em up's waves) */
	u16 n_locks;              /* ba 0-8 */
	u16 pad2;                 /* bc */
};
#define WM_LAYER_PALETTES 32 /* a layer's palette bank: 32 palettes of 15 colors */

/*
 * A player's own look (a Willy Maker hero drawn in the browser): its
 * animations, one per move (docs/willy-maker/moves.md), in the engine's own records (Tile, Frame, Anim from gfx.h,
 * written by the packer in exactly this layout), and its palettes. A tile's
 * pal is relative: the engine adds `pal`, the first sprite palette the look's
 * `npal` palettes are loaded into at startup; their words (npal x 16) follow
 * the struct. Climbing uses a jump frame, as Willy does.
 */
struct wm_look {
	const Anim *idle, *run, *jump;   /* 00, 04, 08 */
	const Anim *knife, *gun;         /* 0c, 10 */
	const Anim *bazooka;             /* 14 */
	const Anim *crouch, *crawl;      /* 18, 1c */
	const Anim *land, *turn, *kick;  /* 20, 24, 28 (kick: the jump kick) */
	const Anim *thumbs, *victory;    /* 2c, 30 (thumbs: the thumbs up) */
	const Anim *yawn;                /* 34 */
	const Anim *double_jump, *jetpack; /* 38, 3c */
	u16 pal;                         /* 40 the first sprite palette (0-31) */
	u16 npal;                        /* 42 palettes that follow the struct */
	/* the body, scaled to the hero (T-26, engine/rules.ts bodyFor): Willy's is 40, 24, 5, -112, -96, 18, 24, 20, 27, 12, 30 */
	s16 body_h, crouch_h, half_w;    /* 44, 46, 48 standing and crouched heights, half width at the feet */
	s16 jump_vy, double_vy;          /* 4a, 4c start speeds, 1/16 px per frame */
	s16 knife_reach, kick_reach;     /* 4e, 50 */
	s16 knife_y, shot_y, crouch_shot_y, rocket_y; /* 52-58 heights over the feet */
};
#define WM_LOOK_PALETTES(l) ((const u16 *)((l) + 1))

#define WM_OFF(f) __builtin_offsetof(struct wm_data, f)
_Static_assert(sizeof(struct wm_object) == 12, "wm_object");
_Static_assert(sizeof(struct wm_rules) == 16, "wm_rules");
_Static_assert(WM_OFF(tags) == 0x18 && WM_OFF(objects) == 0x28 && WM_OFF(n_enemies) == 0x30, "wm_data head");
_Static_assert(WM_OFF(start_x) == 0x38 && WM_OFF(exit_x) == 0x48 && WM_OFF(slots) == 0x50, "wm_data body");
_Static_assert(WM_OFF(bg_color) == 0x58 && WM_OFF(rules) == 0x5c && WM_OFF(title) == 0x6c, "wm_data tail");
_Static_assert(WM_OFF(looks) == 0x70 && WM_OFF(n_play_pals) == 0x74 && WM_OFF(play_pal) == 0x78, "wm_data looks, palettes");
_Static_assert(WM_OFF(far_pal) == 0x7c && WM_OFF(n_play_codes) == 0x80 && WM_OFF(n_far_codes) == 0x82, "wm_data tile palettes");
_Static_assert(WM_OFF(n_bands) == 0x84 && WM_OFF(bands) == 0x86, "wm_data bands");
_Static_assert(WM_OFF(enemy_looks) == 0x9e && WM_OFF(civ_looks) == 0xa2, "wm_data actor looks");
_Static_assert(WM_OFF(platforms) == 0xa6 && WM_OFF(n_platforms) == 0xaa, "wm_data platforms");
_Static_assert(WM_OFF(pickup_looks) == 0xae, "wm_data pickup looks");
_Static_assert(WM_OFF(walk_y0) == 0xb2 && WM_OFF(walk_y1) == 0xb4, "wm_data walk band");
_Static_assert(WM_OFF(locks) == 0xb6 && WM_OFF(n_locks) == 0xba, "wm_data camera locks");
_Static_assert(sizeof(struct wm_data) == 0xbe, "wm_data size");
/* the records the packer writes for a look: 68000 alignment (2), big-endian */
_Static_assert(sizeof(Tile) == 6 && __builtin_offsetof(Tile, dx) == 2 && __builtin_offsetof(Tile, pal) == 4, "Tile");
_Static_assert(sizeof(Frame) == 10 && __builtin_offsetof(Frame, count) == 4 && __builtin_offsetof(Frame, w) == 5 && __builtin_offsetof(Frame, ax) == 6 && __builtin_offsetof(Frame, ay) == 8, "Frame");
_Static_assert(sizeof(Anim) == 8 && __builtin_offsetof(Anim, count) == 4 && __builtin_offsetof(Anim, fps) == 6, "Anim");
_Static_assert(sizeof(struct wm_look) == 0x5a && __builtin_offsetof(struct wm_look, pal) == 0x40 && __builtin_offsetof(struct wm_look, body_h) == 0x44 && __builtin_offsetof(struct wm_look, rocket_y) == 0x58, "wm_look");
_Static_assert(__builtin_offsetof(struct wm_look, crouch) == 0x18 && __builtin_offsetof(struct wm_look, kick) == 0x28 && __builtin_offsetof(struct wm_look, jetpack) == 0x3c, "wm_look moves");

#endif
