// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PLAYER_NAME_KEY } from "@go-link/shared";
import { NameStep } from "./NameStep";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("what's your name", () => {
  it("comes filled with the last name used, so one tap enters", async () => {
    localStorage.setItem(PLAYER_NAME_KEY, "Alex 17");
    const done = vi.fn();
    render(<NameStep onDone={done} />);
    const dialog = screen.getByRole("dialog", { name: "What’s your name?" });
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveValue("Alex 17");
    expect(dialog).toHaveTextContent("7/20");
    await userEvent.click(screen.getByRole("button", { name: "Enter the room" }));
    expect(done).toHaveBeenCalledWith("Alex 17");
  });

  it("turns red for symbols and emoji and waits for a valid name", async () => {
    const done = vi.fn();
    render(<NameStep onDone={done} />);
    const field = screen.getByRole("textbox", { name: "Your name" });
    const enter = screen.getByRole("button", { name: "Enter the room" });
    expect(field).toHaveValue("");
    expect(enter).toBeDisabled();
    await userEvent.type(field, "Ana#1");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Only letters, digits and spaces (no symbols or emoji).")).toBeInTheDocument();
    expect(enter).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, "x".repeat(21));
    expect(screen.getByText("At most 20 characters.")).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.type(field, "  Ñandú   Pérez  {Enter}");
    expect(done).toHaveBeenCalledWith("Ñandú Pérez");
  });
});
