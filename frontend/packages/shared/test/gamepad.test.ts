// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import { describe, expect, it } from "vitest";
import { Button, forgetGamepad, parseDeviceStatus, readGamepad, romPlayable, type GamepadLike } from "../src";

function pad(mapping: string, pressed: number[], axes: number[], index = 0): GamepadLike {
  return {
    id: "057e-2009-Pro Controller",
    index,
    connected: true,
    mapping,
    buttons: Array.from({ length: 18 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
    axes,
  };
}

describe("readGamepad", () => {
  it("reads a standard pad as is", () => {
    const p = readGamepad(pad("standard", [0, 9], [-1, 0, 0, 0]));
    expect(p.buttons).toBe(Button.B1 | Button.Start | Button.Left);
    expect(p.axes[0]).toBe(-127);
  });

  it("ignores what a non-standard pad reports at rest", () => {
    // Firefox on macOS: L, R and ZL look held, and axis 2 rests at -1.
    const rest = pad("", [4, 5, 6], [0.02, -0.01, -1, 0], 1);
    expect(readGamepad(rest)).toEqual({ buttons: 0, axes: [0, 0, 0, 0] });
    // A real press and a real stick push still count.
    const moved = readGamepad(pad("", [0, 4, 5, 6], [0.9, 0, 1, 0], 1));
    expect(moved.buttons).toBe(Button.B1 | Button.Right);
    expect(moved.axes).toEqual([114, 0, 0, 0]);
    forgetGamepad(rest);
    // Plugged in again while holding B1: that becomes the new rest.
    expect(readGamepad(pad("", [0], [0, 0, 0, 0], 1)).buttons).toBe(0);
  });
});

describe("ROM checks in device_status", () => {
  it("keeps valid checks and drops unknown ones", () => {
    const st = parseDeviceStatus({
      type: "device_status",
      device_id: "d",
      library: {
        dir: "/roms",
        core: { name: "mame2003_plus", installed: true, catalog: true },
        roms: [
          { name: "robby", check: { status: "ok" } },
          { name: "velvtbwl", check: { status: "missing", missing: Array.from({ length: 30 }, (_, i) => `f${i}`), needs: ["neogeo"] } },
          { name: "weird", check: { status: "exploded" } },
          { name: "unchecked" },
        ],
      },
    });
    const roms = st!.library!.roms;
    expect(st!.library!.core.catalog).toBe(true);
    expect(roms[0]!.check).toEqual({ status: "ok", missing: undefined, needs: undefined, driver: undefined });
    expect(roms[1]!.check!.missing).toHaveLength(10);
    expect(roms[1]!.check!.needs).toEqual(["neogeo"]);
    expect(roms[2]!.check).toBeUndefined();
    expect(roms.map(romPlayable)).toEqual([true, false, true, true]);
  });
});
