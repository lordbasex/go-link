// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { gameUses } from "./ControlsPanel";

describe("gameUses", () => {
  const sf2 = { players: 2, buttons: 6, control: "joy8way" };
  const tmnt = { players: 4, buttons: 2, control: "joy8way" };
  it("marks the stick, Coin and Start of every game", () => {
    for (const a of ["up", "down", "left", "right", "coin", "start"] as const) expect(gameUses(a, tmnt)).toBe(true);
  });
  it("marks buttons up to the game's count and starts up to its players", () => {
    expect(gameUses("b6", sf2)).toBe(true);
    expect(gameUses("b3", tmnt)).toBe(false);
    expect(gameUses("start2", sf2)).toBe(true);
    expect(gameUses("start3", sf2)).toBe(false);
    expect(gameUses("start4", tmnt)).toBe(true);
    expect(gameUses("start4", { players: 0, buttons: 6, control: "" })).toBe(true);
  });
  it("never marks what never reaches the game", () => {
    for (const a of ["l2", "r2", "l3", "r3", "home", "capture", "pause"] as const) expect(gameUses(a, sf2)).toBe(false);
  });
});
