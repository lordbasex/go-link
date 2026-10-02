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
static const struct wm_look willy_look = { &anim_willy_idle, &anim_willy_run, &anim_willy_jump, &anim_willy_knife, &anim_willy_machine_gun, &anim_willy_bazooka, 0, 0 };

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
static u8 col_map[24576]; /* the collision map in RAM: crates and walls break */

static void load_col2(int c)
{
	int r;
	for (r = 0; r < rows && r < 64; r++) {
		int i = r * cols + c;
		u16 code = D_PLAY[i];
		u8 t = D_TAGS[i];
		volatile u16 *p = scroll2_cell(c, r);
		if ((t == T_CRATE || t == T_BREAKABLE) && col_map[i] == T_AIR)
			code = WM_EMPTY16;
		p[0] = code;
		p[1] = 0;
	}
	loaded2[c & 63] = (s16)c;
}

static void load_col3(int c)
{
	int r, fc = D->far_cols, fr = D->far_rows;
	for (r = 0; r < fr && r < 64; r++) {
		volatile u16 *p = scroll3_cell(c, r);
		p[0] = D_FAR[r * fc + c];
		p[1] = 0;
	}
	loaded3[c & 63] = (s16)c;
}

static int cam_x, cam_y, cam_far;

/* loads the tile columns around the camera that are not on the board yet */
static void stream(void)
{
	int c, c0 = cam_x / 16 - 2, c1 = cam_x / 16 + SCREEN_W / 16 + 3;
	for (c = c0; c <= c1; c++)
		if (c >= 0 && c < cols && loaded2[c & 63] != c)
			load_col2(c);
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
	load_palette(PAL_SCROLL2 + 0, D_PAL);
	load_palette(PAL_SCROLL3 + 0, D_PAL + 16);
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

#define MAX_SPRITES 200 /* the table holds 256 */
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
#define ENEMY_FIRE_EVERY 90
#define ENEMY_SHOT_SPEED 3
#define BREAKABLE_HP 2
#define MAX_ENEMIES 16
#define MAX_CIVS 8
#define MAX_CRATES 32
#define MAX_PICKUPS 16
#define MAX_EN_SHOTS 8
#define MAX_DAMAGED 32

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
	u32 t, score;
	struct bullet shots[SHOTS];
	struct rocket rocket;
};
static struct player pl[MAX_PLAYERS];
static u16 start_now, start_last; /* bit k: port k's Start */

enum { EN_OFF, EN_WALK, EN_HIT, EN_DOWN };
static struct enemy {
	s32 x, fy, min, max;
	int state, hp, flip, dir, fire_wait;
	u32 t;
} en[MAX_ENEMIES];
static int nen;

static struct bullet en_shots[MAX_EN_SHOTS];

static struct civ {
	s32 x, fy;
	int child, rescued;
	u32 t;
} civ[MAX_CIVS];
static int nciv, rescued;

static struct crate {
	int col, row, cells, hp, contents, broken, breakable;
} crate[MAX_CRATES];
static int ncrates;

static struct pickup {
	s32 x, fy;
	int item, live;
} pickup[MAX_PICKUPS];
static int npickups;

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
			if ((down & (1 << k)) && credits < 9)
				credits++;
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

static int support(s32 x, s32 fy, int drop)
{
	int r, c0, c1, best = 0, c;
	if (fy & 15)
		return 0;
	r = (int)(fy >> 4);
	c0 = (int)((x - HALF_W) >> 4);
	c1 = (int)((x + HALF_W) >> 4);
	for (c = c0; c <= c1; c++) {
		if (is_solid(cell(c, r)))
			return 2;
		if (!drop && is_ledge(c, r))
			best = 1;
	}
	return best;
}

static int body_blocked(s32 x, s32 fy)
{
	s32 y;
	for (y = fy - 1; y > fy - BODY_H; y -= 8)
		if (is_solid(cell_at(x, y)))
			return 1;
	return is_solid(cell_at(x, fy - BODY_H));
}

