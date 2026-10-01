/* Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> */
/*
 * go-link's CPS-1 prototype (docs/rom/journal.md, step 4):
 *  - attract screen over the level, INSERT COIN, credits;
 *  - Coin adds a credit, 1P Start begins, 2P Start joins player 2 (an
 *    Uplink recruit: Willy's tiles with a green-shirt palette);
 *  - a two-tier level in the style of Metal Slug: a 1024x448 world on
 *    scroll2 (street, buildings, one-way platforms, ladders, crates to
 *    climb and break), the backdrop on scroll3 at half speed, a camera
 *    that follows both players horizontally and vertically.
 * Controls: stick walks (double tap runs), up/down climb ladders, button
 * 1 jumps (down + jump drops through a platform), button 2 fires the
 * machine gun or the knife up close, button 3 the picked-up special.
 */
#include "hw.h"
#include "gfx.h"
#include "lab_state.h"

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

enum { TXT_ORANGE, TXT_WHITE, TXT_GREEN, TXT_RED };

/* Text on scroll1, in screen cells (0-47 x 0-27). */
static void print(int x, int y, const char *s, int pal)
{
	for (; *s; s++, x++) {
		volatile u16 *c = scroll1_cell(x + SCREEN_X0 / 8, y + SCREEN_Y0 / 8);
		char ch = *s;
		if (ch >= 'a' && ch <= 'z')
			ch -= 32;
		c[0] = ch == ' ' ? 0x0020 : FONT_CODE(ch);
		c[1] = pal;
	}
}

static void print_num(int x, int y, u32 v, int digits, int pal)
{
	char buf[11];
	int i;
	for (i = digits - 1; i >= 0; i--) {
		buf[i] = '0' + (char)(v % 10);
		v /= 10;
	}
	buf[digits] = 0;
	print(x, y, buf, pal);
}

static void clear_text(void)
{
	int c, r;
	for (c = 0; c < 64; c++)
		for (r = 0; r < 32; r++)
			scroll1_cell(c, r)[0] = 0x0020;
}

/*
 * Copies words to the board. The empty asm forces each word through a data
 * register: otherwise gcc may emit "move.w (a0)+,(0,a0,dN.l)", whose
 * destination the emulated 68000 computes with a0 already incremented, so
 * every word lands one word late (journal, steps 2 and 4; build.mjs now
 * refuses a program that contains that pattern).
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
	/* back to front: backdrop (scroll3), level (scroll2), sprites, text (scroll1) */
	CPSB_LAYER_CTRL = LAYER_ORDER(3, 2, 0, 1) | LAYER_EN_SCROLL1 | LAYER_EN_SCROLL23;

	for (c = 0; c < 64; c++)
		for (r = 0; r < 64; r++) {
			volatile u16 *p = scroll1_cell(c, r);
			p[0] = 0x0020;
			p[1] = 0;
			p = scroll2_cell(c, r);
			p[0] = r < LEVEL_ROWS ? level_map[r * LEVEL_COLS + c] : TILE16_LEVEL_EMPTY;
			p[1] = 0;
			p = scroll3_cell(c, r);
			p[0] = r < SKY_ROWS ? sky_map[r * SKY_COLS + c % SKY_COLS] : TILE32_EMPTY;
			p[1] = 0;
		}
	((volatile u16 *)GFX_OBJ)[3] = 0xff00;

	PALETTE[PAL_BACKGROUND] = 0xf102;
	load_palette(PAL_SCROLL2 + 0, pal_level);
	load_palette(PAL_SCROLL3 + 0, pal_sky);
	for (c = 0; c < OBJ_PALETTES; c++)
		load_palette(PAL_OBJ + c, obj_palettes + c * 16);
	/* text: pen 1 ink, pen 2 shadow */
	PALETTE[(PAL_SCROLL1 + TXT_ORANGE) * 16 + 1] = 0xffa3;
	PALETTE[(PAL_SCROLL1 + TXT_WHITE) * 16 + 1] = 0xfeee;
	PALETTE[(PAL_SCROLL1 + TXT_GREEN) * 16 + 1] = 0xf7e9;
	PALETTE[(PAL_SCROLL1 + TXT_RED) * 16 + 1] = 0xfe67;
	for (c = 0; c < 4; c++)
		PALETTE[(PAL_SCROLL1 + c) * 16 + 2] = 0xf000;
}

/* ------------------------------------------------------------- sprites */

