/* Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> */
/*
 * A minimal CPS-1 board for the power-on test (docs/willy-maker/validation.md,
 * level 3): the 68000 (Musashi) and the memory map of the slammast set as
 * the mame2003-plus driver wires it (docs/rom/hardware.md):
 *
 *   0x000000-0x1fffff  program ROM (written by the host, big-endian bytes)
 *   0x800000           P1/P2 inputs        0x800018      system inputs
 *   0x80001a-0x80001f  DIP switches (none on slammast: all high)
 *   0x800030           coin counters (write)
 *   0x800100-0x8001ff  CPS-A/CPS-B registers; 0x80016e reads the CPS-B-21
 *                      board ID 0x0c01; 0x800176/0x800178 read P3/P4;
 *                      0x800180 is the sound latch (write)
 *   0x900000-0x92ffff  graphics RAM
 *   0xf00000-0xf0ffff  QSound ROM window (reads 0)
 *   0xf18000-0xf19fff  QSound shared RAM 1 (low bytes)
 *   0xf1c000/0xf1c002  P3/P4 inputs       0xf1c004-0xf1c007 coin/EEPROM port
 *   0xf1e000-0xf1ffff  QSound shared RAM 2 (low bytes)
 *   0xff0000-0xffffff  work RAM
 *
 * Any other address is an unmapped access, and a write to ROM, an odd word
 * access, an exception or a stack outside work RAM is a fault: the CPU
 * stops at the end of that instruction and the host reads what happened.
 * The Z80 and the QSound chip are not run: the sound latch and the shared
 * RAM only record what the 68000 writes.
 *
 * One frame is 10 MHz / 60 cycles, with the level 2 interrupt (vblank)
 * held until the CPU takes it (HOLD_LINE), as cps1.c does.
 */
#include "m68k.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;

#define ROM_SIZE 0x200000
#define CYCLES_PER_FRAME (10000000 / 60)
#define SLICES 64

enum { FAULT_NONE, FAULT_EXCEPTION, FAULT_UNMAPPED_READ, FAULT_UNMAPPED_WRITE, FAULT_ROM_WRITE, FAULT_ODD, FAULT_STACK };

/* What the host reads after each frame (board_stats). */
enum {
	ST_FAULT, ST_FAULT_ADDR, ST_FAULT_PC, ST_FAULT_VECTOR,
	ST_IRQS, ST_GFX_WRITES, ST_PAL_WRITES, ST_OBJ_WRITES, ST_REG_WRITES,
	ST_SOUND_WRITES, ST_SOUND_LAST, ST_PC_LO, ST_PC_HI, ST_PC, ST_SP, ST_SR,
	ST_FRAMES, ST_COUNT
};

static u8 rom[ROM_SIZE];
static u16 wram[0x8000];
static u16 gfxram[0x18000];
static u16 regs[0x80];
static u8 qram1[0x1000];
static u8 qram2[0x1000];
static u16 in_p12 = 0xffff, in_sys = 0xff, in_p3 = 0xffff, in_p4 = 0xffff;
static u32 stats[ST_COUNT];
static int initialized;

static void fault(int kind, u32 addr)
{
	if (stats[ST_FAULT])
		return;
	stats[ST_FAULT] = (u32)kind;
	stats[ST_FAULT_ADDR] = addr;
	stats[ST_FAULT_PC] = m68k_get_reg(0, M68K_REG_PPC);
	m68k_end_timeslice();
}

/* The level 2 interrupt is HOLD_LINE: taking it clears it. */
int board_int_ack(int level)
{
	(void)level;
	stats[ST_IRQS]++;
	m68k_set_irq(0);
	return (int)M68K_INT_ACK_AUTOVECTOR;
}

/* Every exception but TRAP #n (vectors 32-47) is a fault. */
void board_vector(unsigned int vector)
{
	if (vector >= 32 && vector < 48)
		return;
	if (!stats[ST_FAULT]) {
		stats[ST_FAULT_VECTOR] = vector;
		fault(FAULT_EXCEPTION, 0);
	}
}

static u32 base_of(int reg)
{
	return ((u32)regs[reg >> 1] << 8) & 0x3ffff;
}

/* ------------------------------------------------------------ reads */

