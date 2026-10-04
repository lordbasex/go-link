// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Plays a game made in Willy Maker on the owner's linked go-link in one
// step: the ROM goes to the device's own Willy Maker folder (files channel,
// purpose "maker", never the host's ROM folder), then the device opens the
// room of that game (create_room with rom MAKER_ROM), replacing the room of
// the game sent before, and answers room_created with the room to open.

import { ROM_TEST_MAX_SIZE, type DeviceMessages, type RomTestLink } from "./rom-test";

/** The device's name for the Willy Maker game (services.MakerRom). */
export const MAKER_ROM = "@maker";

/** What the room shows of the game: its name, players and the buttons its genre uses. */
export interface MakerGameInfo {
  title: string;
  players: number;
  labels: string[];
}

export interface MakerPlayOptions {
  onUpload?: (sent: number, total: number) => void;
  /** Gives up waiting after this long (default 120 s: the game loads before the room opens). */
  timeoutMs?: number;
}

/** The room the device opened, or why it could not. */
export interface MakerPlayResult {
  roomId: string;
  id: string;
}

/** A device's refusal, with its translatable code (deviceErrorText) when it has one. */
export class MakerPlayError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly limit?: number,
  ) {
    super(message);
  }
}

/**
 * Sends the game and opens its room. Rejects when the upload is refused,
 * the device cannot open the room or does not answer in time.
 */
export async function playMakerGame(link: RomTestLink, onMessage: DeviceMessages, zip: Blob, info: MakerGameInfo, opts: MakerPlayOptions = {}): Promise<MakerPlayResult> {
  if (zip.size <= 0 || zip.size > ROM_TEST_MAX_SIZE) throw new MakerPlayError("a Willy Maker game is a zip of at most 16 MB");
  const id = `wm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let unsubscribe = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let uploaded!: (ok: boolean, error?: string) => void;
    let opened!: (r: MakerPlayResult) => void;
    let refused!: (e: MakerPlayError) => void;
    let asked = false;
    const upload = new Promise<void>((resolve, reject) => {
      uploaded = (ok, error) => (ok ? resolve() : reject(new MakerPlayError(error || "the device refused the game")));
    });
    const room = new Promise<MakerPlayResult>((resolve, reject) => {
      opened = resolve;
      refused = reject;
    });
    unsubscribe = onMessage((msg) => {
      const m = msg as { type?: string; id?: string; ok?: boolean; error?: string; room_id?: string; rom?: string; code?: string; limit?: number };
      if (m?.type === "upload_result" && m.id === id) uploaded(m.ok === true, m.error);
      if (!asked || m?.rom !== MAKER_ROM) return;
      if (m.type === "room_created" && m.room_id) opened({ roomId: m.room_id, id: m.id ?? "" });
      if (m.type === "room_error") refused(new MakerPlayError(m.error || "the device could not open the room", m.code, m.limit));
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new MakerPlayError("the device did not answer in time")), opts.timeoutMs ?? 120_000);
    });
    await Promise.race([link.sendFile(id, zip, "slammast.zip", opts.onUpload, "maker").then(() => upload), timeout]);
    asked = true;
    link.sendControl({ type: "create_room", rom: MAKER_ROM, title: info.title, public: false, voice: true, chat: true, maker: info });
    return await Promise.race([room, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    unsubscribe();
  }
}
