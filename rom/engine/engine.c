/* Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> */
/*
 * Willy Maker's data-driven engine (docs/willy-maker/engine.md): the ROM
 * prototype (rom/src/main.c) turned into a program that reads its game from
 * the data block at WM_DATA_ADDR (wmdata.h): the level's collision tags,
 * play and far tile maps, palettes, objects (player starts, enemies,
 * civilians, crates, pickups, the exit), each player's look, the texts of
 * the screens and the rules. It is built once (rom/tools/engine.mjs) and
 * shipped to the browser; "Create ROM" only packs data next to it.
 *
 * The rules are the prototype's (and play mode's, engine/game.ts):
 * gravity 6/16 px per frame², jump -7 px per frame, 32 px pushes, ladders
 * at 1.5 px per frame, down + jump through one-way ledges, the double-tap
 * run, the machine gun and the knife, the forward-only camera. Every frame
 * ends with lab_update() (lab_state.h), so experiment 1's harness reads the
 * same state from any game made with Willy Maker.
 */
#include "hw.h"
#include "gfx.h"
#include "lab_state.h"
#include "wmdata.h"

volatile u32 frame_count;

void *memset(void *d, int c, unsigned long n)
{
	u8 *p = d;
	while (n--)
		*p++ = (u8)c;
	return d;
}

void *memcpy(void *d, const void *s, unsigned long n)
{
	u8 *p = d;
	const u8 *q = s;
	while (n--)
		*p++ = *q++;
	return d;
}

static void wait_vblank(void)
{
	u32 f = frame_count;
	while (frame_count == f)
		;
}

/* ------------------------------------------------------------------ data */

#define D ((const struct wm_data *)WM_DATA_ADDR)
#define R (&D->rules)
#define D_TAGS ((const u8 *)D->tags)
#define D_PLAY ((const u16 *)D->play)
#define D_FAR ((const u16 *)D->far)
#define D_PAL ((const u16 *)D->palettes)
#define D_OBJ ((const struct wm_object *)D->objects)
#define D_LOOKS ((const u32 *)D->looks)

/* the built-in hero: the engine's own art (gfx.h), shirts from slots[] */
/* (his sheet has no land, victory, double jump or jet pack: idle, thumbs up and jump stand in, docs/willy-maker/moves.md) */
static const struct wm_look willy_look = {
	&anim_willy_idle, &anim_willy_run, &anim_willy_jump, &anim_willy_knife, &anim_willy_machine_gun, &anim_willy_bazooka,
	&anim_willy_crouch, &anim_willy_crawl, &anim_willy_idle, &anim_willy_turn, &anim_willy_jump_kick,
	&anim_willy_thumbs_up, &anim_willy_thumbs_up, &anim_willy_yawn, &anim_willy_jump, &anim_willy_jump, 0, 0,
	40, 24, 5, -112, -96, 18, 24, 20, 27, 12, 30, /* his body: the prototype's numbers (BODY_H, CROUCH_H, HALF_W, JUMP_VY…) */
};

/* player slot k's own look (wm_look), or 0 for Willy */
static const struct wm_look *own_look(int k)
{
	u32 a = D->looks ? D_LOOKS[k] : 0;
	return a >= WM_DATA_ADDR && a < 2 * WM_DATA_ADDR ? (const struct wm_look *)a : 0;
}

static int cols, rows, level_w, level_h, nplayers;

/* --------------------------------------------------------------- video */

static volatile u16 *scroll1_cell(int col, int row)
{
	u32 off = (row & 0x1f) + ((u32)(col & 0x3f) << 5) + ((u32)(row & 0x20) << 6);
	return (volatile u16 *)(GFX_SCROLL1 + off * 4);
}

static volatile u16 *scroll2_cell(int col, int row)
{
	u32 off = (row & 0x0f) + ((u32)(col & 0x3f) << 4) + ((u32)(row & 0x30) << 6);
	return (volatile u16 *)(GFX_SCROLL2 + off * 4);
}

static volatile u16 *scroll3_cell(int col, int row)
{
	u32 off = (row & 0x07) + ((u32)(col & 0x3f) << 3) + ((u32)(row & 0x38) << 6);
	return (volatile u16 *)(GFX_SCROLL3 + off * 4);
}

enum { INK_ACCENT, INK_WHITE, INK_CYAN, INK_RED };

/* text on scroll1, in screen cells (0-47 x 0-27) */
static void put_char(int x, int y, char ch, int ink)
{
	volatile u16 *c = scroll1_cell(x + SCREEN_X0 / 8, y + SCREEN_Y0 / 8);
	if (ch >= 'a' && ch <= 'z')
		ch -= 32;
	c[0] = (ch > ' ' && ch < 0x60) ? FONT_CODE(ch) : 0x0020;
	c[1] = ink; /* the palette within the scroll1 group */
}

static void put_big(int x, int y, char ch, int ink)
{
	int q;
	if (ch >= 'a' && ch <= 'z')
		ch -= 32;
	for (q = 0; q < 4; q++) {
		volatile u16 *c = scroll1_cell(x + (q & 1) + SCREEN_X0 / 8, y + (q >> 1) + SCREEN_Y0 / 8);
		c[0] = (ch > ' ' && ch < 0x60) ? (u16)(WM_FONT_BIG + (ch - 0x21) * 4 + q) : 0x0020;
		c[1] = ink;
	}
}

static void print(int x, int y, const char *s, int ink)
{
	for (; *s; s++, x++)
		if (x >= 0 && x < 48)
			put_char(x, y, *s, ink);
}

static void print_n(int x, int y, const char *s, int n, int ink)
{
	int i;
	for (i = 0; i < n; i++)
		put_char(x + i, y, s[i] ? s[i] : ' ', ink);
}

static void print_num(int x, int y, u32 v, int digits, int ink)
{
	char buf[11];
	int i;
	for (i = digits - 1; i >= 0; i--) {
		buf[i] = '0' + (char)(v % 10);
		v /= 10;
	}
	buf[digits] = 0;
	print(x, y, buf, ink);
}

static void blank(int x, int y, int n)
{
	int i;
	for (i = 0; i < n; i++)
		put_char(x + i, y, ' ', INK_WHITE);
}

static void clear_text(void)
{
	int c, r;
	for (c = 0; c < 64; c++)
		for (r = 0; r < 32; r++)
			scroll1_cell(c, r)[0] = 0x0020;
}

/* the text lines of the data block */
struct line {
	int row, col, attr, len;
	const char *s;
};

/* the next line of screen `scr` after *pos (a byte offset), or 0 */
static int next_line(int scr, int *pos, struct line *out)
{
	const u8 *t = (const u8 *)D->texts;
	for (;;) {
		const u8 *p = t + *pos;
		int len;
		if (p[0] == WM_SCR_END)
			return 0;
		len = p[4];
		*pos += (5 + len + 1) & ~1;
		if (p[0] != scr)
			continue;
		out->row = p[1];
		out->col = p[2];
		out->attr = p[3];
		out->len = len;
		out->s = (const char *)p + 5;
		return 1;
	}
}

static void draw_line(const struct line *l, int on)
{
	int i, ink = l->attr & WM_TXT_INK;
	for (i = 0; i < l->len; i++) {
		char ch = on ? l->s[i] : ' ';
		if (l->attr & WM_TXT_BIG)
			put_big(l->col + i * 2, l->row, ch, ink);
		else
			put_char(l->col + i, l->row, ch, ink);
	}
}

/* every line of a screen; blinking lines only when `blink_on` */
static void draw_screen(int scr, int blink_on)
{
	struct line l;
	int pos = 0;
	while (next_line(scr, &pos, &l))
		draw_line(&l, !(l.attr & WM_TXT_BLINK) || blink_on);
}

/* a screen's blinking line (its prompt), or 0 */
static int blink_line(int scr, struct line *out)
{
	int pos = 0, found = 0;
	struct line l;
	while (next_line(scr, &pos, &l))
		if (l.attr & WM_TXT_BLINK) {
			*out = l;
			found = 1;
		}
	return found;
}

/* the first line of a screen, for the texts the engine places itself */
static int first_line(int scr, struct line *l)
{
	int pos = 0;
	return next_line(scr, &pos, l);
}

/*
 * Copies words to the board. The empty asm forces each word through a data
 * register (the prototype's step 2 lesson: "move.w (a0)+,(0,a0,dN.l)" lands
 * one word late on the emulated 68000).
 */
static void copy_words(volatile u16 *dst, const u16 *src, int n)
{
	int i;
	for (i = 0; i < n; i++) {
		u16 v = src[i];
		__asm__ volatile("" : "+d"(v));
		dst[i] = v;
	}
}

static void load_palette(int index, const u16 *colors)
{
	copy_words(PALETTE + index * 16, colors, 16);
}

/* columns of the tile maps in the board's 64-column tilemaps */
static s16 loaded2[64], loaded3[64];
/* parallax bands (T-26): rows of the play layer that scroll at their own
   speed with the board's row scroll; their tiles are loaded around their
   own position, apart from the rest of the layer */
static u8 band_of_row[64];  /* 0, or the band + 1 */
static s16 loaded_band[4][64];
static s32 band_x[4];       /* where each band's view starts, world px */
static int nbands;
static u8 col_map[24576]; /* the collision map in RAM: crates and walls break */
/*
 * Tall levels: a tilemap holds 64 rows (scroll2 1024 px, scroll3 2048 px) and
 * its rows wrap like the scroll does, so level row r lives in tilemap row
 * r & 63. Each layer keeps a window of up to 64 level rows around the camera
 * (top: its first row, win: its height); a loaded column holds the window's
 * rows, and when the camera goes up or down the window slides a row at a
 * time, loading the row that comes in across the loaded columns. A level of
 * 64 rows or fewer has the window [0, rows) for good, as before.
 */
static int top2, win2, top3, win3;

/*
 * Each tile code's palette within its layer's bank (wm_data play_pal and
 * far_pal) goes in the attribute word's low 5 bits; codes outside the table
 * (the empty tiles, the exit door) use palette 0. The loops stay tight: the
 * first frame of a game streams every column on screen.
 */
static void load_col2(int c)
{
	int r, n = top2 + win2;
	const u8 *pal = (const u8 *)D->play_pal;
	u16 npal = pal ? D->n_play_codes : 0;
	const u16 *src = D_PLAY + top2 * cols + c;
	const u8 *tag = D_TAGS + top2 * cols + c;
	const u8 *col = col_map + top2 * cols + c;
	volatile u16 *p = 0;
	const u8 *band = nbands ? band_of_row : 0; /* no check at all without bands: the first frame streams every column */
	for (r = top2; r < n; r++, src += cols, tag += cols, col += cols, p += 2) {
		u16 code = *src, k;
		u8 t = *tag;
		if (!(r & 15) || r == top2) /* the tilemap is laid out in blocks of 16 rows */
			p = scroll2_cell(c, r);
		if (band && band[r])
			continue; /* a parallax band's row: loaded with its band */
		if ((t == T_CRATE || t == T_BREAKABLE) && *col == T_AIR)
			code = WM_EMPTY16;
		k = (u16)(code - WM_PLAY_TILES);
		p[0] = code;
		p[1] = k < npal ? pal[k] : 0;
	}
	loaded2[c & 63] = (s16)c;
}

/* column c of band b's rows */
static void load_band_col(int b, int c)
{
	const struct wm_band *bd = &D->bands[b];
	const u8 *pal = (const u8 *)D->play_pal;
	u16 npal = pal ? D->n_play_codes : 0;
	int r;
	for (r = bd->r0; r < bd->r1 && r < 64 && r < rows; r++) {
		u16 code = D_PLAY[r * cols + c], k = (u16)(code - WM_PLAY_TILES);
		volatile u16 *p = scroll2_cell(c, r);
		p[0] = code;
		p[1] = k < npal ? pal[k] : 0;
	}
	loaded_band[b][c & 63] = (s16)c;
}

static void load_col3(int c)
{
	int r, fc = D->far_cols, fr = top3 + win3;
	const u8 *pal = (const u8 *)D->far_pal;
	u16 npal = pal ? D->n_far_codes : 0;
	const u16 *src = D_FAR + top3 * fc + c;
	volatile u16 *p = 0;
	for (r = top3; r < fr; r++, src += fc, p += 2) {
		u16 code = *src, k = (u16)(code - WM_FAR_TILES);
		if (!(r & 7) || r == top3) /* blocks of 8 rows */
			p = scroll3_cell(c, r);
		p[0] = code;
		p[1] = k < npal ? pal[k] : 0;
	}
	loaded3[c & 63] = (s16)c;
}

/* level row r of the play layer across the loaded columns (a tall level's window slid onto it) */
static void load_row2(int r)
{
	const u8 *pal = (const u8 *)D->play_pal;
	u16 npal = pal ? D->n_play_codes : 0;
	int s;
	for (s = 0; s < 64; s++) {
		int c = loaded2[s];
		u16 code, k;
		u8 t;
		if (c < 0)
			continue;
		code = D_PLAY[r * cols + c];
		t = D_TAGS[r * cols + c];
		if ((t == T_CRATE || t == T_BREAKABLE) && col_map[r * cols + c] == T_AIR)
			code = WM_EMPTY16;
		k = (u16)(code - WM_PLAY_TILES);
		scroll2_cell(c, r)[0] = code;
		scroll2_cell(c, r)[1] = k < npal ? pal[k] : 0;
	}
}

/* far row r across the loaded far columns */
static void load_row3(int r)
{
	const u8 *pal = (const u8 *)D->far_pal;
	u16 npal = pal ? D->n_far_codes : 0;
	int s;
	for (s = 0; s < 64; s++) {
		int c = loaded3[s];
		u16 code, k;
		if (c < 0)
			continue;
		code = D_FAR[r * D->far_cols + c];
		k = (u16)(code - WM_FAR_TILES);
		scroll3_cell(c, r)[0] = code;
		scroll3_cell(c, r)[1] = k < npal ? pal[k] : 0;
	}
}

/*
 * Slides a tall layer's window (n rows in all, view: the first row on screen)
 * toward the camera: 24 rows of room above the view, a row or two a frame.
 * A view outside the window (the first frame) moves it at once and drops the
 * loaded columns, which then load again with the new window. Returns the new top.
 */
