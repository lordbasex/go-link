// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { decodeAt, encodeProgram, KEYS, z80OpcodeMap } from "../src/index.ts";

describe("the QSound driver's encryption (T-26)", () => {
  it("marks opcodes and operands", () => {
    // di; ld sp,0fff0h; im 1; ld (0d003h),a; ld (0f010h),de; jp 0; db 1,2
    const p = new Uint8Array([0xf3, 0x31, 0xf0, 0xff, 0xed, 0x56, 0x32, 0x03, 0xd0, 0xed, 0x53, 0x10, 0xf0, 0xc3, 0x00, 0x00, 1, 2]);
    expect(Array.from(z80OpcodeMap(p, 16))).toEqual([1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0]);
    expect(() => z80OpcodeMap(new Uint8Array([0xdd, 0x21, 0, 0]), 4)).toThrow(/IX\/IY/);
  });
  it("encodes each byte so the core decodes it as the Z80 reads it", () => {
    const p = new Uint8Array([0xf3, 0x31, 0xf0, 0xff, 0x3e, 0x42, 0xc3, 0x00, 0x00, 0xaa, 0x55]);
    const map = z80OpcodeMap(p, 9);
    const rom = encodeProgram(p, map, KEYS.slammast!);
    p.forEach((b, a) => expect(decodeAt(rom[a]!, a, map[a] === 1, KEYS.slammast!)).toBe(b));
  });
});