/* the first place feet can stand at x, searching down from y (px) */
static s32 ground_below(s32 x, s32 y)
{
	s32 fy = ((y + 15) >> 4) << 4;
	if (fy < 16)
		fy = 16;
	for (; fy < level_h; fy += 16)
		if (support(x, fy, 0) && !body_blocked(x, fy))
			return fy;
	return level_h - 16;
}

static void clear_cell(int c, int r)
{
	col_map[r * cols + c] = T_AIR;
	if (loaded2[c & 63] == c)
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
	npickups++;
}

/* breaks crate i, then the crates resting on it with nothing else under them,
   so none is left hanging over the floor */
static void crate_break(int i, struct player *by)
{
	struct crate *k = &crate[i];
	int q, j, n = k->cells;
	k->broken = 1;
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
	return en[i].state == EN_WALK || en[i].state == EN_HIT;
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
	} else
		en[i].state = EN_HIT;
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
	p->vy = 0;
	p->flip = 0;
	p->on_ground = 1;
	p->climbing = p->drop_t = p->push_t = 0;
	p->running = p->tap_dir = 0;
	p->special = 0;
	p->ammo = p->knife_t = p->bazooka_t = p->fire_wait = p->firing = 0;
	p->t = 0;
	for (i = 0; i < SHOTS; i++)
		p->shots[i].live = 0;
	p->rocket.live = 0;
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
	if (lead < 0 && D->start_x[k] >= 0) {
		x = D->start_x[k];
		fy = ground_below(x, D->start_y[k] - 16);
	} else if (lead >= 0) {
		x = pl[lead].x - 24;
		if (x < cam_x + 16)
			x = pl[lead].x + 24;
		fy = ground_below(x, (pl[lead].y >> 4) - 48);
	} else {
		x = cam_x + 64 + k * 24;
		fy = ground_below(x, cam_y);
	}
	player_spawn(p, x, fy);
	p->energy = R->energy;
	p->hurt = R->hurt_frames;
}

/* back on the ground near the camera's left side */
static void respawn_near_camera(struct player *p)
{
	s32 x = p->x;
	int energy = p->energy, hurt = p->hurt;
	u32 score = p->score;
	if (x < cam_x + 64)
		x = cam_x + 64;
	if (x > cam_x + SCREEN_W - 64)
		x = cam_x + SCREEN_W - 64;
	player_spawn(p, x, ground_below(x, cam_y));
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
	for (i = 0; i < 64; i++)
		loaded2[i] = loaded3[i] = -1;
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
	}
	o = D_OBJ + D->n_enemies;
	nciv = D->n_civs < MAX_CIVS ? D->n_civs : MAX_CIVS;
	for (i = 0; i < nciv; i++, o++) {
		civ[i].x = o->x;
		civ[i].fy = o->y;
		civ[i].child = o->a;
		civ[i].rescued = 0;
		civ[i].t = (u32)i * 17;
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
	for (i = 0; i < D->n_pickups; i++, o++)
		spawn_pickup(o->x, o->y, o->a);
	for (i = 0; i < MAX_EN_SHOTS; i++)
		en_shots[i].live = 0;
	rescued = 0;
	cam_x = cam_y = cam_far = 0;
}

