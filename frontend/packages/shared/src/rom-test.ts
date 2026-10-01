// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// The ROM test (validation level 4, docs/willy-maker/validation.md): the
// owner's linked browser sends a set to its own go-link device, which
// powers it on with the exact mame2003-plus core in a worker process and
// answers with a checklist. Only the linked owner can do it (the files
// channel and these control messages are the owner's only).
//
//   files   begin {id, name: "<set>.zip", size, purpose: "rom_test"}, chunks, end
//   control upload_result {id, ok}
//   control rom_test {id, set, frames?}  ->  rom_test_result {...}

/** One check of the test. */
export interface RomTestStep {
  /**
   * zip, set, identity, core.loaded, core.files, video.picture,
   * video.alive, audio, input.reacts, time.realtime, or core.run (the
   * worker stopped: a crash or the time limit).
   */
  name: string;
  ok: boolean;
  /** One line in English from the device, for the report. */
  detail?: string;
}

/** The device's answer to rom_test. */
export interface RomTestResult {
  id: string;
  set: string;
  ok: boolean;
  steps: RomTestStep[];
  /** Frames the core ran (per run). */
  frames: number;
  seconds: number;
  /** A data: URL of a PNG of the last frame, when the game ran. */
  shot: string | null;
  /** The go-link set the zip is, verified by its files' SHA-256. */
  own: { id: string; title: string } | null;
  /** Why the test did not run (no core, no upload, busy...). */
  error?: string;
  /** "busy": another test is running; "not_found": the set did not arrive. */
  code?: string;
}

/** The control request. frames: 600 to 3600 (default 900). */
export interface RomTestRequest {
  type: "rom_test";
  id: string;
  set: string;
  frames?: number;
}

/** Reads a rom_test_result message; null for anything else. */
export function parseRomTestResult(msg: unknown): RomTestResult | null {
  if (typeof msg !== "object" || msg === null) return null;
  const m = msg as Record<string, unknown>;
  if (m.type !== "rom_test_result" || typeof m.id !== "string") return null;
  const text = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : undefined);
  const steps = (Array.isArray(m.steps) ? m.steps : []).slice(0, 32).flatMap((s): RomTestStep[] => {
    if (typeof s !== "object" || s === null) return [];
    const o = s as Record<string, unknown>;
    const name = text(o.name, 40);
    return name ? [{ name, ok: o.ok === true, detail: text(o.detail, 300) }] : [];
  });
  const shot = typeof m.shot === "string" && m.shot.length <= 100_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(m.shot) ? `data:image/png;base64,${m.shot}` : null;
  const own = typeof m.own === "object" && m.own !== null ? (m.own as Record<string, unknown>) : null;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  return {
    id: m.id.slice(0, 64),
    set: text(m.set, 16) ?? "",
    ok: m.ok === true && steps.length > 0 && steps.every((s) => s.ok),
    steps,
    frames: num(m.frames),
    seconds: num(m.seconds),
    shot,
    own: own && typeof own.title === "string" ? { id: text(own.id, 40) ?? "", title: own.title.slice(0, 120) } : null,
    error: text(m.error, 300),
    code: text(m.code, 20),
  };
}

/** What the helper needs from the owner's link (HostStream fits). */
export interface RomTestLink {
  sendFile(id: string, file: Blob, name: string, onProgress?: (sent: number, total: number) => void, purpose?: "rom_test"): Promise<void>;
  sendControl(message: unknown): boolean;
}

/** Subscribes to the device's control messages; returns the unsubscribe (SignalProvider's onDeviceMessage). */
export type DeviceMessages = (handler: (msg: unknown) => void) => () => void;

export interface RomTestOptions {
  /** Frames to run, 600 to 3600; the device's default is 900. */
  frames?: number;
  onUpload?: (sent: number, total: number) => void;
  /** Gives up waiting after this long (default 90 s: the device stops a test at 60 s). */
  timeoutMs?: number;
}

/** A set for a test: a .zip with a short set name, at most 16 MB. */
export const ROM_TEST_MAX_SIZE = 16 << 20;
const SET_NAME = /^[a-z0-9_]{1,16}$/;

/**
 * Tests a set on the owner's linked go-link device: sends the zip on the
 * files channel with purpose "rom_test", then asks for rom_test and waits
 * for rom_test_result. The device never adds the set to its ROM folder
 * and deletes it after the test. Rejects when the link drops, the upload
 * is refused or the device does not answer in time.
 */
export async function testRomOnDevice(link: RomTestLink, onMessage: DeviceMessages, zip: Blob, set: string, opts: RomTestOptions = {}): Promise<RomTestResult> {
  if (!SET_NAME.test(set)) throw new Error("bad set name");
  if (zip.size <= 0 || zip.size > ROM_TEST_MAX_SIZE) throw new Error("a set for a test must be a zip of at most 16 MB");
  const id = `rt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let unsubscribe = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let uploaded!: (ok: boolean, error?: string) => void;
    let finished!: (r: RomTestResult) => void;
    const upload = new Promise<void>((resolve, reject) => {
      uploaded = (ok, error) => (ok ? resolve() : reject(new Error(error || "the device refused the set")));
    });
    const result = new Promise<RomTestResult>((resolve) => {
      finished = resolve;
    });
    unsubscribe = onMessage((msg) => {
      const m = msg as { type?: string; id?: string; ok?: boolean; error?: string };
      if (m?.type === "upload_result" && m.id === id) uploaded(m.ok === true, m.error);
      const r = parseRomTestResult(msg);
      if (r && r.id === id) finished(r);
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("the device did not answer in time")), opts.timeoutMs ?? 90_000);
    });
    await Promise.race([link.sendFile(id, zip, `${set}.zip`, opts.onUpload, "rom_test").then(() => upload), timeout]);
    const request: RomTestRequest = { type: "rom_test", id, set };
    if (opts.frames) request.frames = opts.frames;
    link.sendControl(request); // kept and sent on open if the channel is reconnecting
    return await Promise.race([result, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    unsubscribe();
  }
}
