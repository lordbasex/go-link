// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Willy Maker lived on go-link.org before it had its own site, so the games
// made then are in that origin's storage. The bridge tab sends them
// (maker-bridge.ts: import → projects) and this writes them here: projects
// this site does not have yet, their pictures, and the merged list.

import { MAKER_STORAGE_PREFIX } from "@go-link/shared";
import { putAsset } from "./maker/io/assets";
import type { ImportedGames } from "./bridge";

const INDEX = `${MAKER_STORAGE_PREFIX}index`;
const PROJECT = `${MAKER_STORAGE_PREFIX}p.`;

function list(raw: string | null): { id: string }[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(v) ? (v as { id: string }[]).filter((x) => x && typeof x.id === "string") : [];
  } catch {
    return [];
  }
}

/** Writes the games this site does not have yet; returns how many. */
export async function importGames(games: ImportedGames, storage: Storage = window.localStorage): Promise<number> {
  for (const [, value] of games.assets) {
    const v = value as { type?: unknown; bytes?: unknown } | null;
    if (v && v.bytes instanceof Uint8Array) await putAsset(v.bytes, typeof v.type === "string" ? v.type : undefined);
  }
  let added = 0;
  const known = list(storage.getItem(INDEX));
  const ids = new Set(known.map((p) => p.id));
  for (const [key, value] of games.entries) {
    if (!key.startsWith(PROJECT) || storage.getItem(key) !== null) continue;
    storage.setItem(key, value);
    added++;
  }
  const theirs = list(games.entries.find(([k]) => k === INDEX)?.[1] ?? null).filter((p) => !ids.has(p.id) && storage.getItem(`${PROJECT}${p.id}`) !== null);
  storage.setItem(INDEX, JSON.stringify([...known, ...theirs]));
  return added;
}
