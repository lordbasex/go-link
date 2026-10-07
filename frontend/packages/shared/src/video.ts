// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// How a device sends a game's picture. Game rooms may send it enlarged 2x
// (every game pixel as a 2x2 block, so each keeps its own color); the
// device says so in stream_stats "video", and the picture renderer
// averages each block back to one game pixel before drawing it.

/** The host's video quality for game rooms (device Settings). */
export type VideoQuality = "high" | "normal" | "saver";

export const VIDEO_QUALITIES: readonly VideoQuality[] = ["high", "normal", "saver"];

/** Why a room sends less than the host's choice: "cpu", the computer could not keep up with 2x. */
export type VideoFallback = "cpu";

export function parseVideoQuality(v: unknown): VideoQuality | undefined {
  return VIDEO_QUALITIES.find((q) => q === v);
}

/** stream_stats "video": the picture being sent. */
export interface StreamVideo {
  /** 2 when the frames are the game's picture enlarged 2x, else 1. */
  scale: 1 | 2;
  /** The game's own size in pixels (the frames are scale times larger). */
  width: number;
  height: number;
  /** Game rooms: the quality in use. */
  quality?: VideoQuality;
  /** Set when the quality in use is lower than the host's choice. */
  fallback?: VideoFallback;
}

/** Reads the "video" of a stream_stats message; null when absent or broken. */
export function parseStreamVideo(msg: unknown): StreamVideo | null {
  if (typeof msg !== "object" || msg === null) return null;
  const m = msg as Record<string, unknown>;
  if (m.type !== "stream_stats" || typeof m.video !== "object" || m.video === null) return null;
  const v = m.video as Record<string, unknown>;
  const size = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x > 0 && x <= 4096 ? x : 0);
  const width = size(v.width);
  const height = size(v.height);
  if ((v.scale !== 1 && v.scale !== 2) || !width || !height) return null;
  return {
    scale: v.scale,
    width,
    height,
    quality: parseVideoQuality(v.quality),
    fallback: v.fallback === "cpu" ? "cpu" : undefined,
  };
}

/** A part of the picture in fractions of its size (0 to 1). */
export interface HudRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where each seat's beacon is (P1 first) while the host draws the
 * controllers on the video: stream_stats.hud. Null for any other message;
 * an empty list when they are not drawn.
 */
export function parseHudBeacons(msg: unknown): HudRect[] | null {
  if (typeof msg !== "object" || msg === null) return null;
  const m = msg as Record<string, unknown>;
  if (m.type !== "stream_stats") return null;
  if (!Array.isArray(m.hud)) return [];
  const frac = (x: unknown) => (typeof x === "number" && x >= 0 && x <= 1 ? x : -1);
  const out: HudRect[] = [];
  for (const r of m.hud.slice(0, 4)) {
    const o = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
    const rect = { x: frac(o.x), y: frac(o.y), w: frac(o.w), h: frac(o.h) };
    if (rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.h <= 0 || rect.x + rect.w > 1 || rect.y + rect.h > 1) return [];
    out.push(rect);
  }
  return out;
}

/** The room's video as the owner sees it in device_status rooms[].video. */
export interface RoomVideo {
  quality: VideoQuality;
  fallback?: VideoFallback;
  scale: 1 | 2;
}

export function parseRoomVideo(v: unknown): RoomVideo | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  const quality = parseVideoQuality(o.quality);
  if (!quality) return undefined;
  return { quality, fallback: o.fallback === "cpu" ? "cpu" : undefined, scale: o.scale === 2 ? 2 : 1 };
}
