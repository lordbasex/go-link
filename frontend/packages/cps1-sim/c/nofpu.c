/* Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> */
/*
 * The 68000 has no FPU. Musashi still links its 68040 FPU code, which only
 * runs on a 68030 or later, so these floating point routines are never
 * called here: they stand in for SoftFloat's, which are not built, and
 * return placeholder values.
 */
#include "m68kcpu.h"

int8 float_rounding_mode;

floatx80 int32_to_floatx80(int32 a) { floatx80 z = {0, 0}; (void)a; return z; }
floatx80 float32_to_floatx80(float32 a) { floatx80 z = {0, 0}; (void)a; return z; }
floatx80 float64_to_floatx80(float64 a) { floatx80 z = {0, 0}; (void)a; return z; }
int32 floatx80_to_int32(floatx80 a) { (void)a; return 0; }
int32 floatx80_to_int32_round_to_zero(floatx80 a) { (void)a; return 0; }
float32 floatx80_to_float32(floatx80 a) { (void)a; return 0; }
float64 floatx80_to_float64(floatx80 a) { (void)a; return 0; }
floatx80 floatx80_add(floatx80 a, floatx80 b) { (void)b; return a; }
floatx80 floatx80_sub(floatx80 a, floatx80 b) { (void)b; return a; }
floatx80 floatx80_mul(floatx80 a, floatx80 b) { (void)b; return a; }
floatx80 floatx80_div(floatx80 a, floatx80 b) { (void)b; return a; }
floatx80 floatx80_rem(floatx80 a, floatx80 b) { (void)b; return a; }
floatx80 floatx80_sqrt(floatx80 a) { return a; }
flag floatx80_is_nan(floatx80 a) { (void)a; return 0; }
