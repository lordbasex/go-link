// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { buttonNames, identify } from "./controllerModels";

describe("buttonNames", () => {
  it("names each face button as the controller prints it", () => {
    expect(buttonNames(identify("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)").model)).toMatchObject({ b1: "✕", b2: "○", b3: "□", b4: "△", start: "Options" });
    expect(buttonNames(identify("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)").model)).toMatchObject({ b1: "B", b2: "A", b3: "Y", b4: "X", r2: "ZR" });
    expect(buttonNames(identify("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)").model)).toMatchObject({ b1: "A", b4: "Y", r1: "RB", start: "Menu" });
    expect(buttonNames(identify("USB Joystick (Vendor: 0e8f Product: 0002)").model)).toMatchObject({ b1: "1", b3: "3" });
  });
});
