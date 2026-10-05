// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { beforeEach, describe, expect, it } from "vitest";
import { newProject } from "../model";
import { projectFromTemplate } from "../templates";
import { getAsset, putAsset, refOf, resetAssetCacheForTests } from "./assets";
import { asCopy, exportProjectZip, importProjectZip, zipName } from "./projectZip";
import { autosaver, deleteProject, listProjects, loadProject, saveProject } from "./storage";
import { crc32, readZip, writeZip } from "./zip";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);

beforeEach(() => {
  window.localStorage.clear();
  resetAssetCacheForTests();
});

describe("zip", () => {
  it("knows the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("round-trips stored and deflated files", async () => {
    const big = new TextEncoder().encode("go-link ".repeat(500));
    const zip = await writeZip([
      { name: "a.txt", data: new TextEncoder().encode("hello") },
      { name: "dir/big.txt", data: big },
    ]);
    expect(zip.length).toBeLessThan(big.length);
    const files = await readZip(zip);
    expect(new TextDecoder().decode(files.get("a.txt"))).toBe("hello");
    expect(new TextDecoder().decode(files.get("dir/big.txt"))).toBe("go-link ".repeat(500));
  });
  it("finds a damaged file", async () => {
    const zip = await writeZip([{ name: "a.txt", data: new TextEncoder().encode("hello") }], { compress: false });
    zip[30 + 5] = zip[30 + 5]! ^ 0xff; // the first byte of the data
    await expect(readZip(zip)).rejects.toThrow(/damaged/);
  });
  it("refuses archives over the limits", async () => {
    const zip = await writeZip([{ name: "a.bin", data: new Uint8Array(1000) }]);
    await expect(readZip(zip, { maxEntries: 10, maxEntryBytes: 100, maxTotalBytes: 1000 })).rejects.toThrow(/zip.too-big/);
    await expect(readZip(new Uint8Array(40))).rejects.toThrow(/zip.not-zip/);
  });
});

describe("storage", () => {
  it("saves, lists, loads and deletes projects", async () => {
    const a = newProject({ title: "First" });
    const b = newProject({ title: "Second" });
    b.updatedAt = new Date(Date.now() + 1000).toISOString();
    expect(saveProject(a).ok).toBe(true);
    expect(saveProject(b).ok).toBe(true);
    expect(listProjects().map((p) => p.title)).toEqual(["Second", "First"]);
    expect(loadProject(a.id)?.title).toBe("First");
    await deleteProject(a.id);
    expect(listProjects().map((p) => p.id)).toEqual([b.id]);
    expect(loadProject(a.id)).toBeNull();
  });
  it("reports a full storage instead of throwing", () => {
    const p = newProject({ title: "Big" });
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
    };
    try {
      expect(saveProject(p)).toEqual({ ok: false, reason: "full" });
    } finally {
      Storage.prototype.setItem = orig;
    }
  });
  it("autosaves once after a burst of changes", async () => {
    let saves = 0;
    const a = autosaver(() => saves++, 10);
    a.touch();
    a.touch();
    a.touch();
    await new Promise((r) => setTimeout(r, 30));
    expect(saves).toBe(1);
    a.touch();
    a.flush();
    expect(saves).toBe(2);
  });
});

describe("project zip", () => {
  it("names the file after the title", () => {
    expect(zipName(newProject({ title: "Él Lag: Protocol!" }))).toBe("el-lag-protocol.willy.zip");
  });
  it("round-trips a project with its pictures", async () => {
    const p = projectFromTemplate("buenos-aires", { title: "Trip", layout: "slammast", players: 2 });
    p.tilesets[0]!.image = await putAsset(PNG);
    const zip = await exportProjectZip(p, { thumbnails: { "level-1": PNG } });
    const files = await readZip(zip);
    expect([...files.keys()].sort()).toEqual(["README.txt", `assets/${refOf(PNG).slice(7)}.png`, "project.json", "thumbnails/level-1.png"].sort());
    resetAssetCacheForTests();
    const back = await importProjectZip(zip);
    expect(back.project).toEqual(JSON.parse(JSON.stringify(p)));
    expect(back.assets.map((a) => a.ref)).toEqual([refOf(PNG)]);
    expect(back.missing).toEqual([]);
    expect(await getAsset(refOf(PNG))).toBeNull(); // nothing stored until the user confirms
  });
  it("refuses a picture that does not match its hash", async () => {
    const p = newProject({ title: "Bad" });
    const fake = "0".repeat(64);
    const zip = await writeZip([
      { name: "project.json", data: new TextEncoder().encode(JSON.stringify(p)) },
      { name: `assets/${fake}.png`, data: PNG },
    ]);
    await expect(importProjectZip(zip)).rejects.toThrow(/hash/);
  });
  it("lists pictures the zip lacks", async () => {
    const p = newProject({ title: "Lacks" });
    p.tilesets.push({ id: "t", tile: 16, image: refOf(PNG), palettes: [] });
    const zip = await writeZip([{ name: "project.json", data: new TextEncoder().encode(JSON.stringify(p)) }]);
    expect((await importProjectZip(zip)).missing).toEqual([refOf(PNG)]);
  });
  it("carries a character's original sheet", async () => {
    const p = newProject({ title: "Chars" });
    const sheet = await putAsset(PNG);
    p.characters.push({ id: "willy", name: "Willy", role: "hero", height: 44, sheet: null, frames: [], anims: {}, swapColors: [], source: { sheet } } as never);
    const files = await readZip(await exportProjectZip(p));
    expect(files.has(`assets/${sheet.slice(7)}.png`)).toBe(true);
  });
  it("makes a copy with a new id", () => {
    const p = newProject({ title: "Orig" });
    const c = asCopy(p, "(copy)");
    expect(c.id).not.toBe(p.id);
    expect(c.title).toBe("Orig (copy)");
  });
});
