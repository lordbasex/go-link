// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { parseDeviceStatus } from "../src/device-status";

describe("device update", () => {
  const base = { type: "device_status", device_id: "d", version: "v0.1.0" };
  it("offers only go-link's own releases", () => {
    const ok = parseDeviceStatus({ ...base, update: { latest: "v0.2.0", url: "https://github.com/lordbasex/go-link/releases/tag/v0.2.0" } });
    expect(ok?.update).toEqual({ latest: "v0.2.0", url: "https://github.com/lordbasex/go-link/releases/tag/v0.2.0" });
    const evil = parseDeviceStatus({ ...base, update: { latest: "v9.9.9", url: "https://evil.example/go-link.dmg" } });
    expect(evil?.update).toBeUndefined();
    expect(parseDeviceStatus(base)?.update).toBeUndefined();
  });
});
