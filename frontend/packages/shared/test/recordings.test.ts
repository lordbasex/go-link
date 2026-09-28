// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import {
  FACTORY_RESET,
  RecordingDownload,
  Sha256,
  parseChat,
  parseFactoryReset,
  parseHistory,
  parseRecordingEvent,
  parseRecordings,
  parseRoomState,
  recordStart,
  sha256,
} from "../src";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

const REC = {
  id: "a1b2/night-2026-09-28-2130.webm",
  room_id: "a1b2",
  room: "Night",
  file: "night-2026-09-28-2130.webm",
  started_at: "2026-09-28T21:30:00Z",
  duration_ms: 1122000,
  size: 225000000,
  sha256: "a".repeat(64),
  tracks: ["video", "game", "voice-p1", "banana"],
  reason: "paused",
};

describe("recordings from the device", () => {
  it("reads the list, dropping anything that is not a recording", () => {
    const r = parseRecordings({ type: "recordings", bytes: 42, items: [REC, { ...REC, id: "../../etc/passwd" }, "x"] });
    expect(r?.bytes).toBe(42);
    expect(r?.items).toEqual([
      {
        id: REC.id,
        roomId: "a1b2",
        room: "Night",
        file: REC.file,
        startedAt: REC.started_at,
        durationMs: 1122000,
        size: 225000000,
        sha256: REC.sha256,
        tracks: ["video", "game", "voice-p1"],
        reason: "paused",
      },
    ]);
    expect(parseRecordings({ type: "history" })).toBeNull();
    expect(parseRecordings({ type: "recordings", items: [], error: "unknown recording", code: "unknown_recording" })).toMatchObject({ code: "unknown_recording" });
  });

  it("tells a saved recording from a lost one", () => {
    expect(parseRecordingEvent({ type: "recording_saved", room: "a1b2", reason: "room_stopped", recording: REC })).toMatchObject({
      type: "recording_saved",
      reason: "room_stopped",
      recording: { id: REC.id },
    });
    expect(parseRecordingEvent({ type: "recording_error", room: "a1b2", reason: "stopped", error: "the recording has no picture" })).toEqual({
      type: "recording_error",
      room: "a1b2",
      reason: "stopped",
      error: "the recording has no picture",
    });
    expect(parseRecordingEvent({ type: "recording_saved", recording: { id: "bad" } })).toBeNull();
  });

  it("keeps recordings with their game in the history", () => {
    const list = parseHistory({ type: "history", items: [{ id: "0123456789abcdef", started_at: "2026-09-28T21:00:00Z", recordings: [REC] }] });
    expect(list?.[0]?.id).toBe("0123456789abcdef");
    expect(list?.[0]?.recordings?.map((r) => r.id)).toEqual([REC.id]);
  });

  it("shows REC to everyone in the room, with a chat line to translate", () => {
    expect(parseRoomState({ type: "room_state", seats: [], recording: true })?.recording).toBe(true);
    expect(parseChat({ type: "chat", system: "The recording stopped", event: "recording_stopped", ts: 1 })).toEqual({
      kind: "system",
      text: "The recording stopped",
      ts: 1,
      event: "recording_stopped",
    });
    expect(parseChat({ type: "chat", system: "P1 is free", event: "nope", ts: 1 })).toEqual({ kind: "system", text: "P1 is free", ts: 1 });
  });

  it("builds the owner's requests", () => {
    expect(recordStart("a1b2")).toEqual({ type: "room_action", id: "a1b2", action: "record_start" });
    expect(FACTORY_RESET).toEqual({ type: "factory_reset", confirm: "factory_reset" });
    expect(parseFactoryReset({ type: "factory_reset_result", ok: true })).toEqual({ ok: true, error: "" });
  });
});

