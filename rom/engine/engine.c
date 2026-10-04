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

/* the maze's dots must be printed again once the text is cleared (maze_draw_dots) */
static int dots_dirty;

/* the quiz's question on the text layer (-1: none, redrawn after the text is cleared) */
static int quiz_shown = -1;

static void clear_text(void)
{
	int c, r;
	for (c = 0; c < 64; c++)
		for (r = 0; r < 32; r++)
			scroll1_cell(c, r)[0] = 0x0020;
	dots_dirty = 1;
	quiz_shown = -1;
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
#define GRAB_REACH 18
#define GRAB_DEPTH 8
#define GRAB_FRAMES 90
#define THROW_DIST 40
#define PIPE_USES 12
#define PIPE_REACH 10
/* phase 4: the thrown knife and the boss (engine/rules.ts) */
#define KNIFE_SPEED 4
#define KNIFE_BOX 10
#define KNIFE_HITS 3
#define BOSS_REST 25
#define BOSS_HUD_STEP 3
/* the light gun (WM_F_CROSSHAIR, engine/rules.ts) */
#define CROSS_SPEED 3
#define CROSS_BOTTOM 32
#define CLIP 6
#define RELOAD_FRAMES 40
#define SHOT_FLASH 6
#define TARGET_HALF 10
#define TARGET_H 40
#define HOSTAGE_HALF 8
#define HOSTAGE_H 36
#define AIM_FRAMES 60
#define TARGET_REST 120
#define ROUTE_STEP 2
#define BOMBS 2
/* the horizontal shooter (WM_F_SHIP, engine/rules.ts) */
#define SHIP_SPEED 2
#define SHIP_HALF_W 14
#define SHIP_HALF_H 6
#define SHIP_FIRE 8
#define FLY_SPEED 1
#define FLY_WAVE 8
#define FLY_MID 20
#define SHIP_HIT_X 18
#define SHIP_HIT_Y 18
#define MAX_POWER 2
#define POWER_REACH_X 14
#define POWER_REACH_Y 12
#define POWER_GAP 4
#define DIVE_RANGE 160
#define GUNSHIP_HOLD 48
#define GUNSHIP_BOB 40
#define GUNSHIP_FIRE 50
#define SHIP_SHOT_SPEED 3
#define SHIP_SHOT_X 12
#define SHIP_SHOT_Y 6
#define GUNSHIP_HIT_X 36
#define GUNSHIP_HIT_Y 20
#define BOMB_BOSS_HITS 5
/* the top-down run and gun (WM_F_TOPDOWN, engine/rules.ts) */
#define TOP_SPEED 1
#define TOP_HALF_W 6
#define TOP_DEPTH 8
#define TOP_SHOT 5
#define TOP_MID 20
#define TOP_TOUCH_X 14
#define TOP_TOUCH_Y 10
#define GRENADES 3
#define GRENADE_SPEED 3
#define GRENADE_FUSE 30
#define GRENADE_HITS 2
#define GRENADE_X 32
#define GRENADE_Y 24
#define BOOM_FRAMES 12
#define TOP_SIGHT 160
#define TOP_EN_SHOT 3
#define TOP_EN_HIT_X 8
#define TOP_EN_HIT_Y 12
/* the maze (WM_F_MAZE, engine/rules.ts) */
#define MAZE_SPEED 2
#define DOT_SCORE 10
#define POWER_SCORE 50
#define FRIGHT_FRAMES 360
#define MAZE_TOUCH 10
#define EAT_SCORE 200
#define HOME_FRAMES 180
#define AMBUSH_AHEAD 64
#define WANDER_NEAR 128
static const u8 maze_haste[3] = { 0, 4, 2 }; /* a pixel more every n frames from the second round (engine/rules.ts MAZE_HASTE) */
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
	s16 vy; /* the shooter's fan: px a frame up or down */
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
	int grabbed, grab_t;                 /* the enemy held (index + 1, 0 none) and frames held */
	struct { int live, dir; s32 x, fy; } blade; /* the thrown knife (phase 4), along the lane it left from */
	int cx, cy, shot_t, reload_t, bombs;        /* the light gun's crosshair (screen px), its flash, the reload, the bombs left */
	int power;                                  /* the shooter's weapon: 0 one shot, 1 two side by side, 2 a fan of three */
	int aim_x, aim_y;                           /* the top-down aim: -1, 0 or 1 each way (never both 0) */
	int mdx, mdy, wdx, wdy;                     /* the maze: the way it moves, the way the stick last asked for */
	int cpu;                                    /* the puzzle: the CPU rival plays this well */
	int answer, answer_left;                    /* the quiz: this question's answer (0-2, -1 none) and the frames left then */
	struct { int live, dx, dy, t; s32 x, y; } grenade; /* the top-down grenade in flight (its middle, frames flown) */
	struct { int t; s32 x, y; } boom;           /* its burst while it shows */
	u32 t, score;
	struct bullet shots[SHOTS];
	struct rocket rocket;
};
static struct player pl[MAX_PLAYERS];
/* the beat 'em up (WM_F_DEPTH, engine/game.ts moveInDepth): its walkable band, feet y px */
static int depth;
static int crosshair; /* the light gun (WM_F_CROSSHAIR) */
static int ship;      /* the horizontal shooter (WM_F_SHIP) */
static int vertical;  /* with ship, the vertical shooter (WM_F_VERTICAL) */
static int topdown;   /* the top-down run and gun (WM_F_TOPDOWN) */
static int maze;      /* the maze (WM_F_MAZE) */
static int puzzle;    /* the puzzle (WM_F_PUZZLE) */
static int puzzle_cpu; /* its CPU rival (WM_F2_PUZZLE_CPU) */
static int quiz;       /* the quiz (WM_F2_QUIZ) */
/* the quiz (engine/game.ts updateQuiz): its questions, the one asked, its phase (0 asked, 1 the answer shown), frames into it */
#define QUIZ_TIME 600
#define REVEAL_FRAMES 150
#define QUIZ_SCORE 100
#define QUIZ_BONUS 10
#define QUIZ_TIME_ROW 22
#define QUIZ_PLAYERS_ROW 24
#define QUIZ_ANSWER_ROW 12
static const u8 quiz_cols[4] = { 8, 18, 28, 38 };
static int quiz_n, quiz_k, quiz_phase, quiz_t, quiz_revealed;
/* the puzzle's wells (engine/puzzle.ts Well), players 1 and 2 */
#define WELLS 2
#define WELL_COLS 6
#define WELL_ROWS 12
#define WELL_Y 16
#define GEM_COLORS 5
#define FALL_START 30
#define FALL_STEP 3
#define FALL_MIN 6
#define LEVEL_GEMS 15
#define SOFT_DROP 2
#define MOVE_FIRST 12
#define MOVE_EVERY 4
#define CLEAR_FRAMES 24
#define GEM_SCORE 10
#define PUZZLE_GOAL 60
#define PUZZLE_SEED 0x2545f491u
#define STONE 6
#define GARBAGE_CHAIN 3
#define CPU_CANDIDATES 18
#define CPU_STEP 4
static const s16 well_x[WELLS] = { 48, 240 };
struct well {
	u8 cells[WELL_COLS * WELL_ROWS], marks[WELL_COLS * WELL_ROWS];
	u8 piece[3], next[3];
	int col, row, fall_t, move_t, clear_t, chain;
	u32 seed;
	int gems;
	int pending;                                   /* stones the rival sent, to fall before the next trio */
	int cpu_k, cpu_best, cpu_col, cpu_turns, cpu_t; /* the CPU rival: the candidate next, the best so far, its button timer */
};
static struct well wells[WELLS];
/* the gems that just came to rest (the landed trio, or the ones a clear let fall):
   at rest a well holds no line, so any new one runs through one of them */
static u8 cand[WELL_COLS * WELL_ROWS];
static int ncand;
/* the maze's dots, a bit per cell, how many are left, the frames the chasers flee, and a redraw after the text is cleared */
static u8 dots[24576 / 8];
static int dots_left, fright_t, maze_round;
static s32 walk_y0, walk_y1;
/* the camera locks (engine/game.ts activeLock): done once nothing stands in them */
#define MAX_LOCKS 8
static u8 lock_done[MAX_LOCKS];
/* the enemy last hit and frames left to show its health (the beat 'em up's bar) */
static int last_hit = -1, last_hit_t;

static s32 in_walk(s32 fy)
{
	return fy < walk_y0 ? walk_y0 : fy > walk_y1 ? walk_y1 : fy;
}
static u16 start_now, start_last; /* bit k: port k's Start */

