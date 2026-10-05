// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The bridge between Willy Maker (its own site, maker.go-link.org) and the
// owner's go-link device. The link to the device lives on the main site
// (go-link.org): its token is in that origin's storage. Willy Maker opens a
// go-link.org tab (/maker-bridge) and talks to it with postMessage; that tab
// passes on only what Willy Maker needs: a ROM test, and opening a Willy
// Maker game's room. Nothing else of the device is reachable from the maker.
//
//   bridge → maker  status {linked, online, name}     the link's state, on every change
//   maker → bridge  control {message}                 rom_test, or create_room for "@maker"
//   maker → bridge  file {req, id, name, purpose, data}  a zip on the files channel
//   bridge → maker  file_progress {req, sent, total} · file_done {req, error?}
//   bridge → maker  device {message}                  upload_result, rom_test_result, room_created, room_error
//   maker → bridge  open_room {roomId}                the bridge tab goes to the room
//   maker → bridge  import                            the games kept on go-link.org (before the split)
//   bridge → maker  projects {entries, assets}

import { MAKER_ROM } from "./maker-play";
import { ROM_TEST_MAX_SIZE } from "./rom-test";

/** Every message of the bridge carries this tag, so stray messages are ignored. */
export const BRIDGE_TAG = "go-link.maker-bridge";

/** The main site's path the maker opens. */
export const BRIDGE_PATH = "/maker-bridge";

/** Willy Maker's storage keys: the project index and one key per project. */
export const MAKER_STORAGE_PREFIX = "go-link.wm.";

/** Where Willy Maker keeps pictures (IndexedDB database and store). */
export const MAKER_ASSET_DB = "go-link-willy-maker";
export const MAKER_ASSET_STORE = "assets";

export interface BridgeStatus {
  kind: "status";
  /** A device is linked to the main site in this browser. */
  linked: boolean;
  /** The device is online and the link is up. */
  online: boolean;
  name?: string;
}

export type MakerToBridge =
  | { kind: "control"; message: unknown }
  | { kind: "file"; req: number; id: string; name: string; purpose: "rom_test" | "maker"; data: ArrayBuffer }
  | { kind: "open_room"; roomId: string }
  | { kind: "import" };

export type BridgeToMaker =
  | BridgeStatus
  | { kind: "file_progress"; req: number; sent: number; total: number }
  | { kind: "file_done"; req: number; error?: string }
  | { kind: "device"; message: unknown }
  | { kind: "projects"; entries: [string, string][]; assets: [string, unknown][] };

/** Wraps a bridge message for postMessage. */
export function bridgeEnvelope<T extends MakerToBridge | BridgeToMaker>(body: T): T & { tag: typeof BRIDGE_TAG } {
  return { ...body, tag: BRIDGE_TAG };
}

/** The body of a bridge message, or null for anything else. */
export function bridgeBody(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return d.tag === BRIDGE_TAG && typeof d.kind === "string" ? d : null;
}

function record(m: unknown): Record<string, unknown> | null {
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : null;
}

const text = (x: unknown, max: number): string | null => (typeof x === "string" && x.length <= max ? x : null);

/**
 * The control message the bridge sends to the device for one from Willy
 * Maker, or null: a ROM test, or a private room for its game ("@maker").
 * Anything else (unlink, settings, other rooms...) never leaves the main
 * site. The message is always built anew from the allowed fields, never
 * passed on: the device reads JSON keys in any case ("TYPE" is "type" to
 * Go), so an extra key would otherwise override the checked one.
 */
export function bridgeControl(message: unknown): Record<string, unknown> | null {
  const m = record(message);
  if (!m) return null;
  if (m.type === "rom_test") {
    const id = text(m.id, 64);
    const set = text(m.set, 16);
    if (!id || !set) return null;
    const out: Record<string, unknown> = { type: "rom_test", id, set };
    if (typeof m.frames === "number" && Number.isInteger(m.frames) && m.frames >= 600 && m.frames <= 3600) out.frames = m.frames;
    return out;
  }
  if (m.type === "create_room" && m.rom === MAKER_ROM && m.public === false) {
    const info = record(m.maker);
    const title = text(m.title, 120) ?? "";
    const room: Record<string, unknown> = { type: "create_room", rom: MAKER_ROM, title, public: false, voice: m.voice === true, chat: m.chat !== false };
    if (info) {
      const players = typeof info.players === "number" && Number.isInteger(info.players) ? Math.max(1, Math.min(4, info.players)) : 1;
      const labels = (Array.isArray(info.labels) ? info.labels : []).slice(0, 8).map((l) => text(l, 24) ?? "");
      room.maker = { title: text(info.title, 120) ?? title, players, labels };
    }
    return room;
  }
  return null;
}

/** Whether the bridge passes this control message on (as bridgeControl rebuilds it). */
export function bridgeAllowsControl(message: unknown): boolean {
  return bridgeControl(message) !== null;
}

/** Whether the bridge passes this file on: a zip for a test or a Willy Maker game, at most 16 MB. */
export function bridgeAllowsFile(purpose: unknown, size: number, name: unknown): boolean {
  return (purpose === "rom_test" || purpose === "maker") && size > 0 && size <= ROM_TEST_MAX_SIZE && typeof name === "string" && /\.zip$/i.test(name);
}

/** The device's answers the maker may see (never its status, hardware or rooms). */
export function bridgeAllowsReply(message: unknown): boolean {
  const m = record(message);
  return !!m && (m.type === "upload_result" || m.type === "rom_test_result" || m.type === "room_created" || m.type === "room_error");
}

/** The origin of a site address ("https://maker.go-link.org/x" → "https://maker.go-link.org"), or null. */
export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
