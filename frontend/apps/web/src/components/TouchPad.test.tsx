// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Button } from "@go-link/shared";
import { TouchPad } from "./TouchPad";

afterEach(() => cleanup());

describe("on-screen gamepad", () => {
  it("shows as many action buttons as the game has, plus Coin and Start", () => {
    const { container, rerender } = render(<TouchPad controls={{ players: 2, buttons: 2, control: "joy4way" }} onChange={() => undefined} />);
    expect(container.querySelectorAll(".touchpad-button")).toHaveLength(2);
    expect(container.querySelector(".touchpad-dpad.is-4way")).not.toBeNull();
    rerender(<TouchPad controls={{ players: 2, buttons: 6, control: "joy8way" }} onChange={() => undefined} />);
    expect(container.querySelectorAll(".touchpad-button")).toHaveLength(6);
    expect(container.textContent).toContain("Coin");
    expect(container.textContent).toContain("1P");
  });

  it("shows one start button per player, and presses another player's start", () => {
    const onChange = vi.fn();
    const { container } = render(
      <TouchPad controls={{ players: 2, buttons: 2, control: "joy8way" }} starts={2} myPorts={[1]} onChange={onChange} />,
    );
    const pills = container.querySelectorAll<HTMLElement>(".touchpad-starts .touchpad-pill");
    expect([...pills].map((p) => p.textContent)).toEqual(["1P", "2P"]);
    expect(pills[0]!.className).toContain("is-mine");
    const side = container.querySelector<HTMLElement>(".touchpad-right")!;
    document.elementFromPoint = () => pills[1]!;
    side.setPointerCapture = () => undefined;
    fireEvent.pointerDown(side, { pointerId: 3, clientX: 1, clientY: 1 });
    expect(onChange).toHaveBeenLastCalledWith(Button.Start2);
    fireEvent.pointerUp(side, { pointerId: 3 });
  });

  it("presses the button under the finger and releases it", () => {
    const onChange = vi.fn();
    const { container } = render(<TouchPad controls={{ players: 2, buttons: 3, control: "joy8way" }} onChange={onChange} />);
    const b2 = container.querySelectorAll<HTMLElement>(".touchpad-button")[1]!;
    const side = container.querySelector<HTMLElement>(".touchpad-right")!;
    document.elementFromPoint = () => b2; // jsdom has no layout
    side.setPointerCapture = () => undefined;
    fireEvent.pointerDown(side, { pointerId: 7, clientX: 1, clientY: 1 });
    expect(onChange).toHaveBeenLastCalledWith(Button.B2);
    expect(b2.className).toContain("is-on");
    fireEvent.pointerUp(side, { pointerId: 7 });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("reads the D-pad from the thumb position", () => {
    const onChange = vi.fn();
    const { container } = render(<TouchPad controls={{ players: 2, buttons: 1, control: "joy8way" }} onChange={onChange} />);
    const dpad = container.querySelector<HTMLElement>(".touchpad-dpad")!;
    dpad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    dpad.setPointerCapture = () => undefined;
    fireEvent.pointerDown(dpad, { pointerId: 1, clientX: 95, clientY: 50 });
    expect(onChange).toHaveBeenLastCalledWith(Button.Right);
    fireEvent.pointerUp(dpad, { pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });
});
