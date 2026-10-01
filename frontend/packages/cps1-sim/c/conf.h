/* Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> */
/*
 * Musashi's build options for the CPS-1 board model (selected with
 * -DMUSASHI_CNF='"conf.h"'): a plain 68000, with the board answering the
 * interrupt acknowledge (the vblank is HOLD_LINE, cleared when taken) and
 * seeing every exception the CPU takes (the go-link patch in m68kcpu.h).
 */
#ifndef CPS1SIM_CONF_H
#define CPS1SIM_CONF_H

#define M68K_OPT_OFF             0
#define M68K_OPT_ON              1
#define M68K_OPT_SPECIFY_HANDLER 2

/* Only the 68000: the others' opcodes become illegal or line F. */
#define M68K_EMULATE_010   M68K_OPT_OFF
#define M68K_EMULATE_EC020 M68K_OPT_OFF
#define M68K_EMULATE_020   M68K_OPT_OFF
#define M68K_EMULATE_030   M68K_OPT_OFF
#define M68K_EMULATE_040   M68K_OPT_OFF
#define M68K_EMULATE_PMMU  M68K_OPT_OFF

/* Odd word accesses are caught by the board (no setjmp in WebAssembly). */
#define M68K_EMULATE_ADDRESS_ERROR M68K_OPT_OFF

int board_int_ack(int level);
#define M68K_EMULATE_INT_ACK     M68K_OPT_SPECIFY_HANDLER
#define M68K_INT_ACK_CALLBACK(A) board_int_ack(A)

void board_vector(unsigned int vector);
#define M68K_JUMP_VECTOR_HOOK(V) board_vector(V)

#include "m68kconf.h"

/* Musashi arms a bus error trap with setjmp in m68k_execute, and only
   m68k_pulse_bus_error longjmps to it. The board never pulses a bus error
   (unmapped accesses are reported, not raised), so the trap is a no-op and
   the module needs no setjmp/longjmp support. */
#include <setjmp.h>
#undef setjmp
#undef longjmp
#define setjmp(buf) 0
#define longjmp(buf, v) ((void)0)

#endif