#define MAX_SPRITES 200 /* the table holds 256 */
/*
 * Sprites go straight into the table in graphics RAM (the board copies it
 * at the end of each frame). A RAM buffer copied in a loop broke: gcc
 * turned the copy into "move.w (a0)+,(0,a0,d5.l)", which assumes the
 * destination is computed before the source's increment; the emulated
 * 68000 computes it after, so the table landed one word late and the
 * hardware never found our sprites (journal, step 2).
 */
#define OBJ ((volatile u16 *)GFX_OBJ)
static int nobj;

static void put_sprite(int x, int y, u16 code, u16 attr)
{
	volatile u16 *o;
	/* off-screen entries are dropped: X and Y wrap at 512 on the board */
	if (nobj >= MAX_SPRITES || x < -64 || x > SCREEN_W + 16 || y < -64 || y > SCREEN_H + 16)
		return;
	o = OBJ + nobj * 4;
	o[0] = (u16)(x + SCREEN_X0) & 0x1ff;
	o[1] = (u16)(y + SCREEN_Y0) & 0x1ff;
	o[2] = code;
	o[3] = attr;
	nobj++;
}

/*
 * A frame with its feet at screen (x, y), facing left when flip: one
 * sprite entry per 16x16 tile, each with its own palette (step 2b).
 * The palette argument is an offset added to the tiles' own (0 here).
 */
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

static void draw_tile(u16 code, int x, int y, int pal, int flip)
{
	put_sprite(x, y, code, (u16)((pal & 0x1f) | (flip ? 0x20 : 0)));
}

static void flush_sprites(void)
{
	OBJ[nobj * 4 + 3] = 0xff00; /* end of table */
	nobj = 0;
}

/* --------------------------------------------------------------- game */

#define PLAYERS 2
#define BODY_H 40  /* collision height of a player, px */
#define HALF_W 5   /* half width at the feet */
#define GRAVITY 6  /* 1/16 px per frame per frame */
#define JUMP_VY (-7 * 16)
#define MAX_FALL (8 * 16)
#define CLIMB_SPEED 24 /* 1.5 px per frame */
#define STEP_UP 32    /* the highest edge a push climbs (one crate) */
#define PUSH_FRAMES 10

static u16 sys_now, sys_last;
static int credits;
static int cam_x, cam_y;
static int cam_far; /* the farthest the camera has been: the stage only goes forward */
#define BACKTRACK 48  /* how far the camera may go back from cam_far, px */

struct bullet {
	s16 x, y, dir, live;
};

struct rocket {
	s16 x, y, dir, live, speed;
};

enum { SPECIAL_NONE, SPECIAL_BAZOOKA };

struct player {
	int active, palofs;
	u16 pad, last;
	s32 x;  /* world px */
	s32 y;  /* world y of the feet, 1/16 px */
	s32 vy; /* 1/16 px per frame */
	int flip, on_ground, climbing, drop_t, push_t;
	int running, tap_dir;
	u32 tap_time;
	int firing, fire_wait, knife_t, bazooka_t, special, ammo;
	u32 t, score;
	struct bullet shots[6];
	struct rocket rocket;
};
static struct player pl[PLAYERS];

static u8 col_map[LEVEL_ROWS * LEVEL_COLS]; /* RAM copy: crates can break */
static s8 crate_hp[CRATES];

enum { ROBOT_OFF, ROBOT_WALK, ROBOT_HIT, ROBOT_DOWN };
static struct {
	s32 x, fy, min, max;
	int state, hp, flip, dir;
	u32 t;
} robot[ROBOTS];

static struct {
	s32 x, fy;
	int child, rescued;
	u32 t;
} civ[CIVILIANS];

static struct {
	s32 x, fy;
	int live;
} pickup;

static int rescued;

#define PRESSED(p, bit) (((p)->pad & (bit)) && !((p)->last & (bit)))
#define SYS_PRESSED(bit) ((sys_now & (bit)) && !(sys_last & (bit)))
#define SYS_COIN2  0x02
#define SYS_START2 0x20

static void read_inputs(void)
{
	u16 both = (u16)~IN_P12;
	pl[0].last = pl[0].pad;
	pl[1].last = pl[1].pad;
	pl[0].pad = both & 0xff;
	pl[1].pad = (both >> 8) & 0xff;
	sys_last = sys_now;
	sys_now = (u16)(~IN_SYSTEM & 0xff);
	if ((SYS_PRESSED(SYS_COIN1) || SYS_PRESSED(SYS_COIN2)) && credits < 9)
		credits++;
}

