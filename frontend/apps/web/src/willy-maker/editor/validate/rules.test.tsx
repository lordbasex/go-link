// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { layerGrid, newLevel, newProject, objectLayer, tagGrid, TAG_NUMBER, type Character, type Level, type Project, type TileLayer } from "../../model";
import { CPS1, type BoardProfile } from "../../board/cps1";
import { projectFromTemplate } from "../../templates";
import type { RgbaImage } from "../../io/png";
import { exportEn } from "../../i18n/export.en";
import { exportEs } from "../../i18n/export.es";
import { exportPt } from "../../i18n/export.pt";
import { leftBehind, reachability, routes } from "../reach";
import { specProject } from "../../rom/specFixture";
import { applyFix, checkText, mergeReview, reviewProject, type Check } from ".";
import { EXTRA_RULES } from "./extra";
import { pictureChecks, reviewPictures, type Pictures } from "./pictures";

const base = () => newProject({ title: "Dead Air", players: 1 });
const has = (p: Project, msg: string) => reviewProject(p).checks.find((c) => c.msg === msg);

function fill(level: Level, c0: number, r0: number, c1: number, r1: number, tag: number) {
  const g = tagGrid(level);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g.set(c, r, tag);
  g.commit();
}

function hero(over: Partial<Character> = {}): Character {
  const frame = (id: string) => ({ id, x: 0, y: 0, w: 32, h: 44, px: 16, py: 43, zones: ["pal-a"], muzzle: null, hand: null });
  return {
    id: "willy",
    name: "Willy",
    role: "hero",
    height: 44,
    sheet: null,
    frames: [frame("idle_0"), frame("walk_0"), frame("jump_0")],
    anims: { idle: { frames: ["idle_0"], fps: 6, loop: true }, walk: { frames: ["walk_0"], fps: 12, loop: true }, jump: { frames: ["jump_0"], fps: 10, loop: false } },
    swapColors: [],
    ...over,
  };
}

/** A level standing on raised ground (row 10) with an 8-row pit at columns 20-22. */
function pitLevel(): Project {
  const level = newLevel({ id: "level-1", name: "Pit", w: 1536, h: 320 });
  fill(level, 0, 10, 95, 17, TAG_NUMBER.solid);
  fill(level, 20, 10, 22, 17, TAG_NUMBER.air);
  const items = objectLayer(level).items;
  items.splice(0, items.length, { name: "p1_start", type: "player_start", x: 32, y: 160, player: 1 }, { name: "exit", type: "exit", x: 1488, y: 160 });
  return newProject({ title: "Pit", players: 1, levels: [level] });
}

/** The exit sits on a walkway at the left, reached only by a ladder at the far right. */
function backtrackLevel(): Project {
  const p = base();
  const level = p.levels[0]!;
  fill(level, 2, 6, 91, 6, TAG_NUMBER.solid);
  fill(level, 92, 6, 92, 11, TAG_NUMBER.ladder);
  const exit = objectLayer(level).items.find((o) => o.type === "exit")!;
  exit.x = 64;
  exit.y = 96;
  return p;
}

/** A picture of w × h; `px(x, y)` gives each pixel's [r, g, b, a]. */
function picture(w: number, h: number, px: (x: number, y: number) => [number, number, number, number]): RgbaImage {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(px(x, y), (y * w + x) * 4);
  return { w, h, data };
}

/** A project whose play layer uses tile 1 of a 16 px tileset along the floor. */
function tiled(img: RgbaImage, count = 1): { p: Project; pics: Pictures } {
  const p = base();
  p.tilesets.push({ id: "ts", tile: 16, image: "sha256:ts", palettes: [], columns: Math.max(1, img.w / 16), count });
  const level = p.levels[0]!;
  const play = level.layers.find((l): l is TileLayer => l.id === "play")!;
  play.tileset = "ts";
  const g = layerGrid(level, play);
  for (let c = 0; c < 10; c++) g.set(c, 12, 1);
  g.commit();
  return { p, pics: new Map([["sha256:ts", img]]) };
}

