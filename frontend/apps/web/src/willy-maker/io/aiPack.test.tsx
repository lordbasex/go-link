// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { layerGrid, newProject, objectLayer, tagGrid, TAG_NUMBER, type Project, type TileLayer } from "../model";
import { reviewProject } from "../editor/validate";
import * as R from "../engine/rules";
import { aiPackName, buildAiPack, buildPrompt, loadRomDocs } from "./aiPack";
import { decodePng, encodePng } from "./png";
import { exportProjectZip, importProjectZip } from "./projectZip";
import { levelFromTiled } from "./tiled";
import { readZip } from "./zip";

const DOCS = { "rom-README.md": "# rom", "art-spec.md": "# art", "hardware.md": "# hw", "story.md": "# story", "journal.md": "# journal" };

/** A solid picture of w × h in one color. */
function solid(w: number, h: number, rgba: [number, number, number, number]): Uint8Array {
  const d = new Uint8Array(w * h * 4);
  for (let i = 0; i < d.length; i += 4) d.set(rgba, i);
  return d;
}

/** A project with a tileset picture, a painted play layer, a ladder and a hero with a sheet. */
function sample(): { project: Project; assets: Map<string, { bytes: Uint8Array; type: string }> } {
  const p = newProject({ title: "Dead Air", author: "Federico", players: 1 });
  const assets = new Map<string, { bytes: Uint8Array; type: string }>();
  // a 2-tile tileset: tile 1 off-board orange, tile 2 transparent
  const ts = solid(32, 16, [250, 130, 10, 255]);
  for (let y = 0; y < 16; y++) for (let x = 16; x < 32; x++) ts[(y * 32 + x) * 4 + 3] = 0;
  assets.set("sha256:tiles", { bytes: encodePng(32, 16, ts), type: "image/png" });
  p.tilesets.push({ id: "ts-city", tile: 16, image: "sha256:tiles", palettes: [], columns: 2, count: 2 });
  const level = p.levels[0]!;
  const play = level.layers.find((l): l is TileLayer => l.id === "play")!;
  play.tileset = "ts-city";
  const g = layerGrid(level, play);
  for (let c = 0; c < g.cols; c++) g.set(c, g.rows - 2, 1);
  g.commit();
  const tags = tagGrid(level);
  tags.set(10, tags.rows - 3, TAG_NUMBER.ladder);
  tags.commit();
  objectLayer(level).items.push({ name: "page_1", type: "pickup", x: 200, y: 192, item: "lattenza_page" });
  // the hero: a 48 × 44 atlas with two frames
  const atlas = solid(48, 44, [0, 0, 0, 0]);
  for (let y = 0; y < 44; y++) for (let x = 0; x < 20; x++) atlas.set([255, 204, 153, 255], (y * 48 + x) * 4);
  for (let y = 4; y < 44; y++) for (let x = 24; x < 44; x++) atlas.set([34, 51, 68, 255], (y * 48 + x) * 4);
  assets.set("sha256:willy", { bytes: encodePng(48, 44, atlas), type: "image/png" });
  p.palettes.push({ id: "pal-willy", group: "sprite", colors: ["#FFCC99", "#223344"] });
  const frame = (id: string, x: number, h: number) => ({ id, x, y: 44 - h, w: 20, h, px: 10, py: h - 1, zones: ["pal-willy"], muzzle: null, hand: null });
  p.characters.push({
    id: "willy",
    name: "Willy",
    role: "hero",
    height: 44,
    sheet: "sha256:willy",
    frames: [frame("idle_0", 0, 44), frame("walk_0", 24, 40)],
    anims: { idle: { frames: ["idle_0"], fps: 6, loop: true }, walk: { frames: ["idle_0", "walk_0"], fps: 12, loop: true }, jump: { frames: ["walk_0"], fps: 10, loop: false }, climb: { frames: ["idle_0"], fps: 10, loop: true } },
    swapColors: ["#223344"],
  });
  return { project: p, assets };
}

const build = (p: Project, assets: Map<string, { bytes: Uint8Array; type: string }>) =>
  buildAiPack(p, { review: reviewProject(p), docs: DOCS, loadAsset: async (ref) => assets.get(ref) ?? null, decode: async () => Promise.reject(new Error("no canvas")) });

describe("png", () => {
  it("round-trips RGBA pixels", async () => {
    const px = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 17, 34, 51, 255]);
    const png = encodePng(2, 2, px);
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const back = await decodePng(png);
    expect(back.w).toBe(2);
    expect(Array.from(back.data)).toEqual(Array.from(px));
  });
  it("writes the same bytes for the same pixels, also over 64 KB of rows", async () => {
    const px = solid(200, 100, [17, 34, 51, 255]);
    expect(encodePng(200, 100, px)).toEqual(encodePng(200, 100, px));
    expect((await decodePng(encodePng(200, 100, px))).data).toEqual(px);
  });
});

