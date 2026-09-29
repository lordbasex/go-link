// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../signal/SignalProvider", () => ({
  useSignal: () => ({ sendToDevice: vi.fn(), onDeviceMessage: () => () => {} }),
}));

import { InviteDialog } from "./InviteDialog";

const room = { id: "test", name: "Test pattern", invite: "AAAAAAAAAAAAAAAAAAAAAA", inviteCode: "123456789" };

describe("InviteDialog", () => {
  it("closes with Escape, also after the page re-renders it", () => {
    const onClose = vi.fn();
    const { rerender } = render(<InviteDialog room={room} fallbackUrl="" onAction={() => {}} onClose={() => onClose()} />);
    // The room page passes a new onClose on every render.
    rerender(<InviteDialog room={room} fallbackUrl="" onAction={() => {}} onClose={() => onClose()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? window, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
