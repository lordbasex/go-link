// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Status a device sends to browsers linked with the pairing code, on the
// WebRTC "control" DataChannel (type "device_status").

import { parseRecordingList, type RecordingInfo } from "./recordings";

export interface DeviceHardware {
  /** The computer's name (older devices: absent). */
  hostname?: string;
  os: string;
  arch: string;
  platform: string;
  cpu_model: string;
  cores: number;
  mem_total: number;
}

export interface DeviceUsage {
  cpu_percent: number;
  process_cpu_percent: number;
  mem_used: number;
  process_rss: number;
  /** Whole-machine network traffic, bytes per second (older devices: absent). */
  net_sent_bps?: number;
  net_recv_bps?: number;
}

export interface DeviceRom {
  name: string;
  size: number;
  title?: string;
  year?: string;
  maker?: string;
  /** Which of the host's thumbnails exist for the set. */
  thumbs: { boxart: boolean; title: boolean; snap: boolean };
  /** Whether the core can run the set; absent until the core's game list is on the device. */
  check?: RomCheck;
}

/** Verdict of the device's ROM check, made without running the game. */
export type RomCheckStatus = "ok" | "missing" | "unsupported" | "bios" | "bad_zip";

export interface RomCheck {
  status: RomCheckStatus;
  /** Up to 10 missing file names. */
  missing?: string[];
  /** Parent or BIOS sets (zips) that are not in the folder, e.g. "neogeo". */
  needs?: string[];
  /** "preliminary" or "protection" when MAME's driver is incomplete. */
  driver?: string;
}

const CHECK_STATUSES: readonly RomCheckStatus[] = ["ok", "missing", "unsupported", "bios", "bad_zip"];

/** A set the core can run: checked ok, or not checked yet. */
export function romPlayable(r: DeviceRom): boolean {
  return !r.check || r.check.status === "ok";
}

export interface DeviceLibrary {
  dir: string;
  roms: DeviceRom[];
  /** catalog: the core's game list, used to check ROMs, is installed. */
  core: { name: string; installed: boolean; catalog: boolean; downloading: boolean; error?: string };
  /** Space on the volume that holds the ROM folder, in bytes. */
  disk?: { total: number; free: number };
  /** Folder of the host's own thumbnails on the device. */
  thumbnailsDir: string;
  /** The kind of thumbnail the host chose to show (device Settings). */
  thumbKind: ThumbKind;
  /** Space the host's thumbnail images take, in bytes. */
  thumbnailsBytes: number;
}

/** The kinds of thumbnails (libretro naming). */
export type ThumbKind = "boxart" | "title" | "snap";

/** States of a game room on the device. */
export type ManagedRoomState = "live" | "paused" | "archived" | "trash";

/** A game room the device manages (one game each; several at once). */
export interface ManagedRoom {
  id: string;
  name: string;
  rom: string;
  game: string;
  public: boolean;
  voice: boolean;
  state: ManagedRoomState;
  favorite: boolean;
  /** The signalhub room while the game runs, else "". */
  roomId: string;
  players: number;
  maxPlayers: number;
  spectators: number;
  queue: number;
  since: string;
  deletedAt: string | null;
  saves: { slot: number; name: string; at: string }[];
  autosave: boolean;
  lastError: string;
  /** The emulator does not save this game whole: it always starts from the beginning. */
  noSaves: boolean;
  /**
   * What the host's own browsers send instead of a PIN while the room
   * runs (only the owner sees it). Guests get a PIN per invitation.
   */
  ownerKey: string;
  /** The room's invitation while it runs: for /g/<invite> links and QR codes. */
  invite: string;
  /** Its 9 digit code, to type. */
  inviteCode: string;
  /** The host turned the room's chat off. */
  chatOff: boolean;
  /** The host is recording the game, since recordingSince. */
  recording?: boolean;
  recordingSince?: string;
}

/** Days a deleted room stays in the trash. */
export const TRASH_DAYS = 30;

const ROOM_STATES: readonly ManagedRoomState[] = ["live", "paused", "archived", "trash"];

