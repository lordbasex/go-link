// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it } from "vitest";
import { PLAYER_NAME_KEY, cleanPlayerName, nameLength, nameProblem, savePlayerName, savedPlayerName } from "../src";

afterEach(() => localStorage.clear());

describe("player names", () => {
  // The same table as the device's TestCleanName: both sides agree.
  it.each([
    ["Ana", "Ana"],
    ["  Ana   María  ", "Ana María"],
    ["José Ñandú", "José Ñandú"],
    ["José", "José"],
    ["<script>alert(1)</script>", "scriptalert1script"],
    ["Fede 😀🎮", "Fede"],
    ["😀 Ana 🎮 Bo", "Ana Bo"],
    ["a", ""],
    ["😀😀", ""],
    ["!!", ""],
    ["   ", ""],
    ["A1", "A1"],
    ["Player\tOne\nTwo", "Player One Two"],
    ["李小龍", "李小龍"],
    ["Ölçer 2", "Ölçer 2"],
    ["ABCDEFGHIJKLMNOPQRSTUVWXYZ", "ABCDEFGHIJKLMNOPQRST"],
    ["abcdefghijklmnopqrs tuvw", "abcdefghijklmnopqrs"],
    ["a.b", "ab"],
    ["x_y-z", "xyz"],
  ])("cleans %j to %j", (raw, want) => {
    expect(cleanPlayerName(raw)).toBe(want);
  });

  it("explains what is wrong while typing", () => {
    expect(nameProblem("Alex 17")).toBeNull();
    expect(nameProblem("Ñoño Pérez")).toBeNull();
    expect(nameProblem("Alex!")).toBe("chars");
    expect(nameProblem("Alex 😀")).toBe("chars");
    expect(nameProblem("A")).toBe("short");
    expect(nameProblem("  A  ")).toBe("short");
    expect(nameProblem("x".repeat(21))).toBe("long");
    // Runs of spaces count as one, as on the device.
    expect(nameLength("Ana    Bo")).toBe(6);
    expect(nameProblem(`${"x".repeat(10)}     ${"y".repeat(9)}`)).toBeNull();
  });

  it("remembers only a valid name", () => {
    expect(savedPlayerName()).toBe("");
    savePlayerName("Bad!");
    expect(localStorage.getItem(PLAYER_NAME_KEY)).toBeNull();
    savePlayerName("  Ana   María ");
    expect(savedPlayerName()).toBe("Ana María");
    localStorage.setItem(PLAYER_NAME_KEY, "<b>x</b>");
    expect(savedPlayerName()).toBe("");
  });
});
