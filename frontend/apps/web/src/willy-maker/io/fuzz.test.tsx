// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Hard inputs (validation.md, "Hard inputs"): seeded random files and edit
// sequences. Every bad input must end as an InputError the UI translates,
// never as another exception, and a project that loads must be usable by
// the rest of the module (review, exports, the engine).

import { beforeEach, describe, expect, it } from "vitest";
import { cloneProject, CELL, InputError, INPUT_ERRORS, inputErrorText, layerGrid, migrateProject, newProject, objectLayer, type Level, type Project, type TagLayer, type TileLayer } from "../model";
import { applyFix, boardTitle, checkText, NAME_RE, reviewProject, titleProblems, type FixId } from "../editor/validate";
import { EXTRA_RULES } from "../editor/validate/extra";
import { CPS1 } from "../board/cps1";
import { EditorStore } from "../editor/store";
import { deleteObject, placePart, Stroke, updateObject } from "../editor/ops";
import { PARTS } from "../editor/parts";
import { projectFromTemplate } from "../templates";
import { Game, levelFromProject } from "../engine";
import { coreEn } from "../i18n/core.en";
import { coreEs } from "../i18n/core.es";
import { corePt } from "../i18n/core.pt";
import { exportEn } from "../i18n/export.en";
import { aiPackName, buildPrompt } from "./aiPack";
import { exportProjectZip, importProjectZip, zipName } from "./projectZip";
import { levelFromTiled } from "./tiled";
import { levelToTiled } from "./tiledExport";
import { assetsPersistent, putAsset, resetAssetCacheForTests } from "./assets";
import { saveProject, loadProject } from "./storage";
import { encodePng } from "./png";
import { writeZip, readZip } from "./zip";
import { checkSheetFile, checkSheetImage, imageSize, SHEET_MAX_BYTES } from "../sprites/sheetInput";
import { keyBackground } from "../sprites/detect";

/** A small seeded random generator (mulberry32), so a failure can be replayed. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!,
  };
}
type Rng = ReturnType<typeof rng>;

/** Every language translates every input error into a sentence. */
function translated(e: unknown): string[] {
  return [coreEn, coreEs, corePt].map((t) => inputErrorText(t.inputErrors, e));
}

/** A loaded project must work everywhere: review, exports, Tiled, the engine. */
function usable(p: Project): void {
  const r = reviewProject(p, { extra: EXTRA_RULES });
  for (const c of r.checks) expect(checkText(exportEn, c)).not.toMatch(/undefined|NaN/);
  buildPrompt(p, r);
  for (const level of p.levels) {
    for (const layer of level.layers) if (layer.kind !== "objects") layerGrid(level, layer).cells.length;
    levelToTiled(level, p, { collisionTileset: "c.png" });
    const g = new Game(levelFromProject(level));
    for (let f = 0; f < 5; f++) g.step([0]);
  }
}

/** Replaces one random part of a JSON tree with a random value. */
function mutate(v: unknown, r: Rng, depth = 0): unknown {
  const wild = () =>
    r.pick<unknown>([null, 0, -1, 1e12, -1e12, 3.5, "", "x", "😀", "ـــ", "‮", true, false, [], {}, [1, "a", null], { a: { b: [] } }, "rle:9*999999", Number.MAX_SAFE_INTEGER]);
  if (depth > 0 && r.next() < 0.15) return wild();
  if (Array.isArray(v)) {
    if (!v.length) return r.next() < 0.5 ? [wild()] : v;
    const out = [...v];
    const i = r.int(out.length);
    if (r.next() < 0.1) out.splice(i, 1);
    else out[i] = mutate(out[i], r, depth + 1);
    return out;
  }
  if (v && typeof v === "object") {
    const out = { ...(v as Record<string, unknown>) };
    const keys = Object.keys(out);
    if (!keys.length) return out;
    const k = r.pick(keys);
    if (r.next() < 0.1) delete out[k];
    else out[k] = mutate(out[k], r, depth + 1);
    return out;
  }
  return wild();
}

beforeEach(() => {
  window.localStorage.clear();
  resetAssetCacheForTests();
});

