// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it } from "vitest";
import { forgetGamepad, type GamepadLike } from "@go-link/shared";
import { Input } from "./input";

// A generic USB arcade pad: no standard mapping, 10 buttons, 2 axes.
const ID = "USB Joystick (Vendor: 0e8f Product: 0002)";
let held: number[] = [];
const pad = (): GamepadLike & { timestamp: number } => ({
  id: ID,
  index: 0,
  connected: true,
  mapping: "",
  timestamp: 0,
  axes: [0, 0],
  buttons: Array.from({ length: 10 }, (_, i) => ({ pressed: held.includes(i), value: held.includes(i) ? 1 : 0 })),
});
const fakeWin = () => {
  const win = window as unknown as Window;
  Object.defineProperty(win.navigator, "getGamepads", { configurable: true, value: () => [pad()] });
  return win;
};

afterEach(() => {
  forgetGamepad(pad());
  localStorage.removeItem("go-link.input");
  held = [];
});

describe("the game reads a controller like the rest of the site", () => {
  it("uses the standard layout when this browser has no map for the pad", () => {
    const input = new Input(fakeWin());
    expect(input.read().fire).toBe(false); // first reading: the rest state
    held = [2];
    expect(input.read().fire).toBe(true);
    held = [0];
    expect(input.read().jump).toBe(true);
    input.dispose();
  });

  it("uses the button map saved for that pad model", () => {
    // The site's controls: button 5 shoots (b3), button 9 is Start.
    localStorage.setItem("go-link.input", JSON.stringify({ pads: { [ID]: { "5": "b3", "8": "b1", "9": "start" } } }));
    const input = new Input(fakeWin());
    input.read();
    held = [5];
    expect(input.read().fire).toBe(true);
    held = [2]; // not bound in that map
    const c = input.read();
    expect(c.fire).toBe(false);
    held = [9];
    expect(input.read().pause).toBe(true);
    expect(input.padStart).toBe(true);
    input.dispose();
  });

  it("counts a button that was held when the pad appeared, once it is let go", () => {
    held = [0];
    const input = new Input(fakeWin());
    expect(input.read().jump).toBe(false);
    held = [];
    input.read();
    held = [0];
    expect(input.read().jump).toBe(true);
    input.dispose();
  });
});
