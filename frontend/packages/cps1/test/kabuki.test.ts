// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { KEYS, bytedecode, encodeOpcodes } from "../src";

describe("kabuki", () => {
  const keys = KEYS.slammast!;

  it("each address's decoder is a bijection over 0-255", () => {
    for (const a of [0, 1, 0x1234, 0x7fff]) {
      const k = { ...keys, select: (a + keys.addr) & 0xffff };
      const outs = new Set(Array.from({ length: 256 }, (_, c) => bytedecode(c, k)));
      expect(outs.size).toBe(256);
    }
  });

  it("encodes opcodes so the core decodes them back", () => {
    const plain = new Uint8Array([0xf3, 0x31, 0x00, 0xf0, 0xc3, 0x00, 0x00, 0x76]);
    const enc = encodeOpcodes(plain, keys);
    expect(enc).not.toEqual(plain);
    enc.forEach((c, a) => expect(bytedecode(c, { ...keys, select: (a + keys.addr) & 0xffff })).toBe(plain[a]));
    // the input is left as it was
    expect(plain[0]).toBe(0xf3);
  });

  it("leaves bytes past 0x8000 as they are", () => {
    const plain = new Uint8Array(0x8002).fill(0x00);
    const enc = encodeOpcodes(plain, keys);
    expect(enc[0x8000]).toBe(0);
    expect(enc[0x8001]).toBe(0);
  });
});
