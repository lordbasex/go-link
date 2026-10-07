// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { parseTelemetry, shortRunId } from "@go-link/shared";
import { niceMax, timeTicks } from "./TimeChart";

describe("the room's telemetry from the device", () => {
  it("reads runs, a running one has no end", () => {
    const a = parseTelemetry({
      type: "telemetry_runs", req: 3, id: "room1", from: 1, to: 2,
      runs: [{ id: "a1b2c3d4e5f6", started: "2026-10-07T21:00:00Z", ended: "2026-10-07T22:00:00Z", game: "The Simpsons" }, { id: "ff", started: "2026-10-08T21:00:00Z", game: "The Simpsons" }],
      peers: [{ id: "p1", name: "Nico", first: "2026-10-07T21:00:05Z", last: "2026-10-07T21:30:00Z" }],
    });
    expect(a?.type).toBe("telemetry_runs");
    if (a?.type !== "telemetry_runs") return;
    expect(a.req).toBe(3);
    expect(a.runs[0]!.endedAt).toBe(Date.parse("2026-10-07T22:00:00Z"));
    expect(a.runs[1]!.endedAt).toBeNull();
    expect(a.peers[0]!.name).toBe("Nico");
    expect(shortRunId(a.runs[0]!.id)).toBe("a1b2c3d4");
  });
  it("reads series with gaps, incidents with an unknown verdict and events", () => {
    const s = parseTelemetry({ type: "telemetry_series", req: 1, id: "r", from: 10, to: 20, step: 1000, series: [{ peer: "p", kind: "client", metric: "rtt_ms", avg: [30, null, "x"], max: [40, null, 5] }] });
    expect(s?.type === "telemetry_series" && s.series[0]!.avg).toEqual([30, null, null]);
    const i = parseTelemetry({ type: "telemetry_incidents", req: 2, id: "r", incidents: [{ start: "2026-10-07T21:00:00Z", end: "2026-10-07T21:00:02Z", verdict: "aliens", why: "?", device_gap_ms: 2000, voice: true, lost: { p: 4, q: "x" } }] });
    expect(i?.type === "telemetry_incidents" && i.incidents[0]).toMatchObject({ verdict: "player", deviceGapMs: 2000, voice: true, lost: { p: 4 } });
    const e = parseTelemetry({ type: "telemetry_events", req: 4, id: "r", more: true, events: [{ at: "2026-10-07T21:00:00Z", level: "warn", kind: "frame_gap", msg: "no frame", data: { gap_ms: 2000 } }] });
    expect(e?.type === "telemetry_events" && e.more && e.events[0]!.data).toEqual({ gap_ms: 2000 });
    expect(parseTelemetry({ type: "history" })).toBeNull();
  });
});

describe("the time chart's axes", () => {
  it("rounds the top up to 1, 2 or 5 times ten", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(37)).toBe(50);
    expect(niceMax(120)).toBe(200);
    expect(niceMax(0.3)).toBe(0.5);
  });
  it("puts about five ticks on round times", () => {
    const from = Date.parse("2026-10-07T21:03:00Z");
    const ticks = timeTicks(from, from + 2 * 3600_000);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks.length).toBeLessThanOrEqual(5);
    for (const t of ticks) expect(t % (30 * 60_000)).toBe(0);
  });
});