describe("level 1: routes", () => {
  it("finds a pit nobody can climb out of, and passes the templates", () => {
    const p = pitLevel();
    const c = has(p, "level.trap")!;
    expect(c).toMatchObject({ severity: "warning", target: { tab: "build", level: "level-1" } });
    expect(Number(c.params.x)).toBeGreaterThanOrEqual(320);
    expect(Number(c.params.x)).toBeLessThan(368);
    for (const id of ["buenos-aires", "empty"] as const) {
      const q = projectFromTemplate(id, { title: "A", layout: "slammast", players: 4 });
      expect(reviewProject(q).checks.filter((x) => ["level.trap", "level.camera"].includes(x.id)).map((x) => x.severity)).toEqual(["ok", "ok"]);
    }
  });
  it("finds a route the forward-only camera does not allow", () => {
    const p = backtrackLevel();
    expect(has(p, "level.reachable")).toBeUndefined();
    const c = has(p, "level.camera")!;
    expect(c.severity).toBe("error");
    expect(Number(c.params.x)).toBeGreaterThan(1400);
    p.levels[0]!.camera.forwardOnly = false;
    expect(has(p, "level.camera.ok")).toBeDefined();
  });
  it("lets players go back as far as the engine's camera does", () => {
    // the camera aims a third of a screen ahead and goes back 48 px: a short way back is fine
    const p = base();
    const level = p.levels[0]!;
    fill(level, 30, 6, 41, 6, TAG_NUMBER.solid);
    fill(level, 42, 6, 42, 11, TAG_NUMBER.ladder);
    const exit = objectLayer(level).items.find((o) => o.type === "exit")!;
    exit.x = 30 * 16 + 40;
    exit.y = 96;
    expect(has(p, "level.camera.ok")).toBeDefined();
  });
  it("warns about an enemy the forward-only camera can leave behind (T-01, J-01)", () => {
    // Game Spec v1: skipping the ladder at x 480 leaves the upper dock's trooper behind for ever
    const noreturn = (p: Project) => reviewProject(p).checks.filter((c) => c.id === "level.noreturn");
    const p = specProject();
    const warned = noreturn(p).filter((c) => c.severity === "warning");
    const upper = warned.find((c) => c.params.name === "trooper_upper")!;
    expect(upper).toMatchObject({ msg: "level.noreturn", params: { level: "Dead Air" }, target: { tab: "build", object: "trooper_upper", x: 800, y: 256 } });
    // past the ladder's reach (480 plus the camera's 164 px way back), not before
    expect(Number(upper.params.x)).toBeGreaterThan(600);
    expect(Number(upper.params.x)).toBeLessThan(700);
    // the trooper at the exit stands on the only way there: everyone meets it
    expect(warned.find((c) => c.params.name === "trooper_exit")).toBeUndefined();
    // civilians are only a note: the level still ends
    expect(noreturn(p).find((c) => c.msg === "level.noreturn.civilian")).toMatchObject({ severity: "info" });
    for (const m of [exportEn, exportEs, exportPt]) expect(checkText(m, upper)).toContain("trooper_upper");

    // a camera lock over the branch holds the camera until its enemy is down
    const locked = specProject();
    objectLayer(locked.levels[0]!).items.push({ name: "lock_dock", type: "camera_lock", x: 400, y: 0, w: 480, h: 448 });
    expect(noreturn(locked).find((c) => c.params.name === "trooper_upper")).toBeUndefined();
    // the same lock farther right lets the camera pass the ladder first
    const late = specProject();
    objectLayer(late.levels[0]!).items.push({ name: "lock_late", type: "camera_lock", x: 700, y: 0, w: 400, h: 448 });
    expect(noreturn(late).find((c) => c.params.name === "trooper_upper")?.severity).toBe("warning");
    // the exit does not need the enemies: only notes
    const free = specProject();
    free.settings.rules = { ...free.settings.rules, exitNeedsEnemies: false };
    expect(noreturn(free).filter((c) => c.severity === "warning")).toEqual([]);
    expect(noreturn(free).find((c) => c.severity === "ok")).toBeDefined();
    // the trooper moved onto the main route, past the dock
    const moved = specProject();
    Object.assign(objectLayer(moved.levels[0]!).items.find((o) => o.name === "trooper_upper")!, { x: 1200, y: 416 });
    expect(noreturn(moved).find((c) => c.params.name === "trooper_upper")).toBeUndefined();
    // a camera that may go back anywhere leaves nothing behind
    const open = specProject();
    open.levels[0]!.camera.forwardOnly = false;
    expect(noreturn(open).map((c) => c.severity)).toEqual(["ok"]);
  });
  it("leaves nothing behind on a level with everything on one floor", () => {
    const p = base();
    p.settings.rules = { exitNeedsEnemies: true };
    objectLayer(p.levels[0]!).items.push({ name: "e1", type: "enemy", x: 400, y: 192, kind: "trooper" }, { name: "c1", type: "civilian", x: 900, y: 192, kind: "woman" });
    const level = p.levels[0]!;
    expect(leftBehind(level, reachability(level), objectLayer(level).items)).toEqual([]);
    expect(reviewProject(p).checks.filter((c) => c.id === "level.noreturn")).toMatchObject([{ severity: "ok", msg: "level.noreturn.ok" }]);
  });
  it("compares the timer with the walk to the exit", () => {
    const p = base();
    const r = routes(p.levels[0]!, reachability(p.levels[0]!));
    expect(r.walkFrames).toBeGreaterThan(1000);
    expect(has(p, "level.timer.ok")).toBeUndefined(); // no timer: nothing to say
    p.levels[0]!.timer = 5;
    expect(has(p, "level.timer")).toMatchObject({ severity: "info", params: { timer: 5 } });
    p.levels[0]!.timer = 300;
    expect(has(p, "level.timer.ok")).toBeDefined();
  });
});

