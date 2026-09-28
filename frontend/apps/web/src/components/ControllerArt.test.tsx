// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Button, EMPTY_PAD } from "@go-link/shared";
import { ControllerArt, familyOf } from "./ControllerArt";

afterEach(() => cleanup());

describe("gamepad drawings", () => {
  it("tells the family from the browser's gamepad id", () => {
    expect(familyOf("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)")).toBe("playstation");
    expect(familyOf("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)")).toBe("nintendo");
    expect(familyOf("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)")).toBe("xbox");
    expect(familyOf("8BitDo SN30 Pro")).toBe("generic");
  });

  it("fills the pressed buttons and labels the face buttons like the real pad", () => {
    const pad = { ...EMPTY_PAD, buttons: Button.B1 | Button.Start };
    const { container, rerender } = render(<ControllerArt family="playstation" pad={pad} label="P1" />);
    expect(container.querySelectorAll(".is-on")).toHaveLength(2);
    expect(container.textContent).toContain("✕");
    rerender(<ControllerArt family="nintendo" pad={EMPTY_PAD} label="P1" />);
    expect(container.querySelectorAll(".is-on")).toHaveLength(0);
    expect(container.textContent).toContain("ZL");
    rerender(<ControllerArt family="xbox" pad={{ ...EMPTY_PAD, axes: [127, 0, 0, 0] }} label="P1" />);
    expect(container.querySelectorAll(".is-on")).toHaveLength(1); // the moved stick
    expect(container.textContent).toContain("LT");
  });
});
