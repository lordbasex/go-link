// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EMPTY_PAD } from "@go-link/shared";
import { ControlsPanel } from "./ControlsPanel";

const pad = { player: 0, slot: "x#0", auto: true, name: "Xbox", id: "xbox", pad: EMPTY_PAD };
const base = { controllers: [pad], heldKeys: new Set<string>(), keyboardPlayer: 0, onKeyboardPlayer: () => {}, onPlayer: () => {} };

afterEach(cleanup);

describe("Several controllers", () => {
  it("is the host's switch, off by default, with one player for every controller", async () => {
    const onMulti = vi.fn();
    render(<ControlsPanel {...base} single onMulti={onMulti} />);
    const sw = screen.getByRole("switch", { name: "Several controllers" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText("Plays as")).toBeNull();
    expect(screen.getByText(/play as one player/)).toBeInTheDocument();
    await userEvent.click(sw);
    expect(onMulti).toHaveBeenCalledWith(true);
  });
  it("lets the host pick each controller's player when on", () => {
    render(<ControlsPanel {...base} single={false} onMulti={() => {}} />);
    expect(screen.getByRole("switch", { name: "Several controllers" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Keyboard plays as")).toBeInTheDocument();
  });
  it("has no switch for a guest", () => {
    render(<ControlsPanel {...base} single />);
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
