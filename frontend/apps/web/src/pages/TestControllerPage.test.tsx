// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TestControllerPage } from "./TestControllerPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const lit = () => document.querySelectorAll(".test-pad .tc-lamp.is-on").length;

describe("test controller", () => {
  it("lights the pressed keys and tells which actions they are", async () => {
    render(<MemoryRouter><TestControllerPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "Test controller" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Controller: lit parts are pressed" })).toBeInTheDocument();
    expect(screen.getByText("Nothing pressed yet")).toBeInTheDocument();
    expect(lit()).toBe(0);

    fireEvent.keyDown(window, { code: "ArrowUp" });
    fireEvent.keyDown(window, { code: "KeyZ" });
    expect(screen.getByText("Up · Button 1")).toBeInTheDocument();
    expect(screen.getByText("Input: Keyboard")).toBeInTheDocument();
    expect(lit()).toBe(2);
    // The input-to-screen time comes on the next frame.
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    expect(screen.getByText(/ms · ⌀ /)).toBeInTheDocument();

    fireEvent.keyUp(window, { code: "ArrowUp" });
    fireEvent.keyUp(window, { code: "KeyZ" });
    expect(screen.getByText("Nothing pressed yet")).toBeInTheDocument();
    expect(lit()).toBe(0);
  });

  it("shows each gamepad by name and lights its buttons", async () => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    buttons[1] = { pressed: true, value: 1 }; // A (right)
    const pad = { id: "Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)", index: 0, connected: true, mapping: "standard", buttons, axes: [0, 0, 0, 0], timestamp: performance.now() };
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { getGamepads: () => [pad] }));
    render(<MemoryRouter><TestControllerPage /></MemoryRouter>);
    await screen.findByText("Gamepad 1: Pro Controller");
    expect(await screen.findByText("Button 2")).toBeInTheDocument();
    expect(lit()).toBeGreaterThan(0);
  });

  it("offers the on-screen gamepad", async () => {
    render(<MemoryRouter><TestControllerPage /></MemoryRouter>);
    const toggle = screen.getByRole("button", { name: "Show the on-screen gamepad" });
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide the on-screen gamepad" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector(".touchpad")).not.toBeNull();
  });
});
