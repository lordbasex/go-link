// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { hmacSha256, linkProof, panelProof, sameString, sha256, utf8 } from "../src";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

describe("sha256 and hmac", () => {
  it("matches the standard test vectors", () => {
    expect(hex(sha256(utf8("")))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hex(sha256(utf8("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    // Two blocks.
    expect(hex(sha256(utf8("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    // RFC 4231 case 2, and case 6 (a key longer than a block).
    expect(hex(hmacSha256(utf8("Jefe"), utf8("what do ya want for nothing?")))).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
    expect(hex(hmacSha256(new Uint8Array(131).fill(0xaa), utf8("Test Using Larger Than Block-Size Key - Hash Key First")))).toBe(
      "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
    );
  });

  it("compares strings without an early exit", () => {
    expect(sameString("abc", "abc")).toBe(true);
    expect(sameString("abc", "abd")).toBe(false);
    expect(sameString("abc", "ab")).toBe(false);
  });

  it("proves a link exactly like the device does", () => {
    // The same vector as backend-device/internal/services/link_proof_test.go.
    expect(linkProof("token-for-the-cross-language-test", "nonce-0123456789abcdef")).toBe("rPH7TuI01BJG28Tw_mpKMEdt0CfB3r4d8uZkMn9YfUc");
  });

  it("answers the panel's nonce exactly like the device checks it", () => {
    // The same vector as backend-device/internal/panel/proof_test.go; the
    // token is used in lower case, as the panel keeps it.
    expect(panelProof("0b5c7c1e-9d7a-4b8e-8a31-2f6f3c9d1e24", "nonce-0123456789abcdef")).toBe("kFjx9ZwjkUioq9MgKUA8EwwYT6fnxaocllhK8UStoSM");
  });
});
