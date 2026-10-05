// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { MAKER_URL } from "../config";
import { makerAddress } from "./MakerRedirect";

describe("MakerRedirect", () => {
  it("sends old Willy Maker links to its own site, with the game", () => {
    expect(makerAddress(undefined, false)).toBe(`${MAKER_URL}/`);
    expect(makerAddress("abc-123", false)).toBe(`${MAKER_URL}/abc-123`);
    // a browser with games made on this site is offered to bring them
    expect(makerAddress("abc-123", true)).toBe(`${MAKER_URL}/abc-123?import=1`);
    // an odd id is dropped, never put in the address
    expect(makerAddress("../x?y", false)).toBe(`${MAKER_URL}/`);
  });
});