/* ---------------------------------------------------------- the level */

static int cell(int c, int r)
{
	if (c < 0 || c >= LEVEL_COLS || r >= LEVEL_ROWS)
		return CELL_SOLID;
	if (r < 0)
		return CELL_EMPTY;
	return col_map[r * LEVEL_COLS + c];
}

static int cell_at(s32 x, s32 y)
{
	return cell((int)(x >> 4), (int)(y >> 4));
}

static int is_solid(int t)
{
	return t == CELL_SOLID || t == CELL_CRATE;
}

/* the top of a one-way platform, or of a ladder (a ladder's top cell) */
static int is_ledge(int c, int r)
{
	int t = cell(c, r);
	return t == CELL_ONEWAY || (t == CELL_LADDER && cell(c, r - 1) != CELL_LADDER);
}

/* can feet at world y (px, on a cell top) stand at x? 2 = solid, 1 = ledge */
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

static void set_cell_tile(int c, int r, u16 code)
{
	scroll2_cell(c, r)[0] = code;
}

static void level_reset(void)
{
	int i;
	for (i = 0; i < LEVEL_ROWS * LEVEL_COLS; i++) {
		col_map[i] = level_col[i];
		set_cell_tile(i % LEVEL_COLS, i / LEVEL_COLS, level_map[i]);
	}
	for (i = 0; i < CRATES; i++)
		crate_hp[i] = 3;
}

/* a hit on the crate that holds cell (c, r); returns 1 if it was a crate */
static int hit_crate(int c, int r, int damage, struct player *by)
{
	int i, q;
	for (i = 0; i < CRATES; i++) {
		int cc = crate_cells[i * 2], rr = crate_cells[i * 2 + 1];
		if (crate_hp[i] <= 0 || c < cc || c > cc + 1 || r < rr || r > rr + 1)
			continue;
		crate_hp[i] -= damage;
		if (crate_hp[i] <= 0) {
			for (q = 0; q < 4; q++) {
				col_map[(rr + (q >> 1)) * LEVEL_COLS + cc + (q & 1)] = CELL_EMPTY;
				set_cell_tile(cc + (q & 1), rr + (q >> 1), TILE16_LEVEL_EMPTY);
			}
			by->score += 100;
		}
		return 1;
	}
	return 0;
}

/* -------------------------------------------------------------- actors */

static void robot_spawn_all(void)
{
	int i;
	for (i = 0; i < ROBOTS; i++) {
		robot[i].x = robot_spawn[i * 4];
		robot[i].fy = robot_spawn[i * 4 + 1];
		robot[i].min = robot_spawn[i * 4 + 2];
		robot[i].max = robot_spawn[i * 4 + 3];
		robot[i].state = ROBOT_WALK;
		robot[i].hp = 4;
		robot[i].dir = -1;
		robot[i].t = (u32)i * 11;
	}
}

static int robot_alive(int i)
{
	return robot[i].state == ROBOT_WALK || robot[i].state == ROBOT_HIT;
}

static void robot_damage(int i, int n, struct player *by)
{
	if (!robot_alive(i))
		return;
	robot[i].hp -= n;
	robot[i].t = 0;
	if (robot[i].hp <= 0) {
		robot[i].state = ROBOT_DOWN;
		by->score += 500;
	} else
		robot[i].state = ROBOT_HIT;
}

/* the robot hit by a point (x, y), or -1 */
static int robot_at(s32 x, s32 y, int reach)
{
	int i;
	for (i = 0; i < ROBOTS; i++) {
		s32 dx = robot[i].x - x;
		if (robot_alive(i) && dx > -reach && dx < reach && y <= robot[i].fy && y > robot[i].fy - 40)
			return i;
	}
	return -1;
}

static void player_spawn(struct player *p, s32 x, s32 fy)
{
	int i;
	p->active = 1;
	p->x = x;
	p->y = fy * 16;
	p->vy = 0;
	p->flip = 0;
	p->on_ground = 1;
	p->climbing = p->drop_t = p->push_t = 0;
	p->running = p->tap_dir = 0;
	p->special = SPECIAL_NONE;
	p->ammo = p->knife_t = p->bazooka_t = p->fire_wait = 0;
	p->t = 0;
	for (i = 0; i < 6; i++)
		p->shots[i].live = 0;
	p->rocket.live = 0;
}