function parseRooms(v: unknown): ManagedRoom[] {
  if (!Array.isArray(v)) return [];
  const str = (x: unknown, max = 120) => (typeof x === "string" ? x.slice(0, max) : "");
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  return v.slice(0, 200).flatMap((r) => {
    const o = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
    const id = str(o.id, 40);
    const state = ROOM_STATES.find((s) => s === o.state);
    if (!id || !state) return [];
    return [
      {
        id,
        name: str(o.name, 80),
        rom: str(o.rom, 16),
        game: str(o.game, 160) || str(o.rom, 16),
        public: o.public === true,
        voice: o.voice === true,
        state,
        favorite: o.favorite === true,
        roomId: str(o.room_id, 40),
        players: num(o.players),
        maxPlayers: num(o.max_players) || 4,
        spectators: num(o.spectators),
        queue: num(o.queue),
        since: str(o.since, 40),
        deletedAt: typeof o.deleted_at === "string" ? o.deleted_at : null,
        saves: (Array.isArray(o.saves) ? o.saves : []).slice(0, 100).flatMap((x) => {
          const sv = (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>;
          return typeof sv.slot === "number" ? [{ slot: sv.slot, name: str(sv.name, 40), at: str(sv.at, 40) }] : [];
        }),
        autosave: o.autosave === true,
        lastError: str(o.last_error, 300),
        noSaves: o.no_saves === true,
        ownerKey: ownerKeyOf(o.owner_key),
        invite: typeof o.invite === "string" && /^[A-Za-z0-9_-]{22}$/.test(o.invite) ? o.invite : "",
        chatOff: o.chat_off === true,
        inviteCode: typeof o.invite_code === "string" && /^\d{9}$/.test(o.invite_code) ? o.invite_code : "",
        recording: o.recording === true,
        recordingSince: str(o.recording_since, 40),
      },
    ];
  });
}

/** The room the device is running, as its status reports it. */
export interface DeviceRoom {
  room_id: string;
  viewers: number;
  title?: string;
  game?: string;
  public?: boolean;
  players?: number;
  max_players?: number;
  queue?: number;
  spectators?: number;
  /** The test pattern room's invitation and owner key (the owner's browsers only). */
  invite?: string;
  invite_code?: string;
  owner_key?: string;
}

export interface DeviceStatus {
  device_id: string;
  version: string;
  signal_url: string;
  ice_urls: string[];
  roms_dir: string;
  system?: { hardware: DeviceHardware; usage: DeviceUsage; sampled_at: string };
  room?: DeviceRoom;
  library?: DeviceLibrary;
  linked_browsers: number;
  /** Game rooms (besides the test pattern room). */
  rooms: ManagedRoom[];
  /** Space the rooms' saved games take, in bytes. */
  savesBytes: number;
  /** A newer go-link release than the device runs, when there is one. */
  update?: DeviceUpdate;
}

export interface DeviceUpdate {
  latest: string;
  /** Its release page: always one of go-link's releases on GitHub. */
  url: string;
}

const RELEASES = "https://github.com/lordbasex/go-link/releases/";

/** Accepts an update only when it links to go-link's own releases. */
function parseUpdate(u: unknown): DeviceUpdate | undefined {
  if (typeof u !== "object" || u === null) return undefined;
  const { latest, url } = u as Record<string, unknown>;
  if (typeof latest !== "string" || !/^v?\d+\.\d+\.\d+[\w.+-]*$/.test(latest)) return undefined;
  if (typeof url !== "string" || !url.startsWith(RELEASES)) return undefined;
  return { latest, url };
}

/** Returns the status when msg is a device_status message. */
export function parseDeviceStatus(msg: unknown): DeviceStatus | null {
  if (typeof msg !== "object" || msg === null) return null;
  const m = msg as Record<string, unknown>;
  if (m.type !== "device_status" || typeof m.device_id !== "string") return null;
  return {
    device_id: m.device_id,
    version: typeof m.version === "string" ? m.version : "",
    signal_url: typeof m.signal_url === "string" ? m.signal_url : "",
    ice_urls: Array.isArray(m.ice_urls) ? m.ice_urls.filter((u): u is string => typeof u === "string") : [],
    roms_dir: typeof m.roms_dir === "string" ? m.roms_dir : "",
    system: typeof m.system === "object" && m.system !== null ? (m.system as DeviceStatus["system"]) : undefined,
    room: typeof m.room === "object" && m.room !== null ? (m.room as DeviceStatus["room"]) : undefined,
    library: parseLibrary(m.library),
    linked_browsers: typeof m.linked_browsers === "number" ? m.linked_browsers : 0,
    rooms: parseRooms(m.rooms),
    savesBytes: bytesOf(m.saves_bytes),
    update: parseUpdate(m.update),
  };
}

/** A byte count from the device: a finite number, never negative. */
function bytesOf(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

function parseLibrary(v: unknown): DeviceLibrary | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const l = v as Record<string, unknown>;
  const text = (x: unknown, max = 80) => (typeof x === "string" ? x.slice(0, max) : undefined);
  return {
    dir: text(l.dir, 300) ?? "",
    thumbnailsDir: text(l.thumbnails_dir, 300) ?? "",
    thumbKind: l.thumb_kind === "title" || l.thumb_kind === "snap" ? l.thumb_kind : "boxart",
    thumbnailsBytes: bytesOf(l.thumbnails_bytes),
    roms: (Array.isArray(l.roms) ? l.roms : []).slice(0, 5000).flatMap((r) => {
      const o = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
      const name = text(o.name, 16);
      if (!name) return [];
      return [{ name, size: typeof o.size === "number" ? o.size : 0, title: text(o.title, 160), year: text(o.year, 4), maker: text(o.maker), thumbs: parseThumbs(o.thumbs), check: parseCheck(o.check) }];
    }),
    core: (() => {
      const c = (typeof l.core === "object" && l.core !== null ? l.core : {}) as Record<string, unknown>;
      return { name: text(c.name, 40) ?? "", installed: c.installed === true, catalog: c.catalog === true, downloading: c.downloading === true, error: text(c.error, 200) };
    })(),
    disk: (() => {
      const k = (typeof l.disk === "object" && l.disk !== null ? l.disk : {}) as Record<string, unknown>;
      return typeof k.total === "number" && typeof k.free === "number" && k.total > 0 ? { total: k.total, free: Math.min(k.free, k.total) } : undefined;
    })(),
  };
}

/** 1536 MiB -> "1.5 GB"; 300 MiB -> "300 MB". */
export function formatBytes(n: number | undefined): string {
  if (!n) return "–";
  const gb = n / 1024 ** 3;
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return n >= 1024 ** 2 ? `${Math.round(n / 1024 ** 2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function parseCheck(v: unknown): RomCheck | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const c = v as Record<string, unknown>;
  const status = CHECK_STATUSES.find((x) => x === c.status);
  if (!status) return undefined;
  const names = (x: unknown) =>
    Array.isArray(x) ? x.filter((n): n is string => typeof n === "string").slice(0, 10).map((n) => n.slice(0, 40)) : undefined;
  return { status, missing: names(c.missing), needs: names(c.needs), driver: typeof c.driver === "string" ? c.driver.slice(0, 20) : undefined };
}

function parseThumbs(v: unknown): DeviceRom["thumbs"] {
  const t = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  return { boxart: t.boxart === true, title: t.title === true, snap: t.snap === true };
}

/** Why a game session ended. */
export type HistoryReason = "archived" | "deleted" | "failed" | "device_stopped";
const HISTORY_REASONS: readonly HistoryReason[] = ["archived", "deleted", "failed", "device_stopped"];

/** One past game of the device: from the moment a room was turned on to the moment it stopped. */
export interface HistoryItem {
  /** Names the game for delete_history; "" for games saved before ids existed. */
  id?: string;
  roomId: string;
  name: string;
  rom: string;
  game: string;
  startedAt: string;
  endedAt: string;
  peakPlayers: number;
  peakSpectators: number;
  reason: HistoryReason;
  /** Everyone who joined, in order of arrival. */
  people: HistoryPerson[];
  /** Recordings the host made of this game (deleted with it). */
  recordings?: RecordingInfo[];
}

/** One browser in a past game: its name, the ports it played at (none = spectator) and how it connected. */
export interface HistoryPerson {
  name: string;
  ports: number[];
  /** Its address as the device saw it; "" when it came through its own relay. */
  ip: string;
  path: "direct" | "relay" | "";
}

/** Returns the list when msg is the device's "history" reply (newest first). */
export function parseHistory(msg: unknown): HistoryItem[] | null {
  if (typeof msg !== "object" || msg === null) return null;
  const m = msg as Record<string, unknown>;
  if (m.type !== "history" || !Array.isArray(m.items)) return null;
  const str = (x: unknown, max = 120) => (typeof x === "string" ? x.slice(0, max) : "");
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  return m.items.slice(0, 1000).flatMap((e) => {
    const o = (typeof e === "object" && e !== null ? e : {}) as Record<string, unknown>;
    const startedAt = str(o.started_at, 40);
    if (!startedAt) return [];
    return [
      {
        id: typeof o.id === "string" && /^[0-9a-f]{16}$/.test(o.id) ? o.id : "",
        roomId: str(o.room_id, 40),
        name: str(o.name, 80),
        rom: str(o.rom, 16),
        game: str(o.game, 160) || str(o.rom, 16),
        startedAt,
        endedAt: str(o.ended_at, 40),
        peakPlayers: num(o.peak_players),
        peakSpectators: num(o.peak_spectators),
        reason: HISTORY_REASONS.find((r) => r === o.reason) ?? "archived",
        people: (Array.isArray(o.people) ? o.people : []).slice(0, 64).map((x) => {
          const q = (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>;
          return {
            name: str(q.name, 40),
            ports: (Array.isArray(q.ports) ? q.ports : []).filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 4),
            ip: typeof q.ip === "string" && /^[0-9a-fA-F:.]{2,45}$/.test(q.ip) ? q.ip : "",
            path: q.path === "direct" || q.path === "relay" ? q.path : "",
          };
        }),
        recordings: parseRecordingList(o.recordings),
      },
    ];
  });
}

/** A host key or a guest's return token: 43 base64url characters. */
export function ownerKeyOf(v: unknown): string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v) ? v : "";
}

/** A new invitation's PIN, good for one person (the device's "invite_pass"). */
export type InvitePass = { id: string; pin: string; expiresAt: string } | { id: string; error: string };

/** Returns the invitation when msg is the device's "invite_pass" reply. */
export function parseInvitePass(msg: unknown): InvitePass | null {
  if (typeof msg !== "object" || msg === null) return null;
  const m = msg as Record<string, unknown>;
  if (m.type !== "invite_pass" || typeof m.id !== "string") return null;
  const id = m.id.slice(0, 40);
  if (typeof m.pin === "string" && /^\d{6}$/.test(m.pin)) {
    return { id, pin: m.pin, expiresAt: typeof m.expires_at === "string" ? m.expires_at.slice(0, 40) : "" };
  }
  return { id, error: typeof m.error === "string" ? m.error.slice(0, 200) : "unknown error" };
}