enum { EN_OFF, EN_WALK, EN_HIT, EN_DOWN, EN_ATTACK, EN_FALL, EN_HELD, EN_HIDDEN };
static struct enemy {
	s32 x, fy, min, max;
	int state, hp, flip, dir, fire_wait;
	int lane; /* the beat 'em up: its depth offset beside a player (-1, 0, 1) */
	int boss; /* the beat 'em up's brawler (phase 4): tougher, never grabbed, quicker to strike again */
	int appear, stay, shown; /* the light gun: frames on the screen before it shows and before it leaves (0 never), and frames there */
	s32 base_y;              /* the shooter: the feet y its wave flies around */
	int path;                /* the shooter: 0 wave, 1 straight, 2 dive, 3 the gunship boss */
	s32 base_x;              /* the vertical shooter: the x its wave flies around */
	int mdy;                 /* the maze: the way it moves up or down (dir is across) */
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
	/* a beat 'em up's falls where the crate stood, inside the walkable band */
	spawn_pickup((s32)(k->col * 16 + n * 8), depth ? in_walk((s32)((k->row + n) * 16)) : ground_below((s32)(k->col * 16 + n * 8), (s32)((k->row + n - 1) * 16)), k->contents);
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
	return en[i].state == EN_WALK || en[i].state == EN_HIT || en[i].state == EN_ATTACK || en[i].state == EN_FALL || en[i].state == EN_HELD || en[i].state == EN_HIDDEN;
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
	p->grabbed = p->grab_t = 0;
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
	p->blade.live = 0;
	p->shot_t = p->reload_t = 0;
	p->aim_x = 1;
	p->aim_y = 0;
	p->grenade.live = 0;
	p->boom.t = 0;
	p->mdx = p->mdy = p->wdx = p->wdy = 0;
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
/* ---------------------------------------------------------- the puzzle's well
   (engine/puzzle.ts, the same steps: a trio of gems falls, turns, lands,
   three or more of a color in a line clear, chain after chain) */

/* the next gem's color, 1 to GEM_COLORS (a 32-bit LCG) */
static int next_gem(struct well *w)
{
	w->seed = w->seed * 1103515245u + 12345u;
	return (int)((u16)(w->seed >> 16) % GEM_COLORS) + 1;
}

static void new_well(int k)
{
	struct well *w = &wells[k];
	int i;
	for (i = 0; i < WELL_COLS * WELL_ROWS; i++)
		w->cells[i] = w->marks[i] = 0;
	w->col = w->row = w->fall_t = w->move_t = w->clear_t = w->chain = w->gems = w->pending = 0;
	w->cpu_k = w->cpu_best = w->cpu_t = w->cpu_turns = 0;
	w->cpu_col = 2;
	w->seed = PUZZLE_SEED + (u32)k * 7919u;
	for (i = 0; i < 3; i++)
		w->next[i] = (u8)next_gem(w);
}

/* whether (c, r) is free: inside the sides and the floor, over the top or empty */
static int well_free(const struct well *w, int c, int r)
{
	if (c < 0 || c >= WELL_COLS || r >= WELL_ROWS)
		return 0;
	return r < 0 || w->cells[r * WELL_COLS + c] == 0;
}

/* frames a row while not held down: faster for every LEVEL_GEMS gems cleared */
static int fall_frames(const struct well *w)
{
	int f = FALL_START - (w->gems / LEVEL_GEMS) * FALL_STEP;
	return f < FALL_MIN ? FALL_MIN : f;
}

/* the stones the rival sent: up to a row, from the left column, each on its column's stack (lost on a full one) */
static void drop_stones(struct well *w)
{
	int k = w->pending < WELL_COLS ? w->pending : WELL_COLS, c, r;
	for (c = 0; c < k; c++) {
		r = -1;
		while (r + 1 < WELL_ROWS && w->cells[(r + 1) * WELL_COLS + c] == 0)
			r++;
		if (r >= 0)
			w->cells[r * WELL_COLS + c] = STONE;
	}
	w->pending -= k;
}

/* the next trio at the top of the third column; 0 when it cannot come in */
static int spawn_trio(struct well *w)
{
	int i;
	drop_stones(w);
	w->cpu_k = 0;
	for (i = 0; i < 3; i++)
		w->piece[i] = w->next[i];
	for (i = 0; i < 3; i++)
		w->next[i] = (u8)next_gem(w);
	w->col = 2;
	w->row = 0;
	w->fall_t = 0;
	w->chain = 0;
	return well_free(w, w->col, 0);
}

static void shift_trio(struct well *w, int dx)
{
	int c = w->col + dx;
	if (well_free(w, c, w->row) && well_free(w, c, w->row - 1) && well_free(w, c, w->row - 2))
		w->col = c;
}

/* the bottom color goes to the top */
static void turn_trio(struct well *w)
{
	u8 b = w->piece[2];
	w->piece[2] = w->piece[1];
	w->piece[1] = w->piece[0];
	w->piece[0] = b;
}

/* the trio into the well; 0 when a gem of it is still over the top */
static int lock_trio(struct well *w)
{
	int k;
	if (w->row - 2 < 0)
		return 0;
	ncand = 0;
	for (k = 0; k < 3; k++) {
		int i = (w->row - 2 + k) * WELL_COLS + w->col;
		w->cells[i] = w->piece[k];
		cand[ncand++] = (u8)i;
	}
	return 1;
}

/* marks the lines of three or more of its color through the gem at i (column c, row r) */
static void mark_through(struct well *w, int i, int c, int r)
{
	static const s8 dxs[4] = { 1, 0, 1, -1 };
	int d, v = w->cells[i];
	if (!v || v == STONE)
		return;
	for (d = 0; d < 4; d++) {
		int dx = dxs[d], dy = d ? 1 : 0, step = dy ? WELL_COLS + dx : dx, n = 1, cc, rr, j, first;
		/* back to the line's first gem, then forward */
		cc = c - dx;
		rr = r - dy;
		first = i;
		while (cc >= 0 && cc < WELL_COLS && rr >= 0 && w->cells[first - step] == v) {
			first -= step;
			n++;
			cc -= dx;
			rr -= dy;
		}
		cc = c + dx;
		rr = r + dy;
		j = i + step;
		while (cc >= 0 && cc < WELL_COLS && rr < WELL_ROWS && w->cells[j] == v) {
			n++;
			cc += dx;
			rr += dy;
			j += step;
		}
		if (n >= 3)
			for (j = first; n > 0; n--, j += step)
				w->marks[j] = 1;
	}
}

/* marks every gem in a line of three or more of its color (engine/puzzle.ts markMatches),
   looking only through the gems that came to rest, and the stones beside them; returns how many */
static int mark_matches(struct well *w)
{
	int i, c, k, count = 0;
	for (k = 0; k < ncand; k++) {
		int j = cand[k], r = 0;
		c = j;
		while (c >= WELL_COLS) {
			c -= WELL_COLS;
			r++;
		}
		mark_through(w, j, c, r);
	}
	ncand = 0;
	/* the stones next to a cleared gem go with it (a gem marked by a line, not a stone marked just now) */
	for (i = 0, c = 0; i < WELL_COLS * WELL_ROWS; i++, c = c == WELL_COLS - 1 ? 0 : c + 1) {
		if (w->marks[i] != 1)
			continue;
		if (c > 0 && w->cells[i - 1] == STONE)
			w->marks[i - 1] = 2;
		if (c < WELL_COLS - 1 && w->cells[i + 1] == STONE)
			w->marks[i + 1] = 2;
		if (i >= WELL_COLS && w->cells[i - WELL_COLS] == STONE)
			w->marks[i - WELL_COLS] = 2;
		if (i + WELL_COLS < WELL_COLS * WELL_ROWS && w->cells[i + WELL_COLS] == STONE)
			w->marks[i + WELL_COLS] = 2;
	}
	for (k = 0; k < WELL_COLS * WELL_ROWS; k++)
		count += w->marks[k] ? 1 : 0;
	if (count) {
		w->chain++;
		w->clear_t = CLEAR_FRAMES;
	}
	return count;
}

/* takes the marked gems out and lets the ones above fall */
static void settle_well(struct well *w)
{
	int c, r, to;
	ncand = 0;
	for (c = 0; c < WELL_COLS; c++) {
		to = WELL_ROWS - 1;
		for (r = WELL_ROWS - 1; r >= 0; r--) {
			int i = r * WELL_COLS + c, v = w->marks[i] ? 0 : w->cells[i];
			w->marks[i] = 0;
			w->cells[i] = 0;
			if (v) {
				int j = to-- * WELL_COLS + c;
				w->cells[j] = (u8)v;
				/* a gem that fell may line up with others */
				if (j != i)
					cand[ncand++] = (u8)j;
			}
		}
	}
}

/* the player stands for its trio: x at its middle, feet under its bottom gem */
static void place_at_trio(struct player *p)
{
	const struct well *w = &wells[p - pl];
	p->x = well_x[p - pl] + w->col * 16 + 8;
	p->y = (s32)(WELL_Y + (w->row + 1) * 16) * 16;
}

/* a well topped out: a life, and an empty well to start again */
static void top_out(struct player *p)
{
	struct well *w = &wells[p - pl];
	int i;
	sfx(SFX_HURT, p->x);
	/* the CPU has no lives: its well just starts again */
	if (p->cpu)
		++p->energy;
	if (--p->energy <= 0) {
		p->energy = 0;
		p->active = 0;
		p->dead = 1;
		return;
	}
	for (i = 0; i < WELL_COLS * WELL_ROWS; i++)
		w->cells[i] = w->marks[i] = 0;
	w->clear_t = 0;
	w->pending = 0;
	spawn_trio(w);
	place_at_trio(p);
}

/* after a landing or a clear: score the matches, or bring the next trio */
static void resolve_well(struct player *p)
{
	struct well *w = &wells[p - pl];
	int n = mark_matches(w);
	if (n) {
		int k = (int)(p - pl), send = n - 3 + (w->chain - 1) * GARBAGE_CHAIN;
		p->score += (u32)(GEM_SCORE * n * w->chain);
		w->gems += n;
		/* the rival well gets stones for the gems past three and every chain step */
		if (send > 0 && 1 - k < nplayers && pl[1 - k].active)
			wells[1 - k].pending += send;
		sfx(SFX_COIN, p->x);
		return;
	}
	if (!spawn_trio(w))
		top_out(p);
	place_at_trio(p);
}

/* the CPU's weighing (engine/puzzle.ts weigh): the trio in column c, its gems from row top */
static const struct well *wg_w;
static int wg_c, wg_top, wg_r, wg_turns;

static int wg_at(int cc, int rr)
{
	if (cc < 0 || cc >= WELL_COLS || rr < 0 || rr >= WELL_ROWS)
		return 0;
	if (cc == wg_c && rr >= wg_top && rr <= wg_r) {
		int j = rr - wg_top - wg_turns;
		return wg_w->piece[j < 0 ? j + 3 : j];
	}
	return wg_w->cells[rr * WELL_COLS + cc];
}

/* the run of the trio gem at (cc, rr) along (dx, dy), both ways; positions step by
   additions (a variable multiply is a library call on the 68000, far too slow here) */
static int wg_run(int cc, int rr, int dx, int dy)
{
	int v = wg_at(cc, rr), n = 1, x = cc - dx, y = rr - dy;
	while (wg_at(x, y) == v) {
		n++;
		x -= dx;
		y -= dy;
	}
	x = cc + dx;
	y = rr + dy;
	while (wg_at(x, y) == v) {
		n++;
		x += dx;
		y += dy;
	}
	return n >= 3 ? n : 0;
}

/* 64 a gem of a line through the trio, 2 a row lower it lands, less a turn; cheap: it runs every frame */
static int weigh(const struct well *w, int c, int turns)
{
	int r = -1, rr, k, lines = 0;
	while (r + 1 < WELL_ROWS && w->cells[(r + 1) * WELL_COLS + c] == 0)
		r++;
	if (r < 2)
		return -10000;
	wg_w = w;
	wg_c = c;
	wg_r = r;
	wg_top = r - 2;
	wg_turns = turns;
	/* the column: the runs along it, each counted once (from its lowest gem) */
	for (rr = r; rr >= wg_top; rr--) {
		if (rr < r && wg_at(c, rr) == wg_at(c, rr + 1))
			continue;
		lines += wg_run(c, rr, 0, 1);
	}
	for (k = 0; k < 3; k++)
		lines += wg_run(c, wg_top + k, 1, 0) + wg_run(c, wg_top + k, 1, 1) + wg_run(c, wg_top + k, -1, 1);
	return lines * 64 + r * 2 - turns;
}

/* the CPU rival's pad (engine/puzzle.ts cpuPad): a candidate weighed a frame, then a press every CPU_STEP frames */
static u16 cpu_pad(struct well *w)
{
	if (w->clear_t)
		return 0;
	if (w->cpu_k < CPU_CANDIDATES) {
		int k = w->cpu_k, c = k / 3, t = k - c * 3, s = weigh(w, c, t);
		if (k == 0 || s > w->cpu_best) {
			w->cpu_best = s;
			w->cpu_col = c;
			w->cpu_turns = t;
		}
		w->cpu_k++;
		return 0;
	}
	w->cpu_t++;
	if (w->cpu_turns > 0) {
		if (w->cpu_t & (CPU_STEP - 1))
			return 0;
		w->cpu_turns--;
		return BTN_1;
	}
	if (w->col != w->cpu_col) {
		if (w->cpu_t & (CPU_STEP - 1))
			return 0;
		return w->col < w->cpu_col ? BTN_RIGHT : BTN_LEFT;
	}
	return BTN_DOWN;
}

/* the well, a frame (engine/game.ts playWell) */
static void play_well(struct player *p)
{
	struct well *w = &wells[p - pl];
	int dx = (p->pad & BTN_LEFT) ? -1 : (p->pad & BTN_RIGHT) ? 1 : 0;
	p->t++;
	if (w->clear_t) {
		if (--w->clear_t == 0) {
			settle_well(w);
			resolve_well(p);
		}
		return;
	}
	if (dx) {
		if (!(p->last & (dx < 0 ? BTN_LEFT : BTN_RIGHT))) {
			shift_trio(w, dx);
			w->move_t = MOVE_FIRST;
		} else if (--w->move_t <= 0) {
			shift_trio(w, dx);
			w->move_t = MOVE_EVERY;
		}
	}
	if (PRESSED(p, BTN_1))
		turn_trio(w);
	if (++w->fall_t >= ((p->pad & BTN_DOWN) ? SOFT_DROP : fall_frames(w))) {
		w->fall_t = 0;
		if (well_free(w, w->col, w->row + 1))
			w->row++;
		else if (!lock_trio(w))
			top_out(p);
		else {
			sfx(SFX_LAND, p->x);
			resolve_well(p);
		}
	}
	place_at_trio(p);
}

/* the wells' gems as sprites: the ones a match clears flash white, the trio, the next one beside the well */
static void draw_wells(void)
{
	int k, r, c, i;
	for (k = 0; k < WELLS && k < nplayers; k++) {
		const struct well *w = &wells[k];
		int x0 = well_x[k], flash;
		if (!pl[k].active)
			continue;
		flash = w->clear_t > 0 && (((CLEAR_FRAMES - w->clear_t) >> 2) & 1);
		if (!w->clear_t)
			for (i = 0; i < 3; i++)
				if (w->row - 2 + i >= 0)
					put_sprite(x0 + w->col * 16, WELL_Y + (w->row - 2 + i) * 16, (u16)(TILE_GEM + w->piece[i] - 1), PAL_GEMS);
		for (i = 0; i < 3; i++)
			put_sprite(x0 + WELL_COLS * 16 + 16, WELL_Y + i * 16, (u16)(TILE_GEM + w->next[i] - 1), PAL_GEMS);
		for (r = 0, i = 0; r < WELL_ROWS; r++)
			for (c = 0; c < WELL_COLS; c++, i++)
				if (w->cells[i])
					put_sprite(x0 + c * 16, WELL_Y + r * 16, (u16)(TILE_GEM + (w->marks[i] && flash ? 5 : w->cells[i] == STONE ? 6 : w->cells[i] - 1)), PAL_GEMS);
	}
}

/* ------------------------------------------------------------- the quiz */

/* a player's first press of B1 B2 B3 while the question is asked is its answer */
static void answer_quiz(struct player *p)
{
	int k;
	p->t++;
	if (quiz_phase != 0 || p->answer >= 0)
		return;
	k = PRESSED(p, BTN_1) ? 0 : PRESSED(p, BTN_2) ? 1 : PRESSED(p, BTN_3) ? 2 : -1;
	if (k < 0)
		return;
	p->answer = k;
	p->answer_left = QUIZ_TIME - quiz_t;
	sfx(SFX_SHOT, p->x);
}

/* the right answer of question k (its line marked WM_TXT_RIGHT), -1 if none */
static int quiz_right(int k)
{
	struct line l;
	int pos = 0;
	while (next_line(WM_SCR_QUIZ + k, &pos, &l))
		if (l.attr & WM_TXT_RIGHT)
			return (l.row - QUIZ_ANSWER_ROW) / 3;
	return -1;
}

/* the quiz, a frame (engine/game.ts updateQuiz) */
static void update_quiz(void)
{
	int k, ins = 0, answered = 0, right;
	if (quiz_k >= quiz_n)
		return;
	quiz_t++;
	if (quiz_phase == 0) {
		for (k = 0; k < nplayers; k++)
			if (pl[k].active) {
				ins++;
				answered += pl[k].answer >= 0;
			}
		if (quiz_t < QUIZ_TIME && !(ins && answered == ins))
			return;
		right = quiz_right(quiz_k);
		for (k = 0; k < nplayers; k++)
			if (pl[k].active && pl[k].answer == right) {
				pl[k].score += (u32)(QUIZ_SCORE + (pl[k].answer_left / 60) * QUIZ_BONUS);
				sfx(SFX_PICKUP, pl[k].x);
			}
		quiz_phase = 1;
		quiz_t = 0;
		return;
	}
	if (quiz_t < REVEAL_FRAMES)
		return;
	quiz_k++;
	quiz_phase = 0;
	quiz_t = 0;
	for (k = 0; k < nplayers; k++)
		pl[k].answer = -1;
}

/* the quiz's screen on the text layer (play/renderer.ts drawQuiz): a new question is put
   up a line a frame (the old one's lines off, the rows under it blanked, then its lines
   on: all at once ran long), then the seconds left and who answered; then the right
   answer in cyan and each player's letter, cyan if right, red if not */
static int quiz_old, quiz_step, quiz_pos;

static void quiz_draw(void)
{
	struct line l;
	int k, right;
	if (quiz_shown != quiz_k && !quiz_step) {
		quiz_old = quiz_shown;
		quiz_shown = quiz_k;
		quiz_step = quiz_old >= 0 ? 1 : 2;
		quiz_pos = 0;
		quiz_revealed = 0;
	}
	if (quiz_step == 1) {
		if (next_line(WM_SCR_QUIZ + quiz_old, &quiz_pos, &l))
			draw_line(&l, 0);
		else
			quiz_step = 2;
		return;
	}
	if (quiz_step == 2) {
		blank(0, QUIZ_TIME_ROW, 48);
		blank(0, QUIZ_PLAYERS_ROW, 48);
		quiz_step = 3;
		quiz_pos = 0;
		return;
	}
	if (quiz_step == 3) {
		if (quiz_k < quiz_n && next_line(WM_SCR_QUIZ + quiz_k, &quiz_pos, &l))
			draw_line(&l, 1);
		else
			quiz_step = 0;
		return;
	}
	if (quiz_k >= quiz_n)
		return;
	right = -1;
	if (quiz_phase == 0) {
		int left = QUIZ_TIME - quiz_t;
		print(21, QUIZ_TIME_ROW, "TIME", INK_WHITE);
		print_num(26, QUIZ_TIME_ROW, (u32)(left > 0 ? (left + 59) / 60 : 0), 2, INK_WHITE);
	} else {
		right = quiz_right(quiz_k);
		if (!quiz_revealed) {
			/* only the right answer's line, again in cyan */
			int pos = 0;
			blank(0, QUIZ_TIME_ROW, 48);
			while (next_line(WM_SCR_QUIZ + quiz_k, &pos, &l))
				if (l.attr & WM_TXT_RIGHT) {
					l.attr = (l.attr & ~WM_TXT_INK) | INK_CYAN;
					draw_line(&l, 1);
				}
			quiz_revealed = 1;
			return;
		}
	}
	for (k = 0; k < nplayers && k < 4; k++) {
		const struct player *p = &pl[k];
		int col = quiz_cols[k], ink;
		if (!p->active) {
			blank(col, QUIZ_PLAYERS_ROW, 4);
			continue;
		}
		ink = quiz_phase == 0 ? (p->answer >= 0 ? INK_CYAN : INK_WHITE) : (p->answer == right ? INK_CYAN : INK_RED);
		put_char(col, QUIZ_PLAYERS_ROW, '1' + k, ink);
		put_char(col + 1, QUIZ_PLAYERS_ROW, 'P', ink);
		put_char(col + 2, QUIZ_PLAYERS_ROW, ' ', ink);
		put_char(col + 3, QUIZ_PLAYERS_ROW, quiz_phase == 0 ? ' ' : p->answer >= 0 ? 'A' + p->answer : '-', ink);
	}
}

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
	if (puzzle) {
		/* the puzzle: a well for players 1 and 2 */
		if (k < WELLS) {
			player_spawn(p, 0, 0);
			p->energy = R->energy;
			p->hurt = 0;
			new_well(k);
			spawn_trio(&wells[k]);
			place_at_trio(p);
		}
		return;
	}
	if (maze) {
		/* the maze: at its start, on a cell's middle (feet at the cell's bottom) */
		s32 sx = D->start_x[k] >= 0 ? D->start_x[k] : cam_x + (SCREEN_W >> 1) + k * 32;
		s32 sy = D->start_x[k] >= 0 ? D->start_y[k] : cam_y + (SCREEN_H >> 1);
		x = (sx >> 4) * 16 + 8;
		fy = ((sy - 1) >> 4) * 16 + 16;
	} else if (topdown) {
		/* the top-down run and gun: beside the player already in, at the start, or in the screen's middle */
		if (lead >= 0) {
			x = pl[lead].x + 24;
			fy = pl[lead].y >> 4;
		} else if (D->start_x[k] >= 0) {
			x = D->start_x[k];
			fy = D->start_y[k];
		} else {
			x = cam_x + (SCREEN_W >> 1) + k * 24;
			fy = cam_y + (SCREEN_H >> 1);
		}
	} else if (crosshair || ship || quiz) {
		/* the light gun, the shooter and the quiz: nobody walks; crosshairs start in the middle, ships at the left */
		x = cam_x;
		fy = 0;
	} else if (depth) {
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
	if (topdown)
		p->bombs = GRENADES;
	p->answer = -1;
	if (crosshair) {
		p->cx = (SCREEN_W >> 1) + (k * 48 - 72);
		p->cy = (SCREEN_H - CROSS_BOTTOM) >> 1;
		p->ammo = CLIP;
		p->bombs = BOMBS;
	} else if (ship && vertical) {
		p->cx = 96 + k * 64;
		p->cy = SCREEN_H - CROSS_BOTTOM - 30;
		p->bombs = BOMBS;
		p->power = 0;
	} else if (ship) {
		p->cx = 48;
		p->cy = 40 + k * 36;
		p->bombs = BOMBS;
		p->power = 0;
	}
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
	/* the shooter's ship loses its power with a life */
	p->power = 0;
	if (--p->energy <= 0) {
		p->energy = 0;
		p->active = 0;
		p->dead = 1;
		return;
	}
	p->hurt = R->hurt_frames;
	/* the maze: back at the start (as play mode, only with the rule that brings a hurt player back) */
	if (maze && (fell || R->respawn_on_hurt)) {
		int energy = p->energy, hurt_t = p->hurt;
		u32 score = p->score;
		p->active = 0;
		player_join((int)(p - pl));
		p->energy = energy;
		p->hurt = hurt_t;
		p->score = score;
		return;
	}
	if (fell || R->respawn_on_hurt)
		respawn_near_camera(p);
}

/* the maze: a dot in every empty cell but the top and bottom rows (the HUD's);
   one index walked along, no multiplying (it runs mid game on a new round) */
static void fill_dots(void)
{
	int i, c, r, n = cols * rows;
	for (i = 0; i < ((n + 7) >> 3); i++)
		dots[i] = 0;
	dots_left = 0;
	for (r = 1, i = cols; r < rows - 1; r++)
		for (c = 0; c < cols; c++, i++)
			if (col_map[i] == T_AIR) {
				dots[i >> 3] |= (u8)(1 << (i & 7));
				dots_left++;
			}
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
	crosshair = (D->flags & WM_F_CROSSHAIR) != 0;
	ship = (D->flags & WM_F_SHIP) != 0;
	vertical = ship && (D->flags & WM_F_VERTICAL) != 0;
	topdown = (D->flags & WM_F_TOPDOWN) != 0;
	maze = (D->flags & WM_F_MAZE) != 0;
	puzzle = (D->flags & WM_F_PUZZLE) != 0;
	puzzle_cpu = puzzle && (D->flags2 & WM_F2_PUZZLE_CPU) != 0;
	quiz = (D->flags2 & WM_F2_QUIZ) != 0;
	quiz_k = quiz_phase = quiz_t = quiz_revealed = quiz_step = 0;
	quiz_n = 0;
	if (quiz) {
		/* the questions are the text screens from WM_SCR_QUIZ on */
		struct line l;
		int scr;
		for (scr = WM_SCR_QUIZ; scr < WM_SCR_END; scr++) {
			int pos = 0;
			if (!next_line(scr, &pos, &l))
				break;
			quiz_n++;
		}
	}
	for (i = 0; i < MAX_LOCKS; i++)
		lock_done[i] = 0;
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
		en[i].boss = o->d == 2 || o->d == -2;
		en[i].flip = en[i].dir < 0;
		en[i].state = EN_WALK;
		en[i].t = (u32)i * 11;
		en[i].fire_wait = ENEMY_FIRE_EVERY;
		en[i].lane = (i % 3) - 1;
		/* the light gun's targets carry when they show and leave instead of a patrol */
		en[i].appear = crosshair && !en[i].boss ? o->a : 0;
		en[i].stay = crosshair && !en[i].boss ? o->b : 0;
		en[i].shown = 0;
		en[i].base_y = o->y;
		en[i].base_x = o->x;
		/* the shooter's path, or the maze chaser's way of chasing (0 auto, 1 follow, 2 ambush, 3 wander) */
		en[i].path = ship || maze ? o->a : 0;
		if (ship && en[i].path == 3)
			en[i].fire_wait = GUNSHIP_FIRE;
		if (en[i].appear > 0)
			en[i].state = EN_HIDDEN;
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
	/* the maze: a dot in every empty cell but the top and bottom rows (the HUD's), its chasers on cell middles */
	dots_left = fright_t = maze_round = 0;
	dots_dirty = 1;
	/* only the maze pays for its dots (a reset that runs long shifts the start: rom-frame-budget) */
	if (maze) {
		fill_dots();
		for (i = 0; i < nen; i++) {
			en[i].x = (en[i].x >> 4) * 16 + 8;
			en[i].fy = ((en[i].fy - 1) >> 4) * 16 + 16;
			en[i].min = en[i].x;
			en[i].max = en[i].fy;
			en[i].dir = 0;
			en[i].mdy = 0;
		}
	}
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
static int strike(struct player *p, int reach, int n, int knock, int pipe)
{
	s32 fy = p->y >> 4;
	int dir = p->flip ? -1 : 1, i, hit = 0;
	if (pipe) {
		reach += PIPE_REACH;
		n += 1;
	}
	for (i = 0; i < nen; i++) {
		struct enemy *e = &en[i];
		s32 dx = (e->x - p->x) * dir;
		if (e->state != EN_WALK && e->state != EN_HIT && e->state != EN_ATTACK && e->state != EN_HELD)
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
	/* a blow that meets no enemy breaks the crate in front (phase 4) */
	if (!hit) {
		s32 cx = p->x + dir * (p->look->half_w + 4);
		int t = cell_at(cx, fy - 1);
		if ((t == T_CRATE || t == T_BREAKABLE) && hit_cell((int)(cx >> 4), (int)((fy - 1) >> 4), n, p))
			hit = 1;
	}
	/* a pipe wears out with the blows that land */
	if (pipe && hit && --p->ammo <= 0) {
		p->special = 0;
		p->ammo = 0;
	}
	return hit;
}

/* the thrown knife flies on (engine/game.ts flyBlade): the first enemy in its lane
   takes KNIFE_HITS and falls; a wall or the screen's edge ends it */
static void fly_blade(struct player *p)
{
	int i, t;
	p->blade.x += p->blade.dir * KNIFE_SPEED;
	for (i = 0; i < nen; i++) {
		struct enemy *e = &en[i];
		if (e->state != EN_WALK && e->state != EN_HIT && e->state != EN_ATTACK)
			continue;
		if (iabs(e->x - p->blade.x) > KNIFE_BOX || iabs(e->fy - p->blade.fy) > DEPTH_REACH)
			continue;
		en_damage(i, KNIFE_HITS, p);
		last_hit = i;
		last_hit_t = 120;
		if (e->state == EN_HIT) {
			e->state = EN_FALL;
			e->t = 0;
			e->x += p->blade.dir * 8;
		}
		p->blade.live = 0;
		return;
	}
	t = cell_at(p->blade.x, p->blade.fy - 1);
	if (t == T_CRATE || t == T_BREAKABLE)
		hit_cell((int)(p->blade.x >> 4), (int)((p->blade.fy - 1) >> 4), 1, p);
	if (is_solid(t) || p->blade.x < cam_x - 16 || p->blade.x > cam_x + SCREEN_W + 16)
		p->blade.live = 0;
}

/* holding an enemy (engine/game.ts holdEnemy): B1 knees it, B1 with the stick away throws it behind */
static void hold_enemy(struct player *p, int dir)
{
	struct enemy *e = p->grabbed ? &en[p->grabbed - 1] : 0;
	int face = p->flip ? -1 : 1;
	if (!e || e->state != EN_HELD) {
		p->grabbed = 0;
		return;
	}
	p->grab_t++;
	e->x = p->x + face * 16;
	e->fy = p->y >> 4;
	if (PRESSED(p, BTN_1)) {
		last_hit = p->grabbed - 1;
		last_hit_t = 120;
		if (dir == -face) {
			s32 x = p->x - face * THROW_DIST;
			e->x = x < 0 ? 0 : x > level_w ? level_w : x;
			en_damage(p->grabbed - 1, 2, p);
			if (e->state == EN_HIT) {
				e->state = EN_FALL;
				e->t = 0;
			}
			p->grabbed = 0;
			p->flip = !p->flip;
			sfx(SFX_KICK, p->x);
			return;
		}
		en_damage(p->grabbed - 1, 1, p);
		if (e->state == EN_HIT)
			e->state = EN_HELD;
		else
			p->grabbed = 0;
		return;
	}
	if (p->grab_t > GRAB_FRAMES) {
		e->state = EN_WALK;
		e->t = 0;
		e->fire_wait = e->boss ? BOSS_REST : ENEMY_REST;
		p->grabbed = 0;
	}
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
	if (p->blade.live)
		fly_blade(p);
	if (p->grabbed) {
		hold_enemy(p, dir);
		return;
	}
	/* the fight (phase 2): a punch holds the player still until it ends */
	if (p->punch_t) {
		int len = p->combo == 3 ? COMBO_KICK_FRAMES : PUNCH_FRAMES;
		p->punch_t--;
		if (!p->struck && p->punch_t == len - STRIKE_AT) {
			p->struck = 1;
			if (p->combo == 3)
				strike(p, FIGHT_KICK_REACH, 2, 1, 0);
			else
				strike(p, PUNCH_REACH, 1, 0, p->special == WM_ITEM_PIPE);
		}
		if (!p->punch_t)
			p->combo_t = p->combo < 3 ? COMBO_WINDOW : 0;
		return;
	}
	if (p->combo_t)
		p->combo_t--;
	/* a knife is thrown instead of a punch (phase 4) */
	if (p->on_ground && PRESSED(p, BTN_1) && p->special == WM_ITEM_KNIFE && !p->blade.live) {
		p->blade.live = 1;
		p->blade.x = p->x + (p->flip ? -12 : 12);
		p->blade.fy = fy;
		p->blade.dir = p->flip ? -1 : 1;
		p->special = 0;
		p->ammo = 0;
		p->combo = 1;
		p->combo_t = 0;
		p->punch_t = PUNCH_FRAMES;
		p->struck = 1;
		sfx(SFX_KNIFE, p->x);
		return;
	}
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
	if (p->kick_t && !p->kick_hit && strike(p, FIGHT_KICK_REACH, 2, 1, 0))
		p->kick_hit = 1;
	/* walking into an enemy grabs it (phase 3) */
	if (dir && p->on_ground)
		for (n = 0; n < nen; n++) {
			struct enemy *e = &en[n];
			s32 dx = (e->x - p->x) * dir;
			if ((e->state != EN_WALK && e->state != EN_ATTACK) || e->boss)
				continue;
			if (dx < 0 || dx > GRAB_REACH || iabs(e->fy - fy) > GRAB_DEPTH)
				continue;
			p->grabbed = n + 1;
			p->grab_t = 0;
			p->flip = dir < 0;
			e->state = EN_HELD;
			e->t = 0;
			e->dir = -dir;
			e->flip = e->dir < 0;
			return;
		}
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

/* a shot at a world point (engine/game.ts shootAt): the first target there,
   else a hostage (which hurts the shooter), else a crate or breakable cell */
static void shoot_at(struct player *p, s32 wx, s32 wy)
{
	int i, t;
	for (i = 0; i < nen; i++) {
		struct enemy *e = &en[i];
		if (e->state != EN_WALK && e->state != EN_HIT && e->state != EN_ATTACK)
			continue;
		if (iabs(wx - e->x) > TARGET_HALF || wy < e->fy - TARGET_H || wy >= e->fy)
			continue;
		en_damage(i, 1, p);
		last_hit = i;
		last_hit_t = 120;
		return;
	}
	for (i = 0; i < nciv; i++) {
		if (civ[i].rescued || iabs(wx - civ[i].x) > HOSTAGE_HALF || wy < civ[i].fy - HOSTAGE_H || wy >= civ[i].fy)
			continue;
		hurt(p, 0);
		return;
	}
	t = cell_at(wx, wy);
	if (t == T_CRATE || t == T_BREAKABLE)
		hit_cell((int)(wx >> 4), (int)(wy >> 4), 1, p);
}

/* the light gun's player (engine/game.ts aim): the stick moves the crosshair,
   B1 shoots where it points, B2 reloads */
static void aim(struct player *p)
{
	int dx = (p->pad & BTN_LEFT) ? -1 : (p->pad & BTN_RIGHT) ? 1 : 0;
	int dy = (p->pad & BTN_UP) ? -1 : (p->pad & BTN_DOWN) ? 1 : 0;
	p->t++;
	if (p->hurt)
		p->hurt--;
	if (p->shot_t)
		p->shot_t--;
	p->cx += dx * CROSS_SPEED;
	p->cy += dy * CROSS_SPEED;
	if (p->cx < 0)
		p->cx = 0;
	if (p->cx > SCREEN_W - 1)
		p->cx = SCREEN_W - 1;
	if (p->cy < 0)
		p->cy = 0;
	if (p->cy > SCREEN_H - CROSS_BOTTOM - 1)
		p->cy = SCREEN_H - CROSS_BOTTOM - 1;
	if (p->reload_t) {
		if (--p->reload_t == 0)
			p->ammo = CLIP;
		return;
	}
	if (PRESSED(p, BTN_2) && p->ammo < CLIP) {
		p->reload_t = RELOAD_FRAMES;
		return;
	}
	/* a bomb: every target on the screen goes down */
	if (PRESSED(p, BTN_3) && p->bombs > 0) {
		int i;
		p->bombs--;
		sfx(SFX_EXPLOSION, cam_x + (SCREEN_W >> 1));
		for (i = 0; i < nen; i++) {
			struct enemy *e = &en[i];
			if ((e->state == EN_WALK || e->state == EN_HIT || e->state == EN_ATTACK) && e->x >= cam_x && e->x <= cam_x + SCREEN_W)
				en_damage(i, e->hp, p);
		}
		return;
	}
	if (PRESSED(p, BTN_1) && p->ammo > 0) {
		p->ammo--;
		p->shot_t = SHOT_FLASH;
		sfx(SFX_SHOT, cam_x + p->cx);
		shoot_at(p, cam_x + p->cx, cam_y + p->cy);
	}
}

/* the gunship hit by a point: its 64 x 32 body around its middle */
static int gunship_at(s32 x, s32 y)
{
	int i;
	for (i = 0; i < nen; i++)
		if (en[i].path == 3 && en_alive(i) && iabs(en[i].x - x) <= 32 && iabs(en[i].fy - FLY_MID - y) <= 16)
			return i;
	return -1;
}

/* the shooter's player (engine/game.ts fly): the stick flies the ship on the
   screen, B1 held fires ahead, B2 drops a bomb; a wall it touches hurts it */
static void fly(struct player *p)
{
	int dx = (p->pad & BTN_LEFT) ? -1 : (p->pad & BTN_RIGHT) ? 1 : 0;
	int dy = (p->pad & BTN_UP) ? -1 : (p->pad & BTN_DOWN) ? 1 : 0;
	/* the vertical shooter's ship points up: its halves swap */
	int hw = vertical ? SHIP_HALF_H : SHIP_HALF_W, hh = vertical ? SHIP_HALF_W : SHIP_HALF_H;
	int i;
	s32 sx, sy;
	p->t++;
	if (p->hurt)
		p->hurt--;
	p->cx += dx * SHIP_SPEED;
	p->cy += dy * SHIP_SPEED;
	if (p->cx < hw)
		p->cx = hw;
	if (p->cx > SCREEN_W - hw)
		p->cx = SCREEN_W - hw;
	if (p->cy < hh + 16)
		p->cy = hh + 16;
	if (p->cy > SCREEN_H - CROSS_BOTTOM - hh)
		p->cy = SCREEN_H - CROSS_BOTTOM - hh;
	sx = cam_x + p->cx;
	sy = cam_y + p->cy;
	if (is_solid(cell_at(sx + hw, sy)) || is_solid(cell_at(sx - hw, sy)) || is_solid(cell_at(sx, sy - hh)) || is_solid(cell_at(sx, sy + hh)))
		hurt(p, 0);
	if (PRESSED(p, BTN_2) && p->bombs > 0) {
		p->bombs--;
		sfx(SFX_EXPLOSION, cam_x + (SCREEN_W >> 1));
		for (i = 0; i < nen; i++) {
			struct enemy *e = &en[i];
			if ((e->state == EN_WALK || e->state == EN_HIT) && e->x >= cam_x && e->x <= cam_x + SCREEN_W)
				en_damage(i, e->boss && e->hp > BOMB_BOSS_HITS ? BOMB_BOSS_HITS : e->hp, p);
		}
	}
	/* a power pickup it flies over */
	for (i = 0; i < npickups; i++) {
		struct pickup *k = &pickup[i];
		if (k->live && k->item == WM_ITEM_POWER && iabs(k->x - sx) <= POWER_REACH_X && iabs(k->fy - 8 - sy) <= POWER_REACH_Y) {
			k->live = 0;
			if (p->power < MAX_POWER)
				p->power++;
			sfx(SFX_PICKUP, sx);
		}
	}
	if (p->fire_wait)
		p->fire_wait--;
	if ((p->pad & BTN_1) && !p->fire_wait) {
		/* the weapon's shots, each while there is room for one (engine/game.ts fly) */
		int n = p->power == 0 ? 1 : p->power == 1 ? 2 : 3, s, live = 0;
		for (i = 0; i < SHOTS; i++)
			live += p->shots[i].live != 0;
		if (live < SHOTS) {
			for (s = 0; s < n && live < SHOTS; s++, live++) {
				for (i = 0; i < SHOTS && p->shots[i].live; i++)
					;
				/* from the nose; side by side and the fan's drift are across the way it flies */
				int side = p->power == 1 ? (s ? POWER_GAP : -POWER_GAP) : 0;
				p->shots[i].live = 1;
				p->shots[i].dir = 1;
				p->shots[i].x = (s16)(vertical ? sx + side : sx + SHIP_HALF_W);
				p->shots[i].y = (s16)(vertical ? sy - SHIP_HALF_W : sy + side);
				p->shots[i].vy = (s16)(p->power == 2 ? s - 1 : 0);
			}
			p->fire_wait = SHIP_FIRE;
			sfx(SFX_SHOT, sx);
		}
	}
	for (i = 0; i < SHOTS; i++) {
		struct bullet *b = &p->shots[i];
		int ei;
		if (!b->live)
			continue;
		if (vertical) {
			b->y -= 6;
			b->x += b->vy;
		} else {
			b->x += 6;
			b->y += b->vy;
		}
		ei = enemy_at(b->x, b->y, 10);
		if (ei < 0)
			ei = gunship_at(b->x, b->y);
		if (ei >= 0) {
			en_damage(ei, 1, p);
			if (en[ei].boss) {
				last_hit = ei;
				last_hit_t = 120;
			}
			b->live = 0;
		} else if (hit_cell(b->x >> 4, b->y >> 4, 1, p))
			b->live = 0;
		else if (cell_at(b->x, b->y) == T_SOLID || (vertical ? b->y < cam_y - 32 : b->x > cam_x + SCREEN_W + 32))
			b->live = 0;
	}
}

/* a top-down body at (x, feet fy): its feet box touches a solid cell */
static int top_blocked(s32 x, s32 fy)
{
	return is_solid(cell_at(x - TOP_HALF_W, fy - 1)) || is_solid(cell_at(x + TOP_HALF_W, fy - 1)) || is_solid(cell_at(x - TOP_HALF_W, fy - TOP_DEPTH)) || is_solid(cell_at(x + TOP_HALF_W, fy - TOP_DEPTH));
}

/* the top-down run and gun's player (engine/game.ts walkTop): it walks in 8
   directions, aims where it walks unless B3 is held, fires along its aim while
   B1 is held */
static void walk_top(struct player *p)
{
	int dx = (p->pad & BTN_LEFT) ? -1 : (p->pad & BTN_RIGHT) ? 1 : 0;
	int dy = (p->pad & BTN_UP) ? -1 : (p->pad & BTN_DOWN) ? 1 : 0;
	int i;
	s32 fy, my;
	p->t++;
	if (p->hurt)
		p->hurt--;
	if ((dx || dy) && !(p->pad & BTN_3)) {
		p->aim_x = dx;
		p->aim_y = dy;
	}
	fy = p->y >> 4;
	if (dx && !top_blocked(p->x + dx * TOP_SPEED, fy))
		p->x += dx * TOP_SPEED;
	if (dy && !top_blocked(p->x, fy + dy * TOP_SPEED))
		p->y = (fy + dy * TOP_SPEED) * 16;
	if (p->aim_x)
		p->flip = p->aim_x < 0;
	p->on_ground = 1;
	p->running = 0;
	/* a grenade: thrown along the aim, it bursts where it lands or at a wall */
	if (p->boom.t)
		p->boom.t--;
	if (PRESSED(p, BTN_2) && p->bombs > 0 && !p->grenade.live) {
		p->bombs--;
		p->grenade.live = 1;
		p->grenade.x = p->x;
		p->grenade.y = (p->y >> 4) - TOP_MID;
		p->grenade.dx = p->aim_x;
		p->grenade.dy = p->aim_y;
		p->grenade.t = 0;
	}
	if (p->grenade.live) {
		p->grenade.x += p->grenade.dx * GRENADE_SPEED;
		p->grenade.y += p->grenade.dy * GRENADE_SPEED;
		p->grenade.t++;
		if (p->grenade.t >= GRENADE_FUSE || is_solid(cell_at(p->grenade.x, p->grenade.y))) {
			static const s8 around5[5][2] = { { 0, 0 }, { -16, 0 }, { 16, 0 }, { 0, -16 }, { 0, 16 } };
			s32 gx = p->grenade.x, gy = p->grenade.y;
			p->grenade.live = 0;
			p->boom.t = BOOM_FRAMES;
			p->boom.x = gx;
			p->boom.y = gy;
			sfx(SFX_EXPLOSION, gx);
			for (i = 0; i < nen; i++)
				if ((en[i].state == EN_WALK || en[i].state == EN_HIT) && iabs(en[i].x - gx) <= GRENADE_X && iabs(en[i].fy - TOP_MID - gy) <= GRENADE_Y)
					en_damage(i, GRENADE_HITS, p);
			for (i = 0; i < 5; i++) {
				int t = cell_at(gx + around5[i][0], gy + around5[i][1]);
				if (t == T_CRATE || t == T_BREAKABLE)
					hit_cell((int)((gx + around5[i][0]) >> 4), (int)((gy + around5[i][1]) >> 4), GRENADE_HITS, p);
			}
		}
	}
	if (p->fire_wait)
		p->fire_wait--;
	my = (p->y >> 4) - TOP_MID;
	if ((p->pad & BTN_1) && !p->fire_wait)
		for (i = 0; i < SHOTS; i++)
			if (!p->shots[i].live) {
				p->shots[i].live = 1;
				p->shots[i].dir = (s16)p->aim_x;
				p->shots[i].vy = (s16)p->aim_y;
				p->shots[i].x = (s16)(p->x + p->aim_x * 12);
				p->shots[i].y = (s16)(my + p->aim_y * 12);
				p->fire_wait = FIRE_EVERY;
				sfx(SFX_SHOT, p->x);
				break;
			}
	for (i = 0; i < SHOTS; i++) {
		struct bullet *b = &p->shots[i];
		int ei;
		if (!b->live)
			continue;
		b->x += b->dir * TOP_SHOT;
		b->y += b->vy * TOP_SHOT;
		ei = enemy_at(b->x, b->y, 8);
		if (ei >= 0) {
			en_damage(ei, 1, p);
			b->live = 0;
		} else if (hit_cell(b->x >> 4, b->y >> 4, 1, p))
			b->live = 0;
		else if (cell_at(b->x, b->y) == T_SOLID || b->x < cam_x - 32 || b->x > cam_x + SCREEN_W + 32 || b->y < cam_y - 32 || b->y > cam_y + SCREEN_H + 32)
			b->live = 0;
	}
}

/* the maze: cell (c, r) can be walked into (not solid) */
static int maze_open(int c, int r)
{
	/* a row open at both sides is a tunnel: the left of the first column is the last one */
	if (c < 0)
		c += cols;
	else if (c >= cols)
		c -= cols;
	return !is_solid(cell(c, r));
}

/* an x that left the maze through a tunnel comes in at the other side */
static s32 maze_wrap(s32 x)
{
	s32 w = (s32)cols << 4;
	return x < 0 ? x + w : x >= w ? x - w : x;
}

/* the maze's dot of a cell: there, and eaten */
static int dot_at(int i)
{
	return (dots[i >> 3] >> (i & 7)) & 1;
}

/* a maze dot on the text layer, never over the screen's own text (the HUD's
   lines share the bottom rows): a dot goes only on a blank cell, and only a dot
   is wiped */
static void dot_char(int x, int y, int on)
{
	volatile u16 *c = scroll1_cell(x + SCREEN_X0 / 8, y + SCREEN_Y0 / 8);
	if (on ? c[0] == 0x0020 : c[0] == FONT_CODE('.'))
		put_char(x, y, on ? '.' : ' ', INK_ACCENT);
}

/* the maze's player (engine/game.ts walkMaze): MAZE_SPEED px a frame, turning
   the way the stick last asked for at a cell's middle (or back at once),
   stopping at a wall, eating the dot of the cell it is in */
static void walk_maze(struct player *p)
{
	int dx = (p->pad & BTN_LEFT) ? -1 : (p->pad & BTN_RIGHT) ? 1 : 0;
	int dy = dx ? 0 : (p->pad & BTN_UP) ? -1 : (p->pad & BTN_DOWN) ? 1 : 0;
	int step, i, c, r;
	p->t++;
	if (p->hurt)
		p->hurt--;
	if (dx || dy) {
		p->wdx = dx;
		p->wdy = dy;
	}
	for (step = 0; step < MAZE_SPEED; step++) {
		s32 fy = p->y >> 4;
		c = (int)(p->x >> 4);
		r = (int)((fy - 1) >> 4);
		if (p->wdx == -p->mdx && p->wdy == -p->mdy && (p->mdx || p->mdy)) {
			p->mdx = p->wdx;
			p->mdy = p->wdy;
		}
		if ((p->x & 15) == 8 && (fy & 15) == 0) {
			if ((p->wdx || p->wdy) && maze_open(c + p->wdx, r + p->wdy)) {
				p->mdx = p->wdx;
				p->mdy = p->wdy;
			} else if (!maze_open(c + p->mdx, r + p->mdy)) {
				p->mdx = 0;
				p->mdy = 0;
			}
		}
		p->x = maze_wrap(p->x + p->mdx);
		p->y = (fy + p->mdy) * 16;
	}
	if (p->mdx)
		p->flip = p->mdx < 0;
	p->on_ground = 1;
	p->running = p->mdx || p->mdy;
	/* the dot of the cell it is in, and a power pickup it reaches */
	i = (int)((((p->y >> 4) - 1) >> 4) * cols + (p->x >> 4));
	if (dot_at(i)) {
		dots[i >> 3] &= (u8)~(1 << (i & 7));
		dots_left--;
		p->score += DOT_SCORE;
		dot_char((i % cols) * 2 + 1, (i / cols) * 2, 0);
		sfx(SFX_COIN, p->x);
	}
	for (i = 0; i < npickups; i++) {
		struct pickup *k = &pickup[i];
		if (k->live && k->item == WM_ITEM_POWER && iabs(k->x - p->x) <= 8 && iabs(k->fy - (p->y >> 4)) <= 8) {
			k->live = 0;
			p->score += POWER_SCORE;
			fright_t = FRIGHT_FRAMES;
			sfx(SFX_PICKUP, p->x);
		}
	}
}

/* the maze's next round (engine/game.ts nextRound): the dots and power-ups back,
   chasers and players at their starts, lives and score kept */
static void maze_next_round(void)
{
	int i, k;
	maze_round++;
	fill_dots();
	dots_dirty = 1;
	fright_t = 0;
	for (i = 0; i < nen; i++) {
		en[i].state = EN_WALK;
		en[i].x = en[i].min;
		en[i].fy = en[i].max;
		en[i].dir = 0;
		en[i].mdy = 0;
		en[i].t = 0;
	}
	for (i = 0; i < npickups; i++)
		if (pickup[i].item == WM_ITEM_POWER)
			pickup[i].live = 1;
	for (k = 0; k < nplayers; k++) {
		struct player *p = &pl[k];
		int energy = p->energy;
		u32 score = p->score;
		if (!p->active || p->cpu)
			continue;
		p->active = 0;
		player_join(k);
		p->energy = energy;
		p->score = score;
	}
}

/* the maze's dots on the text layer after the text was cleared: a row a frame,
   so no frame runs long (a whole screen of them at once overran a frame) */
static int dots_row;

static void maze_draw_dots(void)
{
	int c, i;
	if (dots_dirty == 1) {
		dots_row = 0;
		dots_dirty = 2;
	}
	i = dots_row * cols;
	for (c = 0; c < cols; c++, i++)
		if (dot_at(i))
			dot_char(c * 2 + 1, dots_row * 2, 1);
	if (++dots_row >= rows)
		dots_dirty = 0;
}

static void update_player(struct player *p)
{
	int i, dir = 0, jet_was;
	s32 fy, d;
	if (!p->active)
		return;
	if (quiz) {
		answer_quiz(p);
		return;
	}
	if (puzzle) {
		/* the CPU rival's pad in place of the port's (read_inputs kept its last one as last) */
		if (p->cpu)
			p->pad = cpu_pad(&wells[p - pl]);
		play_well(p);
		return;
	}
	if (maze) {
		walk_maze(p);
		return;
	}
	if (topdown) {
		walk_top(p);
		return;
	}
	if (crosshair) {
		aim(p);
		return;
	}
	if (ship) {
		fly(p);
		return;
	}
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
			} else if (k->item == WM_ITEM_PIPE) {
				p->special = WM_ITEM_PIPE;
				p->ammo = PIPE_USES;
			} else if (k->item == WM_ITEM_KNIFE) {
				p->special = WM_ITEM_KNIFE;
				p->ammo = 1;
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
		/* an enemy off the screen waits: the camera's next stretch (a lock: a wave) wakes it */
		if (e->state == EN_WALK && (e->x < cam_x - 16 || e->x > cam_x + SCREEN_W + 16))
			continue;
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
			/* it closes in to ENEMY_GAP but never backs away; solid cells stop it */
			if (e->t & 1) {
				s32 nx = iabs(target->x - e->x) > ENEMY_GAP ? e->x + (tx > e->x ? 1 : tx < e->x ? -1 : 0) : e->x;
				if (!is_solid(cell_at(nx, e->fy - 1)))
					e->x = nx;
			} else {
				s32 nf = e->fy + (tz > e->fy ? 1 : tz < e->fy ? -1 : 0);
				if (!is_solid(cell_at(e->x, nf - 1)))
					e->fy = nf;
			}
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
				e->fire_wait = e->boss ? BOSS_REST : ENEMY_REST;
			}
		} else if (e->state == EN_HIT) {
			if (e->t > 14) {
				e->state = EN_WALK;
				e->t = 0;
				e->fire_wait = e->boss ? BOSS_REST : ENEMY_REST;
			}
		} else if (e->state == EN_FALL) {
			if (e->t > FALL_FRAMES) {
				e->state = EN_WALK;
				e->t = 0;
				e->fire_wait = e->boss ? BOSS_REST : ENEMY_REST;
			}
		} else if (e->state == EN_DOWN && e->t > 90)
			e->state = EN_OFF;
	}
}

/* the light gun's targets (engine/game.ts updateTargets): they wait off the
   screen, aim, shoot the first player in and rest; a shot interrupts the aim */
static void update_targets(void)
{
	int i, k;
	if (last_hit_t)
		last_hit_t--;
	for (i = 0; i < nen; i++) {
		struct enemy *e = &en[i];
		int on_screen = e->x >= cam_x && e->x <= cam_x + SCREEN_W;
		e->t++;
		if (e->state == EN_HIDDEN) {
			/* it shows once it has been on the screen for its appear frames */
			if (on_screen && ++e->shown >= e->appear) {
				e->state = EN_WALK;
				e->t = 0;
				e->shown = 0;
			}
			continue;
		}
		/* a target with a stay leaves when its time on the screen is up (missed) */
		if (e->stay && on_screen && (e->state == EN_WALK || e->state == EN_ATTACK) && ++e->shown >= e->stay) {
			e->state = EN_OFF;
			continue;
		}
		if (e->state == EN_WALK) {
			if (!on_screen)
				continue;
			e->flip = e->x > cam_x + (SCREEN_W >> 1);
			if (e->fire_wait)
				e->fire_wait--;
			else if (R->enemies_shoot) {
				e->state = EN_ATTACK;
				e->t = 0;
			}
		} else if (e->state == EN_ATTACK) {
			if (e->t >= AIM_FRAMES) {
				for (k = 0; k < nplayers; k++)
					if (pl[k].active && !pl[k].hurt) {
						sfx(SFX_SHOT, e->x);
						hurt(&pl[k], 0);
						break;
					}
				e->state = EN_WALK;
				e->t = 0;
				e->fire_wait = TARGET_REST;
			}
		} else if (e->state == EN_HIT) {
			if (e->t > 14) {
				e->state = EN_WALK;
				e->t = 0;
				e->fire_wait = TARGET_REST;
			}
		} else if (e->state == EN_DOWN && e->t > 90)
			e->state = EN_OFF;
	}
}

/* the shooter's enemies (engine/game.ts updateFliers): still until the screen
   reaches them, then they fly left on a wave, hurting a ship they touch, and
   are gone past the screen's left */
static void update_fliers(void)
{
	int i, k, lead = -1;
	if (last_hit_t)
		last_hit_t--;
	for (k = 0; k < nplayers && lead < 0; k++)
		if (pl[k].active)
			lead = k;
	for (i = 0; i < nen; i++) {
		struct enemy *e = &en[i];
		int ph, hx, hy;
		e->t++;
		if (e->state == EN_HIT) {
			if (e->t > 14) {
				e->state = EN_WALK;
				e->t = 0;
			}
		} else if (e->state == EN_DOWN) {
			if (e->t > 90)
				e->state = EN_OFF;
			continue;
		}
		if (e->state != EN_WALK && e->state != EN_HIT)
			continue;
		if (vertical) {
			/* the vertical shooter: from above the screen down, the wave and the dive across */
			if (e->fy - FLY_MID + (e->path == 3 ? 32 : 16) < cam_y)
				continue;
			e->shown++;
			if (e->path == 3) {
				/* the gunship: down until it holds near the screen's top, swaying across, firing down */
				s32 hold = cam_y + GUNSHIP_HOLD + FLY_MID;
				if (e->fy < hold)
					e->fy += FLY_SPEED;
				else
					e->fy = hold;
				ph = e->shown & 255;
				e->x = e->base_x + (((ph < 128 ? ph : 256 - ph) * 5) >> 3) - GUNSHIP_BOB;
				if (e->fire_wait)
					e->fire_wait--;
				else {
					int live = 0;
					for (k = 0; k < MAX_EN_SHOTS; k++)
						live += en_shots[k].live != 0;
					if (live < MAX_EN_SHOTS) {
						for (k = 0; en_shots[k].live; k++)
							;
						en_shots[k].live = 1;
						en_shots[k].x = (s16)e->x;
						en_shots[k].y = (s16)(e->fy - FLY_MID + 16);
						en_shots[k].dir = 1;
						en_shots[k].vy = 0;
					}
					e->fire_wait = GUNSHIP_FIRE;
					sfx(SFX_SHOT, e->x);
				}
				for (k = 0; k < nplayers; k++) {
					struct player *p = &pl[k];
					if (!p->active || p->hurt)
						continue;
					if (iabs(cam_x + p->cx - e->x) <= GUNSHIP_HIT_X && iabs(cam_y + p->cy - (e->fy - FLY_MID)) <= GUNSHIP_HIT_Y)
						hurt(p, 0);
				}
				continue;
			}
			e->fy += FLY_SPEED;
			if (e->path == 1)
				e->x = e->base_x;
			else if (e->path == 2) {
				if (lead >= 0 && iabs(cam_y + pl[lead].cy - (e->fy - FLY_MID)) <= DIVE_RANGE) {
					s32 tx = cam_x + pl[lead].cx;
					e->base_x += (tx > e->base_x) - (tx < e->base_x);
				}
				e->x = e->base_x;
			} else {
				ph = (e->shown + i * 32) & 127;
				e->x = e->base_x + ((ph < 64 ? ph : 128 - ph) >> 2) - FLY_WAVE;
			}
			if (e->fy - FLY_MID > cam_y + SCREEN_H + 32) {
				e->state = EN_OFF;
				continue;
			}
			for (k = 0; k < nplayers; k++) {
				struct player *p = &pl[k];
				if (!p->active || p->hurt)
					continue;
				if (iabs(cam_x + p->cx - e->x) <= SHIP_HIT_X && iabs(cam_y + p->cy - (e->fy - FLY_MID)) <= SHIP_HIT_Y)
					hurt(p, 0);
			}
			continue;
		}
		if (e->x > cam_x + SCREEN_W + (e->path == 3 ? 48 : 16))
			continue;
		e->shown++;
		e->flip = 1;
		if (e->path == 3) {
			/* the gunship: in until it holds near the screen's right, bobbing, firing left */
			if (e->x > cam_x + SCREEN_W - GUNSHIP_HOLD)
				e->x -= FLY_SPEED;
			else
				e->x = cam_x + SCREEN_W - GUNSHIP_HOLD;
			ph = e->shown & 255;
			e->fy = e->base_y + (((ph < 128 ? ph : 256 - ph) * 5) >> 3) - GUNSHIP_BOB;
			if (e->fire_wait)
				e->fire_wait--;
			else {
				int live = 0;
				for (k = 0; k < MAX_EN_SHOTS; k++)
					live += en_shots[k].live != 0;
				if (live < MAX_EN_SHOTS) {
					for (k = 0; en_shots[k].live; k++)
						;
					en_shots[k].live = 1;
					en_shots[k].x = (s16)(e->x - 32);
					en_shots[k].y = (s16)(e->fy - FLY_MID);
					en_shots[k].dir = -1;
					en_shots[k].vy = 0;
				}
				e->fire_wait = GUNSHIP_FIRE;
				sfx(SFX_SHOT, e->x);
			}
		} else {
			e->x -= FLY_SPEED;
			if (e->path == 1)
				e->fy = e->base_y;
			else if (e->path == 2) {
				/* a dive: toward the first ship's height once it is near */
				if (lead >= 0 && iabs(cam_x + pl[lead].cx - e->x) <= DIVE_RANGE) {
					s32 ty = cam_y + pl[lead].cy + FLY_MID;
					e->base_y += (ty > e->base_y) - (ty < e->base_y);
				}
				e->fy = e->base_y;
			} else {
				ph = (e->shown + i * 32) & 127;
				e->fy = e->base_y + ((ph < 64 ? ph : 128 - ph) >> 2) - FLY_WAVE;
			}
			if (e->x < cam_x - 32) {
				e->state = EN_OFF;
				continue;
			}
		}
		hx = e->path == 3 ? GUNSHIP_HIT_X : SHIP_HIT_X;
		hy = e->path == 3 ? GUNSHIP_HIT_Y : SHIP_HIT_Y;
		for (k = 0; k < nplayers; k++) {
			struct player *p = &pl[k];
			if (!p->active || p->hurt)
				continue;
			if (iabs(cam_x + p->cx - e->x) <= hx && iabs(cam_y + p->cy - (e->fy - FLY_MID)) <= hy)
				hurt(p, 0);
		}
	}
	/* the gunship's shots, against the ships */
	for (i = 0; i < MAX_EN_SHOTS; i++) {
		struct bullet *s = &en_shots[i];
		if (!s->live)
			continue;
		/* down the screen in the vertical shooter (its ships are tall: the box turns too), else left */
		int bx = vertical ? SHIP_SHOT_Y : SHIP_SHOT_X, by = vertical ? SHIP_SHOT_X : SHIP_SHOT_Y;
		if (vertical)
			s->y += SHIP_SHOT_SPEED;
		else
			s->x += s->dir * SHIP_SHOT_SPEED;
		for (k = 0; k < nplayers; k++) {
			struct player *p = &pl[k];
			if (p->active && !p->hurt && iabs(cam_x + p->cx - s->x) <= bx && iabs(cam_y + p->cy - s->y) <= by) {
				hurt(p, 0);
				s->live = 0;
				break;
			}
		}
		if (s->live && (is_solid(cell_at(s->x, s->y)) || (vertical ? s->y > cam_y + SCREEN_H + 32 : s->x < cam_x - 32 || s->x > cam_x + SCREEN_W + 32)))
			s->live = 0;
	}
}

/* the top-down run and gun's enemies (engine/game.ts updateChasers): on the
   screen they step toward the nearest player every other frame, stopped by
   solid cells, and hurt one they touch */
static void update_chasers(void)
{
	int i, k;
	for (i = 0; i < nen; i++) {
		struct enemy *e = &en[i];
		int target = -1;
		s32 best = 0x7fffffff, tfy;
		e->t++;
		if (e->state == EN_HIT) {
			if (e->t > 14) {
				e->state = EN_WALK;
				e->t = 0;
			}
			continue;
		}
		if (e->state == EN_DOWN) {
			if (e->t > 90)
				e->state = EN_OFF;
			continue;
		}
		if (e->state != EN_WALK)
			continue;
		if (e->x < cam_x - 16 || e->x > cam_x + SCREEN_W + 16 || e->fy < cam_y || e->fy > cam_y + SCREEN_H + 40)
			continue;
		for (k = 0; k < nplayers; k++) {
			s32 d;
			if (!pl[k].active)
				continue;
			d = iabs(pl[k].x - e->x) + iabs((pl[k].y >> 4) - e->fy);
			if (d < best) {
				best = d;
				target = k;
			}
		}
		if (target < 0)
			continue;
		tfy = pl[target].y >> 4;
		if (e->t & 1) {
			int sx = (pl[target].x > e->x) - (pl[target].x < e->x), sy = (tfy > e->fy) - (tfy < e->fy);
			if (sx && !top_blocked(e->x + sx, e->fy))
				e->x += sx;
			if (sy && !top_blocked(e->x, e->fy + sy))
				e->fy += sy;
		}
		e->flip = pl[target].x < e->x;
		e->dir = e->flip ? -1 : 1;
		/* it fires at a player in sight, in the closest of 8 directions */
		if (R->enemies_shoot && iabs(pl[target].x - e->x) <= TOP_SIGHT && iabs(tfy - e->fy) <= TOP_SIGHT) {
			if (e->fire_wait)
				e->fire_wait--;
			else {
				s32 ax = iabs(pl[target].x - e->x), ay = iabs(tfy - e->fy);
				int sx = ax * 2 >= ay ? (pl[target].x > e->x) - (pl[target].x < e->x) : 0;
				int sy = ay * 2 >= ax ? (tfy > e->fy) - (tfy < e->fy) : 0;
				int live = 0, s;
				for (s = 0; s < MAX_EN_SHOTS; s++)
					live += en_shots[s].live != 0;
				if (live < MAX_EN_SHOTS) {
					for (s = 0; en_shots[s].live; s++)
						;
					en_shots[s].live = 1;
					en_shots[s].x = (s16)e->x;
					en_shots[s].y = (s16)(e->fy - TOP_MID);
					en_shots[s].dir = (s16)sx;
					en_shots[s].vy = (s16)sy;
				}
				e->fire_wait = ENEMY_FIRE_EVERY;
				sfx(SFX_SHOT, e->x);
			}
		}
		if (R->touch_hurts)
			for (k = 0; k < nplayers; k++)
				if (pl[k].active && !pl[k].hurt && iabs(pl[k].x - e->x) <= TOP_TOUCH_X && iabs((pl[k].y >> 4) - e->fy) <= TOP_TOUCH_Y)
					hurt(&pl[k], 0);
	}
}

/* the top-down enemies' shots (engine/game.ts updateTopShots): along their
   direction, hurting a player they meet, ended by walls and the screen's edge */
static void update_top_shots(void)
{
	int i, k;
	for (i = 0; i < MAX_EN_SHOTS; i++) {
		struct bullet *s = &en_shots[i];
		if (!s->live)
			continue;
		s->x += s->dir * TOP_EN_SHOT;
		s->y += s->vy * TOP_EN_SHOT;
		for (k = 0; k < nplayers; k++) {
			struct player *p = &pl[k];
			if (p->active && !p->hurt && iabs(p->x - s->x) <= TOP_EN_HIT_X && iabs((p->y >> 4) - TOP_MID - s->y) <= TOP_EN_HIT_Y) {
				hurt(p, 0);
				s->live = 0;
				break;
			}
		}
		if (s->live && (is_solid(cell_at(s->x, s->y)) || s->x < cam_x - 32 || s->x > cam_x + SCREEN_W + 32 || s->y < cam_y - 32 || s->y > cam_y + SCREEN_H + 32))
			s->live = 0;
	}
}

/* the maze's chasers (engine/game.ts updateMazeChasers): a pixel a frame (every
   other frame while they flee), at a cell's middle the open way, not back,
   that brings them nearest the nearest player (farthest while they flee;
   ties: up, left, down, right); a fleeing one a player touches is eaten */
static void update_maze_chasers(void)
{
	static const s8 ways[4][2] = { { 0, -1 }, { -1, 0 }, { 0, 1 }, { 1, 0 } };
	int i, k, flee, kind, steps, s;
	if (fright_t)
		fright_t--;
	flee = fright_t > 0;
	for (i = 0; i < nen; i++) {
		struct enemy *e = &en[i];
		int target = -1;
		s32 best = 0x7fffffff, tx = 0, ty = 0;
		e->t++;
		if (e->state == EN_DOWN) {
			if (e->t >= HOME_FRAMES) {
				e->state = EN_WALK;
				e->x = e->min;
				e->fy = e->max;
				e->dir = 0;
				e->mdy = 0;
				e->t = 0;
			}
			continue;
		}
		if (e->state != EN_WALK)
			continue;
		for (k = 0; k < nplayers; k++) {
			s32 d;
			if (!pl[k].active)
				continue;
			d = iabs(pl[k].x - e->x) + iabs((pl[k].y >> 4) - e->fy);
			if (d < best) {
				best = d;
				target = k;
			}
		}
		/* where it heads: the player, a spot ahead of it, or the corner when near (AMBUSH_AHEAD, WANDER_NEAR) */
		if (target >= 0) {
			struct player *q = &pl[target];
			tx = q->x;
			ty = q->y >> 4;
			/* its way of chasing: chosen in the Inspector (Chases), else by its order */
			kind = e->path ? e->path - 1 : i % 3;
			if (!flee && kind == 1) {
				int moving = q->mdx || q->mdy;
				tx += (moving ? q->mdx : q->wdx) * AMBUSH_AHEAD;
				ty += (moving ? q->mdy : q->wdy) * AMBUSH_AHEAD;
			} else if (!flee && kind == 2 && best < WANDER_NEAR) {
				tx = 0;
				ty = (s32)rows << 4;
			}
		}
		/* from the second round a pixel more every maze_haste frames, unless it flees */
		steps = 0;
		if (target >= 0 && (!flee || (plat_t & 1))) {
			int haste = maze_haste[maze_round < 2 ? maze_round : 2];
			steps = haste && !flee && (plat_t & (haste - 1)) == 0 ? 2 : 1;
		}
		for (s = 0; s < steps; s++) {
			if ((e->x & 15) == 8 && (e->fy & 15) == 0) {
				int c = (int)(e->x >> 4), r = (int)((e->fy - 1) >> 4), w, pick = -1;
				s32 score = flee ? -1 : 0x7fffffff;
				for (w = 0; w < 4; w++) {
					s32 d;
					if (ways[w][0] == -e->dir && ways[w][1] == -e->mdy && (e->dir || e->mdy))
						continue;
					if (!maze_open(c + ways[w][0], r + ways[w][1]))
						continue;
					d = iabs(tx - (e->x + ways[w][0] * 16)) + iabs(ty - (e->fy + ways[w][1] * 16));
					if (flee ? d > score : d < score) {
						score = d;
						pick = w;
					}
				}
				/* a dead end: back the way it came */
				if (pick < 0 && (e->dir || e->mdy) && maze_open(c - e->dir, r - e->mdy)) {
					e->dir = -e->dir;
					e->mdy = -e->mdy;
				} else {
					e->dir = pick >= 0 ? ways[pick][0] : 0;
					e->mdy = pick >= 0 ? ways[pick][1] : 0;
				}
			}
			e->x = maze_wrap(e->x + e->dir);
			e->fy += e->mdy;
			if (e->dir)
				e->flip = e->dir < 0;
		}
		for (k = 0; k < nplayers; k++) {
			struct player *p = &pl[k];
			if (!p->active || iabs(p->x - e->x) > MAZE_TOUCH || iabs((p->y >> 4) - e->fy) > MAZE_TOUCH)
				continue;
			if (flee) {
				e->state = EN_DOWN;
				e->t = 0;
				p->score += EAT_SCORE;
				sfx(SFX_ENEMY_DOWN, e->x);
				break;
			}
			if (!p->hurt && R->touch_hurts)
				hurt(p, 0);
		}
	}
}

static void update_enemies(int playing)
{
	int i, k;
	if (quiz) {
		update_quiz();
		return;
	}
	if (puzzle)
		return;
	if (maze) {
		update_maze_chasers();
		return;
	}
	if (topdown) {
		update_chasers();
		update_top_shots();
		return;
	}
	if (crosshair) {
		update_targets();
		return;
	}
	if (ship) {
		update_fliers();
		return;
	}
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
		/* the light gun's hostages are only not to be shot; the shooter has none to rescue */
		if (civ[i].rescued || crosshair || ship)
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

/*
 * The camera lock in force (engine/game.ts activeLock), or -1: the first not
 * done whose x range the screen reaches past its middle while an enemy still
 * stands in it; reached with nobody in it, it is done for good.
 */
static int active_lock(void)
{
	const struct wm_object *l = (const struct wm_object *)D->locks;
	int i, k, n = D->n_locks < MAX_LOCKS ? D->n_locks : MAX_LOCKS;
	for (i = 0; i < n; i++, l++) {
		int inside = 0;
		if (lock_done[i])
			continue;
		/* camX + SCREEN_W < x + w / 2 in play mode, in whole numbers; the vertical
		   shooter's across the climb: the screen's top past the lock's middle */
		if (vertical) {
			if (2 * cam_y > 2 * l->y + l->b || cam_y + SCREEN_H < l->y)
				continue;
		} else if (2 * (cam_x + SCREEN_W) < 2 * l->x + l->a || cam_x > l->x + l->a)
			continue;
		for (k = 0; k < nen && !inside; k++)
			inside = en_alive(k) && (vertical ? en[k].fy >= l->y && en[k].fy <= l->y + l->b : en[k].x >= l->x && en[k].x <= l->x + l->a);
		if (!inside) {
			lock_done[i] = 1;
			continue;
		}
		return i;
	}
	return -1;
}

/* the light gun's camera (engine/game.ts updateRoute): along the level a pixel
   every ROUTE_STEP frames, holding at a camera lock until its targets are down */
static void update_route(int snap)
{
	s32 max_cx = level_w - SCREEN_W;
	int lk;
	if (vertical) {
		/* the vertical shooter: from the level's bottom up, a pixel every ROUTE_STEP frames */
		/* a lock holds the camera with the screen's top at the lock's top */
		s32 min_y = 0;
		cam_x = 0;
		lk = active_lock();
		if (lk >= 0) {
			const struct wm_object *l = (const struct wm_object *)D->locks + lk;
			min_y = l->y > 0 ? l->y : 0;
		}
		if (snap)
			cam_y = level_h - SCREEN_H > 0 ? level_h - SCREEN_H : 0;
		else if (plat_t % ROUTE_STEP == 0 && cam_y > min_y)
			cam_y--;
		return;
	}
	lk = active_lock();
	if (lk >= 0) {
		const struct wm_object *l = (const struct wm_object *)D->locks + lk;
		s32 end = l->x + l->a - SCREEN_W > l->x ? l->x + l->a - SCREEN_W : l->x;
		if (end < max_cx)
			max_cx = end;
	}
	cam_y = level_h - SCREEN_H > 0 ? level_h - SCREEN_H : 0;
	if (snap)
		cam_x = 0;
	else if (plat_t % ROUTE_STEP == 0 && cam_x < max_cx)
		cam_x++;
	if (cam_x > cam_far)
		cam_far = cam_x;
}

/* the top-down camera (engine/game.ts updateTopCamera): on the players' middle both ways */
static void update_top_camera(int snap)
{
	s32 sx = 0, sy = 0, tx, ty;
	int n = 0, k;
	for (k = 0; k < nplayers; k++)
		if (pl[k].active) {
			sx += pl[k].x;
			sy += pl[k].y >> 4;
			n++;
		}
	if (!n)
		return;
	tx = sx / n - (SCREEN_W >> 1);
	ty = sy / n - TOP_MID - (SCREEN_H >> 1) + 16;
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
		cam_x += (int)(tx - cam_x) / 4 + (tx > cam_x) - (tx < cam_x);
		cam_y += (int)(ty - cam_y) / 4 + (ty > cam_y) - (ty < cam_y);
	}
	if (cam_x > cam_far)
		cam_far = cam_x;
}

static void update_camera(int snap)
{
	s32 sx = 0, sy = 0, tx, ty, fy;
	/* the maze and the puzzle: one screen, the camera still at its top left */
	if (maze || puzzle || quiz) {
		cam_x = cam_y = 0;
		return;
	}
	if (topdown) {
		update_top_camera(snap);
		return;
	}
	if (crosshair || ship) {
		update_route(snap);
		return;
	}
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
	{
		/* a camera lock stops it at the lock's end (a beat 'em up's wave) */
		s32 max_cx = level_w - SCREEN_W;
		int lk = active_lock();
		if (lk >= 0) {
			const struct wm_object *l = (const struct wm_object *)D->locks + lk;
			s32 end = l->x + l->a - SCREEN_W > l->x ? l->x + l->a - SCREEN_W : l->x;
			if (end < max_cx)
				max_cx = end;
		}
		if (tx > max_cx)
			tx = max_cx;
	}
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
	} else if (p->grabbed) {
		/* holding an enemy: the guard pose */
		draw_frame(&l->knife->frames[0], sx, sy, p->pal, p->flip);
	} else if (p->punch_t) {
		/* the beat 'em up's punches, and the combo's kick */
		if (p->combo == 3)
			draw_once(l->kick, (u32)(COMBO_KICK_FRAMES - p->punch_t), sx, sy, p->pal, p->flip);
		else {
			/* Willy has a punch of his own (art.mjs withPunch); an own hero punches with its knife */
			const Anim *a = l == &willy_look ? &anim_willy_punch : l->knife;
			draw_frame(&a->frames[(PUNCH_FRAMES - p->punch_t) / 4 % a->count], sx, sy, p->pal, p->flip);
		}
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
	/* the top-down grenade in flight and its burst: four flashes spreading out */
	if (p->grenade.live)
		put_sprite(p->grenade.x - cam_x - 8, p->grenade.y - cam_y - 8, TILE_BULLET, PAL_BULLET);
	if (p->boom.t) {
		int r = 4 + (BOOM_FRAMES - p->boom.t) * 2, k;
		for (k = 0; k < 4; k++)
			put_sprite(p->boom.x - cam_x - 8 + (k == 0 ? -r : k == 1 ? r : 0), p->boom.y - cam_y - 8 + (k == 2 ? -r : k == 3 ? r : 0), (u16)(TILE_CROSS + 4), PAL_CROSS);
	}
	/* the thrown knife at hand height, its blade first (mirrored one pixel over, as play mode draws it) */
	if (p->blade.live)
		put_sprite(p->blade.x - cam_x - (p->blade.dir < 0 ? 7 : 8), p->blade.fy - 37 - cam_y, TILE_KNIFE, (u16)(PAL_PICKUPS | (p->blade.dir < 0 ? 0x20 : 0)));
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
	if (e->state == EN_OFF || e->state == EN_HIDDEN || sx < -60 || sx > SCREEN_W + 60 || sy < -10 || sy > SCREEN_H + 60)
		return;
	/* the shooter's enemies are drones (engine/shipArt.ts); a downed one blinks out */
	if (ship) {
		if (e->state == EN_DOWN && (e->t > 30 || ((e->t >> 2) & 1)))
			return;
		/* the gunship: the drone at twice the size, eight tiles */
		if (e->path == 3) {
			int t;
			for (t = 0; t < 8; t++)
				put_sprite(sx - 32 + (t & 3) * 16, sy - FLY_MID - 16 + (t >> 2) * 16, (u16)(TILE_GUNSHIP + t), PAL_CROSS);
			return;
		}
		put_sprite(sx - 16, sy - FLY_MID - 8, TILE_DRONE, (u16)(PAL_CROSS | (1 << 8)));
		return;
	}
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
			draw_anim(e->state == EN_HIT || e->state == EN_HELD ? l->land : e->state == EN_ATTACK || e->fire_wait > ENEMY_FIRE_EVERY - 15 ? l->gun : l->run, e->t, sx, sy, l->pal, e->flip);
		return;
	}
	if (e->state == EN_DOWN || e->state == EN_FALL) {
		u32 f = e->t * anim_robot_defeated.fps / 60;
		if (f >= anim_robot_defeated.count)
			f = anim_robot_defeated.count - 1;
		if (e->state == EN_FALL || e->t < 70 || (e->t & 4))
			draw_frame(&anim_robot_defeated.frames[f], sx, sy, e->boss ? BOSS_PAL_OFFSET : 0, e->flip);
		return;
	}
	/* a boss is the android in red: its palettes' copies with red and blue swapped (art.mjs) */
	draw_anim(e->state == EN_HIT || e->state == EN_HELD ? &anim_robot_hit : &anim_robot_walk, e->t, sx, sy, e->boss ? BOSS_PAL_OFFSET : 0, e->flip);
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
		else if (pickup[i].item == WM_ITEM_PIPE)
			put_sprite(sx - 8, sy - 16, TILE_PIPE, PAL_PICKUPS);
		else if (pickup[i].item == WM_ITEM_KNIFE)
			put_sprite(sx - 8, sy - 16, TILE_KNIFE, PAL_PICKUPS);
		else if (pickup[i].item == WM_ITEM_POWER)
			put_sprite(sx - 8, sy - 16, TILE_POWER, PAL_CROSS);
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
	if (puzzle || quiz) {
		if (puzzle)
			draw_wells();
		flush_sprites();
		return;
	}
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
	/* the light gun's players are their crosshairs, in front of everything (the
	   earlier sprite is drawn in front), each with its shot's flash behind it */
	if (crosshair)
		for (k = 0; k < nplayers; k++) {
			struct player *p = &pl[k];
			if (!p->active || (p->hurt && ((p->hurt >> 2) & 1)))
				continue;
			put_sprite(p->cx - 8, p->cy - 8, (u16)(TILE_CROSS + k), PAL_CROSS);
			if (p->shot_t)
				put_sprite(p->cx - 8, p->cy - 8, (u16)(TILE_CROSS + 4), PAL_CROSS);
		}
	else if (ship)
		/* the shooter's players are their ships (a 2 x 1 block in the player's color) */
		for (k = 0; k < nplayers; k++) {
			struct player *p = &pl[k];
			if (!p->active || (p->hurt && ((p->hurt >> 2) & 1)))
				continue;
			if (vertical) {
				/* pointing up: two tiles, top and bottom */
				put_sprite(p->cx - 8, p->cy - 16, (u16)(TILE_SHIPUP + 2 * k), PAL_CROSS);
				put_sprite(p->cx - 8, p->cy, (u16)(TILE_SHIPUP + 2 * k + 1), PAL_CROSS);
			} else
				put_sprite(p->cx - 16, p->cy - 8, (u16)(TILE_SHIP + 2 * k), (u16)(PAL_CROSS | (1 << 8)));
		}
	else
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
/* the HUD's screen; with nobody to rescue its rescued line goes, as in play mode */
static void hud_screen(void)
{
	struct line l;
	int pos = 0;
	draw_screen(WM_SCR_HUD, 1);
	if (!nciv)
		while (next_line(WM_SCR_HUD, &pos, &l))
			if (l.attr & WM_TXT_COUNT)
				blank(l.col, l.row, l.len + 4);
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
			/* the shooter's bombs and the top-down grenades under the energy */
			if (ship || topdown)
				for (e = 0; e < (topdown ? GRENADES : BOMBS) && e < room; e++)
					put_char(col + 3 + e, 2, e < p->bombs ? 'O' : ' ', INK_WHITE);
			/* the light gun: the clip under the energy, or a prompt to reload (B2) */
			if (crosshair) {
				for (e = 0; e < CLIP && e < room; e++)
					put_char(col + 3 + e, 2, e < p->ammo ? 'I' : ' ', INK_ACCENT);
				/* the bombs (B3) after the clip */
				for (e = 0; e < BOMBS && CLIP + 1 + e < room; e++)
					put_char(col + 3 + CLIP + 1 + e, 2, e < p->bombs ? 'O' : ' ', INK_WHITE);
				if (!p->ammo && room >= 6) {
					if (p->reload_t)
						print(col + 3, 2, "...   ", INK_WHITE);
					else if ((frame_count >> 4) & 1)
						print(col + 3, 2, "RELOAD", INK_WHITE);
				}
			}
			if ((p->special == WM_ITEM_BAZOOKA || p->special == WM_ITEM_PIPE) && has_ammo && room > 12) {
				print_n(col + 3 + 4, 1, ammo.s, ammo.len < room - 6 ? ammo.len : room - 6, INK_WHITE);
				put_char(col + 3 + 4 + (ammo.len < room - 6 ? ammo.len : room - 6) + 1, 1, '0' + p->ammo, INK_WHITE);
			}
		} else {
			const struct line *l = credits || free_play() ? (has_join ? &join : 0) : (has_coin ? &coin : 0);
			blank(col + 3, 1, room);
			if (crosshair || ship || topdown)
				blank(col + 3, 2, room < CLIP + 1 + BOMBS ? room : CLIP + 1 + BOMBS);
			if (l && ((frame_count / 20) & 1))
				print_n(col + 3, 0, l->s, l->len < room ? l->len : room, INK_WHITE);
			else
				blank(col + 3, 0, room);
		}
	}
	if (nciv) {
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
	/* the beat 'em up, the light gun and the shooter: the health of the enemy last hit, for two seconds */
	if (depth || crosshair || ship) {
		int hp = last_hit >= 0 && last_hit_t ? en[last_hit].hp : 0;
		int boss = hp > 0 && en[last_hit].boss;
		/* a boss's in BOSS_HUD_STEP hits a mark, in the accent ink */
		if (boss)
			hp = (hp + BOSS_HUD_STEP - 1) / BOSS_HUD_STEP;
		for (k = 0; k < 12; k++)
			put_char(24 + k, 26, k < hp ? '+' : ' ', boss ? INK_ACCENT : INK_RED);
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

#define SETUP_FRAMES 10 /* more than setting up any level takes */

/* the title: the camera tours the level; returns the port whose Start began */
static int title(void)
{
	u32 t = 0, entry = frame_count;
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
	/* as play's start (SETUP_FRAMES): the tour begins a fixed number of frames
	   after the title began, whatever setting it up took, so the real core and
	   the board model, whose cycle counts differ a little, never part by a frame */
	while (frame_count - entry < SETUP_FRAMES)
		wait_vblank();
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


static int play(int first)
{
	u32 end_t = 0, entry = frame_count;
	int k, outcome = -1, cont = 0;
	clear_text();
	game_reset();
	victory = 0;
	for (k = 0; k < nplayers; k++)
		pl[k].cpu = 0;
	player_join(first);
	/* the puzzle's CPU rival takes the second well while player 2 is not in */
	if (puzzle_cpu && nplayers > 1 && !pl[1].active) {
		player_join(1);
		pl[1].cpu = 1;
	}
	update_camera(1);
	stream();
	hud_screen();
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
				if ((!pl[k].active || pl[k].cpu) && (!puzzle || k < WELLS) && (credits || free_play()) && start_pressed(k)) {
					if (!free_play())
						credits--;
					SFX_CENTRE(SFX_START);
					if (cont) {
						cont = 0;
						clear_text();
						hud_screen();
						MUSIC(MUSIC_PLAY);
					}
					/* a player taking the CPU's well: empty, with a credit's lives and no score */
					if (pl[k].cpu) {
						pl[k].cpu = 0;
						pl[k].active = 0;
						pl[k].score = 0;
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
		/* the light gun's camera moves only while playing, as play mode's */
		if ((!crosshair && !ship) || outcome < 0)
			update_camera(0);
		stream();
		set_scroll();
		draw_world();
		if (outcome < 0)
			hud();
		for (k = 0; k < nplayers; k++)
			alive += pl[k].active && !pl[k].cpu;
		if (outcome < 0)
			soon_update();
		/* the maze: its dots on the text layer, and every dot eaten clears the level */
		if (maze && outcome < 0) {
			int any = 0;
			if (dots_dirty)
				maze_draw_dots();
			for (k = 0; k < nplayers; k++)
				any |= pl[k].active;
			/* every dot eaten: the next round, or the level clears after the last */
			if (dots_left <= 0 && any && maze_round + 1 < D->maze_rounds)
				maze_next_round();
			else if (dots_left <= 0 && any) {
				blank(15, 16, 18);
				outcome = END_CLEAR;
				end_t = frame_count;
				draw_screen(WM_SCR_CLEAR, 1);
				MUSIC(MUSIC_CLEAR);
			}
		}
		/* the quiz: its screen, and past the last question the level clears */
		if (quiz && outcome < 0) {
			int any = 0;
			quiz_draw();
			for (k = 0; k < nplayers; k++)
				any |= pl[k].active;
			if (quiz_k >= quiz_n && any) {
				blank(15, 16, 18);
				outcome = END_CLEAR;
				end_t = frame_count;
				draw_screen(WM_SCR_CLEAR, 1);
				MUSIC(MUSIC_CLEAR);
			}
		}
		/* the puzzle: a player with PUZZLE_GOAL gems cleared clears the level */
		if (puzzle && outcome < 0) {
			int won = 0;
			for (k = 0; k < WELLS && k < nplayers; k++)
				won |= pl[k].active && !pl[k].cpu && wells[k].gems >= PUZZLE_GOAL;
			if (won) {
				blank(15, 16, 18);
				outcome = END_CLEAR;
				end_t = frame_count;
				draw_screen(WM_SCR_CLEAR, 1);
				MUSIC(MUSIC_CLEAR);
			}
		}
		/* the light gun: the level ends where the camera's route does, with no lock holding it */
		if (outcome < 0 && (crosshair || ship) && (vertical ? cam_y <= 0 : cam_x >= level_w - SCREEN_W) && active_lock() < 0) {
			int any = 0;
			for (k = 0; k < nplayers; k++)
				any |= pl[k].active;
			if (any) {
				blank(15, 16, 18);
				outcome = END_CLEAR;
				end_t = frame_count;
				draw_screen(WM_SCR_CLEAR, 1);
				MUSIC(MUSIC_CLEAR);
			}
		}
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
				hud_screen(); /* the overlay keeps the HUD whole (J-10) */
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