static void game_reset(void)
{
	int i;
	level_reset();
	pl[0].active = pl[1].active = 0;
	pl[0].score = pl[1].score = 0;
	pl[0].palofs = 0;
	pl[1].palofs = RECRUIT_PAL_OFFSET;
	player_spawn(&pl[0], 64, 400);
	pl[0].active = 0;
	robot_spawn_all();
	for (i = 0; i < CIVILIANS; i++) {
		civ[i].x = civ_spawn[i * 3];
		civ[i].fy = civ_spawn[i * 3 + 1];
		civ[i].child = civ_spawn[i * 3 + 2];
		civ[i].rescued = 0;
		civ[i].t = (u32)i * 17;
	}
	pickup.x = PICKUP_X;
	pickup.fy = PICKUP_Y;
	pickup.live = 1;
	rescued = 0;
}

static int special_pressed(struct player *p)
{
#if defined(SET_CAPTCOMM)
	return (p->pad & (BTN_1 | BTN_2)) == (BTN_1 | BTN_2) && (PRESSED(p, BTN_1) || PRESSED(p, BTN_2));
#else
	return PRESSED(p, BTN_3);
#endif
}

/* horizontal motion, one pixel at a time, with the push-to-climb step */
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
		/* blocked: an edge up to STEP_UP high with room above is climbed after a push */
		if (p->on_ground) {
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

static void update_player(struct player *p, int pi)
{
	int i, dir = 0;
	s32 fy, d;
	if (!p->active)
		return;
	p->t++;
	if (p->drop_t)
		p->drop_t--;
	if (p->pad & BTN_LEFT)
		dir = -1;
	else if (p->pad & BTN_RIGHT)
		dir = 1;
	/* double tap: a second press toward the same side within 15 frames runs */
	if (PRESSED(p, BTN_LEFT) || PRESSED(p, BTN_RIGHT)) {
		if (dir == p->tap_dir && frame_count - p->tap_time <= 15)
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
			if (((p->pad & BTN_UP) && cell_at(lx, fy - 8) == CELL_LADDER) ||
			    ((p->pad & BTN_DOWN) && !(p->pad & BTN_1) && p->on_ground && cell_at(lx, fy) == CELL_LADDER)) {
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
			if (cell_at(p->x, fy - 1) != CELL_LADDER) {
				/* over the top: stand on the ladder's top cell */
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
			} else if (cell_at(p->x, fy - 1) != CELL_LADDER && cell_at(p->x, fy) != CELL_LADDER)
				p->climbing = 0; /* off the bottom: fall */
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
		/* down + jump drops through a ledge; jump otherwise */
		if (p->on_ground && PRESSED(p, BTN_1) && !special_pressed(p)) {
			if ((p->pad & BTN_DOWN) && support(p->x, fy, 0) == 1) {
				p->drop_t = 12;
				p->on_ground = 0;
				p->vy = 0;
				p->y += 16;
			} else {
				p->vy = JUMP_VY;
				p->on_ground = 0;
			}
		}
		/* walking off an edge */
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
				/* the head hits only solid cells: one-way platforms let it through */
				if (is_solid(cell_at(p->x, to - BODY_H)))
					p->vy = 0;
				else
					p->y += p->vy;
			}
		}
	}
	fy = p->y >> 4;
	if (fy > LEVEL_H + 64)
		player_spawn(p, cam_x + 64, 400); /* fell out: back on the street */

	/* the crate pickup */
	d = pickup.x - p->x;
	if (pickup.live && d > -14 && d < 14 && fy - pickup.fy > -8 && fy - pickup.fy < 8) {
		pickup.live = 0;
		p->special = SPECIAL_BAZOOKA;
		p->ammo = 3;
	}

	/* special: the picked-up weapon while it has ammo */
	if (p->bazooka_t)
		p->bazooka_t--;
	if (special_pressed(p) && p->special == SPECIAL_BAZOOKA && p->ammo > 0 && !p->rocket.live && p->on_ground) {
		p->rocket.live = 1;
		p->rocket.dir = p->flip ? -1 : 1;
		p->rocket.x = (s16)(p->x + (p->flip ? -30 : 10));
		p->rocket.y = (s16)(fy - 30);
		p->rocket.speed = 2;
		p->bazooka_t = 24;
		if (--p->ammo == 0)
			p->special = SPECIAL_NONE;
	}
	if (p->rocket.live) {
		s32 tip;
		int ri;
		if (p->rocket.speed < 8)
			p->rocket.speed++;
		p->rocket.x += p->rocket.dir * p->rocket.speed;
		tip = p->rocket.x + 16 + p->rocket.dir * 14;
		ri = robot_at(tip, p->rocket.y + 8, 16);
		if (ri >= 0) {
			robot_damage(ri, 9, p);
			p->rocket.live = 0;
		} else if (cell_at(tip, p->rocket.y + 8) == CELL_CRATE) {
			hit_crate((int)(tip >> 4), (p->rocket.y + 8) >> 4, 9, p);
			p->rocket.live = 0;
		} else if (cell_at(tip, p->rocket.y + 8) == CELL_SOLID || p->rocket.x < cam_x - 48 || p->rocket.x > cam_x + SCREEN_W + 48)
			p->rocket.live = 0;
	}

	/* fire: the knife if a robot stands right in front, else the machine gun */
	if (p->knife_t)
		p->knife_t--;
	if (PRESSED(p, BTN_2) && !special_pressed(p) && p->on_ground && !p->climbing) {
		int ri = robot_at(p->x + (p->flip ? -18 : 18), fy - 20, 16);
		if (ri >= 0) {
			p->knife_t = 16;
			robot_damage(ri, 2, p);
		}
	}
	p->firing = (p->pad & BTN_2) && !p->knife_t && !p->bazooka_t && !p->climbing;
	if (p->fire_wait)
		p->fire_wait--;
	if (p->firing && !p->fire_wait)
		for (i = 0; i < 6; i++)
			if (!p->shots[i].live) {
				p->shots[i].live = 1;
				p->shots[i].dir = p->flip ? -1 : 1;
				p->shots[i].x = (s16)(p->x + (p->flip ? -20 : 20));
				p->shots[i].y = (s16)(fy - 27);
				p->fire_wait = 7;
				break;
			}
	for (i = 0; i < 6; i++) {
		struct bullet *b = &p->shots[i];
		int ri, t;
		if (!b->live)
			continue;
		b->x += b->dir * 6;
		ri = robot_at(b->x, b->y, 8);
		t = cell_at(b->x, b->y);
		if (ri >= 0) {
			robot_damage(ri, 1, p);
			b->live = 0;
		} else if (t == CELL_CRATE) {
			hit_crate(b->x >> 4, b->y >> 4, 1, p);
			b->live = 0;
		} else if (t == CELL_SOLID || b->x < cam_x - 32 || b->x > cam_x + SCREEN_W + 32)
			b->live = 0;
	}
	(void)pi;
}

