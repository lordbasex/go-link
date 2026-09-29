// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { parseDeviceStatus, parsePauseAskEvent } from "../src/device-status";

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

describe("pause requests for the host", () => {
  it("lists a room's requests in device_status", () => {
    const st = parseDeviceStatus({
      type: "device_status",
      device_id: "d",
      rooms: [{ id: "r1", state: "live", name: "Co-op", pause_asks: [{ from: "peer-a", name: "Ana", port: 1, expires_at: "2026-09-29T12:00:30Z" }] }],
    });
    expect(st?.rooms[0]?.pauseAsks).toEqual([{ from: "peer-a", name: "Ana", port: 1, expiresAt: Date.parse("2026-09-29T12:00:30Z") }]);
  });
  it("reads pause_asked and pause_ask_gone", () => {
    expect(parsePauseAskEvent({ type: "pause_asked", id: "r1", from: "peer-a", name: "Ana", port: 2, expires_at: "2026-09-29T12:00:30Z" })).toEqual({
      type: "asked",
      id: "r1",
      ask: { from: "peer-a", name: "Ana", port: 2, expiresAt: Date.parse("2026-09-29T12:00:30Z") },
    });
    expect(parsePauseAskEvent({ type: "pause_ask_gone", id: "r1", from: "peer-a" })).toEqual({ type: "gone", id: "r1", from: "peer-a" });
    expect(parsePauseAskEvent({ type: "pause_asked", id: "r1", from: "peer-a" })).toBeNull(); // no time
    expect(parsePauseAskEvent({ type: "pause_ask_gone", from: "peer-a" })).toBeNull();
    expect(parsePauseAskEvent({ type: "room_result", id: "r1", from: "x" })).toBeNull();
  });
});
