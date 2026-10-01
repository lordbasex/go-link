// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { layerGrid, newProject, type Project, type TileLayer } from "../model";
import { reviewProject } from "../editor/validate";
import { projectFromTemplate } from "../templates";
import { buildAiPack } from "./aiPack";
import { checkAiPack, packReport, PackBuildError, promptPaths } from "./packCheck";
import { decodePng, encodePng } from "./png";
import { readZip } from "./zip";

const DOCS = { "rom-README.md": "# rom", "art-spec.md": "# art", "hardware.md": "# hw", "story.md": "# story", "journal.md": "# journal" };

function solid(w: number, h: number, rgba: [number, number, number, number]): Uint8Array {
  const d = new Uint8Array(w * h * 4);
  for (let i = 0; i < d.length; i += 4) d.set(rgba, i);
  return d;
}

/** A project with a tileset picture, a painted play layer and a hero with two frames. */
function sample(): { project: Project; assets: Map<string, { bytes: Uint8Array; type: string }> } {
  const p = newProject({ title: "Dead Air", players: 1 });
  const assets = new Map<string, { bytes: Uint8Array; type: string }>();
  assets.set("sha256:tiles", { bytes: encodePng(32, 16, solid(32, 16, [250, 130, 10, 255])), type: "image/png" });
  p.tilesets.push({ id: "ts-city", tile: 16, image: "sha256:tiles", palettes: [], columns: 2, count: 2 });
  const play = p.levels[0]!.layers.find((l): l is TileLayer => l.id === "play")!;
  play.tileset = "ts-city";
  const g = layerGrid(p.levels[0]!, play);
  for (let c = 0; c < g.cols; c++) g.set(c, g.rows - 2, 1 + (c % 2));
  g.commit();
  assets.set("sha256:willy", { bytes: encodePng(48, 44, solid(48, 44, [255, 204, 153, 255])), type: "image/png" });
  p.palettes.push({ id: "pal-willy", group: "sprite", colors: ["#FFCC99"] });
  const frame = (id: string, x: number) => ({ id, x, y: 0, w: 20, h: 44, px: 10, py: 43, zones: ["pal-willy"], muzzle: null, hand: null });
  p.characters.push({
    id: "willy",
    name: "Willy",
    role: "hero",
    height: 44,
    sheet: "sha256:willy",
    frames: [frame("idle_0", 0), frame("walk_0", 24)],
    anims: { idle: { frames: ["idle_0"], fps: 6, loop: true }, walk: { frames: ["idle_0", "walk_0"], fps: 12, loop: true }, jump: { frames: ["walk_0"], fps: 10, loop: false } },
    swapColors: [],
  });
  return { project: p, assets };
}

async function packFiles(p: Project, assets: Map<string, { bytes: Uint8Array; type: string }>): Promise<Map<string, Uint8Array>> {
  const pack = await buildAiPack(p, { review: reviewProject(p), docs: DOCS, loadAsset: async (ref) => assets.get(ref) ?? null, decode: () => Promise.reject(new Error("no canvas")), skipCheck: true });
  return readZip(pack.zip);
}

const ids = (problems: { id: string }[]) => [...new Set(problems.map((p) => p.id))];