static void update_robots(void)
{
	int i, k;
	for (i = 0; i < ROBOTS; i++) {
		robot[i].t++;
		switch (robot[i].state) {
		case ROBOT_WALK: {
			/* chase a player on the same floor, else patrol */
			int target = -1;
			s32 best = 170;
			for (k = 0; k < PLAYERS; k++) {
				s32 dx = pl[k].x - robot[i].x, dy = (pl[k].y >> 4) - robot[i].fy;
				if (dx < 0)
					dx = -dx;
				if (pl[k].active && dy > -16 && dy < 16 && dx < best) {
					best = dx;
					target = k;
				}
			}
			if (target >= 0) {
				s32 dx = pl[target].x - robot[i].x;
				robot[i].dir = dx > 0 ? 1 : -1;
				if ((dx > 22 || dx < -22) && (robot[i].t & 1))
					robot[i].x += robot[i].dir;
			} else if (robot[i].t & 1) {
				robot[i].x += robot[i].dir;
				if (robot[i].x <= robot[i].min || robot[i].x >= robot[i].max)
					robot[i].dir = -robot[i].dir;
			}
			if (robot[i].x < robot[i].min)
				robot[i].x = robot[i].min;
			if (robot[i].x > robot[i].max)
				robot[i].x = robot[i].max;
			robot[i].flip = robot[i].dir < 0; /* the sheet faces right */
			break;
		}
		case ROBOT_HIT:
			if (robot[i].t > 14) {
				robot[i].state = ROBOT_WALK;
				robot[i].t = 0;
			}
			break;
		case ROBOT_DOWN:
			if (robot[i].t > 90)
				robot[i].state = ROBOT_OFF;
			break;
		}
	}
}

static void update_civilians(void)
{
	int i, k;
	for (i = 0; i < CIVILIANS; i++) {
		civ[i].t++;
		if (civ[i].rescued)
			continue;
		for (k = 0; k < PLAYERS; k++) {
			s32 dx = civ[i].x - pl[k].x, dy = (pl[k].y >> 4) - civ[i].fy;
			if (pl[k].active && pl[k].on_ground && dx > -20 && dx < 20 && dy > -8 && dy < 8) {
				civ[i].rescued = 1;
				civ[i].t = 0;
				rescued++;
				pl[k].score += 1000;
				break;
			}
		}
	}
}

