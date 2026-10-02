// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { decodePng } from "../io/png";
import { layerGrid, objectLayer, tagLayer, TAG_NUMBER, type Project, type TileLayer } from "../model";
import { projectFromTemplate } from "../templates";
import { packGame, romSymbols, type Engine } from "../rom/pack";
import { zipSet } from "../rom/createRom";
import { powerOnTest } from "../power/powerOn";
import { clearLevelArt, growLevel, preparePicture, setPicture } from "./pictureImport";
import type { Rgba } from "./picture";

const PUBLIC = resolve(__dirname, "../../../public/willy-maker");
const WASM = resolve(__dirname, "../../../../../packages/cps1-sim/wasm/cps1sim.wasm");
let engine: Engine;

beforeAll(() => {
  const manifest = JSON.parse(readFileSync(resolve(PUBLIC, "engine/engine.json"), "utf8"));
  engine = { manifest, bin: new Uint8Array(readFileSync(resolve(PUBLIC, "engine/engine.bin"))) };
});

/** A night picture drawn at 3x: dark bands of sky, lit windows, a light floor at the bottom. */
function nightPicture(w: number, h: number): Rgba {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const bx = Math.floor(x / 3);
      const by = Math.floor(y / 3);
      const o = (y * w + x) * 4;
      const floor = by > (h / 3) * 0.85;
      const window = !floor && by > 20 && bx % 7 === 2 && by % 5 === 1;
      data.set(floor ? [102, 102, 136, 255] : window ? [238, 187, 85, 255] : [17 + (by % 4) * 17, 17, 51 + (by % 6) * 17, 255], o);
    }
  return { w, h, data };
}

/** A game from a picture, as the new game wizard makes it, with a floor traced at the bottom. */
function pictureGame(src: Rgba): Project {
  const p = projectFromTemplate("empty", { title: "Neon Docks", layout: "slammast", players: 2, screens: 1, height: 224 });
  const level = p.levels[0]!;
  clearLevelArt(level);
  const prepared = preparePicture(level, src, { layer: "play", height: 224, x: 0, repeat: false, grow: true }, null);
  setPicture(p, prepared, "sha256:test");
  const tags = layerGrid(level, tagLayer(level));
  for (let c = 0; c < tags.cols; c++) tags.set(c, tags.rows - 1, TAG_NUMBER.solid);
  tags.commit();
  const exit = objectLayer(level).items.find((o) => o.type === "exit");
  if (exit) exit.x = level.size.w - 64;
  return p;
}

describe("a game from a picture (T-28)", () => {
  it("grows the level to the picture and makes the play layer its own tileset", () => {
    const src = nightPicture(1200, 672);
    const p = pictureGame(src);
    const level = p.levels[0]!;
    // 1200 x 672 at 3x is 400 x 224 board pixels: the level grows to 416 (the 32 px grid)
    expect(level.size.w).toBe(416);
    const play = level.layers.find((l): l is TileLayer => l.kind === "tiles" && l.id === "play")!;
    const ts = p.tilesets.find((t) => t.id === play.tileset)!;
    expect(ts.tilePalettes).toHaveLength(ts.count!);
    expect(ts.palettes.every((id) => p.palettes.find((x) => x.id === id)?.group === "play")).toBe(true);
    // every layer of the level is as wide as it
    for (const l of level.layers) if (l.kind === "tiles" || l.kind === "tags") expect(layerGrid(level, l).cols).toBe(Math.ceil(416 / l.grid));
  });

  it("keeps the rest of a row when the level grows", () => {
    const p = projectFromTemplate("empty", { title: "x", layout: "slammast", players: 1, screens: 1, height: 224 });
    const level = p.levels[0]!;
    const tags = layerGrid(level, tagLayer(level));
    const before = [...tags.cells.subarray((tags.rows - 1) * tags.cols, tags.rows * tags.cols)];
    growLevel(level, 512);
    const after = layerGrid(level, tagLayer(level));
    expect([...after.cells.subarray((after.rows - 1) * after.cols, (after.rows - 1) * after.cols + before.length)]).toEqual(before);
  });

  it("packs and powers on in the board model with the picture's palettes", async () => {
    const src = nightPicture(1200, 672);
    const p = pictureGame(src);
    const play = p.levels[0]!.layers.find((l): l is TileLayer => l.kind === "tiles" && l.id === "play")!;
    const ts = p.tilesets.find((t) => t.id === play.tileset)!;
    // the tileset picture as the packer reads it, rebuilt from the fit
    const prepared = preparePicture(projectFromTemplate("empty", { title: "x", layout: "slammast", players: 2, screens: 1, height: 224 }).levels[0]!, src, { layer: "play", height: 224, x: 0, repeat: false, grow: true }, null);
    const pic = { w: prepared.fit.tileset.w, h: prepared.fit.tileset.h, rgba: prepared.fit.tileset.data };
    const r = packGame(p, engine, (id) => (id === ts.id ? pic : null));
    expect(r.stats.playPalettes).toBe(ts.palettes.length);
    const zip = await zipSet(r.files);
    const result = await powerOnTest(zip, { wasm: readFileSync(WASM) });
    expect(result.ok).toBe(true);
  }, 30000);

  // a real picture (WM_PICTURE) as a game, written to WM_ROM_OUT/picture/ for the real core
  const SAMPLE = process.env.WM_PICTURE;
  it.skipIf(!SAMPLE || !existsSync(SAMPLE) || !process.env.WM_ROM_OUT)("builds a ROM from a real picture", async () => {
    const png = await decodePng(new Uint8Array(readFileSync(SAMPLE!)));
    const src = { w: png.w, h: png.h, data: png.data };
    const p = pictureGame(src);
    const play = p.levels[0]!.layers.find((l): l is TileLayer => l.kind === "tiles" && l.id === "play")!;
    const ts = p.tilesets.find((t) => t.id === play.tileset)!;
    const prepared = preparePicture(projectFromTemplate("empty", { title: "x", layout: "slammast", players: 2, screens: 1, height: 224 }).levels[0]!, src, { layer: "play", height: 224, x: 0, repeat: false, grow: true }, null);
    const pic = { w: prepared.fit.tileset.w, h: prepared.fit.tileset.h, rgba: prepared.fit.tileset.data };
    const r = packGame(p, engine, (id) => (id === ts.id ? pic : null));
    const out = resolve(process.env.WM_ROM_OUT!, "picture");
    mkdirSync(out, { recursive: true });
    writeFileSync(resolve(out, "slammast.zip"), await zipSet(r.files));
    writeFileSync(resolve(out, "symbols.json"), romSymbols(engine));
    console.log(`picture ROM: ${p.levels[0]!.size.w} x 224, ${r.stats.playTiles} play tiles, ${r.stats.playPalettes} palettes, notes ${r.notes.map((n) => n.id).join(", ") || "none"}`);
  }, 30000);
});
