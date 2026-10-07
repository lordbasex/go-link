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

describe("Latency", () => {
  const latency = { rttMs: 32, videoMs: 41, hudOn: false, seated: true, probe: null };
  it("shows everyone the network and the video, and only the host the switch", async () => {
    const onHud = vi.fn();
    const { unmount } = render(<ControlsPanel {...base} single latency={{ ...latency, onHud }} />);
    expect(screen.getByText("32 ms")).toBeInTheDocument();
    expect(screen.getByText("41 ms")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Controls on the video" }));
    expect(onHud).toHaveBeenCalledWith(true);
    unmount();
    render(<ControlsPanel {...base} single latency={latency} />);
    expect(screen.queryByRole("switch", { name: "Controls on the video" })).toBeNull();
    expect(screen.getByText(/while the host draws the controllers/)).toBeInTheDocument();
  });
  it("shows the median measured on the picture while the test is on", () => {
    render(<ControlsPanel {...base} single latency={{ ...latency, hudOn: true, probe: { last: 70, median: 64, worst: 90, count: 5 } }} />);
    expect(screen.getByText("64 ms")).toBeInTheDocument();
    expect(screen.getByText(/Last 70 ms · 5 presses · worst 90 ms/)).toBeInTheDocument();
  });
});