describe("level 1: backgrounds and sprites", () => {
  it("keeps every tile layer on its board layer's grid, with a tileset of that size", () => {
    const p = base();
    const play = p.levels[0]!.layers.find((l): l is TileLayer => l.id === "play")!;
    expect(has(p, "gfx.tile-grid.ok")).toBeDefined();
    play.grid = 32;
    expect(has(p, "gfx.tile-grid")).toMatchObject({ severity: "error", params: { size: 16 } });
    play.grid = 16;
    play.tileset = "gone";
    expect(has(p, "gfx.tileset-missing")?.severity).toBe("error");
    p.tilesets.push({ id: "big", tile: 32, image: null, palettes: [], columns: 1, count: 1 });
    play.tileset = "big";
    const g = layerGrid(p.levels[0]!, play);
    g.set(0, 0, 1);
    g.commit();
    expect(has(p, "gfx.tileset-size")?.params).toMatchObject({ tile: 32, size: 16 });
  });
  it("finds tiles past the end of their tileset, and the fix clears them", () => {
    const { p } = tiled(picture(16, 16, () => [0, 0, 0, 255]), 1);
    const level = p.levels[0]!;
    const play = level.layers.find((l): l is TileLayer => l.id === "play")!;
    const g = layerGrid(level, play);
    g.set(3, 3, 7);
    g.commit();
    expect(has(p, "gfx.tile-range")).toMatchObject({ fix: "tile-range", params: { n: 1, max: 1 } });
    expect(applyFix(p, "tile-range")).toBe(true);
    expect(layerGrid(level, play).get(3, 3)).toBe(0);
    expect(layerGrid(level, play).get(0, 12)).toBe(1);
    expect(has(p, "gfx.tile-grid.ok")).toBeDefined();
  });
  it("keeps pivots inside their frames (with a fix) and heights within the art spec", () => {
    const p = base();
    p.palettes.push({ id: "pal-a", group: "sprite", colors: ["#000000"] });
    const ch = hero();
    ch.frames[1]!.px = 90;
    p.characters.push(ch);
    expect(has(p, "anim.pivot-box")).toMatchObject({ severity: "warning", fix: "pivots", target: { tab: "characters", character: "willy" } });
    applyFix(p, "pivots");
    expect(p.characters[0]!.frames[1]!.px).toBe(31);
    expect(has(p, "anim.pivot.ok")).toBeDefined();
    expect(has(p, "anim.size.ok")).toBeDefined();
    for (const f of p.characters[0]!.frames) f.h = 70;
    expect(has(p, "anim.size")?.params).toMatchObject({ h: 70, min: 40, max: 48 });
  });
  it("refuses sprites that would wrap around the 512 px sprite space", () => {
    const p = base();
    p.palettes.push({ id: "pal-a", group: "sprite", colors: ["#000000"] });
    const ch = hero();
    ch.frames[0] = { ...ch.frames[0]!, w: 160, px: 80 };
    p.characters.push(ch);
    expect(has(p, "sprite.wrap")).toMatchObject({ severity: "error", params: { margin: 64, x: 32 }, target: { tab: "build", object: "p1_start" } });
    p.characters[0]!.role = "boss";
    p.characters[0]!.height = 100;
    expect(has(p, "sprite.wrap-character")?.target).toEqual({ tab: "characters", character: "willy" });
    p.characters[0]!.frames[0] = { ...p.characters[0]!.frames[0]!, w: 120, px: 60 };
    expect(has(p, "sprite.wrap.ok")).toBeDefined();
  });
});

