// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { parseRomsPage } from "../src/device-status";
import { parseRomTestResult, testRomOnDevice, type RomTestLink } from "../src/rom-test";

const passing = {
  type: "rom_test_result",
  id: "t1",
  set: "slammast",
  ok: true,
  steps: [
    { name: "zip", ok: true, detail: "28 files" },
    { name: "video.picture", ok: true, detail: "first picture at frame 9" },
  ],
  frames: 900,
  seconds: 6.5,
  shot: "iVBORw0KGgo=",
  own: { id: "willy-proto", title: "Willy Gorklingo: The Lag Protocol (prototype)" },
};

describe("rom_test_result", () => {
  it("reads the device's checklist", () => {
    const r = parseRomTestResult(passing);
    expect(r?.ok).toBe(true);
    expect(r?.steps).toHaveLength(2);
    expect(r?.shot).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(r?.own?.id).toBe("willy-proto");
  });
  it("is not ok when a step failed, whatever ok says", () => {
    const r = parseRomTestResult({ ...passing, steps: [...passing.steps, { name: "input.reacts", ok: false }] });
    expect(r?.ok).toBe(false);
  });
  it("drops a picture that is not base64 and other messages", () => {
    expect(parseRomTestResult({ ...passing, shot: "javascript:alert(1)" })?.shot).toBeNull();
    expect(parseRomTestResult({ type: "upload_result", id: "t1" })).toBeNull();
    expect(parseRomTestResult({ ...passing, steps: [], ok: true })?.ok).toBe(false);
  });
});

describe("testRomOnDevice", () => {
  it("uploads with purpose rom_test, asks for the test and returns its result", async () => {
    const handlers = new Set<(m: unknown) => void>();
    const sent: unknown[] = [];
    const uploads: { name: string; purpose?: string }[] = [];
    const deliver = (m: unknown) => handlers.forEach((h) => h(m));
    const link: RomTestLink = {
      async sendFile(id, _file, name, _p, purpose) {
        uploads.push({ name, purpose });
        setTimeout(() => deliver({ type: "upload_result", id, ok: true }), 0);
      },
      sendControl(m) {
        sent.push(m);
        const id = (m as { id: string }).id;
        setTimeout(() => {
          deliver({ type: "rom_test_result", id: "someone-else", ok: false, steps: [] });
          deliver({ ...passing, id });
        }, 0);
        return true;
      },
    };
    const r = await testRomOnDevice(link, (h) => {
      handlers.add(h);
      return () => handlers.delete(h);
    }, new Blob(["PK\x03\x04"]), "slammast", { frames: 600 });
    expect(r.ok).toBe(true);
    expect(uploads).toEqual([{ name: "slammast.zip", purpose: "rom_test" }]);
    expect(sent[0]).toMatchObject({ type: "rom_test", set: "slammast", frames: 600 });
    expect(handlers.size).toBe(0);
  });
  it("fails when the device refuses the upload", async () => {
    const handlers = new Set<(m: unknown) => void>();
    const link: RomTestLink = {
      async sendFile(id) {
        setTimeout(() => handlers.forEach((h) => h({ type: "upload_result", id, ok: false, error: "this device cannot test ROMs" })), 0);
      },
      sendControl: () => true,
    };
    await expect(
      testRomOnDevice(link, (h) => {
        handlers.add(h);
        return () => handlers.delete(h);
      }, new Blob(["PK"]), "slammast"),
    ).rejects.toThrow("cannot test ROMs");
  });
  it("refuses a bad set name before sending anything", async () => {
    const link: RomTestLink = { sendFile: async () => {}, sendControl: () => true };
    await expect(testRomOnDevice(link, () => () => {}, new Blob(["PK"]), "../x")).rejects.toThrow("bad set name");
  });
});

describe("own sets in the library", () => {
  it("reads go-link's games with their controls", () => {
    const s = parseRomsPage({
      type: "roms_page",
      req: "r",
      roms: [
          { name: "slammast", size: 60000, title: "Willy", own: true, description: "Ours", controls: { players: 4, buttons: 3, labels: ["Jump", "Fire", "Special"] }, thumbs: { boxart: true } },
          { name: "robby", size: 1, title: "Robby Roto", controls: { players: 9 } },
      ],
    });
    const [own, other] = s!.roms;
    expect(own).toMatchObject({ own: true, description: "Ours", controls: { players: 4, buttons: 3, labels: ["Jump", "Fire", "Special"] } });
    expect(other!.own).toBeUndefined();
    expect(other!.controls).toBeUndefined();
  });
});
