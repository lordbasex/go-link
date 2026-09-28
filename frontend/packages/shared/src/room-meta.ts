// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Room metadata published by the device in the public directory. For
// signalhub it is opaque JSON; for the web it is untrusted input written by
// any device, so it is validated and bounded before rendering.

export type RoomMode = "coop" | "versus";

export interface RoomMeta {
  title: string;
  game: string;
  host: string;
  players: number;
  maxPlayers: number;
  queue: number;
  spectators: number;
  mode: RoomMode | null;
  /** The host paused the game. */
  paused: boolean;
  /** The game's Boxart as a data: URL (a tiny JPEG), or null. */
  art: string | null;
}

/** A tiny base64 JPEG, at most what fits in signalhub's 4 KB meta. */
function art(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0 || v.length > 4096 || !/^[A-Za-z0-9+/]+={0,2}$/.test(v)) return null;
  return `data:image/jpeg;base64,${v}`;
}

const MAX_TEXT = 80;

function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, MAX_TEXT);
  return t.length > 0 ? t : null;
}

function count(v: unknown, max: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(Math.trunc(v), 0), max) : 0;
}

/** Returns a safe RoomMeta, or null when the required fields are missing. */
export function parseRoomMeta(meta: unknown): RoomMeta | null {
  if (typeof meta !== "object" || meta === null) return null;
  const m = meta as Record<string, unknown>;
  const title = text(m.title);
  const game = text(m.game);
  if (!title || !game) return null;
  const maxPlayers = Math.max(count(m.max_players, 4), 1);
  return {
    title,
    game,
    host: text(m.host) ?? "",
    players: Math.min(count(m.players, 4), maxPlayers),
    maxPlayers,
    queue: count(m.queue, 999),
    spectators: count(m.spectators, 9999),
    mode: m.mode === "coop" || m.mode === "versus" ? m.mode : null,
    paused: m.paused === true,
    art: art(m.art),
  };
}

/** Free seats left in the room. */
export function freeSeats(meta: RoomMeta): number {
  return Math.max(meta.maxPlayers - meta.players, 0);
}