/* ------------------------------------------------------------- camera */

/*
 * The camera keeps every player in view and only moves forward: it aims
 * a third of a screen ahead of the players' middle, never goes back more
 * than BACKTRACK pixels from the farthest point reached, and players
 * cannot walk past the screen's sides (like Metal Slug in co-op: the
 * leader waits for the other at the edge). Vertically it follows their
 * middle; when they stand more than a screen apart, the lower one may
 * leave the bottom until they meet again.
 */
static void update_camera(int snap)
{
	s32 sx = 0, sy = 0, tx, ty;
	int n = 0, k;
	for (k = 0; k < PLAYERS; k++)
		if (pl[k].active) {
			sx += pl[k].x;
			sy += pl[k].y >> 4;
			n++;
		}
	if (!n)
		return;
	/* the leading edge: aim a third into the screen, like Metal Slug */
	tx = sx / n - SCREEN_W / 3;
	if (tx < cam_far - BACKTRACK)
		tx = cam_far - BACKTRACK;
	ty = sy / n - 150;
	if (tx < 0)
		tx = 0;
	if (tx > LEVEL_W - SCREEN_W)
		tx = LEVEL_W - SCREEN_W;
	if (ty < 0)
		ty = 0;
	if (ty > LEVEL_H - SCREEN_H)
		ty = LEVEL_H - SCREEN_H;
	if (snap) {
		cam_x = (int)tx;
		cam_y = (int)ty;
	} else {
		cam_x += (int)(tx - cam_x) / 4 + (tx > cam_x) - (tx < cam_x);
		cam_y += (int)(ty - cam_y) / 6 + (ty > cam_y) - (ty < cam_y);
	}
	if (cam_x > cam_far)
		cam_far = cam_x;
	for (k = 0; k < PLAYERS; k++)
		if (pl[k].active) {
			if (pl[k].x < cam_x + 12)
				pl[k].x = cam_x + 12;
			if (pl[k].x > cam_x + SCREEN_W - 12)
				pl[k].x = cam_x + SCREEN_W - 12;
		}
}

static void set_scroll(void)
{
	/* the tilemap pixel at the screen's left edge is scroll + 64 (and + 16 down) */
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
	if (!p->active)
		return;
	if (p->climbing) {
		/* no climbing frames yet: a jump pose that flips while moving */
		int f = (p->pad & (BTN_UP | BTN_DOWN)) ? (int)(p->y >> 7) & 1 : 0;
		draw_frame(&anim_willy_jump.frames[1], sx, sy, p->palofs, f);
		return;
	}
	if (!p->on_ground) {
		int i = p->vy < -60 ? 1 : p->vy < 0 ? 2 : p->vy < 60 ? 3 : 4;
		draw_frame(&anim_willy_jump.frames[i % anim_willy_jump.count], sx, sy, p->palofs, p->flip);
	} else if (p->knife_t)
		draw_frame(&anim_willy_knife.frames[(16 - p->knife_t) / 4 % anim_willy_knife.count], sx, sy, p->palofs, p->flip);
	else if (p->bazooka_t)
		draw_anim(&anim_willy_bazooka, p->t, sx, sy, p->palofs, p->flip);
	else if (p->firing)
		draw_anim(&anim_willy_machine_gun, p->t, sx, sy, p->palofs, p->flip);
	else if (moving)
		draw_anim(&anim_willy_run, p->running ? p->t : p->t / 2, sx, sy, p->palofs, p->flip);
	else
		draw_anim(&anim_willy_idle, p->t, sx, sy, p->palofs, p->flip);
}

static void draw_shots(struct player *p)
{
	int i;
	for (i = 0; i < 6; i++)
		if (p->shots[i].live)
			draw_tile(TILE_BULLET, p->shots[i].x - cam_x - 8, p->shots[i].y - cam_y - 8, PAL_BULLET, p->shots[i].dir < 0);
	if (p->rocket.live)
		put_sprite(p->rocket.x - cam_x, p->rocket.y - cam_y, TILE_ROCKET, (u16)(PAL_ROCKET | (p->rocket.dir < 0 ? 0x20 : 0) | (1 << 8)));
}