static int slide(int top, int n, int view, s16 *loaded, void (*load_row)(int))
{
	int target = view - 24, k;
	if (n <= 64)
		return 0;
	if (target > n - 64)
		target = n - 64;
	if (target < 0)
		target = 0;
	/* out of the window, unless the window already touches that end of the level */
	if (top < 0 || (view - 1 < top && top > 0) || (view + 18 >= top + 64 && top + 64 < n)) {
		for (k = 0; k < 64; k++)
			loaded[k] = -1;
		return target;
	}
	for (k = 0; k < 2 && top != target; k++) {
		if (target < top)
			load_row(--top);
		else
			load_row(top++ + 64);
	}
	return top;
}

static int cam_x, cam_y, cam_far;

/* ---------------------------------------------------------------- sound */

/*
 * Commands to the QSound Z80 (rom/engine/sound.z80, T-26) through shared
 * RAM 1 (0xf18000, the low byte of each word is the Z80's 0xc000 + n): an
 * 8-entry queue of (id, pan) and its write index at n = 0x10. Effects are
 * panned to where they happen on screen (0 left, 16 centre, 32 right).
 */
#define QRAM ((volatile u16 *)0xf18000)
enum { SFX_SHOT = 1, SFX_KNIFE, SFX_JUMP, SFX_HIT, SFX_ENEMY_DOWN, SFX_HURT, SFX_CRATE, SFX_PICKUP, SFX_RESCUE, SFX_COIN, SFX_START, SFX_ROCKET, SFX_EXPLOSION, SFX_KICK, SFX_LAND };
enum { MUSIC_TITLE, MUSIC_PLAY, MUSIC_CLEAR, MUSIC_CONTINUE, MUSIC_GAMEOVER };
static u8 q_head;

static void sound_cmd(int id, int pan)
{
	QRAM[q_head * 2] = (u16)id;
	QRAM[q_head * 2 + 1] = (u16)pan;
	q_head = (u8)((q_head + 1) & 7);
	QRAM[0x10] = q_head;
}

/* an effect where world x is on screen */
static void sfx(int id, s32 x)
{
	s32 pan = ((x - cam_x) * 32) / SCREEN_W;
	sound_cmd(id, pan < 0 ? 0 : pan > 32 ? 32 : (int)pan);
}

#define SFX_CENTRE(id) sound_cmd((id), 16)
#define MUSIC(n) sound_cmd(0x40 + (n), 16)

/* loads the tile columns around the camera that are not on the board yet */
static void stream(void)
{
	int b, c, c0 = cam_x / 16 - 2, c1 = cam_x / 16 + SCREEN_W / 16 + 3;
	top2 = slide(top2, rows, cam_y / 16, loaded2, load_row2);
	top3 = slide(top3, D->far_rows, cam_y / 2 / 32, loaded3, load_row3);
	for (c = c0; c <= c1; c++)
		if (c >= 0 && c < cols && loaded2[c & 63] != c)
			load_col2(c);
	for (b = 0; b < nbands; b++) {
		band_x[b] = (s32)cam_x * D->bands[b].speed / 100;
		c0 = (int)(band_x[b] / 16) - 2;
		c1 = (int)(band_x[b] / 16) + SCREEN_W / 16 + 3;
		for (c = c0; c <= c1; c++)
			if (c >= 0 && c < cols && loaded_band[b][c & 63] != c)
				load_band_col(b, c);
	}
	c0 = cam_x / 2 / 32 - 1;
	c1 = cam_x / 2 / 32 + SCREEN_W / 32 + 2;
	for (c = c0; c <= c1; c++)
		if (c >= 0 && c < D->far_cols && loaded3[c & 63] != c)
			load_col3(c);
}

static void video_init(void)
{
	int c, r;
	CPSA_OBJ_BASE = GFX_OBJ >> 8;
	CPSA_SCROLL1_BASE = GFX_SCROLL1 >> 8;
	CPSA_SCROLL2_BASE = GFX_SCROLL2 >> 8;
	CPSA_SCROLL3_BASE = GFX_SCROLL3 >> 8;
	CPSA_OTHER_BASE = GFX_OTHER >> 8;
	CPSA_PALETTE_BASE = GFX_PALETTE >> 8;
	CPSA_VIDEO_CTRL = 0x000e;
	CPSB_CONTROL = 0x003f;
	CPSB_PRIO0 = CPSB_PRIO1 = CPSB_PRIO2 = CPSB_PRIO3 = 0;
	CPSA_SCROLL1_X = CPSA_SCROLL1_Y = 0;
	CPSA_SCROLL2_X = CPSA_SCROLL2_Y = 0;
	CPSA_SCROLL3_X = CPSA_SCROLL3_Y = 0;
	/* back to front: far layer (scroll3), play layer (scroll2), sprites, text (scroll1) */
	CPSB_LAYER_CTRL = LAYER_ORDER(3, 2, 0, 1) | LAYER_EN_SCROLL1 | LAYER_EN_SCROLL23;
	for (c = 0; c < 64; c++) {
		for (r = 0; r < 64; r++) {
			volatile u16 *p = scroll1_cell(c, r);
			p[0] = 0x0020;
			p[1] = 0;
			p = scroll2_cell(c, r);
			p[0] = WM_EMPTY16;
			p[1] = 0;
			p = scroll3_cell(c, r);
			p[0] = WM_EMPTY32;
			p[1] = 0;
		}
		loaded2[c] = loaded3[c] = -1;
	}
	((volatile u16 *)GFX_OBJ)[3] = 0xff00;

	PALETTE[PAL_BACKGROUND] = D->bg_color;
	/* each layer's palettes into its own bank: the play layer's into scroll2's, the far layer's into scroll3's */
	for (c = 0; c < D->n_play_pals && c < WM_LAYER_PALETTES; c++)
		load_palette(PAL_SCROLL2 + c, D_PAL + c * 16);
	for (c = 0; c < D->n_far_pals && c < WM_LAYER_PALETTES; c++)
		load_palette(PAL_SCROLL3 + c, D_PAL + (D->n_play_pals + c) * 16);
	for (c = 0; c < OBJ_PALETTES; c++)
		load_palette(PAL_OBJ + c, obj_palettes + c * 16);
	/* the 4 player slots' own looks, over palettes no Willy shirt of the game or other art uses */
	for (c = 0; c < 4; c++) {
		const struct wm_look *l = own_look(c);
		if (l)
			for (r = 0; r < l->npal && l->pal + r < 32; r++)
				load_palette(PAL_OBJ + l->pal + r, WM_LOOK_PALETTES(l) + r * 16);
	}
	/* text: pen 1 ink, pen 2 shadow */
	PALETTE[(PAL_SCROLL1 + INK_ACCENT) * 16 + 1] = 0xffa3;
	PALETTE[(PAL_SCROLL1 + INK_WHITE) * 16 + 1] = 0xfeee;
	PALETTE[(PAL_SCROLL1 + INK_CYAN) * 16 + 1] = 0xf5de;
	PALETTE[(PAL_SCROLL1 + INK_RED) * 16 + 1] = 0xfe67;
	for (c = 0; c < 4; c++)
		PALETTE[(PAL_SCROLL1 + c) * 16 + 2] = 0xf000;
}

/* without a data block: a message instead of a crash */
static void no_data(void)
{
	PALETTE[PAL_BACKGROUND] = 0xf102;
	PALETTE[(PAL_SCROLL1 + INK_WHITE) * 16 + 1] = 0xfeee;
	PALETTE[(PAL_SCROLL1 + INK_WHITE) * 16 + 2] = 0xf000;
	print(14, 12, "NO GAME DATA", INK_WHITE);
	print(8, 14, "MAKE ONE WITH WILLY MAKER", INK_WHITE);
	for (;;)
		wait_vblank();
}

/* ------------------------------------------------------------- sprites */

#define MAX_SPRITES 248 /* the table holds 256, one ends it (T-26: was 200) */
#define OBJ ((volatile u16 *)GFX_OBJ)
static int nobj;

static void put_sprite(int x, int y, u16 code, u16 attr)
{
	volatile u16 *o;
	if (nobj >= MAX_SPRITES || x < -64 || x > SCREEN_W + 16 || y < -64 || y > SCREEN_H + 16)
		return;
	o = OBJ + nobj * 4;
	o[0] = (u16)(x + SCREEN_X0) & 0x1ff;
	o[1] = (u16)(y + SCREEN_Y0) & 0x1ff;
	o[2] = code;
	o[3] = attr;
	nobj++;
}

static void draw_frame(const Frame *f, int x, int y, int pal, int flip)
{
	int i;
	int left = flip ? x - (f->w - f->ax) : x - f->ax;
	int top = y - f->ay;
	for (i = 0; i < f->count; i++) {
		const Tile *t = &f->tiles[i];
		int tx = flip ? f->w - 16 - t->dx : t->dx;
		put_sprite(left + tx, top + t->dy, t->code, (u16)(((t->pal + pal) & 0x1f) | (flip ? 0x20 : 0)));
	}
}

static void draw_anim(const Anim *a, u32 t, int x, int y, int pal, int flip)
{
	u32 i = (t * a->fps / 60) % a->count;
	draw_frame(&a->frames[i], x, y, pal, flip);
}

static void flush_sprites(void)
{
	OBJ[nobj * 4 + 3] = 0xff00; /* end of table */
	nobj = 0;
}

/* --------------------------------------------------------------- game */

#define MAX_PLAYERS 4
#define BODY_H 40
#define HALF_W 5
#define GRAVITY 6
#define JUMP_VY (-7 * 16)
#define MAX_FALL (8 * 16)
#define CLIMB_SPEED 24
#define STEP_UP 32
#define PUSH_FRAMES 10
#define DROP_FRAMES 12
#define SHOTS 6
#define FIRE_EVERY 7
#define KNIFE_FRAMES 16
#define KNIFE_REACH 18
#define BAZOOKA_FRAMES 24
#define BAZOOKA_AMMO 3
#define ENEMY_SIGHT 170
/* the difficulty (T-15, engine/rules.ts DIFFICULTY): an enemy's fire interval
   and its shot's speed, normal = the prototype's 90 frames and 3 px */
static const u8 fire_every_of[4] = { 90, 150, 60, 40 };
static const u8 shot_speed_of[4] = { 3, 2, 4, 5 };
#define DIFFICULTY ((D->flags & WM_F_DIFFICULTY) >> 5)
#define ENEMY_FIRE_EVERY ((int)fire_every_of[DIFFICULTY])
#define ENEMY_SHOT_SPEED ((int)shot_speed_of[DIFFICULTY])
#define BREAKABLE_HP 2
#define MAX_ENEMIES 16
#define MAX_CIVS 8
#define MAX_CRATES 32
#define MAX_PICKUPS 64 /* the platformer's coins (T-22): was 16 */
#define MAX_EN_SHOTS 8
#define MAX_DAMAGED 32
/* the moves (docs/willy-maker/moves.md), as play mode's engine/rules.ts */
#define CROUCH_H 24
#define CROUCH_SHOT_Y 12
#define LAND_FRAMES 8
#define LAND_AFTER 10
#define TURN_FRAMES 6
#define KICK_FRAMES 20
/* the beat 'em up's fight (engine/rules.ts PUNCH_FRAMES and the rest) */
#define PUNCH_FRAMES 14
#define COMBO_KICK_FRAMES 20
#define STRIKE_AT 6
#define COMBO_WINDOW 18
#define PUNCH_REACH 26
#define FIGHT_KICK_REACH 30
#define DEPTH_REACH 8
#define ENEMY_GAP 26
#define ENEMY_STRIKE 16
#define ENEMY_ATTACK_FRAMES 28
#define ENEMY_REACH 34
#define ENEMY_REST 50
#define FALL_FRAMES 60
#define KICK_REACH 24
#define THUMBS_FRAMES 45
#define YAWN_AFTER 300
#define DOUBLE_JUMP_VY (-96)
#define JET_LIFT 10
#define JET_MAX_UP (-32)
#define JET_FUEL 90

static int credits;
static u16 sys_now, sys_last;

struct bullet {
	s16 x, y, dir, live;
};

struct rocket {
	s16 x, y, dir, live, speed;
};

struct player {
	int active, dead, pal;
	const struct wm_look *look;
	u16 pad, last;
	s32 x, y, vy; /* x world px; y and vy in 1/16 px */
	int flip, on_ground, climbing, drop_t, push_t;
	int running, tap_dir;
	u32 tap_time;
	int firing, fire_wait, knife_t, bazooka_t, special, ammo;
	int energy, hurt;
	/* the moves: crouched, shown moves' frames left, the kick's one hit, the air rules */
	int crouch, crouch_t, land_t, turn_t, kick_t, kick_hit, thumbs_t, idle_t, air_t, air_jumps, fuel, jetting;
	s32 hop; /* the beat 'em up's hop over the floor, 1/16 px, 0 or less */
	int punch_t, combo, combo_t, struck; /* the beat 'em up's fight: the punch, its place in the combo, the window to chain, landed */
	u32 t, score;
	struct bullet shots[SHOTS];
	struct rocket rocket;
};
static struct player pl[MAX_PLAYERS];
/* the beat 'em up (WM_F_DEPTH, engine/game.ts moveInDepth): its walkable band, feet y px */
static int depth;
static s32 walk_y0, walk_y1;
/* the enemy last hit and frames left to show its health (the beat 'em up's bar) */
static int last_hit = -1, last_hit_t;

static s32 in_walk(s32 fy)
{
	return fy < walk_y0 ? walk_y0 : fy > walk_y1 ? walk_y1 : fy;
}
static u16 start_now, start_last; /* bit k: port k's Start */

enum { EN_OFF, EN_WALK, EN_HIT, EN_DOWN, EN_ATTACK, EN_FALL };
static struct enemy {
	s32 x, fy, min, max;
	int state, hp, flip, dir, fire_wait;
	int lane; /* the beat 'em up: its depth offset beside a player (-1, 0, 1) */
	u32 t;
	const struct wm_look *look; /* the game's own enemy, or 0 for the android (T-30) */
} en[MAX_ENEMIES];
static int nen;

static struct bullet en_shots[MAX_EN_SHOTS];