describe("AI pack", { timeout: 30000 }, () => {
  it("has the layout of file-format.md", async () => {
    const { project, assets } = sample();
    const pack = await build(project, assets);
    expect(pack.files[0]).toBe("PROMPT.md");
    expect(pack.files).toEqual(
      expect.arrayContaining([
        "project.json",
        "review.json",
        "levels/level-1.tmj",
        "levels/level-1/play.png",
        "levels/level-1/collision.png",
        "tilesets/ts-city.png",
        "tilesets/collision.png",
        "characters/willy/idle.png",
        "characters/willy/walk.png",
        "characters/willy/sheet.json",
        "docs/rom-README.md",
        "docs/art-spec.md",
        "docs/hardware.md",
        "docs/story.md",
        "docs/journal.md",
      ]),
    );
    const files = await readZip(pack.zip);
    expect(JSON.parse(new TextDecoder().decode(files.get("project.json")))).toEqual(JSON.parse(JSON.stringify(project)));
    const review = JSON.parse(new TextDecoder().decode(files.get("review.json")));
    expect(review).toMatchObject({ ready: true, layout: "slammast", errors: 0 });
    expect(review.checks.every((c: { message: string }) => c.message && !c.message.includes("undefined"))).toBe(true);
    expect(new TextDecoder().decode(files.get("PROMPT.md"))).toBe(pack.prompt);
    expect(aiPackName(project)).toBe("dead-air.ai-pack.zip");
  });

  it("gives the same bytes for the same project", async () => {
    const a = sample();
    const b = sample();
    b.project.id = a.project.id;
    b.project.createdAt = a.project.createdAt;
    b.project.updatedAt = a.project.updatedAt;
    const one = await build(a.project, a.assets);
    const two = await build(b.project, b.assets);
    expect(two.zip.length).toBe(one.zip.length);
    expect(two.zip).toEqual(one.zip);
    // and a change shows
    b.project.title = "Dead Air 2";
    expect((await build(b.project, b.assets)).zip).not.toEqual(one.zip);
  });

  it("converts pictures to board colors: tiles on transparency, strips on magenta", async () => {
    const { project, assets } = sample();
    const files = await readZip((await build(project, assets)).zip);
    const tiles = await decodePng(files.get("tilesets/ts-city.png")!);
    expect(Array.from(tiles.data.subarray(0, 4))).toEqual([255, 136, 17, 255]);
    expect(tiles.data[16 * 4 + 3]).toBe(0);
    const play = await decodePng(files.get("levels/level-1/play.png")!);
    expect(play.w).toBe(project.levels[0]!.size.w);
    const row = play.h - 32;
    expect(Array.from(play.data.subarray(row * play.w * 4, row * play.w * 4 + 4))).toEqual([255, 136, 17, 255]);
    const walk = await decodePng(files.get("characters/willy/walk.png")!);
    expect(walk.w).toBe(40);
    expect(walk.h).toBe(44);
    // the walk frame is 4 px shorter, its feet on the same line: magenta above it
    expect(Array.from(walk.data.subarray((0 * 40 + 25) * 4, (0 * 40 + 25) * 4 + 4))).toEqual([255, 0, 255, 255]);
    expect(Array.from(walk.data.subarray((43 * 40 + 25) * 4, (43 * 40 + 25) * 4 + 4))).toEqual([34, 51, 68, 255]);
    const sheet = JSON.parse(new TextDecoder().decode(files.get("characters/willy/sheet.json")));
    expect(sheet.anims.walk.frames.map((f: { x: number; y: number }) => [f.x, f.y])).toEqual([
      [0, 0],
      [20, 4],
    ]);
    expect(sheet.palettes[0]).toMatchObject({ id: "pal-willy" });
    const collision = await decodePng(files.get("levels/level-1/collision.png")!);
    const at = (x: number, y: number) => Array.from(collision.data.subarray((y * collision.w + x) * 4, (y * collision.w + x) * 4 + 3));
    expect(at(0, collision.h - 1)).toEqual([0, 0, 0]);
    expect(at(10 * 16 + 3, collision.h - 3 * 16 + 3)).toEqual([0, 0, 255]);
    expect(at(0, 0)).toEqual([255, 255, 255]);
  });

  it("writes Tiled maps that read back to the same collision and objects", async () => {
    const { project, assets } = sample();
    const level = project.levels[0]!;
    objectLayer(level).items.push({ name: "lock_1", type: "camera_lock", x: 300, y: 0, w: 384, h: 224 });
    const files = await readZip((await build(project, assets)).zip);
    const text = new TextDecoder().decode(files.get("levels/level-1.tmj"));
    const map = JSON.parse(text);
    expect(map.layers.map((l: { name: string }) => l.name)).toEqual(["play", "collision", "objects"]);
    expect(map.tilesets.map((t: { image: string }) => t.image)).toEqual(["../tilesets/ts-city.png", "../tilesets/collision.png"]);
    const back = levelFromTiled(text, "level-1.tmj");
    expect(tagGrid(back).cells).toEqual(tagGrid(level).cells);
    expect(objectLayer(back).items).toEqual(objectLayer(level).items);
  });

  it("is refused while the review has errors", async () => {
    const { project, assets } = sample();
    objectLayer(project.levels[0]!).items.length = 0;
    expect(reviewProject(project).ready).toBe(false);
    await expect(build(project, assets)).rejects.toThrow(/error/);
  });

  it("notes the pictures it could not read, and still packs the rest", async () => {
    const { project } = sample();
    const pack = await build(project, new Map());
    expect(pack.prompt).toMatch(/missing from the pack: tileset ts-city, character Willy/);
    expect(pack.files).toContain("characters/willy/sheet.json");
    expect(pack.files).not.toContain("characters/willy/idle.png");
  });
});