describe("Sha256", () => {
  it("gives the same hash fed in pieces of any size", () => {
    const data = new Uint8Array(10_000).map((_, i) => (i * 7 + 3) & 0xff);
    for (const step of [1, 13, 63, 64, 65, 1000, 10_000]) {
      const h = new Sha256();
      for (let i = 0; i < data.length; i += step) h.update(data.subarray(i, i + step));
      expect(hex(h.digest())).toBe(hex(sha256(data)));
    }
    expect(hex(sha256(new Uint8Array()))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

/** Plays the device's side of a download of file. */
function fakeDevice(file: Uint8Array, opts: { sha?: string; swap?: boolean } = {}) {
  const sent: Record<string, unknown>[] = [];
  let dl: RecordingDownload | null = null;
  const pending: Record<string, unknown>[] = [];
  const serve = (m: Record<string, unknown>) => {
    if (m.type === "download") {
      dl!.handleText(JSON.stringify({ type: "download_ready", id: m.id, file: "x", name: "night.webm", size: file.length, sha256: opts.sha ?? hex(sha256(file)) }));
    } else if (m.type === "read") {
      pending.push(m);
    }
  };
  const flush = () => {
    while (pending.length) {
      let m = pending.shift()!;
      if (opts.swap && pending.length) {
        const other = pending.shift()!;
        pending.unshift(m);
        m = other;
        opts.swap = false;
      }
      const off = m.offset as number;
      const piece = file.subarray(off, off + (m.length as number));
      const out = new Uint8Array(8 + piece.length);
      new DataView(out.buffer).setUint32(4, off);
      out.set(piece, 8);
      dl!.handleBinary(out.buffer);
    }
  };
  return {
    sent,
    bind(d: RecordingDownload) {
      dl = d;
    },
    send(text: string) {
      const m = JSON.parse(text) as Record<string, unknown>;
      sent.push(m);
      serve(m);
    },
    flush,
  };
}

describe("RecordingDownload", () => {
  const file = new Uint8Array(250_000).map((_, i) => (i * 31) & 0xff);

  it("pulls the file piece by piece, a few at a time, and checks it", async () => {
    const dev = fakeDevice(file);
    const progress: number[] = [];
    const d = new RecordingDownload("a1b2/night.webm", { send: dev.send, window: 3, chunk: 10_000, onProgress: (p) => progress.push(p.received) });
    dev.bind(d);
    d.start();
    expect(dev.sent.filter((m) => m.type === "read")).toHaveLength(3); // the window
    for (let i = 0; i < 40; i++) dev.flush();
    const r = await d.result;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const joined = new Uint8Array(r.size);
    let at = 0;
    for (const p of r.parts) {
      joined.set(p, at);
      at += p.length;
    }
    expect(joined).toEqual(file);
    expect(r.name).toBe("night.webm");
    expect(progress.at(-1)).toBe(file.length);
    expect(dev.sent.at(-1)).toEqual({ type: "done", id: d.id });
  });

  it("refuses a damaged file", async () => {
    const dev = fakeDevice(file, { sha: "b".repeat(64) });
    const d = new RecordingDownload("a1b2/night.webm", { send: dev.send });
    dev.bind(d);
    d.start();
    for (let i = 0; i < 20; i++) dev.flush();
    expect(await d.result).toMatchObject({ ok: false, code: "checksum" });
  });

  it("stops when a piece comes out of order", async () => {
    const dev = fakeDevice(file, { swap: true });
    const d = new RecordingDownload("a1b2/night.webm", { send: dev.send, chunk: 10_000 });
    dev.bind(d);
    d.start();
    dev.flush();
    expect(await d.result).toMatchObject({ ok: false, cancelled: false });
  });

  it("can be cancelled, and ignores other messages", async () => {
    const dev = fakeDevice(file);
    const d = new RecordingDownload("a1b2/night.webm", { send: dev.send });
    dev.bind(d);
    d.start();
    expect(d.handleText(JSON.stringify({ type: "upload_result", id: "u" }))).toBe(false);
    expect(d.handleText("not json")).toBe(false);
    d.cancel();
    expect(await d.result).toEqual({ ok: false, cancelled: true, error: "cancelled" });
    expect(dev.sent.at(-1)).toEqual({ type: "cancel", id: d.id });
  });

  it("reports the device's error", async () => {
    const sent: string[] = [];
    const d = new RecordingDownload("a1b2/gone.webm", { send: (t) => sent.push(t) });
    d.start();
    d.handleText(JSON.stringify({ type: "download_error", id: d.id, error: "unknown recording", code: "unknown_recording" }));
    expect(await d.result).toEqual({ ok: false, cancelled: false, error: "unknown recording", code: "unknown_recording" });
  });

  it("reads the values of a seat event, for the web to translate", () => {
    expect(parseChat({ type: "chat", system: "Guest E took seat P2", event: "took_seat", args: { name: "Guest E", port: 2 }, ts: 1 })).toEqual({
      kind: "system",
      text: "Guest E took seat P2",
      ts: 1,
      event: "took_seat",
      args: { name: "Guest E", port: 2, name2: "", port2: 0 },
    });
    // A seat out of range is dropped (0).
    expect(parseChat({ type: "chat", system: "x", event: "seat_free", args: { port: 9 }, ts: 1 })).toMatchObject({ args: { port: 0 } });
  });
});