describe("level 1: the pictures", () => {
  it("counts the colors of every background tile in board colors", () => {
    // 16 colors in one tile (one channel steps 0, 17, … 255)
    const { p, pics } = tiled(picture(16, 16, (x) => [x * 17, 0, 0, 255]));
    const c = pictureChecks(p, CPS1, pics).find((x) => x.msg === "gfx.tile-colors")!;
    expect(c).toMatchObject({ severity: "error", params: { n: 16, max: 15, x: 0, y: 192, tiles: 10 } });
    expect(c.target).toMatchObject({ tab: "build", level: "level-1" });
    // near colors snap together on the board: 2 colors only
    const near = tiled(picture(16, 16, (x) => [x < 8 ? 16 + (x % 2) : 120, 0, 0, 255]));
    expect(pictureChecks(near.p, CPS1, near.pics).map((x) => x.msg)).toContain("gfx.tile-colors.ok");
  });
  it("counts different tiles per board layer against its budget", () => {
    const { p, pics } = tiled(picture(64, 16, (x, y) => [((x >> 4) * 17) % 256, y * 17, 0, 255]), 4);
    const play = p.levels[0]!.layers.find((l): l is TileLayer => l.id === "play")!;
    const g = layerGrid(p.levels[0]!, play);
    for (let c = 0; c < 4; c++) g.set(c, 5, c + 1);
    g.commit();
    const small: BoardProfile = { ...CPS1, layers: CPS1.layers.map((l) => (l.id === "scroll2" ? { ...l, budget: 4 } : l)) };
    expect(pictureChecks(p, small, pics).find((c) => c.id === "gfx.unique-tiles")).toMatchObject({ severity: "warning", params: { n: 4, max: 4 } });
    const tiny: BoardProfile = { ...CPS1, layers: CPS1.layers.map((l) => (l.id === "scroll2" ? { ...l, budget: 3 } : l)) };
    expect(pictureChecks(p, tiny, pics).find((c) => c.id === "gfx.unique-tiles")?.msg).toBe("gfx.unique-tiles-over");
    expect(pictureChecks(p, CPS1, pics).find((c) => c.id === "gfx.unique-tiles")).toMatchObject({ severity: "ok", params: { layer: "scroll2", n: 4 } });
  });
  it("needs tileset pictures cut on their grid", () => {
    const { p, pics } = tiled(picture(20, 16, () => [0, 0, 0, 255]));
    expect(pictureChecks(p, CPS1, pics).find((c) => c.msg === "gfx.tileset-image")?.params).toMatchObject({ w: 20, h: 16, size: 16 });
  });
  it("counts sprite colors per 16 × 16 cell and checks the feet line", () => {
    const p = base();
    p.palettes.push({ id: "pal-a", group: "sprite", colors: ["#000000"] });
    const ch = hero({ sheet: "sha256:atlas" });
    // frame idle_0 at x 0: 16 colors in its top 16 rows; walk_0 at x 32 stands 5 px higher
    ch.frames = [
      { ...ch.frames[0]!, x: 0, w: 32, h: 44, py: 43 },
      { ...ch.frames[1]!, x: 32, w: 32, h: 44, py: 43 },
      { ...ch.frames[2]!, x: 64, w: 32, h: 44, py: 43 },
    ];
    ch.anims.walk = { frames: ["idle_0", "walk_0"], fps: 12, loop: true };
    p.characters.push(ch);
    const atlas = picture(96, 44, (x, y) => {
      if (x < 32) return y < 16 && x < 16 ? [x * 17, 34, 34, 255] : [0, 0, 0, 255];
      if (x < 64) return y < 39 ? [0, 0, 0, 255] : [0, 0, 0, 0];
      return [0, 0, 0, 255];
    });
    const checks = pictureChecks(p, CPS1, new Map([["sha256:atlas", atlas]]));
    // cells from the feet: rows 12-27 hold the colored rows 12-15 (16 colors) and black
    expect(checks.find((c) => c.msg === "gfx.sprite-colors")).toMatchObject({ params: { frame: "idle_0", n: 17 }, target: { tab: "characters", character: "willy" } });
    expect(checks.find((c) => c.msg === "anim.pivot")).toMatchObject({ severity: "warning", params: { anim: "walk", d: 5 } });
  });
  it("counts sprite cells from the feet, as the ROM cuts them", () => {
    const p = base();
    const ch = hero({ sheet: "sha256:atlas" });
    ch.frames = [{ ...ch.frames[0]!, x: 0, w: 16, h: 44, py: 43 }];
    ch.anims = { idle: { frames: [ch.frames[0]!.id], fps: 6, loop: true } };
    p.characters.push(ch);
    // 12 colors in rows 0-11 and 12 others in rows 12-27: a cell from the top would hold 16 (12 + 4 rows of the next 12)
    const atlas = picture(16, 44, (x, y) => (y < 12 ? [x < 12 ? x * 17 : 0, 0, 0, 255] : y < 28 ? [0, x < 12 ? x * 17 + 17 : 0, 0, 255] : [0, 0, 0, 255]));
    const checks = pictureChecks(p, CPS1, new Map([["sha256:atlas", atlas]]));
    expect(checks.find((c) => c.msg === "gfx.sprite-colors")).toBeUndefined();
  });
  it("joins the picture checks to the review: a failure replaces the rule's ok line", () => {
    const { p, pics } = tiled(picture(20, 16, () => [0, 0, 0, 255]));
    const first = reviewProject(p);
    expect(first.checks.find((c) => c.msg === "gfx.tile-grid.ok")).toBeDefined();
    const merged = mergeReview(first, pictureChecks(p, CPS1, pics));
    expect(merged.checks.find((c) => c.msg === "gfx.tile-grid.ok")).toBeUndefined();
    expect(merged.ready).toBe(false);
    expect(mergeReview(reviewProject(base()), [], true)).toMatchObject({ checking: true, ready: false });
  });
  it("loads the pictures, and stops when the project changes", async () => {
    const { p } = tiled(picture(16, 16, (x) => [x * 17, 0, 0, 255]));
    const png = (await import("../../io/png")).encodePng(16, 16, picture(16, 16, (x) => [x * 17, 0, 0, 255]).data);
    p.tilesets[0]!.image = "sha256:loader-test";
    const loadAsset = async () => ({ bytes: png, type: "image/png" });
    const checks = await reviewPictures(p, CPS1, { loadAsset });
    expect(checks?.find((c) => c.msg === "gfx.tile-colors")).toBeDefined();
    const abort = new AbortController();
    abort.abort();
    expect(await reviewPictures(p, CPS1, { loadAsset, signal: abort.signal })).toBeNull();
  });
});