static void draw_robots(void)
{
	int i;
	for (i = 0; i < ROBOTS; i++) {
		int sx = (int)robot[i].x - cam_x, sy = (int)robot[i].fy - cam_y;
		if (robot[i].state == ROBOT_OFF || sx < -60 || sx > SCREEN_W + 60 || sy < -10 || sy > SCREEN_H + 60)
			continue;
		if (robot[i].state == ROBOT_DOWN) {
			u32 f = robot[i].t * anim_robot_defeated.fps / 60;
			if (f >= anim_robot_defeated.count)
				f = anim_robot_defeated.count - 1;
			if (robot[i].t < 70 || (robot[i].t & 4))
				draw_frame(&anim_robot_defeated.frames[f], sx, sy, 0, robot[i].flip);
			continue;
		}
		draw_anim(robot[i].state == ROBOT_HIT ? &anim_robot_hit : &anim_robot_walk, robot[i].t, sx, sy, 0, robot[i].flip);
	}
}

static void draw_civilians(void)
{
	int i;
	for (i = 0; i < CIVILIANS; i++) {
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

static void draw_pickup(void)
{
	if (pickup.live && (frame_count & 16))
		put_sprite((int)pickup.x - cam_x - 16, (int)pickup.fy - cam_y - 18, TILE_ROCKET, (u16)(PAL_ROCKET | (1 << 8)));
}

static void draw_world(void)
{
	/* first in the table is drawn on top */
	draw_shots(&pl[0]);
	draw_shots(&pl[1]);
	draw_player(&pl[0]);
	draw_player(&pl[1]);
	draw_robots();
	draw_pickup();
	draw_civilians();
	flush_sprites();
}

/* ------------------------------------------------------------ lab state */

/* The state the experiment's harness reads (lab_state.h), filled every frame. */
struct lab_state lab_state __attribute__((section(".lab_state")));

static int lab_mode;

static void lab_update(void)
{
	struct lab_state *s = &lab_state;
	int i;
	s->magic = LAB_MAGIC;
	s->version = LAB_VERSION;
	s->size = sizeof(struct lab_state);
	s->frame = frame_count;
	s->mode = (u8)lab_mode;
	s->credits = (u8)credits;
	s->section_clear = lab_mode == LAB_MODE_CLEAR;
	/* this prototype has no exit and no damage: the section clears when
	   every civilian is rescued */
	s->flags = LAB_FLAG_RESCUE_ALL;
	s->cam_x = (s16)cam_x;
	s->cam_y = (s16)cam_y;
	s->level_w = LEVEL_W;
	s->level_h = LEVEL_H;
	s->exit_x0 = s->exit_x1 = s->exit_y = -1;
	s->n_enemies = ROBOTS < LAB_ENEMIES ? ROBOTS : LAB_ENEMIES;
	s->n_civilians = CIVILIANS < LAB_CIVILIANS ? CIVILIANS : LAB_CIVILIANS;
	s->col_map = (u32)col_map;
	s->col_cols = LEVEL_COLS;
	s->col_rows = LEVEL_ROWS;
	for (i = 0; i < LAB_PLAYERS; i++) {
		struct lab_player *o = &s->player[i];
		struct player *p = i < PLAYERS ? &pl[i] : 0;
		if (!p || !p->active || (lab_mode != LAB_MODE_PLAYING && lab_mode != LAB_MODE_CLEAR)) {
			memset(o, 0, sizeof *o);
			if (p)
				o->score = p->score;
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
		o->energy = 3;
		o->x = (s16)p->x;
		o->y = (s16)(p->y >> 4);
		o->score = p->score;
		o->hurt = 0;
		o->pflags = (u8)((p->on_ground ? LAB_PF_GROUND : 0) | (p->climbing ? LAB_PF_CLIMB : 0) |
				 (p->running ? LAB_PF_RUN : 0) | (p->firing ? LAB_PF_FIRE : 0));
		o->vy = (s16)p->vy;
	}
	for (i = 0; i < LAB_ENEMIES; i++) {
		struct lab_enemy *o = &s->enemy[i];
		if (i >= ROBOTS) {
			memset(o, 0, sizeof *o);
			continue;
		}
		o->alive = (u8)robot_alive(i);
		o->hp = (u8)(robot[i].hp > 0 ? robot[i].hp : 0);
		o->x = (s16)robot[i].x;
		o->y = (s16)robot[i].fy;
		o->facing = robot[i].flip ? -1 : 1;
		o->estate = (u8)robot[i].state; /* ROBOT_* matches LAB_EN_* */
	}
	for (i = 0; i < LAB_CIVILIANS; i++) {
		struct lab_civ *o = &s->civ[i];
		if (i >= CIVILIANS) {
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

static void hud(void)
{
	int k;
	for (k = 0; k < PLAYERS; k++) {
		int x = k ? 26 : 1;
		struct player *p = &pl[k];
		print(x, 1, k ? "2UP" : "1UP", TXT_ORANGE);
		if (p->active) {
			print_num(x + 4, 1, p->score, 6, TXT_WHITE);
			print(x, 26, p->special == SPECIAL_BAZOOKA ? "BAZOOKA x" : "MACHINE GUN", TXT_WHITE); /* 11 cells */
			if (p->special == SPECIAL_BAZOOKA) {
				print_num(x + 9, 26, (u32)p->ammo, 1, TXT_WHITE);
				print(x + 10, 26, " ", TXT_WHITE);
			}
		} else {
			print(x + 4, 1, credits ? ((frame_count / 20) & 1 ? "PRESS START" : "           ") : "INSERT COIN", TXT_GREEN);
			print(x, 26, "           ", TXT_WHITE);
		}
	}
#ifdef DEBUG_POS
	for (k = 0; k < PLAYERS; k++) {
		print_num(1 + k * 25, 3, (u32)pl[k].x, 4, TXT_RED);
		print_num(6 + k * 25, 3, (u32)(pl[k].y >> 4), 4, TXT_RED);
	}
#endif
	print(40, 3, "SAVED", TXT_GREEN);
	print_num(46, 3, (u32)rescued, 1, TXT_WHITE);
}

static void attract(void)
{
	u32 t = 0;
	int last_credits = -1;
	clear_text();
	game_reset();
	print(15, 4, "WILLY GORKLINGO", TXT_ORANGE);
	print(13, 6, "THE LAG PROTOCOL - DEMO", TXT_WHITE);
	print(9, 25, "(C) 2026 GO-LINK - OWN GAME DATA", TXT_WHITE);
	for (;;) {
		wait_vblank();
		read_inputs();
		t++;
		/* the camera tours the level */
		cam_x = (int)(t / 2) % (LEVEL_W - SCREEN_W);
		cam_y = LEVEL_H - SCREEN_H - (int)((t / 3) % 120);
		set_scroll();
		if (credits != last_credits) {
			print(19, 22, "CREDITS ", TXT_WHITE);
			print_num(27, 22, (u32)credits, 1, TXT_WHITE);
			last_credits = credits;
		}
		if (credits)
			print(16, 14, (t / 20) & 1 ? "PRESS 1P START" : "              ", TXT_GREEN);
		else
			print(17, 14, (t / 20) & 1 ? "INSERT COIN" : "           ", TXT_ORANGE);
		update_robots();
		draw_world();
		lab_mode = LAB_MODE_TITLE;
		lab_update();
		if (credits && SYS_PRESSED(SYS_START1)) {
			credits--;
			return;
		}
	}
}

static void play(void)
{
	u32 done_t = 0;
	clear_text();
	game_reset();
	player_spawn(&pl[0], 64, 400);
	cam_far = 0;
	update_camera(1);
	for (;;) {
		wait_vblank();
		read_inputs();
		/* player 2 joins with a credit and 2P Start, next to player 1 */
		if (!pl[1].active && credits && SYS_PRESSED(SYS_START2)) {
			credits--;
			player_spawn(&pl[1], pl[0].x - 24, pl[0].y >> 4);
			pl[1].score = 0;
		}
		if (!pl[0].active && credits && SYS_PRESSED(SYS_START1)) {
			credits--;
			player_spawn(&pl[0], pl[1].x - 24, pl[1].y >> 4);
		}
		update_player(&pl[0], 0);
		update_player(&pl[1], 1);
		update_robots();
		update_civilians();
		update_camera(0);
		set_scroll();
		draw_world();
		hud();
		lab_mode = rescued == CIVILIANS ? LAB_MODE_CLEAR : LAB_MODE_PLAYING;
		lab_update();
		if (rescued == CIVILIANS) {
			if (!done_t)
				done_t = frame_count;
			print(16, 9, "MISSION COMPLETE!", TXT_GREEN);
			print(16, 11, "NOBODY WAITS.", TXT_ORANGE);
			if (frame_count - done_t > 360)
				return;
		}
	}
}

int main(void)
{
	video_init();
	__asm__ volatile("move.w #0x2000,%sr"); /* allow the vblank interrupt */
	for (;;) {
		attract();
		play();
	}
	return 0;
}
