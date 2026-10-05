// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { BRIDGE_TAG, bridgeAllowsControl, bridgeControl, bridgeAllowsFile, bridgeAllowsReply, bridgeBody, bridgeEnvelope, MAKER_ROM, originOf } from "../src";

describe("maker bridge", () => {
  it("passes on a ROM test and a private room for a Willy Maker game only", () => {
    expect(bridgeAllowsControl({ type: "rom_test", id: "t1", set: "slammast" })).toBe(true);
    expect(bridgeAllowsControl({ type: "create_room", rom: MAKER_ROM, public: false, title: "x" })).toBe(true);
    // never the host's own games, a public room, or anything else of the device
    expect(bridgeAllowsControl({ type: "create_room", rom: "sf2", public: false })).toBe(false);
    expect(bridgeAllowsControl({ type: "create_room", rom: MAKER_ROM, public: true })).toBe(false);
    for (const type of ["unlink", "set_roms_dir", "factory_reset", "room_action", "auth", "invite"]) expect(bridgeAllowsControl({ type })).toBe(false);
    expect(bridgeAllowsControl(null)).toBe(false);
    expect(bridgeAllowsControl("rom_test")).toBe(false);
  });

  it("rebuilds the message from the allowed fields: keys in another case never reach the device", () => {
    // Go reads JSON keys in any case: "TYPE" would override "type" on the device
    const sneaky = { type: "rom_test", id: "a", set: "s", TYPE: "factory_reset", Confirm: "factory_reset", dir: "/x" };
    expect(bridgeControl(sneaky)).toEqual({ type: "rom_test", id: "a", set: "s" });
    const room = { type: "create_room", rom: MAKER_ROM, ROM: "sf2", title: "Dead Air", public: false, Public: true, voice: true, chat: true, maker: { title: "Dead Air", players: 9, labels: ["Shoot", 3], Pin: "1" }, Id: "other" };
    expect(bridgeControl(room)).toEqual({ type: "create_room", rom: MAKER_ROM, title: "Dead Air", public: false, voice: true, chat: true, maker: { title: "Dead Air", players: 4, labels: ["Shoot", ""] } });
    expect(bridgeControl({ type: "rom_test", id: "a", set: "s", frames: 99999 })).toEqual({ type: "rom_test", id: "a", set: "s" });
    expect(bridgeControl({ type: "rom_test", id: "x".repeat(65), set: "s" })).toBeNull();
  });

  it("passes on a zip of at most 16 MB for a test or a game", () => {
    expect(bridgeAllowsFile("rom_test", 1000, "slammast.zip")).toBe(true);
    expect(bridgeAllowsFile("maker", 1000, "slammast.zip")).toBe(true);
    expect(bridgeAllowsFile("rom", 1000, "slammast.zip")).toBe(false);
    expect(bridgeAllowsFile("maker", 0, "slammast.zip")).toBe(false);
    expect(bridgeAllowsFile("maker", (16 << 20) + 1, "slammast.zip")).toBe(false);
    expect(bridgeAllowsFile("maker", 1000, "evil.exe")).toBe(false);
  });

  it("shows the maker only the answers it asked for", () => {
    for (const type of ["upload_result", "rom_test_result", "room_created", "room_error"]) expect(bridgeAllowsReply({ type })).toBe(true);
    for (const type of ["device_status", "auth_ok", "history", "rooms"]) expect(bridgeAllowsReply({ type })).toBe(false);
  });

  it("tags its messages and ignores the rest", () => {
    const m = bridgeEnvelope({ kind: "open_room", roomId: "abc" });
    expect(m.tag).toBe(BRIDGE_TAG);
    expect(bridgeBody(m)?.kind).toBe("open_room");
    expect(bridgeBody({ kind: "open_room" })).toBeNull();
    expect(bridgeBody("x")).toBeNull();
    expect(originOf("https://maker.go-link.org/a?b")).toBe("https://maker.go-link.org");
    expect(originOf("not a url")).toBeNull();
  });
});