static int read_word(u32 a, u16 *out)
{
	if (a < ROM_SIZE) {
		*out = (u16)((rom[a] << 8) | rom[a + 1]);
		return 1;
	}
	if (a >= 0xff0000) {
		*out = wram[(a - 0xff0000) >> 1];
		return 1;
	}
	if (a >= 0x900000 && a < 0x930000) {
		*out = gfxram[(a - 0x900000) >> 1];
		return 1;
	}
	switch (a) {
	case 0x800000:
	case 0x800010:
		*out = in_p12;
		return 1;
	case 0x800018:
		*out = (u16)((in_sys << 8) | in_sys);
		return 1;
	case 0x80001a:
	case 0x80001c:
	case 0x80001e:
		*out = 0xffff;
		return 1;
	case 0x800020:
		*out = 0;
		return 1;
	case 0x800176:
	case 0xf1c000:
		*out = in_p3;
		return 1;
	case 0x800178:
	case 0xf1c002:
		*out = in_p4;
		return 1;
	case 0x80016e: /* CPS-B-21 ID of QSOUND_4 */
		*out = 0x0c01;
		return 1;
	case 0xf1c004:
		*out = 0xffff;
		return 1;
	case 0xf1c006: /* EEPROM data out: ready */
		*out = 0x0001;
		return 1;
	}
	if (a >= 0x800100 && a < 0x800200) {
		*out = regs[(a - 0x800100) >> 1];
		return 1;
	}
	if (a >= 0xf00000 && a < 0xf10000) {
		*out = 0;
		return 1;
	}
	if (a >= 0xf18000 && a < 0xf1a000) {
		*out = (u16)(0xff00 | qram1[(a - 0xf18000) >> 1]);
		return 1;
	}
	if (a >= 0xf1e000 && a < 0xf20000) {
		*out = (u16)(0xff00 | qram2[(a - 0xf1e000) >> 1]);
		return 1;
	}
	return 0;
}

static u16 read16(u32 a, int check_odd)
{
	u16 v;
	a &= 0xffffff;
	if (check_odd && (a & 1)) {
		fault(FAULT_ODD, a);
		return 0;
	}
	a &= ~1u;
	if (read_word(a, &v))
		return v;
	fault(FAULT_UNMAPPED_READ, a);
	return 0xffff;
}

unsigned int m68k_read_memory_8(unsigned int address)
{
	u16 w = read16(address, 0);
	return (address & 1) ? (w & 0xff) : (w >> 8);
}

unsigned int m68k_read_memory_16(unsigned int address)
{
	return read16(address, 1);
}

unsigned int m68k_read_memory_32(unsigned int address)
{
	u32 hi = read16(address, 1);
	return (hi << 16) | read16(address + 2, 1);
}

unsigned int m68k_read_disassembler_8(unsigned int address) { return m68k_read_memory_8(address); }
unsigned int m68k_read_disassembler_16(unsigned int address) { return m68k_read_memory_16(address); }
unsigned int m68k_read_disassembler_32(unsigned int address) { return m68k_read_memory_32(address); }

/* ------------------------------------------------------------ writes */

/* mask: 0xffff word, 0xff00 high byte (even address), 0x00ff low byte. */
static void write16(u32 a, u16 v, u16 mask)
{
	u16 *p = 0;
	a &= 0xffffff;
	if (a < ROM_SIZE) {
		fault(FAULT_ROM_WRITE, a);
		return;
	}
	if (a >= 0xff0000) {
		p = &wram[(a - 0xff0000) >> 1];
	} else if (a >= 0x900000 && a < 0x930000) {
		u32 off = a - 0x900000;
		u32 pal = base_of(0x0a), obj = base_of(0x00);
		p = &gfxram[off >> 1];
		stats[ST_GFX_WRITES]++;
		if (off >= pal && off < pal + 0x2000)
			stats[ST_PAL_WRITES]++;
		if (off >= obj && off < obj + 0x800)
			stats[ST_OBJ_WRITES]++;
	} else if (a == 0x800180 || a == 0x800188) {
		if (a == 0x800180) {
			stats[ST_SOUND_WRITES]++;
			stats[ST_SOUND_LAST] = v & mask;
		}
		return;
	} else if (a >= 0x800100 && a < 0x800200) {
		p = &regs[(a - 0x800100) >> 1];
		stats[ST_REG_WRITES]++;
	} else if (a == 0x800030 || a == 0x800040 || (a >= 0xf1c004 && a < 0xf1c008)) {
		return; /* coin counters, coin lockout, EEPROM */
	} else if (a >= 0xf18000 && a < 0xf1a000) {
		if (mask & 0xff)
			qram1[(a - 0xf18000) >> 1] = (u8)v;
		return;
	} else if (a >= 0xf1e000 && a < 0xf20000) {
		if (mask & 0xff)
			qram2[(a - 0xf1e000) >> 1] = (u8)v;
		return;
	} else {
		fault(FAULT_UNMAPPED_WRITE, a);
		return;
	}
	*p = (u16)((*p & ~mask) | (v & mask));
}

