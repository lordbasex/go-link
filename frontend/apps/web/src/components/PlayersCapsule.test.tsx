// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayersCapsule } from "./PlayersCapsule";
import type { SeatCard } from "../pages/roomModel";

afterEach(() => cleanup());

const seat = (name: string, you = false): SeatCard => ({ name, you, status: "Playing", tone: "normal" });

describe("players capsule", () => {
  it("shows every seat as an avatar and acts from its menu", async () => {
    const onSwap = vi.fn();
    const onSilence = vi.fn();
    render(
      <PlayersCapsule
        seats={[seat("Ana Maria", true), seat("Bob"), null, null]}
        swapFor={(port) => (port === 1 ? undefined : { onSwap: () => onSwap(port), waiting: false })}
        onToggleSilence={onSilence}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    // Your own seat has no actions: not a button.
    expect(screen.queryByRole("button", { name: /P1 · Ana Maria/ })).toBeNull();
    expect(screen.getByRole("img", { name: /P1 · Ana Maria/ })).toHaveTextContent("AM");

    await userEvent.click(screen.getByRole("button", { name: /P2 · Bob/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Swap controllers: go to P2/ }));
    expect(onSwap).toHaveBeenCalledWith(2);

    await userEvent.click(screen.getByRole("button", { name: /P2 · Bob/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Silence Bob/ }));
    expect(onSilence).toHaveBeenCalledWith(2);

    await userEvent.click(screen.getByRole("button", { name: /P3 · Free seat/ }));
    expect(screen.getByRole("menuitem", { name: "Move to P3" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("Escape without a key code", () => {
  it("closes the menu when only the key name comes (some keyboards and tools)", async () => {
    render(<PlayersCapsule seats={[seat("Ana", true), null, null, null]} swapFor={() => ({ onSwap: () => undefined, waiting: false })} onToggleSilence={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: /P2 · Free seat/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await vi.waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("presses a seat's Start and lets the host free a seat", async () => {
    const onStart = vi.fn();
    const onRelease = vi.fn();
    const { rerender } = render(
      <PlayersCapsule seats={[seat("Ana", true), seat("Bob"), null, null]} swapFor={() => undefined} onStart={onStart} onRelease={onRelease} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /P2 · Bob/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Press Start 2P" }));
    expect(onStart).toHaveBeenCalledWith(2);
    // Nobody waits: only "to watching" (the queue would give the seat back).
    await userEvent.click(screen.getByRole("button", { name: /P2 · Bob/ }));
    expect(screen.queryByRole("menuitem", { name: /to the queue/ })).toBeNull();
    await userEvent.click(screen.getByRole("menuitem", { name: "Make Bob a spectator" }));
    expect(onRelease).toHaveBeenCalledWith(2, "watch");
    // Someone waits: the host may send a player, itself included, to the queue.
    rerender(
      <PlayersCapsule seats={[seat("Ana", true), seat("Bob"), null, null]} swapFor={() => undefined} onStart={onStart} onRelease={onRelease} queueWaiting />,
    );
    await userEvent.click(screen.getByRole("button", { name: /P1 · Ana/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Give up my seat (to the queue)" }));
    expect(onRelease).toHaveBeenCalledWith(1, "queue");
    // Free seats have no Start or release.
    expect(screen.queryByRole("button", { name: /P3 · Free seat/ })).toBeNull();
  });
});
