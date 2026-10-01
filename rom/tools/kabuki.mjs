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

function bitswap1(src, key, select) {
  if (select & (1 << ((key >> 0) & 7))) src = (src & 0xfc) | ((src & 0x01) << 1) | ((src & 0x02) >> 1);
  if (select & (1 << ((key >> 4) & 7))) src = (src & 0xf3) | ((src & 0x04) << 1) | ((src & 0x08) >> 1);
  if (select & (1 << ((key >> 8) & 7))) src = (src & 0xcf) | ((src & 0x10) << 1) | ((src & 0x20) >> 1);
  if (select & (1 << ((key >> 12) & 7))) src = (src & 0x3f) | ((src & 0x40) << 1) | ((src & 0x80) >> 1);
  return src;
}

function bitswap2(src, key, select) {
  if (select & (1 << ((key >> 12) & 7))) src = (src & 0xfc) | ((src & 0x01) << 1) | ((src & 0x02) >> 1);
  if (select & (1 << ((key >> 8) & 7))) src = (src & 0xf3) | ((src & 0x04) << 1) | ((src & 0x08) >> 1);
  if (select & (1 << ((key >> 4) & 7))) src = (src & 0xcf) | ((src & 0x10) << 1) | ((src & 0x20) >> 1);
  if (select & (1 << ((key >> 0) & 7))) src = (src & 0x3f) | ((src & 0x40) << 1) | ((src & 0x80) >> 1);
  return src;
}

const rol = (v) => ((v & 0x7f) << 1) | ((v & 0x80) >> 7);

export function bytedecode(src, k) {
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
export const KEYS = {
  slammast: { swap1: 0x54321076, swap2: 0x65432107, addr: 0x3131, xor: 0x19 },
};

/** Opcode-side select for address a (kabuki_decode). */
const opSelect = (a, k) => (a + k.addr) & 0xffff;

/**
 * Encodes a Z80 program whose bytes are all opcodes (one-byte
 * instructions), so the core's opcode decoding gives them back.
 */
export function encodeOpcodes(plain, keys) {
  const out = Buffer.from(plain);
  for (let a = 0; a < plain.length && a < 0x8000; a++) {
    const k = { ...keys, select: opSelect(a, keys) };
    let found = -1;
    for (let c = 0; c < 256 && found < 0; c++) if (bytedecode(c, k) === plain[a]) found = c;
    if (found < 0) throw new Error(`kabuki: no byte decodes to ${plain[a]} at ${a}`);
    out[a] = found;
  }
  return out;
}