static struct civ {
	s32 x, fy;
	int child, rescued;
	u32 t;
	const struct wm_look *look; /* the game's own civilian, or 0 */
} civ[MAX_CIVS];

/* entry i of a table of look addresses (enemy_looks, civ_looks), or 0 */
static const struct wm_look *actor_look(u32 table, int i)
{
	u32 a = table >= WM_DATA_ADDR && table < 2 * WM_DATA_ADDR ? ((const u32 *)table)[i] : 0;
	return a >= WM_DATA_ADDR && a < 2 * WM_DATA_ADDR ? (const struct wm_look *)a : 0;
}
static int nciv, rescued;

static struct crate {
	int col, row, cells, hp, contents, broken, breakable;
} crate[MAX_CRATES];
static int ncrates;

static struct pickup {
	s32 x, fy;
	int item, live;
	const struct wm_look *look; /* the game's own picture, or 0 for the engine's icon */
} pickup[MAX_PICKUPS];
static int npickups;

/* the moving platforms (engine/game.ts Platform): their place comes from
   plat_t, the frames played since the level started, alone */
#define MAX_PLATFORMS 16
static struct platform {
	s32 x0, y0, w, axis, range, speed;
	s32 x, y; /* the top left now */
	s32 dy;   /* how far the top moved this frame */
	/* a falling platform (engine/game.ts fallStep): rest, shake, fall, gone; frames in it, speed and top in 1/16 px */
	int falls, state;
	s32 t, vy, y16;
} plat[MAX_PLATFORMS];
enum { PL_REST, PL_SHAKE, PL_FALL, PL_GONE };
#define FALL_SHAKE 30
#define FALL_GRAVITY 4
#define FALL_MAX 64
#define FALL_BACK 180
static int nplat;
static u32 plat_t;

static void place_platform(struct platform *q, u32 t)
{
	s32 span = 2 * q->range, s = span ? (s32)((t * (u32)q->speed) % (u32)span) : 0;
	s32 off = s <= q->range ? s : span - s;
	q->x = q->axis ? q->x0 : q->x0 + off;
	q->y = q->axis ? q->y0 + off : q->y0;
}

/* a platform that rose to or past falling feet this frame (from: the feet before the fall), or -1 */
static int platform_rose(s32 x, s32 from, int half)
{
	int i;
	for (i = 0; i < nplat; i++)
		if (plat[i].state != PL_GONE && plat[i].dy <= 0 && from >= plat[i].y && from <= plat[i].y - plat[i].dy && x + half >= plat[i].x && x - half < plat[i].x + plat[i].w)
			return i;
	return -1;
}

/* the platform whose top is at fy under feet at x, or -1 */
static int platform_under(s32 x, s32 fy, int half)
{
	int i;
	for (i = 0; i < nplat; i++)
		if (plat[i].state != PL_GONE && fy == plat[i].y && x + half >= plat[i].x && x - half < plat[i].x + plat[i].w)
			return i;
	return -1;
}
/* the platformer (T-22): coins taken and in the level, a spring's and a stomp's bounce (1/16 px per frame) */
static int coins, ncoins;
#define COIN_SCORE 100
#define SPRING_VY (-180)
#define STOMP_VY (-80)

static struct {
	s16 cell;
	s8 hp;
} damaged[MAX_DAMAGED];

#define PRESSED(p, bit) (((p)->pad & (bit)) && !((p)->last & (bit)))

/* one port's controls as the P1 byte has them (b3 at 0x40) */
static u16 port_pad(int k, u16 p12)
{
	u16 v;
	switch (k) {
	case 0:
		return p12 & 0x7f;
	case 1:
		return (p12 >> 8) & 0x7f;
	case 2:
		v = (u16)(~IN_P3 & 0x3f);
		return (p12 & P3_BTN_3) ? v | BTN_3 : v;
	default:
		v = (u16)(~IN_P4 & 0x3f);
		return (p12 & P4_BTN_3) ? v | BTN_3 : v;
	}
}

static void read_inputs(void)
{
	u16 p12 = (u16)~IN_P12, p3 = (u16)~IN_P3, p4 = (u16)~IN_P4, coins;
	int k;
	for (k = 0; k < MAX_PLAYERS; k++) {
		u16 v = port_pad(k, p12);
		/* opposite directions together cancel out, as the core delivers them */
		if ((v & (BTN_LEFT | BTN_RIGHT)) == (BTN_LEFT | BTN_RIGHT))
			v &= (u16)~(BTN_LEFT | BTN_RIGHT);
		if ((v & (BTN_UP | BTN_DOWN)) == (BTN_UP | BTN_DOWN))
			v &= (u16)~(BTN_UP | BTN_DOWN);
		pl[k].last = pl[k].pad;
		pl[k].pad = v;
	}
	sys_last = sys_now;
	sys_now = (u16)(~IN_SYSTEM & 0xff);
	start_last = start_now;
	start_now = (u16)(((sys_now & SYS_START1) ? 1 : 0) | ((sys_now & 0x20) ? 2 : 0) | ((p3 & 0x80) ? 4 : 0) | ((p4 & 0x80) ? 8 : 0));
	/* coins of every port, counted on the press */
	coins = (u16)((sys_now & 0x03) | ((p3 & 0x40) ? 4 : 0) | ((p4 & 0x40) ? 8 : 0));
	{
		static u16 coins_last;
		u16 down = coins & (u16)~coins_last;
		coins_last = coins;
		for (k = 0; k < 4; k++)
			if ((down & (1 << k)) && credits < 9) {
				credits++;
				SFX_CENTRE(SFX_COIN);
			}
	}
}

static int start_pressed(int k)
{
	return (start_now & (1 << k)) && !(start_last & (1 << k));
}

static int free_play(void)
{
	return D->flags & WM_F_FREE_PLAY;
}

/* ---------------------------------------------------------- the level */

static int cell(int c, int r)
{
	if (c < 0 || c >= cols || r >= rows)
		return T_SOLID;
	if (r < 0)
		return T_AIR;
	return col_map[r * cols + c];
}

static int cell_at(s32 x, s32 y)
{
	return cell((int)(x >> 4), (int)(y >> 4));
}

static int is_solid(int t)
{
	return t == T_SOLID || t == T_CRATE || t == T_BREAKABLE;
}

static int is_ledge(int c, int r)
{
	int t = cell(c, r);
	return t == T_ONEWAY || (t == T_LADDER && cell(c, r - 1) != T_LADDER);
}

/* support_w from the cells alone (no platform) */
static int cell_support(s32 x, s32 fy, int drop, int half)
{
	int r, c0, c1, best = 0, c;
	if (fy & 15)
		return 0;
	r = (int)(fy >> 4);
	c0 = (int)((x - half) >> 4);
	c1 = (int)((x + half) >> 4);
	for (c = c0; c <= c1; c++) {
		if (is_solid(cell(c, r)))
			return 2;
		if (!drop && is_ledge(c, r))
			best = 1;
	}
	return best;
}

static int support_w(s32 x, s32 fy, int drop, int half)
{
	int best = cell_support(x, fy, drop, half);
	int on = !drop && platform_under(x, fy, half) >= 0;
	return best > on ? best : on;
}

/* a body h px tall (BODY_H standing, CROUCH_H crouched) */
static int body_blocked_h(s32 x, s32 fy, int h)
{
	s32 y;
	for (y = fy - 1; y > fy - h; y -= 8)
		if (is_solid(cell_at(x, y)))
			return 1;
	return is_solid(cell_at(x, fy - h));
}

/* the first place feet can stand at x, searching down from y (px) */
static s32 ground_below_b(s32 x, s32 y, const struct wm_look *b)
{
	s32 fy = ((y + 15) >> 4) << 4;
	if (fy < 16)
		fy = 16;
	for (; fy < level_h; fy += 16)
		if (support_w(x, fy, 0, b->half_w) && !body_blocked_h(x, fy, b->body_h))
			return fy;
	return level_h - 16;
}

static s32 ground_below(s32 x, s32 y)
{
	return ground_below_b(x, y, &willy_look);
}

static void clear_cell(int c, int r)
{
	col_map[r * cols + c] = T_AIR;
	if (loaded2[c & 63] == c && r >= top2 && r < top2 + win2)
		scroll2_cell(c, r)[0] = WM_EMPTY16;
}

static void spawn_pickup(s32 x, s32 fy, int item)
{
	if (npickups >= MAX_PICKUPS || item == WM_ITEM_NONE)
		return;
	pickup[npickups].x = x;
	pickup[npickups].fy = fy;
	pickup[npickups].item = item;
	pickup[npickups].live = 1;
	pickup[npickups].look = 0;
	npickups++;
}

/* breaks crate i, then the crates resting on it with nothing else under them,
   so none is left hanging over the floor */
static void crate_break(int i, struct player *by)
{
	struct crate *k = &crate[i];
	int q, j, n = k->cells;
	k->broken = 1;
	sfx(SFX_CRATE, k->col * 16 + k->cells * 8);
	for (q = 0; q < n * n; q++)
		if (cell(k->col + q % n, k->row + q / n) == T_CRATE)
			clear_cell(k->col + q % n, k->row + q / n);
	if (by)
		by->score += R->crate_score;
	spawn_pickup((s32)(k->col * 16 + n * 8), ground_below((s32)(k->col * 16 + n * 8), (s32)((k->row + n - 1) * 16)), k->contents);
	for (j = 0; j < ncrates; j++) {
		struct crate *u = &crate[j];
		int c, held = 0;
		if (u->broken || u->row + u->cells != k->row || u->col >= k->col + n || u->col + u->cells <= k->col)
			continue;
		for (c = u->col; c < u->col + u->cells; c++)
			if (is_solid(cell(c, u->row + u->cells)))
				held = 1;
		if (!held)
			crate_break(j, by);
	}
}

/* a hit on a crate or breakable wall at cell (c, r); 1 if something took it */
static int hit_cell(int c, int r, int damage, struct player *by)
{
	int i, t = cell(c, r);
	if (t == T_CRATE)
		for (i = 0; i < ncrates; i++) {
			struct crate *k = &crate[i];
			int n = k->cells;
			if (k->broken || c < k->col || c >= k->col + n || r < k->row || r >= k->row + n)
				continue;
			if (!k->breakable)
				return 1;
			k->hp -= damage;
			if (k->hp <= 0)
				crate_break(i, by);
			return 1;
		}
	if (t == T_CRATE || t == T_BREAKABLE) {
		int id = r * cols + c, free_slot = -1;
		for (i = 0; i < MAX_DAMAGED; i++) {
			if (damaged[i].hp && damaged[i].cell == id)
				break;
			if (!damaged[i].hp && free_slot < 0)
				free_slot = i;
		}
		if (i == MAX_DAMAGED) {
			if (free_slot < 0)
				free_slot = 0;
			i = free_slot;
			damaged[i].cell = (s16)id;
			damaged[i].hp = BREAKABLE_HP;
		}
		damaged[i].hp -= damage;
		if (damaged[i].hp <= 0) {
			damaged[i].hp = 0;
			clear_cell(c, r);
			if (by)
				by->score += R->crate_score;
		}
		return 1;
	}
	return 0;
}

/* -------------------------------------------------------------- actors */

static int en_alive(int i)
{
	return en[i].state == EN_WALK || en[i].state == EN_HIT || en[i].state == EN_ATTACK || en[i].state == EN_FALL;
}

static int enemies_left(void)
{
	int i, n = 0;
	for (i = 0; i < nen; i++)
		n += en_alive(i);
	return n;
}

static void en_damage(int i, int n, struct player *by)
{
	if (!en_alive(i))
		return;
	en[i].hp -= n;
	en[i].t = 0;
	if (en[i].hp <= 0) {
		en[i].state = EN_DOWN;
		by->score += R->enemy_score;
		sfx(SFX_ENEMY_DOWN, en[i].x);
	} else {
		en[i].state = EN_HIT;
		sfx(SFX_HIT, en[i].x);
	}
}

static int enemy_at(s32 x, s32 y, int reach)
{
	int i;
	for (i = 0; i < nen; i++) {
		s32 dx = en[i].x - x;
		if (en_alive(i) && dx > -reach && dx < reach && y <= en[i].fy && y > en[i].fy - 40)
			return i;
	}
	return -1;
}

static void player_spawn(struct player *p, s32 x, s32 fy)
{
	int i;
	p->active = 1;
	p->dead = 0;
	p->x = x;
	p->y = fy * 16;
	p->hop = 0;
	p->punch_t = p->combo = p->combo_t = p->struck = 0;
	p->vy = 0;
	p->flip = 0;
	p->on_ground = 1;
	p->climbing = p->drop_t = p->push_t = 0;
	p->running = p->tap_dir = 0;
	p->special = 0;
	p->ammo = p->knife_t = p->bazooka_t = p->fire_wait = p->firing = 0;
	p->crouch = p->crouch_t = p->land_t = p->turn_t = p->kick_t = p->kick_hit = p->thumbs_t = 0;
	p->idle_t = p->air_t = p->air_jumps = p->jetting = 0;
	p->fuel = JET_FUEL;
	p->t = 0;
	for (i = 0; i < SHOTS; i++)
		p->shots[i].live = 0;
	p->rocket.live = 0;
}

/* where place_near looks, in order */
static const s8 around[5] = { 0, 24, -24, 48, -48 };
static const s8 beside[5] = { -24, 24, -48, 48, 0 };

/* a place for a player near x, on screen: x and 24 and 48 px to each side,
   on the first free floor from y down to max_y; else the old search */
static void place_near(s32 x, s32 y, s32 max_y, const s8 *offs, const struct wm_look *b, s32 *ox, s32 *ofy)
{
	s32 lo = cam_x + 16, hi = cam_x + SCREEN_W - 16, cx, fy;
	int i;
	for (i = 0; i < 5; i++) {
		cx = x + offs[i];
		if (cx < lo || cx > hi)
			continue;
		fy = ((y + 15) >> 4) << 4;
		if (fy < 16)
			fy = 16;
		for (; fy <= max_y && fy < level_h; fy += 16)
			if (support_w(cx, fy, 0, b->half_w) && !body_blocked_h(cx, fy, b->body_h)) {
				*ox = cx;
				*ofy = fy;
				return;
			}
	}
	cx = x < lo ? lo : x > hi ? hi : x;
	*ox = cx;
	*ofy = ground_below_b(cx, y, b);
}