void m68k_write_memory_8(unsigned int address, unsigned int value)
{
	if (address & 1)
		write16(address & ~1u, (u16)(value & 0xff), 0x00ff);
	else
		write16(address, (u16)((value & 0xff) << 8), 0xff00);
}

void m68k_write_memory_16(unsigned int address, unsigned int value)
{
	if (address & 1) {
		fault(FAULT_ODD, address & 0xffffff);
		return;
	}
	write16(address, (u16)value, 0xffff);
}

void m68k_write_memory_32(unsigned int address, unsigned int value)
{
	m68k_write_memory_16(address, value >> 16);
	m68k_write_memory_16(address + 2, value & 0xffff);
}

/* ------------------------------------------------------------ host API */

EXPORT u8 *board_rom(void) { return rom; }
EXPORT u16 *board_gfxram(void) { return gfxram; }
EXPORT u16 *board_regs(void) { return regs; }
EXPORT u16 *board_wram(void) { return wram; }
EXPORT u32 *board_stats(void) { return stats; }

EXPORT void board_inputs(u32 p12, u32 sys, u32 p3, u32 p4)
{
	in_p12 = (u16)p12;
	in_sys = (u16)(sys & 0xff);
	in_p3 = (u16)p3;
	in_p4 = (u16)p4;
}

/* Power-on: RAMs cleared, inputs released, the CPU reset from the vectors. */
EXPORT void board_reset(void)
{
	u32 i;
	for (i = 0; i < sizeof wram / sizeof wram[0]; i++)
		wram[i] = 0;
	for (i = 0; i < sizeof gfxram / sizeof gfxram[0]; i++)
		gfxram[i] = 0;
	for (i = 0; i < sizeof regs / sizeof regs[0]; i++)
		regs[i] = 0;
	/* the driver's default bases (VIDEO_START( cps )) */
	regs[0x00 >> 1] = 0x9200; /* sprites */
	regs[0x02 >> 1] = 0x9000; /* scroll1 */
	regs[0x04 >> 1] = 0x9040; /* scroll2 */
	regs[0x06 >> 1] = 0x9080; /* scroll3 */
	regs[0x08 >> 1] = 0x9100; /* other */
	regs[0x0a >> 1] = 0x90c0; /* palette */
	for (i = 0; i < sizeof qram1; i++)
		qram1[i] = qram2[i] = 0;
	for (i = 0; i < ST_COUNT; i++)
		stats[i] = 0;
	board_inputs(0xffff, 0xff, 0xffff, 0xffff);
	if (!initialized) {
		m68k_init();
		initialized = 1;
	}
	m68k_set_cpu_type(M68K_CPU_TYPE_68000);
	m68k_pulse_reset();
	m68k_set_irq(0);
	stats[ST_FAULT] = stats[ST_FAULT_ADDR] = stats[ST_FAULT_PC] = stats[ST_FAULT_VECTOR] = 0;
}

static int sp_ok(u32 sp)
{
	return sp >= 0xff0000 && sp <= 0x1000000;
}

/* Runs one frame; returns the fault kind (0 when the frame ran whole). */
EXPORT u32 board_frame(void)
{
	int s;
	u32 pc;
	if (stats[ST_FAULT])
		return stats[ST_FAULT];
	stats[ST_IRQS] = stats[ST_GFX_WRITES] = stats[ST_PAL_WRITES] = stats[ST_OBJ_WRITES] = 0;
	stats[ST_REG_WRITES] = stats[ST_SOUND_WRITES] = 0;
	stats[ST_PC_LO] = 0xffffffff;
	stats[ST_PC_HI] = 0;
	m68k_set_irq(2);
	for (s = 0; s < SLICES && !stats[ST_FAULT]; s++) {
		m68k_execute(CYCLES_PER_FRAME / SLICES);
		pc = m68k_get_reg(0, M68K_REG_PC) & 0xffffff;
		if (pc < stats[ST_PC_LO])
			stats[ST_PC_LO] = pc;
		if (pc > stats[ST_PC_HI])
			stats[ST_PC_HI] = pc;
		if (!stats[ST_FAULT] && !sp_ok(m68k_get_reg(0, M68K_REG_SP))) {
			stats[ST_FAULT] = FAULT_STACK;
			stats[ST_FAULT_ADDR] = m68k_get_reg(0, M68K_REG_SP);
			stats[ST_FAULT_PC] = pc;
		}
	}
	stats[ST_PC] = m68k_get_reg(0, M68K_REG_PC) & 0xffffff;
	stats[ST_SP] = m68k_get_reg(0, M68K_REG_SP);
	stats[ST_SR] = m68k_get_reg(0, M68K_REG_SR);
	stats[ST_FRAMES]++;
	return stats[ST_FAULT];
}
