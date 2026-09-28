// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The token the device gives a guest on the way into a room, kept per
// room so a reload or a dropped connection gets back in without a new
// invitation. Room ids change with every session of a room, so old tokens
// are useless and only the last few are kept.

const KEY = "go-link.room-passes";
const MAX = 20;

type Passes = Record<string, string>; // room_id -> token

function read(): Passes {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as unknown;
    return typeof v === "object" && v !== null ? (v as Passes) : {};
  } catch {
    return {};
  }
}

function write(passes: Passes): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(passes));
  } catch {
    // storage blocked: the token lasts for this page
  }
}

export function roomPass(roomId: string): string {
  const token = read()[roomId];
  return typeof token === "string" ? token : "";
}

export function saveRoomPass(roomId: string, token: string): void {
  const passes = read();
  delete passes[roomId];
  passes[roomId] = token; // newest last
  const ids = Object.keys(passes);
  ids.slice(0, Math.max(0, ids.length - MAX)).forEach((id) => delete passes[id]);
  write(passes);
}

export function forgetRoomPass(roomId: string): void {
  const passes = read();
  if (!(roomId in passes)) return;
  delete passes[roomId];
  write(passes);
}