/* a player comes in: at their start, or next to a player already in */
static void player_join(int k)
{
	struct player *p = &pl[k];
	s32 x, fy;
	int i, lead = -1;
	for (i = 0; i < nplayers; i++)
		if (pl[i].active && i != k) {
			lead = i;
			break;
		}
	if (depth) {
		/* the beat 'em up: beside the player already in, at the start, or near the camera, inside the band */
		if (lead >= 0) {
			x = pl[lead].x + (pl[lead].x + 24 < cam_x + SCREEN_W - 12 ? 24 : -24);
			fy = in_walk(pl[lead].y >> 4);
		} else if (D->start_x[k] >= 0) {
			x = D->start_x[k];
			fy = in_walk(D->start_y[k]);
		} else {
			x = cam_x + 64 + k * 24;
			fy = in_walk((walk_y0 + walk_y1) >> 1);
		}
	} else if (lead < 0 && D->start_x[k] >= 0) {
		x = D->start_x[k];
		fy = ground_below_b(x, D->start_y[k] - 16, p->look);
	} else if (lead >= 0) {
		/* beside the player already in, on a floor they can stand on (J-06) */
		s32 lf = pl[lead].y >> 4;
		place_near(pl[lead].x, lf - 48, lf + 64, beside, p->look, &x, &fy);
	} else
		place_near(cam_x + 64 + k * 24, cam_y, cam_y + SCREEN_H, around, p->look, &x, &fy);
	player_spawn(p, x, fy);
	p->energy = R->energy;
	p->hurt = R->hurt_frames;
}

/* back on the ground near the camera's left side */
static void respawn_near_camera(struct player *p)
{
	s32 x = p->x, fy;
	int energy = p->energy, hurt = p->hurt;
	u32 score = p->score;
	if (x < cam_x + 64)
		x = cam_x + 64;
	if (x > cam_x + SCREEN_W - 64)
		x = cam_x + SCREEN_W - 64;
	if (depth)
		fy = in_walk(p->y >> 4);
	else
		place_near(x, cam_y, cam_y + SCREEN_H, around, p->look, &x, &fy);
	player_spawn(p, x, fy);
	p->energy = energy;
	p->hurt = hurt;
	p->score = score;
}

static void hurt(struct player *p, int fell)
{
	if (!p->active)
		return;
	if (p->hurt && !fell)
		return;
	if (p->hurt) {
		respawn_near_camera(p); /* fell while protected: no energy lost */
		return;
	}
	sfx(SFX_HURT, p->x);
	if (--p->energy <= 0) {
		p->energy = 0;
		p->active = 0;
		p->dead = 1;
		return;
	}
	p->hurt = R->hurt_frames;
	if (fell || R->respawn_on_hurt)
		respawn_near_camera(p);
}

static void game_reset(void)
{
	const struct wm_object *o = D_OBJ;
	int i, n = cols * rows;
	for (i = 0; i < n; i++)
		col_map[i] = D_TAGS[i];
	for (i = 0; i < 64; i++) {
		int b;
		loaded2[i] = loaded3[i] = -1;
		band_of_row[i] = 0;
		for (b = 0; b < 4; b++)
			loaded_band[b][i] = -1;
	}
	depth = (D->flags & WM_F_DEPTH) != 0;
	last_hit = -1;
	last_hit_t = 0;
	walk_y0 = D->walk_y0;
	walk_y1 = D->walk_y1;
	/* a tall level's windows come to the camera on the first stream() */
	win2 = rows < 64 ? rows : 64;
	top2 = rows > 64 ? -1 : 0;
	win3 = D->far_rows < 64 ? D->far_rows : 64;
	top3 = D->far_rows > 64 ? -1 : 0;
	/* the parallax bands' rows (a level of 64 rows at most), and the row scroll on when there are any */
	nbands = rows > 64 ? 0 : D->n_bands < 4 ? D->n_bands : 4;
	for (i = 0; i < nbands; i++) {
		int r;
		for (r = D->bands[i].r0; r < D->bands[i].r1 && r < 64; r++)
			band_of_row[r] = (u8)(i + 1);
	}
	CPSA_ROWSCROLL_OFFS = 0;
	CPSA_VIDEO_CTRL = nbands ? 0x000f : 0x000e;
	for (i = 0; i < MAX_DAMAGED; i++)
		damaged[i].hp = 0;
	for (i = 0; i < MAX_PLAYERS; i++) {
		memset(&pl[i], 0, sizeof pl[i]);
		pl[i].look = own_look(i);
		if (pl[i].look)
			pl[i].pal = pl[i].look->pal;
		else {
			pl[i].look = &willy_look;
			pl[i].pal = (int)D->slots[i] * RECRUIT_PAL_OFFSET;
		}
	}
	nen = D->n_enemies < MAX_ENEMIES ? D->n_enemies : MAX_ENEMIES;
	for (i = 0; i < nen; i++, o++) {
		en[i].x = o->x;
		en[i].fy = o->y;
		en[i].min = o->a;
		en[i].max = o->b;
		en[i].hp = o->c > 0 ? o->c : R->enemy_hp;
		en[i].dir = o->d > 0 ? 1 : -1;
		en[i].flip = en[i].dir < 0;
		en[i].state = EN_WALK;
		en[i].t = (u32)i * 11;
		en[i].fire_wait = ENEMY_FIRE_EVERY;
		en[i].lane = (i % 3) - 1;
		en[i].look = actor_look(D->enemy_looks, i);
	}
	o = D_OBJ + D->n_enemies;
	nciv = D->n_civs < MAX_CIVS ? D->n_civs : MAX_CIVS;
	for (i = 0; i < nciv; i++, o++) {
		civ[i].x = o->x;
		civ[i].fy = o->y;
		civ[i].child = o->a;
		civ[i].rescued = 0;
		civ[i].t = (u32)i * 17;
		civ[i].look = actor_look(D->civ_looks, i);
	}
	o = D_OBJ + D->n_enemies + D->n_civs;
	ncrates = D->n_crates < MAX_CRATES ? D->n_crates : MAX_CRATES;
	for (i = 0; i < ncrates; i++, o++) {
		crate[i].col = o->x;
		crate[i].row = o->y;
		crate[i].cells = o->a;
		crate[i].hp = o->b;
		crate[i].breakable = o->b > 0;
		crate[i].contents = o->c;
		crate[i].broken = 0;
	}
	o = D_OBJ + D->n_enemies + D->n_civs + D->n_crates;
	npickups = 0;
	coins = ncoins = 0;
	for (i = 0; i < D->n_pickups; i++, o++) {
		spawn_pickup(o->x, o->y, o->a);
		if (npickups && i == npickups - 1)
			pickup[i].look = actor_look(D->pickup_looks, i);
		if (o->a == WM_ITEM_COIN)
			ncoins++;
	}
	plat_t = 0;
	nplat = D->n_platforms < MAX_PLATFORMS ? D->n_platforms : MAX_PLATFORMS;
	o = (const struct wm_object *)D->platforms;
	for (i = 0; i < nplat; i++, o++) {
		plat[i].x0 = o->x;
		plat[i].y0 = o->y;
		plat[i].w = o->a;
		plat[i].axis = o->b & 1;
		plat[i].falls = (o->b >> 1) & 1;
		plat[i].state = PL_REST;
		plat[i].t = plat[i].vy = plat[i].y16 = 0;
		plat[i].range = o->c;
		plat[i].speed = o->d;
		plat[i].dy = 0;
		place_platform(&plat[i], 0);
	}
	for (i = 0; i < MAX_EN_SHOTS; i++)
		en_shots[i].live = 0;
	rescued = 0;
	cam_x = cam_y = cam_far = 0;
}

/* a falling platform's frame: at rest until stood on, then it shakes, falls out of the level and comes back */
static void fall_step(struct platform *q, int ridden)
{
	if (q->state == PL_REST) {
		if (ridden) {
			q->state = PL_SHAKE;
			q->t = 0;
		}
	} else if (q->state == PL_SHAKE) {
		if (++q->t >= FALL_SHAKE) {
			q->state = PL_FALL;
			q->vy = 0;
			q->y16 = q->y * 16;
		}
	} else if (q->state == PL_FALL) {
		q->vy += FALL_GRAVITY;
		if (q->vy > FALL_MAX)
			q->vy = FALL_MAX;
		q->y16 += q->vy;
		q->y = q->y16 >> 4;
		/* it breaks on solid ground (its top's middle in a solid cell) or once out of the level */
		if (is_solid(cell_at(q->x + (q->w >> 1), q->y)) || q->y > level_h + 16) {
			q->state = PL_GONE;
			q->t = 0;
		}
	} else if (++q->t >= FALL_BACK) {
		q->state = PL_REST;
		q->y = q->y0;
	}
}

/* moves the platforms to this frame's place, carrying whoever stands on them (engine/game.ts movePlatforms) */
static void move_platforms(void)
{
	int i, k;
	plat_t++;
	for (i = 0; i < nplat; i++) {
		struct platform *q = &plat[i];
		s32 wx = q->x, wy = q->y, dx, dy, n;
		int ride[MAX_PLAYERS];
		for (k = 0; k < nplayers; k++)
			ride[k] = pl[k].active && pl[k].on_ground && !pl[k].climbing && platform_under(pl[k].x, pl[k].y >> 4, pl[k].look->half_w) == i;
		if (q->falls) {
			int ridden = 0;
			for (k = 0; k < nplayers; k++)
				ridden |= ride[k];
			fall_step(q, ridden);
		} else
			place_platform(q, plat_t);
		dx = q->x - wx;
		/* a falling platform coming back is not a move (it carries nobody and catches nobody) */
		dy = q->falls && q->state == PL_REST ? 0 : q->y - wy;
		q->dy = dy;
		for (k = 0; k < nplayers; k++) {
			struct player *p = &pl[k];
			int step = dx > 0 ? 1 : -1;
			if (!ride[k])
				continue;
			/* sideways one pixel at a time, stopped by walls; up or down with the top */
			for (n = 0; n < (dx < 0 ? -dx : dx); n++) {
				if (body_blocked_h(p->x + step + step * p->look->half_w, p->y >> 4, p->look->body_h))
					break;
				p->x += step;
			}
			if (dy < 0 && body_blocked_h(p->x, (p->y >> 4) + dy, p->look->body_h))
				continue;
			/* going down, ground on the way stops the rider (the platform goes on alone) */
			{
				s32 py, ground = 0;
				for (py = (p->y >> 4) + 1; py <= (p->y >> 4) + dy && !ground; py++)
					if (cell_support(p->x, py, 0, p->look->half_w))
						ground = py;
				p->y = ground ? ground * 16 : p->y + dy * 16;
			}
		}
	}
}

static void draw_platforms(void)
{
	int i, x;
	for (i = 0; i < nplat; i++) {
		int sx = (int)plat[i].x - cam_x, sy = (int)plat[i].y - cam_y;
		u16 base = plat[i].falls ? TILE_PLATFORM + 3 : TILE_PLATFORM; /* a falling one: rusty and cracked */
		if (plat[i].state == PL_GONE)
			continue;
		if (plat[i].state == PL_SHAKE)
			sx += (plat[i].t & 2) ? 1 : -1;
		for (x = 0; x < plat[i].w; x += 16)
			put_sprite(sx + x, sy, x == 0 ? base : x + 16 >= plat[i].w ? base + 2 : base + 1, PAL_PICKUPS);
	}
}

static void walk(struct player *p, int dir, int speed)
{
	s32 fy = p->y >> 4;
	int n;
	for (n = 0; n < speed; n++) {
		s32 nx = p->x + dir;
		s32 front = nx + dir * p->look->half_w;
		if (!body_blocked_h(front, fy, p->look->body_h)) {
			p->x = nx;
			p->push_t = 0;
			continue;
		}
		/* blocked: with the push rule, an edge up to STEP_UP high with room above is
		   climbed after a push; else it must be jumped */
		if (p->on_ground && (D->flags & WM_F_PUSH_CLIMB)) {
			s32 top = fy;
			while (fy - top < STEP_UP + 16 && is_solid(cell_at(front, top - 1)))
				top = ((top - 1) >> 4) << 4;
			if (fy - top <= STEP_UP && !body_blocked_h(front, top, p->look->body_h) && !body_blocked_h(p->x, top, p->look->body_h)) {
				if (++p->push_t >= PUSH_FRAMES) {
					p->y = top * 16;
					p->x = nx;
					p->push_t = 0;
				}
			}
		}
		return;
	}
}

static s32 iabs(s32 v)
{
	return v < 0 ? -v : v;
}

/*
 * A beat 'em up blow (engine/game.ts strike): every enemy standing in front
 * within reach px and DEPTH_REACH px of depth takes n hits; a knocking blow
 * throws it down (FALL_FRAMES on the floor, 8 px back).
 */
static int strike(struct player *p, int reach, int n, int knock)
{
	s32 fy = p->y >> 4;
	int dir = p->flip ? -1 : 1, i, hit = 0;
	for (i = 0; i < nen; i++) {
		struct enemy *e = &en[i];
		s32 dx = (e->x - p->x) * dir;
		if (e->state != EN_WALK && e->state != EN_HIT && e->state != EN_ATTACK)
			continue;
		if (dx < 0 || dx > reach || iabs(e->fy - fy) > DEPTH_REACH)
			continue;
		en_damage(i, n, p);
		last_hit = i;
		last_hit_t = 120;
		if (knock && e->state == EN_HIT) {
			e->state = EN_FALL;
			e->t = 0;
			e->x += dir * 8;
		}
		hit = 1;
	}
	return hit;
}

/*
 * The beat 'em up's moves (WM_F_DEPTH, engine/game.ts moveInDepth): left and
 * right stopped by solid cells at the feet, up and down a pixel a frame
 * inside the walkable band, B2 hops and lands back at the same depth.
 */