describe("project .zip and the review", { timeout: 90000 }, () => {
  it("gives the same review and the same maps after a round trip", async () => {
    const { project, assets } = sample();
    const back = (await importProjectZip(await exportProjectZip(project))).project;
    expect(reviewProject(back)).toEqual(reviewProject(project));
    // project.json gets the loader's defaults; the maps and pictures stay the same
    const one = await readZip((await build(project, assets)).zip);
    const two = await readZip((await build(back, assets)).zip);
    for (const name of ["levels/level-1.tmj", "levels/level-1/play.png", "characters/willy/sheet.json", "review.json"]) expect(two.get(name), name).toEqual(one.get(name));
  });
});

describe("PROMPT.md", () => {
  it("explains the board, the rules, the controls, the story and the build", () => {
    const { project } = sample();
    project.palettes.push({ id: "pal-x", group: "sprite", colors: ["#123456"] });
    const review = reviewProject(project);
    const prompt = buildPrompt(project, review);
    for (const part of [
      "Capcom CPS-1 (384 × 224 at 60 Hz",
      "`slammast` set: 4 players × 3 buttons",
      "mame2003-plus",
      '"Dead Air" by Federico',
      "- Genre: Platform shooter (`platform-shooter`)",
      "docs/story.md",
      "docs/art-spec.md",
      "only by jumping: walking into it does nothing",
      `${R.JUMP_VY}/16`,
      "Button 1: jump",
      "Button 3: special",
      "node rom/tools/build.mjs",
      "Node 22.18 or newer",
      "rom/tools/room-test.mjs",
      "levels/level-1.tmj",
      "Willy (`willy`, hero, 44 px tall)",
      "warning: 1 color is not on the board",
    ])
      expect(prompt).toContain(part);
    expect(prompt).not.toMatch(/undefined|NaN|\[object/);
  });
  it("uses the button combination on a 2-button layout", () => {
    const p = newProject({ title: "Two", layout: "captcomm", players: 2 });
    const prompt = buildPrompt(p, reviewProject(p));
    expect(prompt).toContain("Buttons 1 + 2 together: special");
    expect(prompt).toContain("node rom/tools/build.mjs captcomm");
  });
});

describe("ROM docs", () => {
  it("bundles the five docs of docs/rom and Willy Maker's file format and moves (P-21)", async () => {
    const docs = await loadRomDocs();
    expect(Object.keys(docs).sort()).toEqual(["art-spec.md", "file-format.md", "hardware.md", "journal.md", "moves.md", "rom-README.md", "story.md"]);
    expect(docs["hardware.md"]).toContain("CPS-1");
    expect(docs["file-format.md"]).toContain("project.json");
  });
  it("answers experiment 1's P-01 to P-26 with this game's settings", () => {
    const p = newProject({ title: "Dead Air", players: 2 });
    p.settings.rules = { exitNeedsEnemies: true, touchHurts: true };
    const prompt = buildPrompt(p, reviewProject(p), {}, { "file-format.md": "", "moves.md": "" });
    for (let i = 1; i <= 26; i++) expect(prompt).toContain(`(P-${String(i).padStart(2, "0")})`);
    expect(prompt).toContain("with every enemy down");
    expect(prompt).toContain("touching an enemy hurts");
    expect(prompt).toContain("docs/file-format.md in this pack");
    expect(prompt).not.toMatch(/must have no "WRONG CHECKSUMS"/);
  });
});