static void walk(struct player *p, int dir, int speed)
{
	s32 fy = p->y >> 4;
	int n;
	for (n = 0; n < speed; n++) {
		s32 nx = p->x + dir;
		s32 front = nx + dir * HALF_W;
		if (!body_blocked(front, fy)) {
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
			if (fy - top <= STEP_UP && !body_blocked(front, top) && !body_blocked(p->x, top)) {
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

static void update_player(struct player *p)
{
	int i, dir = 0;
	s32 fy, d;
	if (!p->active)
		return;
	p->t++;
	if (p->drop_t)
		p->drop_t--;
	if (p->hurt)
		p->hurt--;
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
			if (support(p->x, (fy >> 4) << 4, 1) == 2 && (fy & 15) < 2) {
				p->y = ((fy >> 4) << 4) * 16;
				p->climbing = 0;
				p->on_ground = 1;
			} else if (cell_at(p->x, fy - 1) != T_LADDER && cell_at(p->x, fy) != T_LADDER)
				p->climbing = 0;
		}
		if (PRESSED(p, BTN_1)) {
			p->climbing = 0;
			p->vy = JUMP_VY / 2;
		}
	} else {
		if (dir && !p->knife_t && !p->bazooka_t) {
			p->flip = dir < 0;
			walk(p, dir, p->running ? 2 : 1);
		} else
			p->push_t = 0;
		fy = p->y >> 4;
		if (p->on_ground && PRESSED(p, BTN_1)) {
			if ((p->pad & BTN_DOWN) && support(p->x, fy, 0) == 1) {
				p->drop_t = DROP_FRAMES;
				p->on_ground = 0;
				p->vy = 0;
				p->y += 16;
			} else {
				p->vy = JUMP_VY;
				p->on_ground = 0;
			}
		}
		if (p->on_ground && !support(p->x, fy, 0)) {
			p->on_ground = 0;
			p->vy = 0;
		}
		if (!p->on_ground) {
			s32 from = p->y >> 4, to, py;
			p->vy += GRAVITY;
			if (p->vy > MAX_FALL)
				p->vy = MAX_FALL;
			to = (p->y + p->vy) >> 4;
			if (p->vy > 0) {
				for (py = from + 1; py <= to; py++)
					if (support(p->x, py, p->drop_t != 0)) {
						p->y = py * 16;
						p->vy = 0;
						p->on_ground = 1;
						break;
					}
				if (!p->on_ground)
					p->y += p->vy;
			} else {
				if (is_solid(cell_at(p->x, to - BODY_H)))
					p->vy = 0;
				else
					p->y += p->vy;
			}
		}
	}
	fy = p->y >> 4;
	if (fy > level_h + 64) {
		hurt(p, 1); /* fell out */
		return;
	}
	if (cell_at(p->x, fy - 1) == T_HAZARD || cell_at(p->x, fy - BODY_H / 2) == T_HAZARD)
		hurt(p, 0);
	if (!p->active)
		return;

	/* pickups */
	for (i = 0; i < npickups; i++) {
		struct pickup *k = &pickup[i];
		d = k->x - p->x;
		if (k->live && d > -14 && d < 14 && fy - k->fy > -8 && fy - k->fy < 8) {
			k->live = 0;
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
	if (PRESSED(p, BTN_3) && p->special == WM_ITEM_BAZOOKA && p->ammo > 0 && !p->rocket.live && p->on_ground) {
		p->rocket.live = 1;
		p->rocket.dir = p->flip ? -1 : 1;
		p->rocket.x = (s16)(p->x + (p->flip ? -30 : 10));
		p->rocket.y = (s16)(fy - 30);
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
		} else if (hit_cell((int)(tip >> 4), (p->rocket.y + 8) >> 4, 9, p))
			p->rocket.live = 0;
		else if (cell_at(tip, p->rocket.y + 8) == T_SOLID || p->rocket.x < cam_x - 48 || p->rocket.x > cam_x + SCREEN_W + 48)
			p->rocket.live = 0;
	}

	/* fire (B2): the knife if an enemy stands right in front, else the machine gun */
	if (p->knife_t)
		p->knife_t--;
	if (PRESSED(p, BTN_2) && p->on_ground && !p->climbing) {
		int ei = enemy_at(p->x + (p->flip ? -KNIFE_REACH : KNIFE_REACH), fy - 20, 16);
		if (ei >= 0) {
			p->knife_t = KNIFE_FRAMES;
			en_damage(ei, 2, p);
		}
	}
	p->firing = (p->pad & BTN_2) && !p->knife_t && !p->bazooka_t && !p->climbing;
	if (p->fire_wait)
		p->fire_wait--;
	if (p->firing && !p->fire_wait)
		for (i = 0; i < SHOTS; i++)
			if (!p->shots[i].live) {
				p->shots[i].live = 1;
				p->shots[i].dir = p->flip ? -1 : 1;
				p->shots[i].x = (s16)(p->x + (p->flip ? -20 : 20));
				p->shots[i].y = (s16)(fy - 27);
				p->fire_wait = FIRE_EVERY;
				break;
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

static void update_enemies(int playing)
{
	int i, k;
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
				if ((dx > 22 || dx < -22) && (e->t & 1))
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
			if (p->active && dx > -8 && dx < 8 && s->y <= fy && s->y > fy - BODY_H) {
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
				pl[k].score += R->rescue_score;
				break;
			}
		}
	}
}

/* ------------------------------------------------------------- camera */

static void update_camera(int snap)
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
	tx = sx / n - SCREEN_W / 3;
	if (tx < cam_far - (s32)D->backtrack)
		tx = cam_far - (s32)D->backtrack;
	ty = sy / n - 150;
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
		cam_y += (int)(ty - cam_y) / 6 + (ty > cam_y) - (ty < cam_y);
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
	CPSA_SCROLL2_X = (u16)(cam_x - SCREEN_X0);
	CPSA_SCROLL2_Y = (u16)(cam_y - SCREEN_Y0);
	CPSA_SCROLL3_X = (u16)(cam_x / 2 - SCREEN_X0);
	CPSA_SCROLL3_Y = (u16)(cam_y / 2 - SCREEN_Y0);
}

/* -------------------------------------------------------------- drawing */

static void draw_player(struct player *p)
{
	int sx = (int)p->x - cam_x;
	int sy = (int)(p->y >> 4) - cam_y;
	int moving = (p->pad & (BTN_LEFT | BTN_RIGHT)) != 0;
	const struct wm_look *l = p->look;
	if (!p->active || (p->hurt & 4))
		return;
	if (p->climbing) {
		int f = (p->pad & (BTN_UP | BTN_DOWN)) ? (int)(p->y >> 7) & 1 : 0;
		draw_frame(&l->jump->frames[1 % l->jump->count], sx, sy, p->pal, f);
		return;
	}
	if (!p->on_ground) {
		int i = p->vy < -60 ? 1 : p->vy < 0 ? 2 : p->vy < 60 ? 3 : 4;
		draw_frame(&l->jump->frames[i % l->jump->count], sx, sy, p->pal, p->flip);
	} else if (p->knife_t)
		draw_frame(&l->knife->frames[(KNIFE_FRAMES - p->knife_t) / 4 % l->knife->count], sx, sy, p->pal, p->flip);
	else if (p->bazooka_t)
		draw_anim(l->bazooka, p->t, sx, sy, p->pal, p->flip);
	else if (p->firing)
		draw_anim(l->gun, p->t, sx, sy, p->pal, p->flip);
	else if (moving)
		draw_anim(l->run, p->running ? p->t : p->t / 2, sx, sy, p->pal, p->flip);
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

static void draw_enemies(void)
{
	int i;
	for (i = 0; i < MAX_EN_SHOTS; i++)
		if (en_shots[i].live)
			put_sprite(en_shots[i].x - cam_x - 8, en_shots[i].y - cam_y - 8, TILE_BULLET, (u16)(PAL_BULLET | (en_shots[i].dir < 0 ? 0x20 : 0)));
	for (i = 0; i < nen; i++) {
		struct enemy *e = &en[i];
		int sx = (int)e->x - cam_x, sy = (int)e->fy - cam_y;
		if (e->state == EN_OFF || sx < -60 || sx > SCREEN_W + 60 || sy < -10 || sy > SCREEN_H + 60)
			continue;
		if (e->state == EN_DOWN) {
			u32 f = e->t * anim_robot_defeated.fps / 60;
			if (f >= anim_robot_defeated.count)
				f = anim_robot_defeated.count - 1;
			if (e->t < 70 || (e->t & 4))
				draw_frame(&anim_robot_defeated.frames[f], sx, sy, 0, e->flip);
			continue;
		}
		draw_anim(e->state == EN_HIT ? &anim_robot_hit : &anim_robot_walk, e->t, sx, sy, 0, e->flip);
	}
}

static void draw_civilians(void)
{
	int i;
	for (i = 0; i < nciv; i++) {
		int sx = (int)civ[i].x - cam_x, sy = (int)civ[i].fy - cam_y;
		const Anim *a;
		if (sx < -40 || sx > SCREEN_W + 40 || sy < -10 || sy > SCREEN_H + 50)
			continue;
		if (civ[i].child)
			a = civ[i].rescued ? &anim_child_happy : &anim_child_worried;
		else
			a = civ[i].rescued ? &anim_woman_happy : &anim_woman_worried;
		draw_anim(a, civ[i].t, sx, sy, 0, 1);
	}
}

static void draw_pickups(void)
{
	int i;
	for (i = 0; i < npickups; i++)
		if (pickup[i].live && (frame_count & 16))
			put_sprite((int)pickup[i].x - cam_x - 16, (int)pickup[i].fy - cam_y - 18, TILE_ROCKET, (u16)(PAL_ROCKET | (1 << 8)));
}

static void draw_world(void)
{
	int k;
	for (k = 0; k < nplayers; k++)
		draw_shots(&pl[k]);
	for (k = 0; k < nplayers; k++)
		draw_player(&pl[k]);
	draw_enemies();
	draw_pickups();
	draw_civilians();
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
				 (p->running ? LAB_PF_RUN : 0) | (p->firing ? LAB_PF_FIRE : 0));
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
				return k;
			}
	}
}