static void move_in_depth(struct player *p, int dir)
{
	s32 fy = p->y >> 4;
	int n, dz = (p->pad & BTN_UP) ? -1 : (p->pad & BTN_DOWN) ? 1 : 0;
	p->crouch = 0;
	/* the fight (phase 2): a punch holds the player still until it ends */
	if (p->punch_t) {
		int len = p->combo == 3 ? COMBO_KICK_FRAMES : PUNCH_FRAMES;
		p->punch_t--;
		if (!p->struck && p->punch_t == len - STRIKE_AT) {
			p->struck = 1;
			if (p->combo == 3)
				strike(p, FIGHT_KICK_REACH, 2, 1);
			else
				strike(p, PUNCH_REACH, 1, 0);
		}
		if (!p->punch_t)
			p->combo_t = p->combo < 3 ? COMBO_WINDOW : 0;
		return;
	}
	if (p->combo_t)
		p->combo_t--;
	if (p->on_ground && PRESSED(p, BTN_1)) {
		p->combo = p->combo_t ? p->combo + 1 : 1;
		p->combo_t = 0;
		p->punch_t = p->combo == 3 ? COMBO_KICK_FRAMES : PUNCH_FRAMES;
		p->struck = 0;
		sfx(p->combo == 3 ? SFX_KICK : SFX_KNIFE, p->x);
		return;
	}
	/* a flying kick: B1 in the air knocks down what it meets */
	if (!p->on_ground && PRESSED(p, BTN_1) && !p->kick_t) {
		p->kick_t = KICK_FRAMES;
		p->kick_hit = 0;
		sfx(SFX_KICK, p->x);
	}
	if (p->kick_t && !p->kick_hit && strike(p, FIGHT_KICK_REACH, 2, 1))
		p->kick_hit = 1;
	if (dir) {
		if (p->on_ground && p->flip != (dir < 0))
			p->turn_t = TURN_FRAMES;
		p->flip = dir < 0;
		for (n = 0; n < (p->running ? 2 : 1); n++) {
			if (is_solid(cell_at(p->x + dir + dir * p->look->half_w, fy - 1)))
				break;
			p->x += dir;
		}
	}
	if (dz) {
		s32 nf = in_walk(fy + dz);
		if (!is_solid(cell_at(p->x, nf - 1)))
			p->y = nf * 16;
	}
	if (p->on_ground && PRESSED(p, BTN_2)) {
		p->vy = p->look->jump_vy;
		p->on_ground = 0;
		sfx(SFX_JUMP, p->x);
	}
	if (!p->on_ground) {
		p->air_t++;
		p->vy += GRAVITY;
		if (p->vy > MAX_FALL)
			p->vy = MAX_FALL;
		p->hop += p->vy;
		if (p->hop >= 0) {
			p->hop = 0;
			p->vy = 0;
			p->on_ground = 1;
			if (p->air_t >= LAND_AFTER) {
				p->land_t = LAND_FRAMES;
				sfx(SFX_LAND, p->x);
			}
			p->air_t = 0;
		}
	}
}

static void update_player(struct player *p)
{
	int i, dir = 0, jet_was;
	s32 fy, d;
	if (!p->active)
		return;
	p->t++;
	if (p->drop_t)
		p->drop_t--;
	if (p->hurt)
		p->hurt--;
	if (p->land_t)
		p->land_t--;
	if (p->turn_t)
		p->turn_t--;
	if (p->thumbs_t)
		p->thumbs_t--;
	if (p->kick_t)
		p->kick_t--;
	p->idle_t = !p->pad && p->on_ground && !p->climbing ? p->idle_t + 1 : 0;
	jet_was = p->jetting;
	p->jetting = 0;
	if (p->pad & BTN_LEFT)
		dir = -1;
	else if (p->pad & BTN_RIGHT)
		dir = 1;
	if (PRESSED(p, BTN_LEFT) || PRESSED(p, BTN_RIGHT)) {
		if (dir == p->tap_dir && frame_count - p->tap_time <= R->run_tap)
			p->running = 1;
		p->tap_dir = dir;
		p->tap_time = frame_count;
	}
	if (!dir)
		p->running = 0;
	fy = p->y >> 4;

	if (depth)
		move_in_depth(p, dir);
	else {
		/* ladders: up in front of one, or down standing on its top (6 px of grace) */
		if (!p->climbing && !p->knife_t) {
			int k;
			for (k = -6; k <= 6; k += 6) {
				s32 lx = p->x + k;
				if (((p->pad & BTN_UP) && cell_at(lx, fy - 8) == T_LADDER) ||
				    ((p->pad & BTN_DOWN) && !(p->pad & BTN_1) && p->on_ground && cell_at(lx, fy) == T_LADDER)) {
					p->climbing = 1;
					p->on_ground = 0;
					p->vy = 0;
					p->x = ((lx >> 4) << 4) + 8;
					break;
				}
			}
		}
		if (p->climbing) {
			if (p->pad & BTN_UP) {
				p->y -= CLIMB_SPEED;
				fy = p->y >> 4;
				if (cell_at(p->x, fy - 1) != T_LADDER) {
					p->y = (((fy - 1) >> 4) + 1) * 16 * 16;
					p->climbing = 0;
					p->on_ground = 1;
				}
			} else if (p->pad & BTN_DOWN) {
				p->y += CLIMB_SPEED;
				fy = p->y >> 4;
				if (support_w(p->x, (fy >> 4) << 4, 1, p->look->half_w) == 2 && (fy & 15) < 2) {
					p->y = ((fy >> 4) << 4) * 16;
					p->climbing = 0;
					p->on_ground = 1;
				}
			}
			/* off the ladder's column or off its bottom: the climb ends and the player falls (L-06, J-04) */
			if (p->climbing && cell_at(p->x, fy - 1) != T_LADDER && cell_at(p->x, fy) != T_LADDER)
				p->climbing = 0;
			if (PRESSED(p, BTN_1)) {
				p->climbing = 0;
				p->vy = p->look->jump_vy / 2;
			}
		} else {
			/* crouch on Down (B1 with it drops through a ledge); stand up only where 40 px fit */
			if (p->on_ground && (p->pad & BTN_DOWN) && !(p->pad & BTN_1)) {
				if (!p->crouch)
					p->crouch_t = 0;
				p->crouch = 1;
			} else if (p->crouch && (!p->on_ground || !body_blocked_h(p->x, fy, p->look->body_h)))
				p->crouch = 0;
			if (p->crouch) {
				p->crouch_t++;
				p->running = 0;
				p->push_t = 0;
				if (dir) {
					s32 nx = p->x + dir;
					if (p->flip != (dir < 0))
						p->turn_t = TURN_FRAMES;
					p->flip = dir < 0;
					/* crawl: 1 px every 2 frames, under anything CROUCH_H tall */
					if ((p->t & 1) && !body_blocked_h(nx + dir * p->look->half_w, fy, p->look->crouch_h))
						p->x = nx;
				}
			} else if (dir && !p->knife_t && !p->bazooka_t) {
				if (p->on_ground && p->flip != (dir < 0))
					p->turn_t = TURN_FRAMES;
				p->flip = dir < 0;
				walk(p, dir, p->running ? 2 : 1);
			} else
				p->push_t = 0;
			fy = p->y >> 4;
			if (p->on_ground && PRESSED(p, BTN_1)) {
				if ((p->pad & BTN_DOWN) && support_w(p->x, fy, 0, p->look->half_w) == 1) {
					p->drop_t = DROP_FRAMES;
					p->on_ground = 0;
					p->vy = 0;
					p->y += 16;
				} else {
					p->crouch = 0;
					p->vy = p->look->jump_vy;
					sfx(SFX_JUMP, p->x);
					p->on_ground = 0;
				}
			} else if (!p->on_ground && PRESSED(p, BTN_1) && (D->flags & WM_F_DOUBLE_JUMP) && !p->air_jumps) {
				p->vy = p->look->double_vy;
				sfx(SFX_JUMP, p->x);
				p->air_jumps = 1;
			}
			/* jump kick: Down + B2 in the air */
			if (!p->on_ground && (p->pad & BTN_DOWN) && PRESSED(p, BTN_2) && !p->kick_t && !(D->flags & WM_F_NO_WEAPONS)) {
				p->kick_t = KICK_FRAMES;
				p->kick_hit = 0;
				sfx(SFX_KICK, p->x);
			}
			if (p->on_ground && !support_w(p->x, fy, 0, p->look->half_w)) {
				p->on_ground = 0;
				p->vy = 0;
			}
			if (!p->on_ground) {
				s32 from = p->y >> 4, to, py, was = p->vy;
				p->air_t++;
				p->vy += GRAVITY;
				if (p->vy > MAX_FALL)
					p->vy = MAX_FALL;
				/* the jet pack, after gravity: B1 held starts it while falling (or after the
				   double jump) and keeps it going, even rising, until the fuel runs out */
				if ((D->flags & WM_F_JETPACK) && (p->pad & BTN_1) && p->fuel > 0 && (jet_was || was >= 0 || p->air_jumps)) {
					/* it lifts up to JET_MAX_UP and never slows a faster rise (the double jump's) */
					if (p->vy > JET_MAX_UP) {
						p->vy -= JET_LIFT;
						if (p->vy < JET_MAX_UP)
							p->vy = JET_MAX_UP;
					}
					p->fuel--;
					p->jetting = 1;
				}
				to = (p->y + p->vy) >> 4;
				if (p->vy > 0) {
					/* a platform going up can meet the feet from below: it is found at its own top */
					int rose = p->drop_t ? -1 : platform_rose(p->x, from, p->look->half_w);
					s32 last = rose >= 0 && plat[rose].y > to ? plat[rose].y : to;
					for (py = rose >= 0 ? plat[rose].y : from + 1; py <= last; py++)
						if (support_w(p->x, py, p->drop_t != 0, p->look->half_w)) {
							p->y = py * 16;
							p->vy = 0;
							p->on_ground = 1;
							if (p->air_t >= LAND_AFTER) {
								p->land_t = LAND_FRAMES;
								sfx(SFX_LAND, p->x);
							}
							p->air_t = 0;
							p->air_jumps = 0;
							p->fuel = JET_FUEL;
							break;
						}
					if (!p->on_ground)
						p->y += p->vy;
				} else {
					if (is_solid(cell_at(p->x, to - p->look->body_h)))
						p->vy = 0;
					else
						p->y += p->vy;
				}
			}
		}
	}
	fy = p->y >> 4;
	if (fy > level_h + 64) {
		hurt(p, 1); /* fell out */
		return;
	}
	if (cell_at(p->x, fy - 1) == T_HAZARD || cell_at(p->x, fy - (p->look->body_h >> 1)) == T_HAZARD)
		hurt(p, 0);
	if (!p->active)
		return;

	/* pickups */
	for (i = 0; i < npickups; i++) {
		struct pickup *k = &pickup[i];
		d = k->x - p->x;
		if (k->item == WM_ITEM_SPRING) {
			/* a spring: standing on it throws the player up (the platformer, T-22) */
			if (k->live && d > -12 && d < 12 && p->on_ground && fy == k->fy) {
				p->vy = SPRING_VY;
				p->on_ground = 0;
				p->air_jumps = 0;
				sfx(SFX_JUMP, p->x);
			}
			continue;
		}
		if (k->live && d > -14 && d < 14 && fy - k->fy > -8 && fy - k->fy < 8) {
			k->live = 0;
			sfx(SFX_PICKUP, p->x);
			if (k->item == WM_ITEM_COIN) {
				coins++;
				p->score += COIN_SCORE;
			}
			if (k->item == WM_ITEM_BAZOOKA) {
				p->special = WM_ITEM_BAZOOKA;
				p->ammo = BAZOOKA_AMMO;
			} else if (k->item == WM_ITEM_HEALTH && p->energy < R->energy)
				p->energy++;
		}
	}

	/* special (B3): the picked-up weapon while it has ammo; nothing without one */
	if (p->bazooka_t)
		p->bazooka_t--;
	if (PRESSED(p, BTN_3) && p->special == WM_ITEM_BAZOOKA && p->ammo > 0 && !p->rocket.live && p->on_ground && !(D->flags & WM_F_NO_WEAPONS)) {
		p->rocket.live = 1;
		sfx(SFX_ROCKET, p->x);
		p->rocket.dir = p->flip ? -1 : 1;
		p->rocket.x = (s16)(p->x + (p->flip ? -30 : 10));
		p->rocket.y = (s16)(fy - p->look->rocket_y);
		p->rocket.speed = 2;
		p->bazooka_t = BAZOOKA_FRAMES;
		if (--p->ammo == 0)
			p->special = 0;
	}
	if (p->rocket.live) {
		s32 tip;
		int ei;
		if (p->rocket.speed < 8)
			p->rocket.speed++;
		p->rocket.x += p->rocket.dir * p->rocket.speed;
		tip = p->rocket.x + 16 + p->rocket.dir * 14;
		ei = enemy_at(tip, p->rocket.y + 8, 16);
		if (ei >= 0) {
			en_damage(ei, 9, p);
			p->rocket.live = 0;
			sfx(SFX_EXPLOSION, tip);
		} else if (hit_cell((int)(tip >> 4), (p->rocket.y + 8) >> 4, 9, p)) {
			p->rocket.live = 0;
			sfx(SFX_EXPLOSION, tip);
		}
		else if (cell_at(tip, p->rocket.y + 8) == T_SOLID || p->rocket.x < cam_x - 48 || p->rocket.x > cam_x + SCREEN_W + 48)
			p->rocket.live = 0;
	}

	/* fire (B2): the knife if an enemy stands right in front, else the machine gun */
	if (p->knife_t)
		p->knife_t--;
	if (PRESSED(p, BTN_2) && p->on_ground && !p->climbing && !(D->flags & WM_F_NO_WEAPONS)) {
		int ei = enemy_at(p->x + (p->flip ? -p->look->knife_reach : p->look->knife_reach), fy - p->look->knife_y, 16);
		if (ei >= 0) {
			p->knife_t = KNIFE_FRAMES;
			sfx(SFX_KNIFE, p->x);
			en_damage(ei, 2, p);
		}
	}
	p->firing = !(D->flags & WM_F_NO_WEAPONS) && (p->pad & BTN_2) && !p->knife_t && !p->bazooka_t && !p->climbing && !p->kick_t;
	if (p->fire_wait)
		p->fire_wait--;
	if (p->firing && !p->fire_wait)
		for (i = 0; i < SHOTS; i++)
			if (!p->shots[i].live) {
				p->shots[i].live = 1;
				p->shots[i].dir = p->flip ? -1 : 1;
				p->shots[i].x = (s16)(p->x + (p->flip ? -20 : 20));
				p->shots[i].y = (s16)(fy - (p->crouch ? p->look->crouch_shot_y : p->look->shot_y));
				p->fire_wait = FIRE_EVERY;
				sfx(SFX_SHOT, p->x);
				break;
			}
	/* the kick's first enemy in front, body to body, takes 2 hits once */
	if (p->kick_t && !p->kick_hit)
		for (i = 0; i < nen; i++) {
			s32 dx = (en[i].x - p->x) * (p->flip ? -1 : 1);
			if (en_alive(i) && dx >= 0 && dx <= p->look->kick_reach && en[i].fy - 40 < fy && en[i].fy > fy - p->look->body_h) {
				p->kick_hit = 1;
				en_damage(i, 2, p);
				break;
			}
		}
	for (i = 0; i < SHOTS; i++) {
		struct bullet *b = &p->shots[i];
		int ei;
		if (!b->live)
			continue;
		b->x += b->dir * 6;
		ei = enemy_at(b->x, b->y, 8);
		if (ei >= 0) {
			en_damage(ei, 1, p);
			b->live = 0;
		} else if (hit_cell(b->x >> 4, b->y >> 4, 1, p))
			b->live = 0;
		else if (cell_at(b->x, b->y) == T_SOLID || b->x < cam_x - 32 || b->x > cam_x + SCREEN_W + 32)
			b->live = 0;
	}
}

