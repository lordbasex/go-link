// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { parseDeviceStatus, parseRoomPicture, parseRoomState, roomPictureAction } from "../src";

describe("room default picture", () => {
  it("reads a known style and sides", () => {
    expect(parseRoomPicture({ style: "crt", bands: "ambient" })).toEqual({ style: "crt", bands: "ambient" });
    expect(parseRoomPicture({ style: "edges", bands: "frame", extra: 1 })).toEqual({ style: "edges", bands: "frame" });
  });

  it("ignores anything unknown or missing", () => {
    for (const v of [undefined, null, "crt", {}, { style: "crt" }, { bands: "black" }, { style: "neon", bands: "black" }, { style: "crt", bands: "<b>" }, { style: 1, bands: 2 }]) {
      expect(parseRoomPicture(v)).toBeNull();
    }
  });

  it("comes in room_state (absent: the site's default)", () => {
    const base = { type: "room_state", max_players: 2, seats: [], you: {} };
    expect(parseRoomState({ ...base, picture: { style: "sharp", bands: "black" } })?.picture).toEqual({ style: "sharp", bands: "black" });
    expect(parseRoomState(base)?.picture).toBeNull();
    expect(parseRoomState({ ...base, picture: { style: "sharp", bands: "plaid" } })?.picture).toBeNull();
  });

  it("comes in device_status for game rooms and the test pattern room", () => {
    const st = parseDeviceStatus({
      type: "device_status",
      device_id: "d",
      room: { room_id: "R0", viewers: 0, picture: { style: "crt", bands: "frame" } },
      rooms: [
        { id: "a1", state: "live", picture: { style: "sharp", bands: "ambient" } },
        { id: "b2", state: "archived", picture: { style: "?", bands: "ambient" } },
      ],
    });
    expect(st?.room?.picture).toEqual({ style: "crt", bands: "frame" });
    expect(st?.rooms[0]?.picture).toEqual({ style: "sharp", bands: "ambient" });
    expect(st?.rooms[1]?.picture).toBeNull();
  });

  it("builds the owner's room_action", () => {
    expect(roomPictureAction("a1", { style: "crt", bands: "black" })).toEqual({ type: "room_action", id: "a1", action: "picture", style: "crt", bands: "black" });
    expect(roomPictureAction("test", null)).toEqual({ type: "room_action", id: "test", action: "picture", style: "", bands: "" });
  });
});
