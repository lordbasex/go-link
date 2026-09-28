// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import { describe, expect, it } from "vitest";
import { migrateLegacyStorage } from "../src";

describe("legacy storage", () => {
  it("moves the old keys once and keeps newer values", () => {
    localStorage.clear();
    localStorage.setItem("mame-webrtc.device-link", "old-link");
    localStorage.setItem("mame-webrtc.game-volume", "0.4");
    localStorage.setItem("go-link.game-volume", "0.9");
    expect(migrateLegacyStorage(localStorage)).toBe(1);
    expect(localStorage.getItem("go-link.device-link")).toBe("old-link");
    expect(localStorage.getItem("go-link.game-volume")).toBe("0.9");
    expect(localStorage.getItem("mame-webrtc.device-link")).toBeNull();
    expect(migrateLegacyStorage(localStorage)).toBe(0);
  });
});