/*
 * The beat 'em up's enemies (engine/game.ts updateEnemiesInDepth): each walks
 * to stand ENEMY_GAP px beside the nearest player, on its own side and its
 * lane's depth, winds up and hits a player in reach, rests, and gets up after
 * a knock-down.
 */
static void update_enemies_in_depth(void)
{
	int i, k;
	if (last_hit_t)
		last_hit_t--;
	for (i = 0; i < nen; i++) {
		struct enemy *e = &en[i];
		e->t++;
		if (e->state == EN_WALK) {
			struct player *target = 0;
			s32 best = 0x7fffffff, pf, tx, tz;
			for (k = 0; k < nplayers; k++) {
				s32 d;
				if (!pl[k].active)
					continue;
				d = iabs(pl[k].x - e->x) + iabs((pl[k].y >> 4) - e->fy);
				if (d < best) {
					best = d;
					target = &pl[k];
				}
			}
			if (!target)
				continue;
			pf = target->y >> 4;
			tx = target->x + (e->x < target->x ? -1 : 1) * ENEMY_GAP;
			tz = in_walk(pf + e->lane * 6);
			if (e->t & 1)
				e->x += tx > e->x ? 1 : tx < e->x ? -1 : 0;
			else
				e->fy += tz > e->fy ? 1 : tz < e->fy ? -1 : 0;
			e->dir = target->x >= e->x ? 1 : -1;
			e->flip = e->dir < 0;
			if (e->fire_wait)
				e->fire_wait--;
			else if (iabs(target->x - e->x) <= ENEMY_GAP + 6 && iabs(pf - e->fy) <= 6) {
				e->state = EN_ATTACK;
				e->t = 0;
			}
		} else if (e->state == EN_ATTACK) {
			if (e->t == ENEMY_STRIKE)
				for (k = 0; k < nplayers; k++) {
					struct player *p = &pl[k];
					s32 dx = (p->x - e->x) * e->dir;
					if (p->active && !p->hurt && p->hop > -16 * 16 && dx >= 0 && dx <= ENEMY_REACH && iabs((p->y >> 4) - e->fy) <= DEPTH_REACH)
						hurt(p, 0);
				}
			if (e->t >= ENEMY_ATTACK_FRAMES) {
				e->state = EN_WALK;
				e->t = 0;
				e->fire_wait = ENEMY_REST;
			}
		} else if (e->state == EN_HIT) {
			if (e->t > 14) {
				e->state = EN_WALK;
				e->t = 0;
				e->fire_wait = ENEMY_REST;
			}
		} else if (e->state == EN_FALL) {
			if (e->t > FALL_FRAMES) {
				e->state = EN_WALK;
				e->t = 0;
				e->fire_wait = ENEMY_REST;
			}
		} else if (e->state == EN_DOWN && e->t > 90)
			e->state = EN_OFF;
	}
}

static void update_enemies(int playing)
{
	int i, k;
	if (depth) {
		update_enemies_in_depth();
		return;
	}
	for (i = 0; i < nen; i++) {
		struct enemy *e = &en[i];
		e->t++;
		switch (e->state) {
		case EN_WALK: {
			int target = -1;
			s32 best = ENEMY_SIGHT;
			if (playing && (R->enemies_chase || R->enemies_shoot))
				for (k = 0; k < nplayers; k++) {
					s32 dx = pl[k].x - e->x, dy = (pl[k].y >> 4) - e->fy;
					if (dx < 0)
						dx = -dx;
					if (pl[k].active && dy > -16 && dy < 16 && dx < best) {
						best = dx;
						target = k;
					}
				}
			if (target >= 0 && R->enemies_chase) {
				s32 dx = pl[target].x - e->x;
				e->dir = dx > 0 ? 1 : -1;
				/* with touch damage it walks into the player (it used to stop 22 px away, out of the 14 px reach, J-09) */
				s32 gap = R->touch_hurts ? 8 : 22;
				if ((dx > gap || dx < -gap) && (e->t & 1))
					e->x += e->dir;
			} else if (e->t & 1) {
				/* the patrol: walk, turn at its ends */
				e->x += e->dir;
				if (e->x <= e->min || e->x >= e->max)
					e->dir = -e->dir;
			}
			if (target >= 0 && R->enemies_shoot) {
				s32 dx = pl[target].x - e->x;
				if (!R->enemies_chase)
					e->dir = dx > 0 ? 1 : -1;
				if (e->fire_wait)
					e->fire_wait--;
				else if (dx > 40 || dx < -40) {
					for (k = 0; k < MAX_EN_SHOTS; k++)
						if (!en_shots[k].live) {
							en_shots[k].live = 1;
							en_shots[k].x = (s16)(e->x + e->dir * 16);
							en_shots[k].y = (s16)(e->fy - 26);
							en_shots[k].dir = (s16)e->dir;
							break;
						}
					e->fire_wait = ENEMY_FIRE_EVERY;
				}
			}
			if (e->x < e->min)
				e->x = e->min;
			if (e->x > e->max)
				e->x = e->max;
			e->flip = e->dir < 0; /* the sheet faces right */
			break;
		}
		case EN_HIT:
			if (e->t > 14) {
				e->state = EN_WALK;
				e->t = 0;
			}
			break;
		case EN_DOWN:
			if (e->t > 90)
				e->state = EN_OFF;
			break;
		}
		/* stomping: landing on an enemy's head takes it down and bounces (the platformer, T-22) */
		if (playing && (D->flags & WM_F_STOMP) && en_alive(i))
			for (k = 0; k < nplayers; k++) {
				struct player *p = &pl[k];
				s32 dx = p->x - e->x, fy = p->y >> 4;
				if (p->active && p->vy > 0 && dx > -16 && dx < 16 && fy >= e->fy - 44 && fy <= e->fy - 28) {
					en_damage(i, 99, p);
					p->vy = STOMP_VY;
					break;
				}
			}
		/* touching an enemy hurts */
		if (playing && R->touch_hurts && en_alive(i))
			for (k = 0; k < nplayers; k++) {
				struct player *p = &pl[k];
				s32 dx = p->x - e->x, dy = (p->y >> 4) - e->fy;
				if (p->active && !p->hurt && dx > -14 && dx < 14 && dy > -24 && dy < 24)
					hurt(p, 0);
			}
	}
	for (i = 0; i < MAX_EN_SHOTS; i++) {
		struct bullet *s = &en_shots[i];
		if (!s->live)
			continue;
		s->x += s->dir * ENEMY_SHOT_SPEED;
		for (k = 0; k < nplayers; k++) {
			struct player *p = &pl[k];
			s32 fy = p->y >> 4, dx = p->x - s->x;
			if (p->active && dx > -8 && dx < 8 && s->y <= fy && s->y > fy - (p->crouch ? p->look->crouch_h : p->look->body_h)) {
				hurt(p, 0);
				s->live = 0;
				break;
			}
		}
		if (s->live && (is_solid(cell_at(s->x, s->y)) || s->x < cam_x - 32 || s->x > cam_x + SCREEN_W + 32))
			s->live = 0;
	}
}

static void update_civilians(void)
{
	int i, k;
	for (i = 0; i < nciv; i++) {
		civ[i].t++;
		if (civ[i].rescued)
			continue;
		for (k = 0; k < nplayers; k++) {
			s32 dx = civ[i].x - pl[k].x, dy = (pl[k].y >> 4) - civ[i].fy;
			if (pl[k].active && pl[k].on_ground && dx > -20 && dx < 20 && dy > -8 && dy < 8) {
				civ[i].rescued = 1;
				civ[i].t = 0;
				rescued++;
				sfx(SFX_RESCUE, civ[i].x);
				pl[k].score += R->rescue_score;
				pl[k].thumbs_t = THUMBS_FRAMES;
				break;
			}
		}
	}
}

/* ------------------------------------------------------------- camera */

#define VIEW_TOP 24 /* room kept above the highest head */
#define VIEW_BOTTOM 8 /* and below the lowest feet */

static void update_camera(int snap)
{
	s32 sx = 0, sy = 0, tx, ty, fy;
	s32 min_x = 0x7fffffff, max_x = -0x7fffffff, top = 0x7fffffff, feet = -0x7fffffff;
	s32 lo_x, hi_x, lo_y, hi_y, before;
	int n = 0, k;
	for (k = 0; k < nplayers; k++)
		if (pl[k].active) {
			fy = pl[k].y >> 4;
			sx += pl[k].x;
			sy += fy;
			n++;
			if (pl[k].x < min_x)
				min_x = pl[k].x;
			if (pl[k].x > max_x)
				max_x = pl[k].x;
			if (fy - pl[k].look->body_h < top)
				top = fy - pl[k].look->body_h;
			if (fy > feet)
				feet = fy;
		}
	if (!n)
		return;
	/* the positions that keep every active player in the picture: x from the one
	   in front (lo_x) to the one behind (hi_x, which wins), y with every head and
	   every pair of feet on screen (lo_y > hi_y when they do not fit) */
	hi_x = min_x - 12;
	lo_x = max_x - SCREEN_W + 12;
	if (lo_x > hi_x)
		lo_x = hi_x;
	lo_y = feet + VIEW_BOTTOM - SCREEN_H;
	hi_y = top - VIEW_TOP;
	tx = sx / n - SCREEN_W / 3;
	if (tx < cam_far - (s32)D->backtrack)
		tx = cam_far - (s32)D->backtrack;
	ty = sy / n - 150;
	if (lo_y <= hi_y) {
		if (ty < lo_y)
			ty = lo_y;
		if (ty > hi_y)
			ty = hi_y;
	}
	if (tx > level_w - SCREEN_W)
		tx = level_w - SCREEN_W;
	if (tx < 0)
		tx = 0;
	if (ty > level_h - SCREEN_H)
		ty = level_h - SCREEN_H;
	if (ty < 0)
		ty = 0;
	if (snap) {
		cam_x = (int)tx;
		cam_y = (int)ty;
	} else {
		before = cam_x;
		cam_x += (int)(tx - cam_x) / 4 + (tx > cam_x) - (tx < cam_x);
		cam_y += (int)(ty - cam_y) / 6 + (ty > cam_y) - (ty < cam_y);
		/* it never moves past the player furthest behind, so it does not push anyone
		   into a wall or a crate (J-05): the one in front waits at the right side */
		if (cam_x > before) {
			if (cam_x > hi_x)
				cam_x = (int)(hi_x > before ? hi_x : before);
		} else if (cam_x < before) {
			if (cam_x < lo_x)
				cam_x = (int)(lo_x < before ? lo_x : before);
		}
	}
	if (lo_y <= hi_y) {
		if (cam_y < lo_y)
			cam_y = (int)lo_y;
		if (cam_y > hi_y)
			cam_y = (int)hi_y;
		if (cam_y > level_h - SCREEN_H)
			cam_y = level_h - SCREEN_H;
		if (cam_y < 0)
			cam_y = 0;
	}
	if (cam_x > cam_far)
		cam_far = cam_x;
	for (k = 0; k < nplayers; k++)
		if (pl[k].active) {
			if (pl[k].x < cam_x + 12)
				pl[k].x = cam_x + 12;
			if (pl[k].x > cam_x + SCREEN_W - 12)
				pl[k].x = cam_x + SCREEN_W - 12;
		}
}

static void set_scroll(void)
{
	/* each raster line of a band's rows adds the band's lag behind the camera to scroll2 */
	if (nbands) {
		volatile u16 *other = (volatile u16 *)GFX_OTHER;
		int i;
		for (i = 0; i < 256; i++) {
			s32 y = cam_y + i - SCREEN_Y0;
			int r = y >= 0 ? (int)(y >> 4) : 0, b = r < 64 ? band_of_row[r] : 0;
			other[i] = b ? (u16)(band_x[b - 1] - cam_x) : 0;
		}
	}
	CPSA_SCROLL2_X = (u16)(cam_x - SCREEN_X0);
	CPSA_SCROLL2_Y = (u16)(cam_y - SCREEN_Y0);
	CPSA_SCROLL3_X = (u16)(cam_x / 2 - SCREEN_X0);
	CPSA_SCROLL3_Y = (u16)(cam_y / 2 - SCREEN_Y0);
}

/* -------------------------------------------------------------- drawing */

/* a move shown once: frame `t` (frames since it began) at its fps, held on its last frame */
static void draw_once(const Anim *a, u32 t, int x, int y, int pal, int flip)
{
	u32 i = t * a->fps / 60;
	draw_frame(&a->frames[i < a->count ? i : a->count - 1u], x, y, pal, flip);
}

static int victory; /* the section is cleared: every player shows its victory */