describe("hard inputs: the input errors", () => {
  it("has a sentence for every code in every language", () => {
    for (const code of INPUT_ERRORS) for (const text of translated(new InputError(code, { name: "a.png", method: 99, format: 3, max: 2, cell: 16, w: 32, h: 32, maxW: 1, maxH: 1, mb: 40 }))) expect(text, code).not.toMatch(/undefined|\{|\}/);
    // anything else is "the file could not be read"
    expect(translated(new TypeError("boom"))).toEqual([coreEn.inputErrors.unknown(), coreEs.inputErrors.unknown(), corePt.inputErrors.unknown()]);
  });
});

describe("hard inputs: project .zip", { timeout: 60000 }, () => {
  it("survives random damage to a real project .zip", async () => {
    const p = projectFromTemplate("buenos-aires", { title: "Dead Air", layout: "slammast", players: 2 });
    const good = await exportProjectZip(p, { thumbnails: { "level-1": encodePng(2, 2, new Uint8Array(16)) } });
    const r = rng(1);
    const seen = new Set<string>();
    for (let i = 0; i < 150; i++) {
      const bad = good.slice(0, r.next() < 0.3 ? r.int(good.length) : good.length);
      for (let k = 1 + r.int(4); k > 0; k--) if (bad.length) bad[r.int(bad.length)] = r.int(256);
      try {
        usable((await importProjectZip(bad)).project);
        seen.add("ok");
      } catch (e) {
        expect(e, `run ${i}: ${(e as Error)?.stack}`).toBeInstanceOf(InputError);
        seen.add((e as InputError).code);
      }
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it("refuses a picture that does not match its hash, and nothing else is imported", async () => {
    const p = newProject({ title: "A" });
    const png = encodePng(16, 16, new Uint8Array(1024));
    p.tilesets.push({ id: "t", tile: 16, image: await putAsset(png), palettes: [], columns: 1, count: 1 });
    const zip = await exportProjectZip(p);
    const files = await readZip(zip);
    const name = [...files.keys()].find((n) => n.startsWith("assets/"))!;
    files.set(name, encodePng(16, 16, new Uint8Array(1024).fill(255)));
    const forged = await writeZip([...files].map(([n, data]) => ({ name: n, data })));
    const e = await importProjectZip(forged).catch((x) => x);
    expect(e).toBeInstanceOf(InputError);
    expect(e.code).toBe("project.hash");
    expect(loadProject(p.id)).toBeNull();
  });

  it("refuses huge sizes before it fills the memory", async () => {
    // a zip whose directory claims a 1 GB file
    const zip = await writeZip([{ name: "project.json", data: new TextEncoder().encode("{}") }], { compress: false });
    const view = new DataView(zip.buffer);
    const cd = view.getUint32(zip.length - 22 + 16, true);
    view.setUint32(cd + 24, 1 << 30, true);
    await expect(importProjectZip(zip)).rejects.toMatchObject({ code: "zip.too-big" });
    // a project asking for a level a billion pixels wide, or a thousand levels
    const big = newProject({ title: "Big" });
    big.levels[0]!.size = { w: 1e9, h: 224 };
    expect(() => migrateProject(JSON.parse(JSON.stringify(big)))).toThrow(InputError);
    const many = newProject({ title: "Many" });
    many.levels = Array.from({ length: 1000 }, (_, i) => ({ ...many.levels[0]!, id: `l${i}` }));
    expect(() => migrateProject(JSON.parse(JSON.stringify(many)))).toThrow(/project.too-big/);
  });

  it("says which format a newer editor made, and refuses what is not a project", async () => {
    const p = newProject({ title: "Future" });
    const future = { ...JSON.parse(JSON.stringify(p)), format: 7 };
    const zip = await writeZip([{ name: "project.json", data: new TextEncoder().encode(JSON.stringify(future)) }]);
    const e = await importProjectZip(zip).catch((x) => x);
    expect(e).toMatchObject({ code: "project.newer", params: { format: 7, max: 2 } });
    expect(translated(e)[0]).toMatch(/format 7; this one reads up to 2/);
    for (const raw of [null, 3, "x", [], { format: "2", id: "a", levels: [] }, { format: 2, levels: [] }, { format: 2, id: "a" }, { format: 0.5, id: "a", levels: [] }])
      expect(() => migrateProject(raw)).toThrow(InputError);
    const notJson = await writeZip([{ name: "project.json", data: new TextEncoder().encode("{not json") }]);
    await expect(importProjectZip(notJson)).rejects.toMatchObject({ code: "project.json" });
    await expect(importProjectZip(await writeZip([{ name: "x.txt", data: new Uint8Array(3) }]))).rejects.toMatchObject({ code: "project.missing" });
  });

  it("brings a format 1 project up to date", () => {
    const p = JSON.parse(JSON.stringify(newProject({ title: "Old", players: 2 })));
    p.format = 1;
    delete p.settings.playerSlots;
    delete p.settings.actionLabels;
    delete p.settings.runTapMs;
    delete p.settings.credits;
    p.settings.menus = { title: { blocks: [{ kind: "text", x: 1, y: 2, text: "HI" }] } };
    const back = migrateProject(p);
    expect(back.format).toBe(2);
    expect(back.settings.playerSlots).toHaveLength(4);
    expect(back.settings.menus.title.blocks).toEqual([{ kind: "text", x: 1, y: 2, text: "HI" }]);
    expect(back.settings.menus.gameOver).toBeDefined();
    expect(reviewProject(back).ready).toBe(true);
    usable(back);
  });

  it("loads any mutation of a project.json as an error or as a usable project", () => {
    const start = JSON.parse(JSON.stringify(projectFromTemplate("buenos-aires", { title: "Dead Air", layout: "captcomm", players: 4 })));
    start.characters = [
      {
        id: "willy",
        name: "Willy",
        role: "hero",
        height: 44,
        sheet: null,
        frames: [{ id: "f1", x: 0, y: 0, w: 32, h: 44, px: 16, py: 43, zones: [], muzzle: null, hand: null }],
        anims: { idle: { frames: ["f1"], fps: 6, loop: true } },
        swapColors: ["#112233"],
      },
    ];
    const r = rng(7);
    let loaded = 0;
    for (let i = 0; i < 300; i++) {
      let raw: unknown = start;
      for (let k = 1 + r.int(3); k > 0; k--) raw = mutate(raw, r);
      let p: Project;
      try {
        p = migrateProject(JSON.parse(JSON.stringify(raw)));
      } catch (e) {
        expect(e, `run ${i}`).toBeInstanceOf(InputError);
        continue;
      }
      try {
        usable(p);
      } catch (e) {
        throw new Error(`run ${i}: a loaded project broke the module: ${(e as Error).stack}\n${JSON.stringify(raw).slice(0, 400)}`);
      }
      loaded++;
    }
    expect(loaded).toBeGreaterThan(100);
  });
});

describe("hard inputs: Tiled maps", () => {
  it("reads any damaged map as a level or as an InputError", () => {
    const p = newProject({ title: "A" });
    const good = JSON.stringify(levelToTiled(p.levels[0]!, p, { collisionTileset: "c.png" }));
    const r = rng(3);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      let text: string;
      const mode = r.int(4);
      if (mode === 0) text = good.slice(0, r.int(good.length));
      else if (mode === 1) text = JSON.stringify(mutate(JSON.parse(good), r));
      else if (mode === 2) text = Array.from({ length: r.int(200) }, () => String.fromCharCode(r.int(0x3000))).join("");
      else text = JSON.stringify(mutate(mutate(JSON.parse(good), r), r));
      try {
        const level: Level = levelFromTiled(text, `map ${i}.tmj`);
        for (const o of objectLayer(level).items) expect(Number.isFinite(o.x) && Number.isFinite(o.y)).toBe(true);
        usable(newProject({ title: "T", levels: [level] }));
        seen.add("ok");
      } catch (e) {
        expect(e, `run ${i}: ${(e as Error)?.stack}`).toBeInstanceOf(InputError);
        seen.add((e as InputError).code);
      }
    }
    expect(seen.has("ok")).toBe(true);
    expect(seen.has("tiled.not-map")).toBe(true);
  });
  it("names the grid and the size it refuses", () => {
    const map = (over: object) => JSON.stringify({ width: 10, height: 10, tilewidth: 16, tileheight: 16, layers: [], ...over });
    expect(() => levelFromTiled(map({ tilewidth: 32, tileheight: 32 }), "a.tmj")).toThrow(expect.objectContaining({ code: "tiled.grid", params: { cell: 16, w: 32, h: 32 } }));
    expect(() => levelFromTiled(map({ width: 5000 }), "a.tmj")).toThrow(expect.objectContaining({ code: "tiled.too-big" }));
    expect(() => levelFromTiled(map({ width: -3 }), "a.tmj")).toThrow(expect.objectContaining({ code: "tiled.not-map" }));
  });
});

describe("hard inputs: sprite sheets", () => {
  const png = (w: number, h: number) => {
    const b = encodePng(1, 1, new Uint8Array(4));
    const v = new DataView(b.buffer);
    v.setUint32(16, w);
    v.setUint32(20, h);
    return b;
  };
  it("reads the size from the file before the browser opens it", () => {
    expect(imageSize(png(640, 480))).toEqual({ w: 640, h: 480 });
    expect(imageSize(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x00, 0x10, 0x00]))).toEqual({ w: 32, h: 16 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x01, 0x00, 0x02, 0x00, 3, 0, 0, 0, 0, 0, 0]);
    expect(imageSize(jpeg)).toEqual({ w: 512, h: 256 });
    const webp = new Uint8Array(30);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
    webp.set([99, 0, 0, 49, 0, 0], 24);
    expect(imageSize(webp)).toEqual({ w: 100, h: 50 });
  });
  it("refuses huge, tiny, empty and non-picture files with their reason", () => {
    expect(() => checkSheetFile(png(100000, 100000), "image/png")).toThrow(expect.objectContaining({ code: "image.too-big" }));
    expect(() => checkSheetFile(png(8192, 8192), "image/png")).toThrow(expect.objectContaining({ code: "image.too-big" }));
    expect(() => checkSheetFile(png(1, 1), "image/png")).toThrow(expect.objectContaining({ code: "image.too-small", params: { w: 1, h: 1 } }));
    expect(() => checkSheetFile(new TextEncoder().encode("hello"), "text/plain")).toThrow(expect.objectContaining({ code: "image.not-image" }));
    expect(() => checkSheetFile(new Uint8Array(40), "image/png")).toThrow(expect.objectContaining({ code: "image.unreadable" }));
    expect(() => checkSheetFile(new Uint8Array(SHEET_MAX_BYTES + 1), "image/png")).toThrow(expect.objectContaining({ code: "file.too-big" }));
    expect(checkSheetFile(png(256, 64), "")).toBe("image/png");
    // transparent everywhere, or one flat color: nothing to cut
    for (const fill of [[0, 0, 0, 0], [255, 0, 255, 255], [30, 60, 90, 255]]) {
      const data = new Uint8ClampedArray(64 * 64 * 4);
      for (let i = 0; i < data.length; i += 4) data.set(fill, i);
      const img = { w: 64, h: 64, data };
      expect(() => checkSheetImage(img, keyBackground(img, { tolerance: 24 }))).toThrow(expect.objectContaining({ code: "image.empty" }));
    }
    const r = rng(11);
    for (let i = 0; i < 200; i++) {
      const bytes = new Uint8Array(r.int(64)).map(() => r.int(256));
      try {
        checkSheetFile(bytes, r.pick(["", "image/png", "application/zip"]));
      } catch (e) {
        expect(e).toBeInstanceOf(InputError);
      }
    }
  });
});

