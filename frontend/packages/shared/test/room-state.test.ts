// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import { describe, expect, it } from "vitest";
import { ordinal, parseChat, parseRoomState } from "../src";

describe("room state", () => {
  it("parses a room_state message", () => {
    const st = parseRoomState({
      type: "room_state",
      max_players: 4,
      seats: [{ port: 1, name: "Ana", local_player: 0, you: true }, null, { port: 3, name: "Leo", local_player: 1, you: false }],
      queue: [{ position: 1, name: "Pedro", you: false }],
      spectators: [{ name: "Sofi", you: false }],
      you: { name: "Ana", ports: [1], queue_positions: [], spectator: false },
    });
    expect(st?.seats).toEqual([{ port: 1, name: "Ana", localPlayer: 0, you: true }, null, { port: 3, name: "Leo", localPlayer: 1, you: false }, null]);
    expect(st?.queue).toEqual([{ position: 1, name: "Pedro", you: false }]);
    expect(st?.you.ports).toEqual([1]);
  });
  it("bounds hostile values", () => {
    const st = parseRoomState({ type: "room_state", max_players: 99, seats: "x", you: null });
    expect(st?.maxPlayers).toBe(4);
    expect(st?.seats).toEqual([null, null, null, null]);
    expect(st?.you.ports).toEqual([]);
    expect(parseRoomState({ type: "chat" })).toBeNull();
  });
});

describe("chat", () => {
  it("parses user and system lines", () => {
    expect(parseChat({ type: "chat", name: "Ana", port: 2, role: "P2", text: "hi", ts: 5 })).toEqual({ kind: "user", name: "Ana", port: 2, role: "P2", text: "hi", ts: 5 });
    expect(parseChat({ type: "chat", system: "Ana took seat P2", ts: 6 })).toEqual({ kind: "system", text: "Ana took seat P2", ts: 6 });
    expect(parseChat({ type: "chat", name: "x", port: 9, text: "y" })).toMatchObject({ port: null });
    expect(parseChat({ type: "chat", text: 3 })).toBeNull();
  });
  it("orders", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });
});

describe("pause in room_state", () => {
  it("reads who paused and whether the game can pause", () => {
    const st = parseRoomState({ type: "room_state", max_players: 4, seats: [], pausable: true, paused: true, paused_by: "Ana", you: {} });
    expect(st).toMatchObject({ pausable: true, paused: true, pausedBy: "Ana" });
    const idle = parseRoomState({ type: "room_state", max_players: 4, seats: [], you: {} });
    expect(idle).toMatchObject({ pausable: false, paused: false, pausedBy: "" });
  });
});

describe("pause requests", () => {
  const base = { type: "room_state", max_players: 4, seats: [], pausable: true };
  it("reads the host's view: requests waiting for an answer", () => {
    const st = parseRoomState({
      ...base,
      host_online: true,
      you: { name: "Host", ports: [], owner: true, pause_asks: [{ from: "peer-a", name: "Ana", port: 2, expires_at: "2026-09-29T12:00:30Z" }], pause_asked: null },
    });
    expect(st?.hostOnline).toBe(true);
    expect(st?.you.owner).toBe(true);
    expect(st?.you.pauseAsks).toEqual([{ from: "peer-a", name: "Ana", port: 2, expiresAt: Date.parse("2026-09-29T12:00:30Z") }]);
    expect(st?.you.pauseAsked).toBeNull();
  });
  it("reads a guest's own request and drops bad ones", () => {
    const st = parseRoomState({
      ...base,
      you: { name: "Ana", ports: [2], pause_asked: { expires_at: "2026-09-29T12:00:30Z" }, pause_asks: [{ from: "", name: "x" }, { from: "p", expires_at: "nope" }] },
    });
    expect(st?.hostOnline).toBe(false);
    expect(st?.you.owner).toBe(false);
    expect(st?.you.pauseAsked).toEqual({ expiresAt: Date.parse("2026-09-29T12:00:30Z") });
    expect(st?.you.pauseAsks).toEqual([]);
    expect(parseRoomState({ ...base, you: { pause_asked: { expires_at: 5 } } })?.you.pauseAsked).toBeNull();
  });
  it("knows the pause_declined notice", () => {
    expect(parseChat({ type: "chat", system: "The host would rather keep playing", event: "pause_declined", args: { name: "Ana", port: 2 }, ts: 1 })).toMatchObject({
      kind: "system",
      event: "pause_declined",
    });
  });
});
