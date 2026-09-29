// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PauseAskDialog } from "./PauseAskDialog";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ask = (over = {}) => ({ from: "peer-a", name: "Ana", port: 2, expiresAt: Date.now() + 30_000, ...over });

describe("a request for a pause, for the host", () => {
  it("names the player and their seat, and answers either way", async () => {
    const answer = vi.fn();
    render(<PauseAskDialog ask={ask()} onAnswer={answer} />);
    const dialog = screen.getByRole("alertdialog", { name: "Ana wants to pause" });
    expect(dialog).toHaveTextContent("P2");
    expect(dialog).toHaveTextContent("If you accept, the game pauses for everyone.");
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep playing" }));
    expect(answer.mock.calls).toEqual([[true], [false]]);
  });

  it("names the room on other pages and translates generated names", () => {
    render(<PauseAskDialog ask={ask({ name: "Guest 9F3A" })} room="Co-op night" onAnswer={() => undefined} />);
    expect(screen.getByRole("alertdialog", { name: "Guest 9F3A wants to pause “Co-op night”" })).toBeInTheDocument();
  });

  it("counts down from what is left, never more than 30 s", () => {
    vi.useFakeTimers();
    // A device clock far ahead: the countdown still starts at 30 s.
    render(<PauseAskDialog ask={ask({ expiresAt: Date.now() + 3_600_000 })} onAnswer={() => undefined} />);
    expect(screen.getByText("Dismissed by itself in 30 s.")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("Dismissed by itself in 20 s.")).toBeInTheDocument();
  });
});