static void draw_player(struct player *p)
{
	int sx = (int)p->x - cam_x;
	int sy = (int)((p->y + p->hop) >> 4) - cam_y; /* a beat 'em up's hop draws it over the floor */
	int moving = (p->pad & (BTN_LEFT | BTN_RIGHT)) != 0;
	const struct wm_look *l = p->look;
	if (!p->active || (p->hurt & 4))
		return;
	if (p->climbing) {
		int f = (p->pad & (BTN_UP | BTN_DOWN)) ? (int)(p->y >> 7) & 1 : 0;
		draw_frame(&l->jump->frames[1 % l->jump->count], sx, sy, p->pal, f);
		return;
	}
	if (victory)
		draw_anim(l->victory, p->t, sx, sy, p->pal, p->flip);
	else if (!p->on_ground) {
		/* the jump's frames by vertical speed, as Willy's sheet has them */
		int i = p->vy < -60 ? 1 : p->vy < 0 ? 2 : p->vy < 60 ? 3 : 4;
		const Anim *a = p->jetting ? l->jetpack : p->air_jumps && p->vy < 0 ? l->double_jump : l->jump;
		if (p->kick_t)
			draw_once(l->kick, (u32)(KICK_FRAMES - p->kick_t), sx, sy, p->pal, p->flip);
		else
			draw_frame(&a->frames[i % a->count], sx, sy, p->pal, p->flip);
	} else if (p->punch_t) {
		/* the beat 'em up's punches, and the combo's kick */
		if (p->combo == 3)
			draw_once(l->kick, (u32)(COMBO_KICK_FRAMES - p->punch_t), sx, sy, p->pal, p->flip);
		else
			draw_frame(&l->knife->frames[(PUNCH_FRAMES - p->punch_t) / 4 % l->knife->count], sx, sy, p->pal, p->flip);
	} else if (p->crouch) {
		if (moving)
			draw_anim(l->crawl, p->t, sx, sy, p->pal, p->flip);
		else
			draw_once(l->crouch, (u32)p->crouch_t, sx, sy, p->pal, p->flip);
	} else if (p->knife_t)
		draw_frame(&l->knife->frames[(KNIFE_FRAMES - p->knife_t) / 4 % l->knife->count], sx, sy, p->pal, p->flip);
	else if (p->bazooka_t)
		draw_anim(l->bazooka, p->t, sx, sy, p->pal, p->flip);
	else if (p->firing)
		draw_anim(l->gun, p->t, sx, sy, p->pal, p->flip);
	else if (p->land_t)
		draw_once(l->land, (u32)(LAND_FRAMES - p->land_t), sx, sy, p->pal, p->flip);
	else if (p->turn_t && moving)
		draw_once(l->turn, (u32)(TURN_FRAMES - p->turn_t), sx, sy, p->pal, p->flip);
	else if (moving)
		draw_anim(l->run, p->running ? p->t : p->t / 2, sx, sy, p->pal, p->flip);
	else if (p->thumbs_t)
		draw_once(l->thumbs, (u32)(THUMBS_FRAMES - p->thumbs_t), sx, sy, p->pal, p->flip);
	else if (p->idle_t >= YAWN_AFTER)
		draw_anim(l->yawn, (u32)(p->idle_t - YAWN_AFTER), sx, sy, p->pal, p->flip);
	else
		draw_anim(l->idle, p->t, sx, sy, p->pal, p->flip);
}

static void draw_shots(struct player *p)
{
	int i;
	for (i = 0; i < SHOTS; i++)
		if (p->shots[i].live)
			put_sprite(p->shots[i].x - cam_x - 8, p->shots[i].y - cam_y - 8, TILE_BULLET, (u16)(PAL_BULLET | (p->shots[i].dir < 0 ? 0x20 : 0)));
	if (p->rocket.live)
		put_sprite(p->rocket.x - cam_x, p->rocket.y - cam_y, TILE_ROCKET, (u16)(PAL_ROCKET | (p->rocket.dir < 0 ? 0x20 : 0) | (1 << 8)));
}

static void draw_enemy(int i);

static void draw_enemies(void)
{
	int i;
	for (i = 0; i < MAX_EN_SHOTS; i++)
		if (en_shots[i].live)
			put_sprite(en_shots[i].x - cam_x - 8, en_shots[i].y - cam_y - 8, TILE_BULLET, (u16)(PAL_BULLET | (en_shots[i].dir < 0 ? 0x20 : 0)));
	for (i = 0; i < nen; i++)
		draw_enemy(i);
}

static void draw_enemy(int i)
{
	struct enemy *e = &en[i];
	int sx = (int)e->x - cam_x, sy = (int)e->fy - cam_y;
	if (e->state == EN_OFF || sx < -60 || sx > SCREEN_W + 60 || sy < -10 || sy > SCREEN_H + 60)
		return;
	if (e->look) {
		/* the game's own enemy (T-30): walk, a shot just fired, hit, its death (wm_look's run, gun, land, victory) */
		const struct wm_look *l = e->look;
		if (e->state == EN_DOWN || e->state == EN_FALL) {
			/* down for good blinks out; knocked down (the beat 'em up) lies still */
			const Anim *a = l->victory;
			u32 f = e->t * a->fps / 60;
			if (f >= a->count)
				f = a->count - 1;
			if (e->state == EN_FALL || e->t < 70 || (e->t & 4))
				draw_frame(&a->frames[f], sx, sy, l->pal, e->flip);
		} else
			draw_anim(e->state == EN_HIT ? l->land : e->state == EN_ATTACK || e->fire_wait > ENEMY_FIRE_EVERY - 15 ? l->gun : l->run, e->t, sx, sy, l->pal, e->flip);
		return;
	}
	if (e->state == EN_DOWN || e->state == EN_FALL) {
		u32 f = e->t * anim_robot_defeated.fps / 60;
		if (f >= anim_robot_defeated.count)
			f = anim_robot_defeated.count - 1;
		if (e->state == EN_FALL || e->t < 70 || (e->t & 4))
			draw_frame(&anim_robot_defeated.frames[f], sx, sy, 0, e->flip);
		return;
	}
	draw_anim(e->state == EN_HIT ? &anim_robot_hit : &anim_robot_walk, e->t, sx, sy, 0, e->flip);
}

static void draw_civilian(int i);

static void draw_civilians(void)
{
	int i;
	for (i = 0; i < nciv; i++)
		draw_civilian(i);
}

static void draw_civilian(int i)
{
	int sx = (int)civ[i].x - cam_x, sy = (int)civ[i].fy - cam_y;
	const Anim *a;
	if (sx < -40 || sx > SCREEN_W + 40 || sy < -10 || sy > SCREEN_H + 50)
		return;
	if (civ[i].look) {
		/* the game's own civilian: worried until rescued, then thanks (wm_look's land, thumbs) */
		draw_anim(civ[i].rescued ? civ[i].look->thumbs : civ[i].look->land, civ[i].t, sx, sy, civ[i].look->pal, 0);
		return;
	}
	if (civ[i].child)
		a = civ[i].rescued ? &anim_child_happy : &anim_child_worried;
	else
		a = civ[i].rescued ? &anim_woman_happy : &anim_woman_worried;
	draw_anim(a, civ[i].t, sx, sy, 0, 1);
}

static void draw_pickups(void)
{
	int i;
	for (i = 0; i < npickups; i++) {
		int sx = (int)pickup[i].x - cam_x, sy = (int)pickup[i].fy - cam_y;
		if (!pickup[i].live)
			continue;
		if (pickup[i].look)
			/* the game's own picture: its idle animation, standing on the pickup's place */
			draw_anim(pickup[i].look->idle, frame_count, sx, sy, pickup[i].look->pal, 0);
		else if (pickup[i].item == WM_ITEM_COIN)
			put_sprite(sx - 8, sy - 16 - ((frame_count >> 3) & 1), TILE_COIN, PAL_PICKUPS);
		else if (pickup[i].item == WM_ITEM_SPRING)
			put_sprite(sx - 8, sy - 16, TILE_SPRING, PAL_PICKUPS);
		else if (frame_count & 16)
			put_sprite(sx - 16, sy - 18, TILE_ROCKET, (u16)(PAL_ROCKET | (1 << 8)));
	}
}

/*
 * A beat 'em up's actors by depth (WM_F_DEPTH): the nearer the screen (the
 * larger the feet y), the earlier in the sprite list, which the board draws
 * in front; at the same depth players before enemies before civilians, as
 * play mode draws them.
 */
static void draw_actors_by_depth(void)
{
	s32 key[MAX_PLAYERS + MAX_ENEMIES + MAX_CIVS];
	int n = 0, i, j, k;
	for (i = 0; i < nplayers; i++)
		if (pl[i].active)
			key[n++] = ((pl[i].y >> 4) << 8) | (2 << 6) | i;
	for (i = 0; i < nen; i++)
		if (en[i].state != EN_OFF)
			key[n++] = (en[i].fy << 8) | (1 << 6) | i;
	for (i = 0; i < nciv; i++)
		key[n++] = (civ[i].fy << 8) | i;
	for (i = 1; i < n; i++) /* largest first */
		for (j = i; j > 0 && key[j] > key[j - 1]; j--) {
			k = key[j];
			key[j] = key[j - 1];
			key[j - 1] = k;
		}
	for (i = 0; i < n; i++) {
		int kind = (key[i] >> 6) & 3, idx = key[i] & 63;
		if (kind == 2)
			draw_player(&pl[idx]);
		else if (kind == 1)
			draw_enemy(idx);
		else
			draw_civilian(idx);
	}
}

static void draw_world(void)
{
	int k;
	for (k = 0; k < nplayers; k++)
		draw_shots(&pl[k]);
	if (depth) {
		for (k = 0; k < MAX_EN_SHOTS; k++)
			if (en_shots[k].live)
				put_sprite(en_shots[k].x - cam_x - 8, en_shots[k].y - cam_y - 8, TILE_BULLET, (u16)(PAL_BULLET | (en_shots[k].dir < 0 ? 0x20 : 0)));
		draw_actors_by_depth();
		draw_pickups();
		draw_platforms();
		flush_sprites();
		return;
	}
	for (k = 0; k < nplayers; k++)
		draw_player(&pl[k]);
	draw_enemies();
	draw_pickups();
	draw_civilians();
	draw_platforms();
	flush_sprites();
}

/* ------------------------------------------------------------ lab state */

struct lab_state lab_state __attribute__((section(".lab_state")));
static int lab_mode;

static void lab_update(void)
{
	struct lab_state *s = &lab_state;
	int i, playing = lab_mode == LAB_MODE_PLAYING || lab_mode == LAB_MODE_CLEAR || lab_mode == LAB_MODE_GAME_OVER;
	s->magic = LAB_MAGIC;
	s->version = LAB_VERSION;
	s->size = sizeof(struct lab_state);
	s->frame = frame_count;
	s->mode = (u8)lab_mode;
	s->credits = (u8)credits;
	s->section_clear = lab_mode == LAB_MODE_CLEAR;
	s->flags = (u8)((D->exit_w > 0 ? LAB_FLAG_EXIT : 0) | (D->exit_w > 0 && !R->exit_needs_enemies ? LAB_FLAG_EXIT_TOUCH : 0) | (R->touch_hurts || R->enemies_shoot ? LAB_FLAG_DAMAGE : 0));
	s->cam_x = (s16)cam_x;
	s->cam_y = (s16)cam_y;
	s->level_w = (u16)level_w;
	s->level_h = (u16)level_h;
	if (D->exit_w > 0) {
		s->exit_x0 = D->exit_x;
		s->exit_x1 = (s16)(D->exit_x + D->exit_w);
		s->exit_y = D->exit_y;
	} else
		s->exit_x0 = s->exit_x1 = s->exit_y = -1;
	s->n_enemies = (u8)(nen < LAB_ENEMIES ? nen : LAB_ENEMIES);
	s->n_civilians = (u8)(nciv < LAB_CIVILIANS ? nciv : LAB_CIVILIANS);
	s->col_map = (u32)col_map;
	s->col_cols = (u16)cols;
	s->col_rows = (u16)rows;
	for (i = 0; i < LAB_PLAYERS; i++) {
		struct lab_player *o = &s->player[i];
		struct player *p = &pl[i];
		if (i >= nplayers || !playing || !p->active) {
			memset(o, 0, sizeof *o);
			if (i < nplayers && playing) {
				o->score = p->score;
				if (p->dead)
					o->state = LAB_PL_DEAD;
			}
			continue;
		}
		o->active = 1;
		if (p->climbing)
			o->state = LAB_PL_CLIMB;
		else if (!p->on_ground)
			o->state = LAB_PL_AIR;
		else if (p->crouch)
			o->state = p->pad & (BTN_LEFT | BTN_RIGHT) ? LAB_PL_CRAWL : LAB_PL_CROUCH;
		else if (p->knife_t || p->bazooka_t || p->firing)
			o->state = LAB_PL_ATTACK;
		else if (p->pad & (BTN_LEFT | BTN_RIGHT))
			o->state = p->running ? LAB_PL_RUN : LAB_PL_WALK;
		else
			o->state = LAB_PL_IDLE;
		o->facing = p->flip ? -1 : 1;
		o->energy = (u8)p->energy;
		o->x = (s16)p->x;
		o->y = (s16)(p->y >> 4);
		o->score = p->score;
		o->hurt = (u8)(p->hurt > 255 ? 255 : p->hurt);
		o->pflags = (u8)((p->on_ground ? LAB_PF_GROUND : 0) | (p->climbing ? LAB_PF_CLIMB : 0) |
				 (p->running ? LAB_PF_RUN : 0) | (p->firing ? LAB_PF_FIRE : 0) | (p->kick_t ? LAB_PF_KICK : 0) |
				 (p->jetting ? LAB_PF_JET : 0) | (p->air_jumps ? LAB_PF_AIR_JUMP : 0));
		o->vy = (s16)p->vy;
	}
	for (i = 0; i < LAB_ENEMIES; i++) {
		struct lab_enemy *o = &s->enemy[i];
		if (i >= nen) {
			memset(o, 0, sizeof *o);
			continue;
		}
		o->alive = (u8)en_alive(i);
		o->hp = (u8)(en[i].hp > 0 ? en[i].hp : 0);
		o->x = (s16)en[i].x;
		o->y = (s16)en[i].fy;
		o->facing = en[i].flip ? -1 : 1;
		o->estate = (u8)en[i].state;
	}
	for (i = 0; i < LAB_CIVILIANS; i++) {
		struct lab_civ *o = &s->civ[i];
		if (i >= nciv) {
			memset(o, 0, sizeof *o);
			continue;
		}
		o->rescued = (u8)civ[i].rescued;
		o->present = 1;
		o->x = (s16)civ[i].x;
		o->y = (s16)civ[i].fy;
		o->reserved = 0;
	}
}

