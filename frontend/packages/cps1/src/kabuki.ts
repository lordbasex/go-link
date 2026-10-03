// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// The "Kabuki" Z80 encryption of the CPS-1 QSound boards, run backwards so
// OUR Z80 program reaches the CPU as written. The decoder is the one the
// core uses (src/machine/kabuki.c, bytedecode and cps1_decode): it turns
// each ROM byte into an opcode byte and a data byte, both depending on the
// address. Each is a bijection over 0-255, so the encoder finds, for every
// byte we want, the ROM byte that decodes to it (256 tries).
//
// Only the first 0x8000 bytes of the Z80 ROM are decoded. Opcode fetches
// use the opcode table; operands and data reads use the data table, so the
// stub uses one-byte opcodes only.

/** The keys of one set. */
export interface KabukiKeys {
  swap1: number;
  swap2: number;
  addr: number;
  xor: number;
}

function bitswap1(src: number, key: number, select: number): number {
  if (select & (1 << ((key >> 0) & 7))) src = (src & 0xfc) | ((src & 0x01) << 1) | ((src & 0x02) >> 1);
  if (select & (1 << ((key >> 4) & 7))) src = (src & 0xf3) | ((src & 0x04) << 1) | ((src & 0x08) >> 1);
  if (select & (1 << ((key >> 8) & 7))) src = (src & 0xcf) | ((src & 0x10) << 1) | ((src & 0x20) >> 1);
  if (select & (1 << ((key >> 12) & 7))) src = (src & 0x3f) | ((src & 0x40) << 1) | ((src & 0x80) >> 1);
  return src;
}

function bitswap2(src: number, key: number, select: number): number {
  if (select & (1 << ((key >> 12) & 7))) src = (src & 0xfc) | ((src & 0x01) << 1) | ((src & 0x02) >> 1);
  if (select & (1 << ((key >> 8) & 7))) src = (src & 0xf3) | ((src & 0x04) << 1) | ((src & 0x08) >> 1);
  if (select & (1 << ((key >> 4) & 7))) src = (src & 0xcf) | ((src & 0x10) << 1) | ((src & 0x20) >> 1);
  if (select & (1 << ((key >> 0) & 7))) src = (src & 0x3f) | ((src & 0x40) << 1) | ((src & 0x80) >> 1);
  return src;
}

const rol = (v: number) => ((v & 0x7f) << 1) | ((v & 0x80) >> 7);

export function bytedecode(src: number, k: KabukiKeys & { select: number }): number {
  const { swap1, swap2, xor } = k;
  const sel = k.select;
  src = bitswap1(src, swap1 & 0xffff, sel & 0xff);
  src = rol(src);
  src = bitswap2(src, swap1 >>> 16, sel & 0xff);
  src ^= xor;
  src = rol(src);
  src = bitswap2(src, swap2 & 0xffff, (sel >> 8) & 0xff);
  src = rol(src);
  src = bitswap1(src, swap2 >>> 16, (sel >> 8) & 0xff);
  return src;
}

/** The keys of each QSound set (kabuki.c, the *_decode functions). */
export const KEYS: Record<string, KabukiKeys> = {
  slammast: { swap1: 0x54321076, swap2: 0x65432107, addr: 0x3131, xor: 0x19 },
};

/** Opcode-side select for address a (kabuki_decode). */
const opSelect = (a: number, k: KabukiKeys) => (a + k.addr) & 0xffff;

/**
 * Encodes a Z80 program whose bytes are all opcodes (one-byte
 * instructions), so the core's opcode decoding gives them back.
 */
export function encodeOpcodes(plain: Uint8Array, keys: KabukiKeys): Uint8Array {
  const out = new Uint8Array(plain);
  for (let a = 0; a < plain.length && a < 0x8000; a++) {
    const k = { ...keys, select: opSelect(a, keys) };
    let found = -1;
    for (let c = 0; c < 256 && found < 0; c++) if (bytedecode(c, k) === plain[a]) found = c;
    if (found < 0) throw new Error(`kabuki: no byte decodes to ${plain[a]} at ${a}`);
    out[a] = found;
  }
  return out;
}

/** Data-side select for address a (kabuki_decode: operands and data reads). */
const dataSelect = (a: number, k: KabukiKeys) => ((a ^ 0x1fc0) + k.addr + 1) & 0xffff;

/**
 * Encodes a whole Z80 program for the first 0x8000 bytes (T-26, the
 * QSound driver): `opcode[a]` says whether the Z80 fetches byte a as an
 * opcode (the opcode table) or reads it as an operand or data (the data
 * table). Bytes past 0x8000 stay as they are (not decoded).
 */
export function encodeProgram(plain: Uint8Array, opcode: Uint8Array, keys: KabukiKeys): Uint8Array {
  const out = new Uint8Array(plain);
  for (let a = 0; a < plain.length && a < 0x8000; a++) {
    const k = { ...keys, select: opcode[a] ? opSelect(a, keys) : dataSelect(a, keys) };
    let found = -1;
    for (let c = 0; c < 256 && found < 0; c++) if (bytedecode(c, k) === plain[a]) found = c;
    if (found < 0) throw new Error(`kabuki: no byte decodes to ${plain[a]} at ${a}`);
    out[a] = found;
  }
  return out;
}

/** The decode the core does, for tests: the byte the Z80 sees at a as an opcode or as data. */
export function decodeAt(rom: number, a: number, asOpcode: boolean, keys: KabukiKeys): number {
  return bytedecode(rom, { ...keys, select: asOpcode ? opSelect(a, keys) : dataSelect(a, keys) });
}
