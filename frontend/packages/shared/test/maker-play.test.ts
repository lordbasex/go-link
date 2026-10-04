// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { MAKER_ROM, playMakerGame } from "../src/maker-play";
import type { RomTestLink } from "../src/rom-test";

// A fake linked device: answers the upload, then create_room.
function device(answer: (m: Record<string, unknown>, deliver: (m: unknown) => void) => void, upload: { ok: boolean; error?: string } = { ok: true }) {
  const handlers = new Set<(m: unknown) => void>();
  const deliver = (m: unknown) => handlers.forEach((h) => h(m));
  const sent: Record<string, unknown>[] = [];
  const uploads: { name: string; purpose?: string }[] = [];
  const link: RomTestLink = {
    async sendFile(id, _file, name, _p, purpose) {
      uploads.push({ name, purpose });
      setTimeout(() => deliver({ type: "upload_result", id, ...upload }), 0);
    },
    sendControl(m) {
      sent.push(m as Record<string, unknown>);
      setTimeout(() => answer(m as Record<string, unknown>, deliver), 0);
      return true;
    },
  };
  const onMessage = (h: (m: unknown) => void) => {
    handlers.add(h);
    return () => handlers.delete(h);
  };
  return { link, onMessage, sent, uploads };
}

const zip = new Blob([new Uint8Array([0x50, 0x4b, 3, 4])]);
const info = { title: "My street", players: 2, labels: ["Punch", "Hop"] };

describe("playMakerGame", () => {
  it("sends the game with purpose maker, opens its room and returns it", async () => {
    const d = device((m, deliver) => {
      // another room's answer first: only the Willy Maker room counts
      deliver({ type: "room_created", id: "x", room_id: "R0", rom: "robby" });
      deliver({ type: "room_created", id: "g1", room_id: "R1", rom: m.rom });
    });
    const room = await playMakerGame(d.link, d.onMessage, zip, info);
    expect(room).toEqual({ roomId: "R1", id: "g1" });
    expect(d.uploads).toEqual([{ name: "slammast.zip", purpose: "maker" }]);
    expect(d.sent[0]).toMatchObject({ type: "create_room", rom: MAKER_ROM, title: "My street", public: false, maker: info });
  });

  it("rejects with the device's reason", async () => {
    const refused = device(() => undefined, { ok: false, error: "unknown upload purpose" });
    await expect(playMakerGame(refused.link, refused.onMessage, zip, info)).rejects.toThrow("unknown upload purpose");
    const full = device((m, deliver) => deliver({ type: "room_error", rom: m.rom, error: "too many rooms", code: "too_many_rooms", limit: 4 }));
    await expect(playMakerGame(full.link, full.onMessage, zip, info)).rejects.toMatchObject({ code: "too_many_rooms", limit: 4 });
  });

  it("gives up when the device does not answer", async () => {
    const quiet = device(() => undefined);
    await expect(playMakerGame(quiet.link, quiet.onMessage, zip, info, { timeoutMs: 30 })).rejects.toThrow("did not answer");
  });
});
