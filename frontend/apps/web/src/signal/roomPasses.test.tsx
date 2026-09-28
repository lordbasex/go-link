// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it } from "vitest";
import { forgetRoomPass, roomPass, saveRoomPass } from "./roomPasses";

afterEach(() => window.localStorage.clear());

describe("room passes", () => {
  it("keeps the return token of each room, only the newest twenty", () => {
    saveRoomPass("R1", "t1");
    expect(roomPass("R1")).toBe("t1");
    for (let i = 2; i <= 21; i++) saveRoomPass(`R${i}`, `t${i}`);
    expect(roomPass("R1")).toBe(""); // the oldest went away
    expect(roomPass("R21")).toBe("t21");
    forgetRoomPass("R21");
    expect(roomPass("R21")).toBe("");
  });
});
