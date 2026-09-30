// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { parseStreamVideo } from "../src/video";

describe("stream_stats video", () => {
  const stats = { type: "stream_stats", fps: 59.9, width: 768, height: 448, aspect: 4 / 3 };
  it("reads a 2x picture with the game's size and quality", () => {
    expect(parseStreamVideo({ ...stats, video: { scale: 2, width: 384, height: 224, quality: "high" } })).toEqual({
      scale: 2,
      width: 384,
      height: 224,
      quality: "high",
      fallback: undefined,
    });
    expect(parseStreamVideo({ ...stats, width: 384, video: { scale: 1, width: 384, height: 224, quality: "saver", fallback: "cpu" } })?.fallback).toBe("cpu");
  });
  it("ignores older devices and broken values", () => {
    expect(parseStreamVideo(stats)).toBeNull();
    expect(parseStreamVideo({ ...stats, video: { scale: 3, width: 384, height: 224 } })).toBeNull();
    expect(parseStreamVideo({ ...stats, video: { scale: 2, width: 0, height: 224 } })).toBeNull();
    expect(parseStreamVideo({ ...stats, video: { scale: 2, width: 1e9, height: 224 } })).toBeNull();
    expect(parseStreamVideo({ type: "room_state", video: { scale: 2, width: 384, height: 224 } })).toBeNull();
    expect(parseStreamVideo({ ...stats, video: { scale: 2, width: 384, height: 224, quality: "4k", fallback: "gpu" } })).toEqual({
      scale: 2,
      width: 384,
      height: 224,
      quality: undefined,
      fallback: undefined,
    });
  });
});