describe("hard inputs: names", () => {
  const odd = ["Zoë 😀 Über", "‮evil", "á́́", "名前", "‮", "\ud800", " ", "", "x".repeat(500), "<script>", "../../etc", "Ñandú ⚔︎", "\u0000\u0007", "فارسی"];
  it("turns any title into one the board can draw, and any file name into a safe one", () => {
    for (const t of odd) {
      const fixed = boardTitle(t, CPS1);
      expect(titleProblems(fixed, CPS1)).toEqual({ length: false, chars: [] });
      const p = newProject({ title: t });
      expect(zipName(p)).toMatch(/^[a-z0-9-]+\.willy\.zip$/);
      expect(aiPackName(p)).toMatch(/^[a-z0-9-]+\.ai-pack\.zip$/);
      const review = reviewProject(p);
      if (!review.ready) {
        applyFix(p, "title");
        expect(reviewProject(p).checks.find((c) => c.id === "game.title")?.severity).toBe("ok");
      }
    }
  });
  it("turns any object name into a valid, unique one", () => {
    const p = newProject({ title: "A" });
    const items = objectLayer(p.levels[0]!).items;
    for (const n of odd) items.push({ name: n, type: "checkpoint", x: 64, y: 192 });
    applyFix(p, "names");
    const names = items.map((o) => o.name);
    for (const n of names) expect(n).toMatch(NAME_RE);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("hard inputs: editor commands", () => {
  /** The project as JSON, without the time of the last change. */
  const snapshot = (p: Project) => JSON.stringify({ ...p, updatedAt: "" });

  it("undoes any sequence of edits back to the start", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = rng(seed);
      const p = projectFromTemplate(seed % 2 ? "buenos-aires" : "empty", { title: "Dead Air", layout: "slammast", players: 2 });
      const store = new EditorStore(p);
      const start = snapshot(store.project);
      const levelId = p.levels[0]!.id;
      const fixes: FixId[] = ["snap-colors", "buttons", "players", "level-order", "title", "names", "tile-range", "pivots"];
      let steps = 0;
      for (let i = 0; i < 120; i++) {
        const level = store.level(levelId)!;
        const kind = r.int(9);
        if (kind <= 2) {
          const layer = r.pick(level.layers.filter((l): l is TileLayer | TagLayer => l.kind !== "objects"));
          const grid = layerGrid(level, layer);
          const stroke = new Stroke(store, levelId, layer.id, r.int(layer.kind === "tags" ? 8 : 20), r.next() < 0.5, "paint");
          const c = r.int(grid.cols);
          const row = r.int(grid.rows);
          stroke.paint(c, row, c + r.int(4) - 2, row + r.int(4) - 2);
          stroke.end();
        } else if (kind === 3) placePart(store, levelId, r.pick(PARTS), r.int(level.size.w), r.int(level.size.h), r.next() < 0.5, "place");
        else if (kind === 4) {
          const o = r.pick(objectLayer(level).items);
          if (o) updateObject(store, levelId, o.name, { x: r.int(level.size.w), y: Math.floor(r.int(level.size.h) / CELL) * CELL }, "move");
        } else if (kind === 5) {
          const o = r.pick(objectLayer(level).items);
          if (o) deleteObject(store, levelId, o.name, "delete");
        } else if (kind === 6) store.editSettings("players", (s) => void (s.players = 1 + r.int(6)), r.next() < 0.5 ? "players" : undefined);
        else if (kind === 7) store.editProject("fix", (q) => void applyFix(q, r.pick(fixes)));
        else if (r.next() < 0.5) store.undo();
        else store.redo();
        steps++;
      }
      expect(steps).toBe(120);
      while (store.undo());
      expect(snapshot(store.project), `seed ${seed}`).toBe(start);
      // and redo all comes back to a project the review still reads
      while (store.redo());
      reviewProject(store.project, { extra: EXTRA_RULES });
      expect(cloneProject(store.project)).toBeTruthy();
    }
  });
});

describe("hard inputs: storage that is full", () => {
  it("reports a full localStorage and keeps the last good save", () => {
    const p = newProject({ title: "Saved" });
    expect(saveProject(p).ok).toBe(true);
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    try {
      p.title = "Changed";
      expect(saveProject(p)).toEqual({ ok: false, reason: "full" });
    } finally {
      Storage.prototype.setItem = setItem;
    }
    expect(loadProject(p.id)?.title).toBe("Saved");
  });

  it("notices pictures IndexedDB could not keep", async () => {
    // an IndexedDB whose writes fail when they commit (a full disk)
    const fake = {
      open() {
        const req: Record<string, unknown> = {};
        const db = {
          objectStoreNames: { contains: () => true },
          transaction() {
            const t: Record<string, unknown> = {};
            t.objectStore = () => ({
              put() {
                const r: Record<string, unknown> = {};
                setTimeout(() => {
                  (r.onsuccess as (() => void) | undefined)?.();
                  (t.onabort as (() => void) | undefined)?.();
                });
                return r;
              },
            });
            return t;
          },
        };
        setTimeout(() => {
          req.result = db;
          (req.onsuccess as () => void)();
        });
        return req;
      },
    };
    const had = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", { value: fake, configurable: true });
    try {
      resetAssetCacheForTests();
      expect(await assetsPersistent()).toBe(true);
      await putAsset(encodePng(1, 1, new Uint8Array(4)));
      expect(await assetsPersistent()).toBe(false);
    } finally {
      if (had) Object.defineProperty(globalThis, "indexedDB", had);
      else delete (globalThis as { indexedDB?: unknown }).indexedDB;
      resetAssetCacheForTests();
    }
  });
});