describe("AI pack build check (level 2)", { timeout: 30000 }, () => {
  it("passes the packs Willy Maker makes, for the sample and the templates", async () => {
    const { project, assets } = sample();
    expect(await checkAiPack(await packFiles(project, assets))).toEqual([]);
    // the templates' tilesets are not in this test's storage: blank placeholders keep the maps whole
    for (const id of ["buenos-aires", "empty"] as const) {
      const p = projectFromTemplate(id, { title: "Dead Air", layout: "slammast", players: 4 });
      expect(await checkAiPack(await packFiles(p, new Map()))).toEqual([]);
    }
  });

  it("runs inside buildAiPack and passes there", async () => {
    const { project, assets } = sample();
    const pack = await buildAiPack(project, { review: reviewProject(project), docs: DOCS, loadAsset: async (ref) => assets.get(ref) ?? null });
    expect(pack.files).toContain("levels/level-1.tmj");
  });

  it("finds a file PROMPT.md names that is not there", async () => {
    const { project, assets } = sample();
    const files = await packFiles(project, assets);
    files.delete("levels/level-1.tmj");
    files.delete("docs/hardware.md");
    files.delete("characters/willy/sheet.json");
    const problems = await checkAiPack(files);
    expect(ids(problems)).toEqual(["pack.files"]);
    const text = problems.map((p) => p.detail).join("\n");
    expect(text).toMatch(/levels\/level-1\.tmj/);
    expect(text).toMatch(/docs\/hardware\.md/);
    expect(text).toMatch(/characters\/willy\//);
  });

  it("finds a map that points at a missing or wrongly sized picture", async () => {
    const { project, assets } = sample();
    const files = await packFiles(project, assets);
    const map = JSON.parse(new TextDecoder().decode(files.get("levels/level-1.tmj")));
    map.tilesets[0].imagewidth = 64;
    map.layers.find((l: { name: string }) => l.name === "play").data.push(0);
    files.set("levels/level-1.tmj", new TextEncoder().encode(JSON.stringify(map)));
    files.delete("tilesets/ts-city.png");
    const problems = await checkAiPack(files);
    expect(ids(problems)).toEqual(["pack.maps"]);
    expect(problems.map((p) => p.detail).join("\n")).toMatch(/tilesets\/ts-city\.png, which is not in the pack[\s\S]*cells/);
  });

  it("finds PNGs off the board's colors, half-transparent pixels and wrong sizes", async () => {
    const { project, assets } = sample();
    const files = await packFiles(project, assets);
    files.set("tilesets/ts-city.png", encodePng(30, 16, solid(30, 16, [250, 130, 10, 128])));
    const play = await decodePng(files.get("levels/level-1/play.png")!);
    files.set("levels/level-1/play.png", encodePng(play.w - 16, play.h, solid(play.w - 16, play.h, [0, 0, 0, 0])));
    const problems = await checkAiPack(files);
    expect(ids(problems).sort()).toEqual(["pack.maps", "pack.png", "pack.sizes"]);
    const text = problems.map((p) => p.detail).join("\n");
    expect(text).toMatch(/ts-city\.png has 480 pixel\(s\) that are not board colors/);
    expect(text).toMatch(/half-transparent/);
    expect(text).toMatch(/play\.png is 1520 × 224; the level is 1536 × 224/);
  });

  it("finds a sheet frame outside its strip, and broken JSON", async () => {
    const { project, assets } = sample();
    const files = await packFiles(project, assets);
    const sheet = JSON.parse(new TextDecoder().decode(files.get("characters/willy/sheet.json")));
    sheet.anims.walk.frames[1].x = 30;
    files.set("characters/willy/sheet.json", new TextEncoder().encode(JSON.stringify(sheet)));
    files.set("review.json", new TextEncoder().encode("{"));
    const problems = await checkAiPack(files);
    expect(ids(problems).sort()).toEqual(["pack.json", "pack.sheets"]);
    expect(problems.find((p) => p.id === "pack.sheets")!.detail).toMatch(/walk_0 of walk \(30, 0, 20 × 44\) is not inside characters\/willy\/walk\.png \(40 × 44\)/);
  });

  it("reads the pack paths a prompt names, not the repository's", () => {
    const text = "See docs/hardware.md and docs/willy-maker/file-format.md of the repository; levels/level-1.tmj, characters/willy/ and rom/tools/build.mjs. levels/<id>.tmj";
    expect(promptPaths(text).sort()).toEqual(["characters/willy/", "docs/hardware.md", "levels/level-1.tmj"]);
  });

  it("writes a report a user can paste into a bug", () => {
    const e = new PackBuildError([{ id: "pack.png", detail: "x.png has 1 pixel(s) that are not board colors" }]);
    const report = packReport(e.problems, { project: "abc" });
    expect(report).toMatch(/^Willy Maker AI pack build check failed\nproject: abc\n\n- pack\.png: x\.png/);
  });
});
