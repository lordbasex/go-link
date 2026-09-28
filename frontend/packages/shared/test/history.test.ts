// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { parseHistory } from "../src";

describe("parseHistory", () => {
  it("reads the device's history reply and skips broken entries", () => {
    const list = parseHistory({
      type: "history",
      items: [
        {
          room_id: "a", name: "Night", rom: "robby", game: "Robby Roto", started_at: "2026-09-26T10:00:00Z", ended_at: "2026-09-26T11:00:00Z", peak_players: 2, peak_spectators: -1, reason: "weird",
          people: [
            { name: "Fede", ports: [1, 9], ip: "192.0.2.10", path: "direct" },
            { name: "Ana", ip: "<script>", path: "relay" },
          ],
        },
        { name: "no start" },
        "junk",
      ],
    });
    expect(list).toEqual([
      { id: "", roomId: "a", name: "Night", rom: "robby", game: "Robby Roto", startedAt: "2026-09-26T10:00:00Z", endedAt: "2026-09-26T11:00:00Z", peakPlayers: 2, peakSpectators: 0, reason: "archived",
        people: [
          { name: "Fede", ports: [1], ip: "192.0.2.10", path: "direct" },
          { name: "Ana", ports: [], ip: "", path: "relay" },
        ],
        recordings: [],
      },
    ]);
  });

  it("ignores other messages", () => {
    expect(parseHistory({ type: "device_status" })).toBeNull();
    expect(parseHistory(null)).toBeNull();
  });
});
