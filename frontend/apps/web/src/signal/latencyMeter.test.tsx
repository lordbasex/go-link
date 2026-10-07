// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { parseHudBeacons, parseRoomState } from "@go-link/shared";
import { LatencyMeter } from "./useLatencyProbe";

describe("LatencyMeter", () => {
  it("measures a press and a release from the edge to the beacon's change", () => {
    const m = new LatencyMeter();
    const down = { active: true, at: 1000 };
    expect(m.frame(false, 990, { active: false, at: 0 })).toBeNull(); // first frame: nothing to compare
    expect(m.frame(false, 1016, down)).toBeNull(); // not there yet
    expect(m.frame(true, 1062, down)).toBe(62);
    expect(m.frame(true, 1078, down)).toBeNull(); // still lit: measured once
    const up = { active: false, at: 1200 };
    expect(m.frame(false, 1250, up)).toBe(50);
    expect(m.reading()).toEqual({ last: 50, median: 56, worst: 62, count: 2 });
  });
  it("ignores a beacon lit by someone else's seat change and stale edges", () => {
    const m = new LatencyMeter();
    m.frame(false, 0, { active: false, at: 0 });
    expect(m.frame(true, 100, { active: false, at: 50 })).toBeNull(); // the edge says released
    expect(m.frame(false, 5000, { active: false, at: 1000 })).toBeNull(); // 4 s: a missed frame
    expect(m.reading()).toBeNull();
  });
});

describe("the latency test's messages", () => {
  it("reads the beacons from stream_stats and the switch from room_state", () => {
    const rect = { x: 0.01, y: 0.8, w: 0.05, h: 0.1 };
    expect(parseHudBeacons({ type: "stream_stats", hud: [rect, rect] })).toEqual([rect, rect]);
    expect(parseHudBeacons({ type: "stream_stats" })).toEqual([]);
    expect(parseHudBeacons({ type: "stream_stats", hud: [{ x: 0.9, y: 0, w: 0.5, h: 0.1 }] })).toEqual([]);
    expect(parseHudBeacons({ type: "room_state" })).toBeNull();
    expect(parseRoomState({ type: "room_state", max_players: 2, seats: [], input_hud: true })?.inputHud).toBe(true);
    expect(parseRoomState({ type: "room_state", max_players: 2, seats: [] })?.inputHud).toBe(false);
  });
});