/* ------------------------------------------------------------- screens */

static int exit_msg, soon_t, soon_k;

/* Start on a port past the game's players: "nP COMING SOON" for 2 s, no credit taken */
static void soon_update(void)
{
	int k;
	if (D->flags & WM_F_SOON)
		for (k = nplayers; k < MAX_PLAYERS; k++)
			if (start_pressed(k)) {
				soon_k = k;
				soon_t = 120;
			}
	if (!soon_t)
		return;
	if (--soon_t) {
		put_char(17, 23, (char)('1' + soon_k), INK_WHITE);
		print(18, 23, "P COMING SOON", INK_WHITE);
	} else
		blank(17, 23, 14);
}

static void hud(void)
{
	struct line join, ammo, coin;
	int k, w = 48 / nplayers, has_join = first_line(WM_SCR_JOIN, &join), has_ammo = first_line(WM_SCR_AMMO, &ammo);
	int has_coin = first_line(WM_SCR_COIN, &coin);
	for (k = 0; k < nplayers; k++) {
		struct player *p = &pl[k];
		int col = k * w + 1, room = w - 4;
		put_char(col, 0, '1' + k, INK_CYAN);
		put_char(col + 1, 0, 'P', INK_CYAN);
		if (p->active) {
			int e;
			print_num(col + 3, 0, p->score, 6, INK_WHITE);
			blank(col + 9, 0, room - 6 > 0 ? room - 6 : 0);
			for (e = 0; e < 9 && e < room; e++)
				put_char(col + 3 + e, 1, e < p->energy ? '+' : ' ', INK_RED);
			if (p->special == WM_ITEM_BAZOOKA && has_ammo && room > 12) {
				print_n(col + 3 + 4, 1, ammo.s, ammo.len < room - 6 ? ammo.len : room - 6, INK_WHITE);
				put_char(col + 3 + 4 + (ammo.len < room - 6 ? ammo.len : room - 6) + 1, 1, '0' + p->ammo, INK_WHITE);
			}
		} else {
			const struct line *l = credits || free_play() ? (has_join ? &join : 0) : (has_coin ? &coin : 0);
			blank(col + 3, 1, room);
			if (l && ((frame_count / 20) & 1))
				print_n(col + 3, 0, l->s, l->len < room ? l->len : room, INK_WHITE);
			else
				blank(col + 3, 0, room);
		}
	}
	{
		struct line l;
		int pos = 0;
		while (next_line(WM_SCR_HUD, &pos, &l))
			if (l.attr & WM_TXT_COUNT) {
				print_num(l.col + l.len + 1, l.row, (u32)rescued, 1, INK_WHITE);
				put_char(l.col + l.len + 2, l.row, '/', INK_WHITE);
				print_num(l.col + l.len + 3, l.row, (u32)nciv, 1, INK_WHITE);
			}
	}
	if (!free_play()) {
		print(37, 26, "CREDITS", INK_WHITE);
		print_num(45, 26, (u32)credits, 1, INK_WHITE);
	}
	/* the beat 'em up: the health of the enemy last hit, for two seconds */
	if (depth) {
		int hp = last_hit >= 0 && last_hit_t ? en[last_hit].hp : 0;
		for (k = 0; k < 12; k++)
			put_char(24 + k, 26, k < hp ? '+' : ' ', INK_RED);
	}
	/* the coins taken (the platformer) */
	if (ncoins) {
		print(12, 26, "COINS", INK_WHITE);
		print_num(18, 26, (u32)coins, 2, INK_WHITE);
		put_char(20, 26, '/', INK_WHITE);
		print_num(21, 26, (u32)ncoins, 2, INK_WHITE);
	}
	/* what the exit still needs */
	if (R->exit_needs_enemies && D->exit_w > 0) {
		print(1, 26, "ENEMY", INK_WHITE);
		print_num(7, 26, (u32)enemies_left(), 2, INK_WHITE);
	}
}

/* the title: the camera tours the level; returns the port whose Start began */
static int title(void)
{
	u32 t = 0;
	int last_credits = -1, k;
	struct line prompt, coin;
	int has_prompt = 0, has_coin = first_line(WM_SCR_COIN, &coin);
	{
		struct line l;
		int pos = 0;
		while (next_line(WM_SCR_TITLE, &pos, &l))
			if (l.attr & WM_TXT_BLINK) {
				prompt = l;
				has_prompt = 1;
			}
	}
	clear_text();
	game_reset();
	draw_screen(WM_SCR_TITLE, 0);
	MUSIC(MUSIC_TITLE);
	for (;;) {
		int on;
		wait_vblank();
		read_inputs();
		t++;
		cam_x = level_w > SCREEN_W ? (int)(t / 2) % (level_w - SCREEN_W) : 0;
		cam_y = level_h - SCREEN_H - (int)((t / 3) % (level_h > SCREEN_H + 120 ? 120 : level_h - SCREEN_H + 1));
		stream();
		set_scroll();
		if (credits != last_credits && !free_play()) {
			print(19, 22, "CREDITS ", INK_WHITE);
			print_num(27, 22, (u32)credits, 1, INK_WHITE);
			last_credits = credits;
		}
		on = (t / 20) & 1;
		if (has_prompt)
			draw_line(&prompt, 0);
		/* both prompts share a row: clear both (a longer one leaves letters behind) */
		if (has_coin)
			draw_line(&coin, 0);
		if (credits || free_play()) {
			if (has_prompt)
				draw_line(&prompt, on);
		} else if (has_coin)
			draw_line(&coin, on);
		soon_update();
		update_enemies(0);
		draw_world();
		lab_mode = LAB_MODE_TITLE;
		lab_update();
		for (k = 0; k < nplayers; k++)
			if ((credits || free_play()) && start_pressed(k)) {
				if (!free_play())
					credits--;
				SFX_CENTRE(SFX_START);
				return k;
			}
	}
}

/* how a game ended */
enum { END_CLEAR, END_OVER };

/* the clear's tally (T-12, J-08), under the clear text: the enemies
   down, the rescued civilians with the HUD's own word, every player's score */
static void tally(void)
{
	struct line l;
	int pos = 0, k, col, row = 17;
	/* the tally says it all: the HUD's own rescued line and enemy counter go */
	while (next_line(WM_SCR_HUD, &pos, &l))
		if (l.attr & WM_TXT_COUNT)
			blank(l.col, l.row, l.len + 4);
	pos = 0;
	blank(1, 26, 8);
	if (nen) {
		col = (48 - 11) / 2;
		print(col, row, "ENEMY", INK_WHITE);
		print_num(col + 6, row, (u32)(nen - enemies_left()), 2, INK_WHITE);
		put_char(col + 8, row, '/', INK_WHITE);
		print_num(col + 9, row, (u32)nen, 2, INK_WHITE);
		row += 2;
	}
	while (next_line(WM_SCR_HUD, &pos, &l))
		if ((l.attr & WM_TXT_COUNT) && nciv) {
			struct line t = l;
			t.row = row;
			t.col = (48 - (l.len + 4)) / 2;
			t.attr &= ~WM_TXT_BIG;
			draw_line(&t, 1);
			print_num(t.col + t.len + 1, row, (u32)rescued, 1, INK_WHITE);
			put_char(t.col + t.len + 2, row, '/', INK_WHITE);
			print_num(t.col + t.len + 3, row, (u32)nciv, 1, INK_WHITE);
			row += 2;
			break;
		}
	col = (48 - (nplayers * 9 + (nplayers - 1) * 2)) / 2;
	for (k = 0; k < nplayers; k++, col += 11) {
		put_char(col, row, '1' + k, INK_CYAN);
		put_char(col + 1, row, 'P', INK_CYAN);
		print_num(col + 3, row, pl[k].score, 6, INK_WHITE);
	}
}

/* the Continue screen's prompt follows the credits (J-10): the title's
   prompt (PUSH START) with a credit or free play, else the continue
   screen's own (INSERT COIN), both on the continue prompt's row */
static void continue_prompt(int on)
{
	struct line coin, start;
	if (!blink_line(WM_SCR_CONTINUE, &coin))
		return;
	draw_line(&coin, 0);
	if (blink_line(WM_SCR_TITLE, &start)) {
		start.row = coin.row;
		start.col = (48 - start.len * ((start.attr & WM_TXT_BIG) ? 2 : 1)) / 2;
		draw_line(&start, 0);
		if (credits || free_play()) {
			draw_line(&start, on);
			return;
		}
	}
	draw_line(&coin, on);
}

#define SETUP_FRAMES 10 /* more than setting up any level takes */

static int play(int first)
{
	u32 end_t = 0, entry = frame_count;
	int k, outcome = -1, cont = 0;
	clear_text();
	game_reset();
	victory = 0;
	player_join(first);
	update_camera(1);
	stream();
	draw_screen(WM_SCR_HUD, 1);
	MUSIC(MUSIC_PLAY);
	/* setting the level up takes a few frames, ending near a vblank on some levels, where the real
	   core and the board model could disagree by one: play always starts SETUP_FRAMES after Start */
	while (frame_count - entry < SETUP_FRAMES)
		;
	for (;;) {
		int alive = 0;
		wait_vblank();
		read_inputs();
		if (outcome < 0)
			for (k = 0; k < nplayers; k++)
				if (!pl[k].active && (credits || free_play()) && start_pressed(k)) {
					if (!free_play())
						credits--;
					SFX_CENTRE(SFX_START);
					if (cont) {
						cont = 0;
						clear_text();
						draw_screen(WM_SCR_HUD, 1);
						MUSIC(MUSIC_PLAY);
					}
					player_join(k);
				}
		if (outcome < 0)
			move_platforms();
		/* on the clear screen the players stand still, showing their victory */
		victory = outcome == END_CLEAR;
		for (k = 0; k < nplayers; k++)
			if (!victory)
				update_player(&pl[k]);
			else if (pl[k].active)
				pl[k].t++;
		/* on the clear (and game over) the world stands still: no enemy moves,
		   no shot flies, nobody is hurt (T-12, J-08) */
		if (outcome < 0)
			update_enemies(1);
		update_civilians();
		update_camera(0);
		stream();
		set_scroll();
		draw_world();
		if (outcome < 0)
			hud();
		for (k = 0; k < nplayers; k++)
			alive += pl[k].active;
		if (outcome < 0)
			soon_update();
		/* the exit: any player in it, with every enemy down when the rules say so;
		   too early, a message says why it does not open */
		if (outcome < 0 && D->exit_w > 0)
			for (k = 0; k < nplayers; k++) {
				s32 fy = pl[k].y >> 4;
				if (!pl[k].active || pl[k].x < D->exit_x || pl[k].x > D->exit_x + D->exit_w || fy < D->exit_y || fy > D->exit_y + D->exit_h)
					continue;
				if (R->exit_needs_enemies && enemies_left()) {
					exit_msg = 90;
					continue;
				}
				exit_msg = 0;
				blank(15, 16, 18);
				outcome = END_CLEAR;
				end_t = frame_count;
				draw_screen(WM_SCR_CLEAR, 1);
				MUSIC(MUSIC_CLEAR);
				break;
			}
		if (exit_msg && outcome < 0) {
			if (--exit_msg && ((frame_count >> 4) & 1))
				print(15, 16, "DEFEAT EVERY ENEMY", INK_WHITE);
			else
				blank(15, 16, 18);
		}
		/* nobody left: 10 s to continue (a coin, then Start), else game over */
		if (outcome < 0 && !alive) {
			if (!cont) {
				cont = 1;
				end_t = frame_count;
				clear_text();
				draw_screen(WM_SCR_CONTINUE, 1);
				draw_screen(WM_SCR_HUD, 1); /* the overlay keeps the HUD whole (J-10) */
				MUSIC(MUSIC_CONTINUE);
			}
			print_num(23, 12, (u32)(9 - (frame_count - end_t) / 60), 1, INK_WHITE);
			continue_prompt((frame_count / 20) & 1);
			if (frame_count - end_t >= 600)
				cont = 0, outcome = END_OVER;
			if (outcome == END_OVER) {
				end_t = frame_count;
				clear_text();
				draw_screen(WM_SCR_GAMEOVER, 1);
				MUSIC(MUSIC_GAMEOVER);
			}
		}
		lab_mode = outcome == END_CLEAR ? LAB_MODE_CLEAR : outcome == END_OVER ? LAB_MODE_GAME_OVER : LAB_MODE_PLAYING;
		lab_update();
		if (outcome == END_CLEAR && frame_count - end_t == 90)
			tally();
		if (outcome >= 0 && frame_count - end_t > 360)
			return outcome;
	}
}

int main(void)
{
	if (D->magic != WM_MAGIC || D->version != WM_VERSION || (u32)D->cols * D->rows > sizeof col_map) {
		CPSA_SCROLL1_BASE = GFX_SCROLL1 >> 8;
		CPSA_PALETTE_BASE = GFX_PALETTE >> 8;
		CPSA_VIDEO_CTRL = 0x000e;
		CPSB_LAYER_CTRL = LAYER_ORDER(3, 2, 0, 1) | LAYER_EN_SCROLL1;
		clear_text();
		__asm__ volatile("move.w #0x2000,%sr");
		no_data();
	}
	cols = D->cols;
	rows = D->rows;
	level_w = D->level_w;
	level_h = D->level_h;
	nplayers = D->players < 1 ? 1 : D->players > MAX_PLAYERS ? MAX_PLAYERS : D->players;
	video_init();
	__asm__ volatile("move.w #0x2000,%sr"); /* allow the vblank interrupt */
	for (;;)
		play(title());
	return 0;
}