describe("level 1: every rule of validation.md", () => {
  const doc = readFileSync(resolve(__dirname, "../../../../../../../docs/willy-maker/validation.md"), "utf8");
  const level1 = doc.slice(doc.indexOf("## Level 1"), doc.indexOf("## Level 2"));
  const ids = [...new Set([...level1.matchAll(/^\| `([a-z0-9.-]+)` \|/gm)].map((m) => m[1]!))];
  /** Rules with nothing to check yet: Willy Maker has no sound data (Phase 2). */
  const notApplicable = new Set(["sound.size", "sound.format"]);

  it("has a fixture that makes every rule report", async () => {
    expect(ids.length).toBeGreaterThan(25);
    const seen = new Map<string, Check>();
    const add = (cs: Check[]) => cs.forEach((c) => c.severity !== "ok" && !seen.has(c.id) && seen.set(c.id, c));
    // one broken project per group of rules
    const broken: Project[] = [];
    const a = base();
    a.levels = [];
    a.settings.levels = [];
    a.title = "";
    a.settings.players = 9;
    a.settings.buttons.b2 = "jump";
    a.settings.menus.gameOver.texts = { heading: " " };
    broken.push(a);
    const b = base();
    const items = objectLayer(b.levels[0]!).items;
    items.splice(0, items.length, { name: "e", type: "enemy", x: 40, y: 192 });
    b.levels[0]!.size = { w: 20000, h: 224 };
    for (let i = 0; i < 40; i++) items.push({ name: `boss_${i}`, type: "boss", x: 100, y: 192, kind: "x" });
    broken.push(b);
    const wall = base();
    fill(wall.levels[0]!, 40, 0, 40, 13, TAG_NUMBER.solid);
    broken.push(pitLevel(), backtrackLevel(), wall);
    const c = base();
    c.levels[0]!.timer = 1;
    fill(c.levels[0]!, 20, 3, 25, 3, TAG_NUMBER.solid);
    const play = c.levels[0]!.layers.find((l): l is TileLayer => l.id === "play")!;
    play.grid = 32;
    for (let i = 0; i < 33; i++) c.palettes.push({ id: `pal-${i}`, group: "sprite", colors: Array.from({ length: 16 }, (_, k) => `#${(k * 17).toString(16).padStart(2, "0")}0001`) });
    c.tilesets.push({ id: "huge", tile: 32, image: null, palettes: [], columns: 1, count: 20000 });
    const ch = hero({ anims: { idle: { frames: ["idle_0"], fps: 6, loop: true } } });
    ch.frames[0] = { ...ch.frames[0]!, w: 200, h: 90, px: 300 };
    c.characters.push(ch);
    broken.push(c);
    const d = base();
    objectLayer(d.levels[0]!).items.push({ name: "flame", type: "pickup", x: 100, y: 192, item: "flamethrower" }, { name: "e1", type: "enemy", x: 200, y: 192, kind: "trooper" });
    broken.push(d, specProject());
    for (const p of broken) add(reviewProject(p, { extra: EXTRA_RULES }).checks);
    add(reviewProject(base(), { board: { ...CPS1, rom: { ...CPS1.rom, programBytes: 1024 } } }).checks);
    const pics = tiled(picture(16, 16, (x) => [x * 17, 0, 0, 255]));
    const small: BoardProfile = { ...CPS1, layers: CPS1.layers.map((l) => ({ ...l, budget: 1 })) };
    add(pictureChecks(pics.p, small, pics.pics));
    const feet = base();
    const fh = hero({ sheet: "sha256:a" });
    fh.frames = fh.frames.map((f, i) => ({ ...f, x: i * 32 }));
    fh.anims.walk = { frames: ["idle_0", "walk_0"], fps: 12, loop: true };
    feet.characters.push(fh);
    add(pictureChecks(feet, CPS1, new Map([["sha256:a", picture(96, 44, (x, y) => (x >= 32 && x < 64 && y > 38 ? [0, 0, 0, 0] : [0, 0, 0, 255]))]])));
    const missing = ids.filter((id) => !notApplicable.has(id) && !seen.has(id));
    expect(missing).toEqual([]);
  });

  it("has a message in every language for every check", () => {
    const p = backtrackLevel();
    p.levels[0]!.timer = 1;
    const all = [...reviewProject(p).checks, ...reviewProject(pitLevel()).checks, ...reviewProject(specProject()).checks];
    for (const c of all) {
      if (c.texts) continue;
      for (const m of [exportEn, exportEs, exportPt]) expect(checkText(m, c), c.msg).not.toMatch(/undefined|\{|\}|^[a-z]+\.[a-z.-]+$/);
    }
    // every key of the English messages exists in the others (the shape test covers the rest)
    expect(Object.keys(exportEs.checks).sort()).toEqual(Object.keys(exportEn.checks).sort());
  });
});
