// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Which bytes of a Z80 program the CPU fetches as opcodes (T-26, the QSound
// driver): the board decrypts opcodes and operands with different Kabuki
// tables (kabuki.ts), so every byte of the code must be encoded as what the
// Z80 will read it as. A linear sweep over the code: the opcode byte and a
// CB or ED prefix and its next byte are opcode fetches; immediate values,
// addresses and jump offsets are operand (data) reads. IX and IY (the DD
// and FD prefixes) are refused: the driver does not use them.

/** Bytes of operands after an unprefixed opcode. */
function operands(op: number): number {
  // LD r,n and the ALU with n, DJNZ and JR, OUT (n),A and IN A,(n)
  if ((op & 0xc7) === 0x06 || (op & 0xc7) === 0xc6 || op === 0x10 || op === 0x18 || (op & 0xe7) === 0x20 || op === 0xd3 || op === 0xdb) return 1;
  // LD rr,nn, LD (nn),HL/A and LD HL/A,(nn), JP and CALL with their conditions
  if ((op & 0xcf) === 0x01 || op === 0x22 || op === 0x2a || op === 0x32 || op === 0x3a || (op & 0xc7) === 0xc2 || op === 0xc3 || (op & 0xc7) === 0xc4 || op === 0xcd) return 2;
  return 0;
}

/**
 * A map of the program: 1 where the Z80 fetches an opcode, 0 elsewhere
 * (operands, and everything from `codeEnd` on, which is data).
 */
export function z80OpcodeMap(program: Uint8Array, codeEnd: number): Uint8Array {
  const map = new Uint8Array(program.length);
  let a = 0;
  while (a < codeEnd) {
    const op = program[a]!;
    if (op === 0xdd || op === 0xfd) throw new Error(`z80: IX/IY prefix at 0x${a.toString(16)} (the driver must not use them)`);
    map[a] = 1;
    if (op === 0xcb) {
      map[a + 1] = 1;
      a += 2;
    } else if (op === 0xed) {
      const next = program[a + 1]!;
      map[a + 1] = 1;
      // LD (nn),rr and LD rr,(nn) carry an address
      a += (next & 0xc7) === 0x43 ? 4 : 2;
    } else a += 1 + operands(op);
  }
  return map;
}
