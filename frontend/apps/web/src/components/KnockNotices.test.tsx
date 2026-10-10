// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const sendToDevice = vi.fn();
const status = {
  room: { room_id: "r0", viewers: 0, title: "Test pattern", knocks: [{ peer: "p1", name: "Ana", since: "" }] },
  rooms: [{ id: "g1", name: "Friday", knocks: [{ peer: "p2", name: "Bea", since: "" }, { peer: "p3", name: "", since: "" }] }],
};
vi.mock("../signal/SignalProvider", () => ({
  useSignal: () => ({ sendToDevice, linkedDevice: { status } }),
}));
vi.mock("./ding", () => ({ playDing: vi.fn() }));

import { KnockNotices } from "./KnockNotices";

afterEach(() => {
  cleanup();
  sendToDevice.mockClear();
});

describe("KnockNotices", () => {
  it("lets the host answer each person, or everyone in a room", () => {
    render(<KnockNotices />);
    expect(screen.getByText("1 person wants to come in")).toBeInTheDocument();
    expect(screen.getByText("2 people want to come in")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Let Ana in" }));
    expect(sendToDevice).toHaveBeenCalledWith({ type: "knock_answer", id: "test", peer: "p1", accept: true });
    fireEvent.click(screen.getByRole("button", { name: "Do not let Bea in" }));
    expect(sendToDevice).toHaveBeenCalledWith({ type: "knock_answer", id: "g1", peer: "p2", accept: false });
    fireEvent.click(screen.getByRole("button", { name: "Let everyone in" }));
    expect(sendToDevice).toHaveBeenCalledWith({ type: "knock_answer", id: "g1", peer: "p3", accept: true });
    expect(screen.getByRole("button", { name: "Let Someone in" })).toBeInTheDocument(); // no name given
  });
});
