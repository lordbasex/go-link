// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import { describe, expect, it } from "vitest";
import { Button, DEFAULT_CONTROLS, actionButtons, dpadBits, isTouchDevice, parseRoomState, parseTyping, startButtonCount, startOf } from "../src";

describe("on-screen gamepad", () => {
  it("reads eight directions and ignores the center", () => {
    expect(dpadBits(0.1, 0.1)).toBe(0);
    expect(dpadBits(1, 0)).toBe(Button.Right);
    expect(dpadBits(-1, 0)).toBe(Button.Left);
    expect(dpadBits(0, -1)).toBe(Button.Up);
    expect(dpadBits(0, 1)).toBe(Button.Down);
    expect(dpadBits(0.7, -0.7)).toBe(Button.Up | Button.Right);
    expect(dpadBits(-0.7, 0.7)).toBe(Button.Down | Button.Left);
  });

  it("keeps only the dominant axis on a 4-way joystick", () => {
    expect(dpadBits(0.7, -0.6, true)).toBe(Button.Right);
    expect(dpadBits(0.5, -0.8, true)).toBe(Button.Up);
  });

  it("shows as many action buttons as the game has", () => {
    expect(actionButtons(2)).toEqual([Button.B1, Button.B2]);
    expect(actionButtons(0)).toEqual([]);
    expect(actionButtons(9)).toHaveLength(6);
  });

  it("detects touch screens", () => {
    expect(isTouchDevice({ maxTouchPoints: 5 }, () => false)).toBe(true);
    expect(isTouchDevice({ maxTouchPoints: 0 }, () => false)).toBe(false);
    expect(isTouchDevice({ maxTouchPoints: 0 }, (q) => q === "(any-pointer: coarse)")).toBe(true);
  });

  it("takes the controls from the room state, with a safe default", () => {
    const st = parseRoomState({ type: "room_state", max_players: 2, controls: { buttons: 3, control: "joy4way", players: 2 } });
    expect(st?.controls).toEqual({ players: 2, buttons: 3, control: "joy4way" });
    expect(parseRoomState({ type: "room_state", controls: { players: 9 } })?.controls.players).toBe(4);
    expect(parseRoomState({ type: "room_state", max_players: 2 })?.controls).toEqual(DEFAULT_CONTROLS);
    expect(parseRoomState({ type: "room_state", controls: { buttons: 40 } })?.controls.buttons).toBe(6);
  });
});

describe("lobby room meta", () => {
  it("accepts a tiny base64 Boxart and the pause, and rejects anything else", async () => {
    const { parseRoomMeta } = await import("../src");
    const ok = parseRoomMeta({ title: "T", game: "G", paused: true, art: "AAAA/+9=" });
    expect(ok?.paused).toBe(true);
    expect(ok?.art).toBe("data:image/jpeg;base64,AAAA/+9=");
    expect(parseRoomMeta({ title: "T", game: "G", art: "javascript:alert(1)" })?.art).toBeNull();
    expect(parseRoomMeta({ title: "T", game: "G", art: "A".repeat(5000) })?.art).toBeNull();
    expect(parseRoomMeta({ title: "T", game: "G" })?.paused).toBe(false);
  });

  it("shows one start button per seated player, up to what the game takes", () => {
    expect(startButtonCount(2, 1)).toBe(1);
    expect(startButtonCount(2, 3)).toBe(2);
    expect(startButtonCount(4, 4)).toBe(4);
    expect(startButtonCount(0, 3)).toBe(3); // unknown game
    expect(startButtonCount(1, 0)).toBe(1);
    expect(startOf(2)).toBe(Button.Start2);
    expect(startOf(5)).toBe(0);
  });

  it("reads requests to swap controllers from the room state", () => {
    const st = parseRoomState({
      type: "room_state",
      max_players: 4,
      you: { swap_offers: [{ from: 2, to: 1, name: "Ana" }, { from: 9, to: 1 }], swap_asked: [{ from: 1, to: 1 }] },
    });
    expect(st?.you.swapOffers).toEqual([{ from: 2, to: 1, name: "Ana" }]);
    expect(st?.you.swapAsked).toEqual([]);
  });

  it("reads who is typing", () => {
    expect(parseTyping({ type: "typing", names: [{ name: "Ana", port: 2 }, { name: "" }, { name: "Bob", port: 9 }] })).toEqual([
      { name: "Ana", port: 2 },
      { name: "Bob", port: null },
    ]);
    expect(parseTyping({ type: "chat" })).toBeNull();
  });
});
