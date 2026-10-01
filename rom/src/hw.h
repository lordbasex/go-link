/* Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> */
/*
 * The CPS-1 board as the chosen set wires it (see docs/rom/hardware.md):
 * the CPS-A/CPS-B registers, graphics RAM, inputs and the sound latch.
 * build.mjs passes -DSET_SLAMMAST (default) or -DSET_CAPTCOMM.
 */
#ifndef GOLINK_HW_H
#define GOLINK_HW_H

typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned long u32;
typedef signed char s8;
typedef signed short s16;
typedef signed long s32;

#define REG16(a) (*(volatile u16 *)(a))

/* CPS-A registers (0x800100 + offset). */
#define CPSA_OBJ_BASE     REG16(0x800100)
#define CPSA_SCROLL1_BASE REG16(0x800102)
#define CPSA_SCROLL2_BASE REG16(0x800104)
#define CPSA_SCROLL3_BASE REG16(0x800106)
#define CPSA_OTHER_BASE   REG16(0x800108)
#define CPSA_PALETTE_BASE REG16(0x80010a)
#define CPSA_SCROLL1_X    REG16(0x80010c)
#define CPSA_SCROLL1_Y    REG16(0x80010e)
#define CPSA_SCROLL2_X    REG16(0x800110)
#define CPSA_SCROLL2_Y    REG16(0x800112)
#define CPSA_SCROLL3_X    REG16(0x800114)
#define CPSA_SCROLL3_Y    REG16(0x800116)
#define CPSA_VIDEO_CTRL   REG16(0x800122)

#if defined(SET_CAPTCOMM)
/* CPS-B registers of the captcomm config (BATTRY_3). */
#define CPSB_LAYER_CTRL   REG16(0x800160)
#define CPSB_PRIO0        REG16(0x80016e)
#define CPSB_PRIO1        REG16(0x80016c)
#define CPSB_PRIO2        REG16(0x80016a)
#define CPSB_PRIO3        REG16(0x800168)
#define CPSB_CONTROL      REG16(0x800170)
#define LAYER_EN_SCROLL1  0x20
#define LAYER_EN_SCROLL23 0x12
#define IN_P3     REG16(0x800176)
#define IN_P4     REG16(0x800178)
#define P3_BTN_3  0         /* captcomm: two buttons per player */
#define P4_BTN_3  0
#else
/* CPS-B-21 registers of the slammast config (QSOUND_4). */
#define CPSB_LAYER_CTRL   REG16(0x800156)
#define CPSB_PRIO0        REG16(0x800140)
#define CPSB_PRIO1        REG16(0x800142)
#define CPSB_PRIO2        REG16(0x800168)
#define CPSB_PRIO3        REG16(0x80016a)
#define CPSB_CONTROL      REG16(0x80016c)
#define LAYER_EN_SCROLL1  0x04
#define LAYER_EN_SCROLL23 0x18 /* scroll2 0x08, scroll3 0x10 */
#define IN_P3     REG16(0xf1c000)
#define IN_P4     REG16(0xf1c002)
#define P3_BTN_3  0x0080    /* in IN_P12: button 3 of players 3 and 4 */
#define P4_BTN_3  0x8000
#endif

/* Layer control: drawing order (0 sprites, 1-3 scroll1-3), first drawn
   first, plus the config's enable bits. */
#define LAYER_ORDER(a, b, c, d) (((a) << 6) | ((b) << 8) | ((c) << 10) | ((d) << 12))

/* Inputs, active low. */
#define IN_P12    REG16(0x800000) /* P1 low byte, P2 high byte */
#define IN_SYSTEM REG16(0x800018)
#define BTN_RIGHT 0x01
#define BTN_LEFT  0x02
#define BTN_DOWN  0x04
#define BTN_UP    0x08
#define BTN_1     0x10
#define BTN_2     0x20
#define BTN_3     0x40 /* players 1 and 2 (slammast) */
#define SYS_COIN1  0x01
#define SYS_START1 0x10

#define SOUND_CMD REG16(0x800180)

/* Where our tables live in graphics RAM (0x900000-0x92ffff); the base
   registers hold address >> 8. */
#define GFX_SCROLL1  0x900000
#define GFX_SCROLL2  0x904000
#define GFX_SCROLL3  0x908000
#define GFX_PALETTE  0x90c000
#define GFX_OTHER    0x910000
#define GFX_OBJ      0x920000

/* Palette groups: 32 palettes of 16 colors each. */
#define PAL_OBJ     0
#define PAL_SCROLL1 32
#define PAL_SCROLL2 64
#define PAL_SCROLL3 96
#define PALETTE ((volatile u16 *)GFX_PALETTE)
#define PAL_BACKGROUND 4095 /* the color behind every layer */

/* Screen: 384x224, at bitmap offset (64, 16). */
#define SCREEN_W 384
#define SCREEN_H 224
#define SCREEN_X0 64
#define SCREEN_Y0 16

/* The vblank counter, incremented by the level 2 interrupt (crt0.s). */
extern volatile u32 frame_count;

#endif