/* how a game ended */
enum { END_CLEAR, END_OVER };

static int play(int first)
{
	u32 end_t = 0;
	int k, outcome = -1, cont = 0;
	clear_text();
	game_reset();
	player_join(first);
	update_camera(1);
	stream();
	draw_screen(WM_SCR_HUD, 1);
	for (;;) {
		int alive = 0;
		wait_vblank();
		read_inputs();
		if (outcome < 0)
			for (k = 0; k < nplayers; k++)
				if (!pl[k].active && (credits || free_play()) && start_pressed(k)) {
					if (!free_play())
						credits--;
					if (cont) {
						cont = 0;
						clear_text();
						draw_screen(WM_SCR_HUD, 1);
					}
					player_join(k);
				}
		for (k = 0; k < nplayers; k++)
			update_player(&pl[k]);
		update_enemies(outcome < 0);
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
				break;
			}
		if (exit_msg && outcome < 0) {
			if (--exit_msg && ((frame_count >> 4) & 1))
				print(15, 16, "DEFEAT EVERY ENEMY", INK_WHITE);
			else
				blank(15, 16, 18);
		}
		/* nobody left: continue with a credit, else game over */
		if (outcome < 0 && !alive) {
			if (credits || free_play()) {
				if (!cont) {
					cont = 1;
					end_t = frame_count;
					clear_text();
					draw_screen(WM_SCR_CONTINUE, 1);
				}
				print_num(23, 12, (u32)(9 - (frame_count - end_t) / 60), 1, INK_WHITE);
				if (frame_count - end_t >= 600)
					cont = 0, outcome = END_OVER;
			} else
				outcome = END_OVER;
			if (outcome == END_OVER) {
				end_t = frame_count;
				clear_text();
				draw_screen(WM_SCR_GAMEOVER, 1);
			}
		}
		lab_mode = outcome == END_CLEAR ? LAB_MODE_CLEAR : outcome == END_OVER ? LAB_MODE_GAME_OVER : LAB_MODE_PLAYING;
		lab_update();
		if (outcome >= 0 && frame_count - end_t > 360)
			return outcome;
	}
}

int main(void)
{
	if (D->magic != WM_MAGIC || D->version != WM_VERSION || (u32)D->cols * D->rows > sizeof col_map || D->rows > 64 || D->far_rows > 64) {
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
