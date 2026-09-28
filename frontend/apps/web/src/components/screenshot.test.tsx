// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { slug, stamp } from "./screenshot";

describe("screenshot names", () => {
  it("turns a room title into a file name", () => {
    expect(slug("The Simpsons (4 Players)")).toBe("the-simpsons-4-players");
    expect(slug("Pelea en la ñandú")).toBe("pelea-en-la-nandu");
    expect(slug("***")).toBe("go-link");
  });
  it("stamps the local date and time", () => {
    expect(stamp(new Date(2026, 8, 28, 21, 5, 9))).toBe("2026-09-28-210509");
  });
});
