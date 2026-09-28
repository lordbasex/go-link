// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import { describe, expect, it } from "vitest";
import { Button, DEFAULT_KEYBOARD, DEFAULT_PAD, bind, bindingOf, keyboardButtons, loadInputConfig, padBits, saveInputConfig, type KeyMap } from "../src";

describe("input config", () => {
  it("binds one input per action and one action per input", () => {
    let map: KeyMap = { KeyZ: "b1", KeyX: "b2" };
    map = bind(map, "KeyX", "b1"); // X now fires button 1; Z is free
    expect(map).toEqual({ KeyX: "b1" });
    expect(bindingOf(map, "b1")).toBe("KeyX");
  });

  it("turns keys and gamepad buttons into bits, pause stays local", () => {
    expect(keyboardButtons(["KeyZ", "Digit1", "KeyP"], DEFAULT_KEYBOARD)).toBe(Button.B1 | Button.Start1);
    // 1 to 4 are the panel start buttons; Enter is your own start.
    expect(keyboardButtons(["Digit2", "Enter"], DEFAULT_KEYBOARD)).toBe(Button.Start2 | Button.Start);
    expect(bindingOf(DEFAULT_KEYBOARD, "pause")).toBe("KeyP");
    const bits = padBits({ ...DEFAULT_PAD, 16: "pause" });
    expect(bits[0]).toBe(Button.B1);
    expect(bits[16]).toBeUndefined();
  });

  it("round trips and drops junk", () => {
    localStorage.clear();
    saveInputConfig(localStorage, { keyboard: { KeyJ: "b1" }, pads: { "Pro Controller": { 1: "b1" } }, players: { "Pro Controller#0": 2 } });
    expect(loadInputConfig(localStorage)).toEqual({ keyboard: { KeyJ: "b1" }, pads: { "Pro Controller": { 1: "b1" } }, players: { "Pro Controller#0": 2 } });
    localStorage.setItem("go-link.input", JSON.stringify({ keyboard: { KeyJ: "explode" }, players: { a: 9 } }));
    expect(loadInputConfig(localStorage)).toEqual({ keyboard: DEFAULT_KEYBOARD, pads: {}, players: {} });
  });

  it("moves a map saved before the start buttons to 1-4 = 1P-4P, keeping custom keys", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage;
    store.set("go-link.input", JSON.stringify({ keyboard: { KeyZ: "b1", Digit1: "start", Enter: "start", Digit3: "coin" } }));
    const kb = loadInputConfig(storage).keyboard;
    expect(kb.Digit1).toBe("start1");
    expect(kb.Digit2).toBe("start2");
    expect(kb.Digit3).toBe("coin"); // the person's own choice stays
    expect(kb.Digit4).toBe("start4");
    expect(kb.Enter).toBe("start");
  });
});

