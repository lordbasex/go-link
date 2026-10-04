// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assembleProgram, GfxRegion, joinGfx, setFiles, SLAMMAST, toCps1 } from "@go-link/cps1";
import { decodePng } from "../io/png";
import { readZip } from "../io/zip";
import { powerOnTest } from "../power/powerOn";
import { CITY_TILESET, SKY_TILESET } from "../templates/tiles";
import { bigGlyph, packGame, romSymbols, WM_DATA_ADDR, type Engine, type Picture } from "./pack";
import { zipSet } from "./createRom";
import { SPEC, specProject } from "./specFixture";
import { tallProject } from "./tallFixture";
import { brawlProject, streetProject, waveProject } from "./streetFixture";
import { gunProject } from "./gunFixture";
import { shipProject } from "./shipFixture";
import { HERO_ID, HERO_PALETTES, heroCharacter, heroPicture } from "./heroFixture";
import { layerGrid, type Project, type TileLayer } from "../model";
import { bodyFor } from "../engine/rules";

// Create ROM end to end with the committed engine (public/willy-maker/engine,
// rom/tools/engine.mjs): Game Spec v1's level packed, zipped and powered on
// in the board model (validation level 3). WM_ROM_OUT=<dir> also writes the
// zip and its symbol map there (for the experiment's harness).
const PUBLIC = resolve(__dirname, "../../../public/willy-maker");
const WASM = resolve(__dirname, "../../../../../packages/cps1-sim/wasm/cps1sim.wasm");

let engine: Engine;
const pictures = new Map<string, Picture>();

beforeAll(async () => {
  const manifest = JSON.parse(readFileSync(resolve(PUBLIC, "engine/engine.json"), "utf8"));
  engine = { manifest, bin: new Uint8Array(readFileSync(resolve(PUBLIC, "engine/engine.bin"))) };
  for (const ts of [CITY_TILESET, SKY_TILESET]) {
    const img = await decodePng(new Uint8Array(readFileSync(resolve(PUBLIC, ts.url.replace("/willy-maker/", "")))));
    pictures.set(ts.id, { w: img.w, h: img.h, rgba: img.data });
  }
});

const u16 = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const u32 = (b: Uint8Array, at: number) => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;

describe("Create ROM", () => {
  it("packs the spec level as the slammast set's files, with the engine at 0 and the data at 0x100000", () => {
    const r = packGame(specProject(), engine, (id) => pictures.get(id) ?? null);
    for (const f of setFiles(SLAMMAST)) expect(r.files.get(f.name)?.length, f.name).toBe(f.size);
    expect(r.files.size).toBe(setFiles(SLAMMAST).length);
    const space = assembleProgram(SLAMMAST, r.files);
    const prog = engine.bin.subarray(0, engine.manifest.program.size);
    expect(space.subarray(0, prog.length)).toEqual(prog);
    const d = space.subarray(WM_DATA_ADDR);
    expect(u32(d, 0)).toBe(0x574d4431); // "WMD1"
    expect(u16(d, 4)).toBe(14);
    expect(u16(d, 6)).toBe(0xbe);
    expect(u16(d, 0x0a) & 0x18).toBe(0); // no double jump, no jet pack (docs/willy-maker/moves.md)
    expect(u32(d, 0x70)).toBe(0); // no own looks: every player is Willy
    // one palette per layer (the starter tilesets have one), every used tile on it
    expect([u16(d, 0x74), u16(d, 0x76)]).toEqual([1, 1]);
    const playTable = u32(d, 0x78) - WM_DATA_ADDR;
    expect(u16(d, 0x80)).toBeGreaterThan(0);
    expect([...d.subarray(playTable, playTable + u16(d, 0x80))].every((k) => k === 0)).toBe(true);
    expect(u32(d, 0x7c) - WM_DATA_ADDR).toBe(playTable + u16(d, 0x80));
    expect(u16(d, 8)).toBe(2); // players
    expect([u16(d, 0x0c), u16(d, 0x0e), u16(d, 0x10), u16(d, 0x12)]).toEqual([SPEC.w, SPEC.h, 96, 28]);
    expect([u16(d, 0x30), u16(d, 0x32), u16(d, 0x34)]).toEqual([3, 2, 3]);
    expect([u16(d, 0x48), u16(d, 0x4c)]).toEqual([SPEC.exit.x, SPEC.exit.w]);
    expect([u16(d, 0x50), u16(d, 0x52)]).toEqual([0, 1]); // Willy, a recruit
    // rules: energy 3, enemy hits 3, touch hurts, no chase, no shots, the exit needs every enemy down
    expect([...d.subarray(0x5c, 0x63)]).toEqual([3, 3, 1, 0, 0, 1, 0]);
    expect([u16(d, 0x64), u16(d, 0x66), u16(d, 0x68)]).toEqual([60, 100, 500]);
    // the tags in ROM: the ladder and the dock
    const tags = u32(d, 0x18) - WM_DATA_ADDR;
    expect(d[tags + SPEC.ladder.r0 * 96 + SPEC.ladder.col]).toBe(3);
    expect(d[tags + SPEC.dock.row * 96 + SPEC.dock.c0]).toBe(1);
    expect(d[tags + 27 * 96]).toBe(1);
    expect(r.notes).toEqual([]);
    expect([r.stats.looks, r.stats.lookTiles]).toEqual([0, 0]);
    expect(r.stats.playTiles).toBeGreaterThan(5);
    expect(r.stats.farTiles).toBe(6);
    // the graphics: the engine's sprites and the font in place
    const gfx = joinGfx(SLAMMAST, r.files);
    const sprites = engine.bin.subarray(engine.manifest.sprites.offset, engine.manifest.sprites.offset + engine.manifest.sprites.size);
    expect(gfx.subarray(engine.manifest.sprites.code * 128, engine.manifest.sprites.code * 128 + sprites.length)).toEqual(sprites);
    expect(gfx.subarray(0x41 * 64, 0x41 * 64 + 64).some((b) => b !== 0xff)).toBe(true); // "A"
    // nothing after the engine's sprites, up to the far layer's tiles
    const end = engine.manifest.sprites.code * 128 + sprites.length;
    expect(gfx.subarray(end, 0x100000).every((b) => b === 0xff)).toBe(true);
  });

  it("packs the double jump and the jet pack as header flags", () => {
    const flags = (doubleJump: boolean, jetpack: boolean) => {
      const p = specProject();
      p.settings.rules = { ...p.settings.rules, doubleJump, jetpack };
      return u16(packGame(p, engine, (id) => pictures.get(id) ?? null).data, 0x0a) & 0x18;
    };
    expect(flags(true, true)).toBe(0x18);
    expect(flags(true, false)).toBe(0x08);
    expect(flags(false, true)).toBe(0x10);
  });

  it("powers on with both air rules (validation level 3)", async () => {
    const p = specProject();
    p.settings.rules = { ...p.settings.rules, doubleJump: true, jetpack: true };
    const zip = await zipSet(packGame(p, engine, (id) => pictures.get(id) ?? null).files);
    const out = process.env.WM_ROM_OUT;
    if (out) {
      const dir = resolve(out, "moves");
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "slammast.zip"), zip);
      writeFileSync(resolve(dir, "symbols.json"), romSymbols(engine));
    }
    const result = await powerOnTest(zip, { wasm: readFileSync(WASM) });
    for (const s of result.steps) expect(s.ok || s.skipped, `${s.name}: ${s.detail ?? s.code}`).toBe(true);
    expect(result.ok).toBe(true);
  }, 30000);

  it("powers on with moving platforms (validation level 3)", async () => {
    // player 1 starts on a lift going across; a second one goes up and down (rom/tools/lab/runs/platforms-ride.json)
    const p = specProject();
    const items = p.levels[0]!.layers.find((l) => l.kind === "objects")!;
    if (items.kind !== "objects") throw new Error("objects");
    Object.assign(items.items.find((o) => o.type === "player_start" && o.player === 1)!, { x: 64, y: 384 });
    items.items.push({ name: "lift_a", type: "platform", x: 40, y: 384, w: 48, axis: "x", range: 96, speed: 1 });
    items.items.push({ name: "lift_b", type: "platform", x: 232, y: 320, w: 64, axis: "y", range: 64, speed: 1 });
    const out = process.env.WM_ROM_OUT;
    if (out) {
      // the same level with player 1 on a falling platform instead (rom/tools/lab/runs/platforms-fall.json)
      const fall = specProject();
      const fi = fall.levels[0]!.layers.find((l) => l.kind === "objects")!;
      if (fi.kind !== "objects") throw new Error("objects");
      Object.assign(fi.items.find((o) => o.type === "player_start" && o.player === 1)!, { x: 64, y: 384 });
      fi.items.push({ name: "crumbly", type: "platform", x: 40, y: 384, w: 48, falls: true });
      const dir = resolve(out, "falling");
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "slammast.zip"), await zipSet(packGame(fall, engine, (id) => pictures.get(id) ?? null).files));
      writeFileSync(resolve(dir, "symbols.json"), romSymbols(engine));
    }
    const r = packGame(p, engine, (id) => pictures.get(id) ?? null);
    expect(r.stats.platforms).toBe(2);
    const d = assembleProgram(SLAMMAST, r.files).subarray(WM_DATA_ADDR);
    expect(u16(d, 0xaa)).toBe(2);
    const at = u32(d, 0xa6) - WM_DATA_ADDR;
    expect([0, 2, 4, 6, 8, 10].map((k) => u16(d, at + 12 + k))).toEqual([232, 320, 64, 1, 64, 1]);
    const zip = await zipSet(r.files);
    if (out) {
      const dir = resolve(out, "platforms");
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "slammast.zip"), zip);
      writeFileSync(resolve(dir, "symbols.json"), romSymbols(engine));
    }
    const result = await powerOnTest(zip, { wasm: readFileSync(WASM) });
    for (const s of result.steps) expect(s.ok || s.skipped, `${s.name}: ${s.detail ?? s.code}`).toBe(true);
    expect(result.ok).toBe(true);
  }, 30000);

  it("packs a level taller than the tilemap and powers it on (validation level 3)", async () => {
    const p = tallProject();
    const r = packGame(p, engine, (id) => pictures.get(id) ?? null);
    expect(r.stats.rows).toBe(256);
    const zip = await zipSet(r.files);
    const out = process.env.WM_ROM_OUT;
    if (out) {
      const dir = resolve(out, "tall");
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "slammast.zip"), zip);
      writeFileSync(resolve(dir, "symbols.json"), romSymbols(engine));
    }
    const result = await powerOnTest(zip, { wasm: readFileSync(WASM) });
    for (const s of result.steps) expect(s.ok || s.skipped, `${s.name}: ${s.detail ?? s.code}`).toBe(true);
    expect(result.ok).toBe(true);
  }, 30000);

  it("packs a beat 'em up street and powers it on (validation level 3)", async () => {
    // the spec level as a street: walking in depth over the floor, an enemy standing in the band (rom/tools/lab/runs/street-walk.json)
    const p = streetProject();
    const r = packGame(p, engine, (id) => pictures.get(id) ?? null);
    const d = assembleProgram(SLAMMAST, r.files).subarray(WM_DATA_ADDR);
    expect(u16(d, 0x0a) & 0x200).toBe(0x200);
    expect([u16(d, 0xb2), u16(d, 0xb4)]).toEqual([352, 416]);
    const zip = await zipSet(r.files);
    const out = process.env.WM_ROM_OUT;
    if (out) {
      const dir = resolve(out, "street");
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "slammast.zip"), zip);
      writeFileSync(resolve(dir, "symbols.json"), romSymbols(engine));
    }
    const result = await powerOnTest(zip, { wasm: readFileSync(WASM) });
    for (const s of result.steps) expect(s.ok || s.skipped, `${s.name}: ${s.detail ?? s.code}`).toBe(true);
    if (out) {
      // phase 3: a pipe, a grab and a wave held by a camera lock (rom/tools/lab/runs/street-wave.json)
      const wave = packGame(waveProject(), engine, (id) => pictures.get(id) ?? null);
      const wd = assembleProgram(SLAMMAST, wave.files).subarray(WM_DATA_ADDR);
      expect(u16(wd, 0xba)).toBe(1);
      const dir = resolve(out, "wave");
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "slammast.zip"), await zipSet(wave.files));
      writeFileSync(resolve(dir, "symbols.json"), romSymbols(engine));
      // the light gun: crosshairs and a camera that moves by itself (rom/tools/lab/runs/gun-range.json)
      const gun = packGame(gunProject(), engine, (id) => pictures.get(id) ?? null);
      expect(u16(assembleProgram(SLAMMAST, gun.files).subarray(WM_DATA_ADDR), 0x0a) & 0x400).toBe(0x400);
      const gdir = resolve(out, "gun");
      mkdirSync(gdir, { recursive: true });
      writeFileSync(resolve(gdir, "slammast.zip"), await zipSet(gun.files));
      writeFileSync(resolve(gdir, "symbols.json"), romSymbols(engine));
      // the horizontal shooter: ships over a level the camera scrolls by itself (rom/tools/lab/runs/ship-flight.json)
      const sh = packGame(shipProject(), engine, (id) => pictures.get(id) ?? null);
      expect(u16(assembleProgram(SLAMMAST, sh.files).subarray(WM_DATA_ADDR), 0x0a) & 0x800).toBe(0x800);
      const sdir = resolve(out, "ship");
      mkdirSync(sdir, { recursive: true });
      writeFileSync(resolve(sdir, "slammast.zip"), await zipSet(sh.files));
      writeFileSync(resolve(sdir, "symbols.json"), romSymbols(engine));
      // phase 4: a crate with a knife, a throw and a brawler behind a lock (rom/tools/lab/runs/street-brawl.json)
      const brawl = packGame(brawlProject(), engine, (id) => pictures.get(id) ?? null);
      expect(brawl.notes.map((n) => n.id)).not.toContain("boss");
      const bdir = resolve(out, "brawl");
      mkdirSync(bdir, { recursive: true });
      writeFileSync(resolve(bdir, "slammast.zip"), await zipSet(brawl.files));
      writeFileSync(resolve(bdir, "symbols.json"), romSymbols(engine));
    }
  }, 30000);

  it("draws double-size glyphs as four quarters", () => {
    const q = bigGlyph("A");
    expect(q).toHaveLength(4);
    expect(q[0]).toHaveLength(8);
    expect(q[0]![0]).toHaveLength(8);
  });

  it("gives the same .zip for the same game", async () => {
    const a = await zipSet(packGame(specProject(), engine, (id) => pictures.get(id) ?? null).files);
    const b = await zipSet(packGame(specProject(), engine, (id) => pictures.get(id) ?? null).files);
    expect(a).toEqual(b);
    const back = await readZip(a);
    expect(back.size).toBe(setFiles(SLAMMAST).length);
  });

  it("notes what the engine leaves out", () => {
    const p = specProject();
    p.levels[0]!.layers.find((l) => l.kind === "objects")!.kind === "objects" &&
      (p.levels[0]!.layers.find((l) => l.kind === "objects") as { items: unknown[] }).items.push({ name: "cp_1", type: "checkpoint", x: 400, y: 416 }, { name: "lock_1", type: "camera_lock", x: 0, y: 0, w: 384, h: 224 });
    const r = packGame(p, engine, () => null);
    expect(r.notes.map((n) => n.id)).toEqual(expect.arrayContaining(["checkpoint", "tileset"]));
    // camera locks are in the ROM since wm_data 11 (the beat 'em up's waves)
    expect(r.notes.map((n) => n.id)).not.toContain("camera_lock");
  });

  it("powers on in the board model (validation level 3)", async () => {
    const p = specProject();
    const r = packGame(p, engine, (id) => pictures.get(id) ?? null);
    const zip = await zipSet(r.files);
    const out = process.env.WM_ROM_OUT;
    if (out) {
      mkdirSync(out, { recursive: true });
      writeFileSync(resolve(out, "slammast.zip"), zip);
      writeFileSync(resolve(out, "slammast.symbols.json"), romSymbols(engine));
      writeFileSync(resolve(out, "symbols.json"), romSymbols(engine));
      // the same level with a free camera ("Only forward" off: it may go back all the way, rom/tools/lab/runs/free-camera.json)
      const free = specProject();
      free.levels[0]!.camera = { forwardOnly: false, backtrack: 48 };
      const fd = assembleProgram(SLAMMAST, packGame(free, engine, (id) => pictures.get(id) ?? null).files).subarray(WM_DATA_ADDR);
      expect(u16(fd, 0x58 + 2)).toBe(free.levels[0]!.size.w);
      const fdir = resolve(out, "free");
      mkdirSync(fdir, { recursive: true });
      writeFileSync(resolve(fdir, "slammast.zip"), await zipSet(packGame(free, engine, (id) => pictures.get(id) ?? null).files));
      writeFileSync(resolve(fdir, "symbols.json"), romSymbols(engine));
    }
    const result = await powerOnTest(zip, { wasm: readFileSync(WASM) });
    for (const s of result.steps) expect(s.ok || s.skipped, `${s.name}: ${s.detail ?? s.code}`).toBe(true);
    expect(result.ok).toBe(true);
  }, 30000);
});

/**
 * Game Spec v1 with its play tileset over three palettes (T-28): the city
 * palette, and the same colors with their channels turned (g, b, r) and
 * (b, r, g). The used tiles go round the three in tile order, and each is
 * recolored in the picture to its palette, so its pens stay the city's.
 */
function threePaletteProject(city: Picture): { project: Project; picture: Picture; palettes: string[][]; slotOf: Map<number, number> } {
  const p = specProject();
  const ts = p.tilesets.find((t) => t.id === CITY_TILESET.id)!;
  const base = p.palettes.find((x) => x.id === ts.palettes[0])!;
  const turn = (hex: string, k: number) => {
    const ch = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)];
    return "#" + [0, 1, 2].map((i) => ch[(i + k) % 3]).join("");
  };
  const palettes = [0, 1, 2].map((k) => base.colors.map((c) => turn(c.toLowerCase(), k)));
  p.palettes.push({ id: "pal-city-gbr", group: base.group, colors: palettes[1]! }, { id: "pal-city-brg", group: base.group, colors: palettes[2]! });
  ts.palettes = [base.id, "pal-city-gbr", "pal-city-brg"];
  const play = p.levels[0]!.layers.find((l) => l.kind === "tiles" && l.id === "play") as TileLayer;
  const used = [...new Set(layerGrid(p.levels[0]!, play).cells.filter((n) => n))].sort((a, b) => a - b);
  const slotOf = new Map(used.map((n, i) => [n, i % 3]));
  ts.tilePalettes = Array.from({ length: Math.max(...used) }, (_, i) => slotOf.get(i + 1) ?? 0);
  const rgba = new Uint8Array(city.rgba);
  const hex = (o: number) => "#" + [0, 1, 2].map((k) => rgba[o + k]!.toString(16).padStart(2, "0")).join("");
  for (const [n, k] of slotOf) {
    if (!k) continue;
    const tx = ((n - 1) % CITY_TILESET.columns) * 16;
    const ty = Math.floor((n - 1) / CITY_TILESET.columns) * 16;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const o = ((ty + y) * city.w + tx + x) * 4;
        if (rgba[o + 3]! < 128) continue;
        const to = turn(hex(o), k);
        for (let c = 0; c < 3; c++) rgba[o + c] = parseInt(to.slice(1 + c * 2, 3 + c * 2), 16);
      }
  }
  return { project: p, picture: { w: city.w, h: city.h, rgba }, palettes, slotOf };
}

describe("Create ROM with a background over many palettes", () => {
  it("loads each palette a layer's tiles use and cuts every tile with its own", () => {
    const { project, picture, palettes, slotOf } = threePaletteProject(pictures.get(CITY_TILESET.id)!);
    const pics = (id: string) => (id === CITY_TILESET.id ? picture : (pictures.get(id) ?? null));
    const r = packGame(project, engine, pics);
    expect(r.notes).toEqual([]);
    expect([r.stats.playPalettes, r.stats.farPalettes]).toEqual([3, 1]);
    const d = assembleProgram(SLAMMAST, r.files).subarray(WM_DATA_ADDR);
    expect([u16(d, 0x74), u16(d, 0x76)]).toEqual([3, 1]);
    // the palettes: the play layer's three, then the far layer's
    const pal = u32(d, 0x24) - WM_DATA_ADDR;
    const word = (hex: string) => toCps1([parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]).word;
    palettes.forEach((colors, k) => colors.forEach((c, i) => expect(u16(d, pal + (k * 16 + i) * 2), `palette ${k} color ${i}`).toBe(word(c))));
    expect(u16(d, pal + (3 * 16) * 2)).not.toBe(u16(d, pal)); // the far layer's sky comes after them
    // the table: the palette of each play tile code, from 0x4000
    const table = u32(d, 0x78) - WM_DATA_ADDR;
    expect(u16(d, 0x80)).toBe(Math.max(...slotOf.keys()));
    for (const [n, k] of slotOf) expect(d[table + n - 1], `tile ${n}`).toBe(k);
    expect(new Set(slotOf.values())).toEqual(new Set([0, 1, 2]));
    // each tile's pens: its pixels' index in its own palette
    const gfx = joinGfx(SLAMMAST, r.files);
    const want = new GfxRegion(SLAMMAST.gfxSize);
    for (const [n, k] of slotOf) {
      const code = 0x4000 + n - 1;
      const tx = ((n - 1) % CITY_TILESET.columns) * 16;
      const ty = Math.floor((n - 1) / CITY_TILESET.columns) * 16;
      want.tile16(
        code,
        Array.from({ length: 16 }, (_, y) =>
          Array.from({ length: 16 }, (_, x) => {
            const o = ((ty + y) * picture.w + tx + x) * 4;
            if (picture.rgba[o + 3]! < 128) return 15;
            const hexc = "#" + [0, 1, 2].map((c) => picture.rgba[o + c]!.toString(16).padStart(2, "0")).join("");
            const i = palettes[k]!.indexOf(hexc);
            expect(i, `tile ${n} pixel ${x},${y} ${hexc}`).toBeGreaterThanOrEqual(0);
            return i;
          }),
        ),
      );
      expect(gfx.subarray(code * 128, code * 128 + 128), `tile ${n}`).toEqual(want.data.subarray(code * 128, code * 128 + 128));
    }
  });

  it("keeps a layer to the board's 32 palettes, the rest on the closest", () => {
    const { project, picture } = threePaletteProject(pictures.get(CITY_TILESET.id)!);
    const ts = project.tilesets.find((t) => t.id === CITY_TILESET.id)!;
    const play = project.levels[0]!.layers.find((l) => l.kind === "tiles" && l.id === "play") as TileLayer;
    const used = [...new Set(layerGrid(project.levels[0]!, play).cells.filter((n) => n))].sort((a, b) => a - b);
    // 40 palettes, each used tile on its own (the spec level uses fewer tiles: palettes past them are not loaded)
    const base = project.palettes.find((x) => x.id === ts.palettes[0])!;
    ts.palettes = Array.from({ length: 40 }, (_, i) => (i ? `pal-x${i}` : base.id));
    for (let i = 1; i < 40; i++) project.palettes.push({ id: `pal-x${i}`, group: base.group, colors: [...base.colors] });
    ts.tilePalettes = Array.from({ length: 64 }, (_, i) => i % 40);
    for (const n of used) ts.tilePalettes[n - 1] = 0;
    // 34 tiles of the level on palettes 1-34
    const grid = layerGrid(project.levels[0]!, play);
    for (let i = 0; i < 34; i++) {
      ts.tilePalettes[30 + i] = i + 1;
      grid.set(i, 0, 31 + i);
    }
    grid.commit();
    const wide = { w: picture.w, h: 16 * 8, rgba: new Uint8Array(picture.w * 16 * 8 * 4) };
    wide.rgba.set(picture.rgba);
    const r = packGame(project, engine, (id) => (id === CITY_TILESET.id ? wide : (pictures.get(id) ?? null)));
    expect(r.notes).toContainEqual({ id: "layerPalettes", params: { layer: "play", n: 35, max: 32 } });
    expect(r.stats.playPalettes).toBe(32);
    const d = assembleProgram(SLAMMAST, r.files).subarray(WM_DATA_ADDR);
    expect(u16(d, 0x74)).toBe(32);
    const table = u32(d, 0x78) - WM_DATA_ADDR;
    for (let i = 0; i < 34; i++) expect(d[table + 30 + i]).toBeLessThan(32);
  });

  it("powers on in the board model (validation level 3)", async () => {
    const { project, picture } = threePaletteProject(pictures.get(CITY_TILESET.id)!);
    const r = packGame(project, engine, (id) => (id === CITY_TILESET.id ? picture : (pictures.get(id) ?? null)));
    const zip = await zipSet(r.files);
    const out = process.env.WM_ROM_OUT;
    if (out) {
      const dir = resolve(out, "palettes");
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "slammast.zip"), zip);
      writeFileSync(resolve(dir, "symbols.json"), romSymbols(engine));
    }
    const result = await powerOnTest(zip, { wasm: readFileSync(WASM) });
    for (const s of result.steps) expect(s.ok || s.skipped, `${s.name}: ${s.detail ?? s.code}`).toBe(true);
    expect(result.ok).toBe(true);
  }, 30000);
});

/** Game Spec v1 with player 1 as the game's own hero (Vera), player 2 Willy in the green shirt. */
function heroProject(): Project {
  const p = specProject();
  p.palettes.push(...HERO_PALETTES.map((x) => ({ ...x, colors: [...x.colors] })));
  p.characters.push(heroCharacter());
  p.settings.playerSlots = [
    { character: HERO_ID, variant: 0 },
    { character: "builtin:willy", variant: 1 },
    { character: HERO_ID, variant: 2 },
    { character: "builtin:willy", variant: 3 },
  ];
  return p;
}

describe("Create ROM with the game's own hero", () => {
  const heroPics = (id: string) => (id === HERO_ID ? heroPicture() : null);

  it("packs the hero as a look: its frames as the engine's records, its tiles and its palettes", () => {
    const r = packGame(heroProject(), engine, (id) => pictures.get(id) ?? null, heroPics);
    expect(r.notes).toEqual([]);
    const space = assembleProgram(SLAMMAST, r.files);
    const d = space.subarray(WM_DATA_ADDR);
    const at = (addr: number) => addr - WM_DATA_ADDR;
    expect([u16(d, 0x50), u16(d, 0x52)]).toEqual([0, 1]); // Willy's shirts: player 2 the green recruit
    const looks = at(u32(d, 0x70));
    expect(u32(d, 0x70)).toBeGreaterThan(WM_DATA_ADDR);
    const look = u32(d, looks);
    expect(look).toBeGreaterThan(WM_DATA_ADDR);
    // players 2 to 4: Willy (player 3 is past the game's 2 players)
    expect([u32(d, looks + 4), u32(d, looks + 8), u32(d, looks + 12)]).toEqual([0, 0, 0]);
    const l = at(look);
    const anims = [...Array(16)].map((_, i) => u32(d, l + i * 4));
    const [idle, run, jump, knife, gun, bazooka, crouch, crawl, land, turn, kick, thumbs, victory, yawn, doubleJump, jetpack] = anims;
    expect(run).not.toBe(idle);
    expect(jump).not.toBe(idle);
    expect([knife, gun, bazooka]).toEqual([idle, idle, idle]); // no knife, fire or bazooka: idle
    // the moves without their own animations take the doc's fallbacks (docs/willy-maker/moves.md)
    expect([crouch, crawl, land, thumbs, victory, yawn]).toEqual([idle, idle, idle, idle, idle, idle]);
    expect(turn).toBe(run);
    expect([kick, doubleJump, jetpack]).toEqual([jump, jump, jump]);
    // the palettes: the smallest free run that fits (recruit 1 is worn; after the engine's art, the boss's red and the crosshairs, only two are left, so recruit 2's four)
    expect(u16(d, l + 0x40)).toBe(8);
    expect(u16(d, l + 0x42)).toBe(3);
    // the body, scaled to the hero's height (T-26), then the palette words
    const b = bodyFor(heroCharacter().height);
    const s16 = (a: number) => (u16(d, a) << 16) >> 16;
    expect([0x44, 0x46, 0x48, 0x4a, 0x4c, 0x4e, 0x50, 0x52, 0x54, 0x56, 0x58].map((o) => s16(l + o))).toEqual([b.h, b.crouchH, b.halfW, b.jumpVy, b.doubleVy, b.knifeReach, b.kickReach, b.knifeY, b.shotY, b.crouchShotY, b.rocketY]);
    const words = [...Array(48)].map((_, i) => u16(d, l + 0x5a + i * 2));
    HERO_PALETTES.forEach((p, k) => p.colors.forEach((c, i) => expect(words[k * 16 + i]).toBe(toCps1([parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]).word)));
    expect(words[15]).toBe(0);
    // Anim { frames, count, fps }: idle skips its empty frame
    const anim = (a: number) => ({ frames: u32(d, at(a)), count: u16(d, at(a) + 4), fps: u16(d, at(a) + 6) });
    expect([anim(idle!).count, anim(idle!).fps]).toEqual([1, 4]);
    expect([anim(run!).count, anim(run!).fps]).toEqual([2, 8]);
    expect(anim(jump!).count).toBe(1);
    // Frame { tiles, count, w, ax, ay } and its Tiles { code, dx, dy, pal }
    const frame = (a: number) => ({ tiles: u32(d, at(a)), count: d[at(a) + 4]!, w: d[at(a) + 5]!, ax: u16(d, at(a) + 6), ay: u16(d, at(a) + 8) });
    const tiles = (f: ReturnType<typeof frame>) => [...Array(f.count)].map((_, i) => ({ code: u16(d, at(f.tiles) + i * 6), dx: d[at(f.tiles) + i * 6 + 2]!, dy: d[at(f.tiles) + i * 6 + 3]!, pal: d[at(f.tiles) + i * 6 + 4]! }));
    const idle0 = frame(anim(idle!).frames);
    expect([idle0.w, idle0.ax, idle0.ay]).toEqual([32, 16, 47]);
    const it0 = tiles(idle0);
    expect(it0.length).toBe(6); // 2 x 3, none empty
    expect(it0.map((t) => t.pal)).toEqual([0, 0, 1, 1, 2, 2]); // head, torso, legs from the top
    const jump0 = frame(anim(jump!).frames);
    expect([jump0.w, jump0.ax, jump0.ay]).toEqual([32, 16, 31]);
    expect(tiles(jump0).map((t) => t.pal)).toEqual([1, 1, 2, 2]); // a 32 px frame: torso and legs only
    // the tiles, after the engine's own sprites, deduplicated (the torso is the same in idle, run and jump)
    const first = engine.manifest.sprites.code + engine.manifest.sprites.size / 128;
    const all = [it0, ...[0, 1].map((i) => tiles(frame(anim(run!).frames + i * 10))), tiles(jump0)].flat();
    for (const t of all) expect(t.code).toBeGreaterThanOrEqual(first);
    expect(new Set(all.map((t) => t.code)).size).toBe(r.stats.lookTiles);
    expect(r.stats.lookTiles).toBeLessThan(all.length);
    expect(it0[2]!.code).toBe(tiles(jump0)[0]!.code);
    // each tile's pens are the atlas' pixels in its zone's palette
    const gfx = joinGfx(SLAMMAST, r.files);
    const pic = heroPicture();
    const want = new GfxRegion(0x4000 * 128);
    for (const t of it0) {
      const pal = HERO_PALETTES[t.pal]!.colors;
      want.tile16(
        t.code,
        Array.from({ length: 16 }, (_, y) =>
          Array.from({ length: 16 }, (_, x) => {
            const o = ((t.dy + y) * pic.w + t.dx + x) * 4;
            if (!pic.rgba[o + 3]) return 15;
            const hexc = "#" + [0, 1, 2].map((k) => pic.rgba[o + k]!.toString(16).padStart(2, "0")).join("");
            return pal.indexOf(hexc);
          }),
        ),
      );
      expect(gfx.subarray(t.code * 128, t.code * 128 + 128)).toEqual(want.data.subarray(t.code * 128, t.code * 128 + 128));
    }
  });

  it("packs a hero's own moves, and each move's fallback among them", () => {
    const p = heroProject();
    // the same frames under the moves' names: each name is an animation of its own
    p.characters[0]!.anims = {
      ...p.characters[0]!.anims,
      crouch: { frames: ["jump_0"], fps: 8, loop: false },
      jump_kick: { frames: ["run_1"], fps: 14, loop: false },
      thumbs_up: { frames: ["idle_0"], fps: 7, loop: false },
      bored: { frames: ["run_0"], fps: 2, loop: true },
      jetpack: { frames: ["jump_0", "run_0"], fps: 10, loop: true },
    };
    const r = packGame(p, engine, (id) => pictures.get(id) ?? null, heroPics);
    expect(r.notes).toEqual([]);
    const d = assembleProgram(SLAMMAST, r.files).subarray(WM_DATA_ADDR);
    const l = u32(d, u32(d, 0x70) - WM_DATA_ADDR) - WM_DATA_ADDR;
    const [idle, run, jump, , , , crouch, crawl, land, turn, kick, thumbs, victory, yawn, doubleJump, jetpack] = [...Array(16)].map((_, i) => u32(d, l + i * 4));
    const own = [crouch, kick, thumbs, yawn, jetpack];
    expect(new Set([idle, run, jump, ...own]).size).toBe(8); // each its own record
    expect(crawl).toBe(crouch); // crawl falls back to crouch
    expect(victory).toBe(thumbs); // victory to the thumbs up
    expect(land).toBe(idle);
    expect(turn).toBe(run);
    expect(doubleJump).toBe(jump);
    // the records: Anim { frames, count, fps }
    expect([u16(d, jetpack! - WM_DATA_ADDR + 4), u16(d, jetpack! - WM_DATA_ADDR + 6)]).toEqual([2, 10]);
    expect([u16(d, kick! - WM_DATA_ADDR + 4), u16(d, kick! - WM_DATA_ADDR + 6)]).toEqual([1, 14]);
    expect(u16(d, l + 0x40)).toBe(8);
  });

  it("notes a hero it cannot draw and keeps that player Willy", () => {
    const r = packGame(heroProject(), engine, (id) => pictures.get(id) ?? null, () => null);
    expect(r.notes).toEqual([{ id: "heroPicture", params: { name: "Vera" } }]);
    const d = assembleProgram(SLAMMAST, r.files).subarray(WM_DATA_ADDR);
    expect(u32(d, 0x70)).toBe(0);
    const p = heroProject();
    p.settings.playerSlots![0]!.variant = 2;
    expect(packGame(p, engine, (id) => pictures.get(id) ?? null, heroPics).notes).toEqual([{ id: "heroShirt", params: { name: "Vera" } }]);
    const big = heroProject();
    big.characters[0]!.frames[0]!.w = 16 * 17; // 17 tiles across: wider than a Frame record holds
    expect(packGame(big, engine, (id) => pictures.get(id) ?? null, heroPics).notes.map((n) => n.id)).toEqual(["heroBig"]);
  });

  it("draws the game's own enemy kind with its character, the rest as the android (T-30)", () => {
    const p = heroProject();
    p.characters.push({ ...heroCharacter(), id: "trooper", name: "Trooper", role: "enemy" });
    const r = packGame(p, engine, (id) => pictures.get(id) ?? null, (id) => (id === HERO_ID || id === "trooper" ? heroPicture() : null));
    const d = assembleProgram(SLAMMAST, r.files).subarray(WM_DATA_ADDR);
    const table = u32(d, 0x9e);
    expect(table).toBeGreaterThan(WM_DATA_ADDR);
    const n = u16(d, 0x30);
    const looks = [...Array(n)].map((_, i) => u32(d, table - WM_DATA_ADDR + i * 4));
    expect(looks.every((a) => a > WM_DATA_ADDR)).toBe(true); // every trooper of the spec level
    expect(u32(d, 0xa2)).toBe(0); // no civilian of its own
    expect(r.notes.map((x) => x.id)).not.toContain("enemyArt");
  });

  it("powers on in the board model with the hero (validation level 3)", async () => {
    const r = packGame(heroProject(), engine, (id) => pictures.get(id) ?? null, heroPics);
    const zip = await zipSet(r.files);
    const out = process.env.WM_ROM_OUT;
    if (out) {
      const dir = resolve(out, "hero");
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "slammast.zip"), zip);
      writeFileSync(resolve(dir, "symbols.json"), romSymbols(engine));
      // the same hero 96 px tall (T-26): its body and jump scale, for the harness
      const tall = heroProject();
      tall.characters[0]!.height = 96;
      const tallDir = resolve(out, "hero96");
      mkdirSync(tallDir, { recursive: true });
      writeFileSync(resolve(tallDir, "slammast.zip"), await zipSet(packGame(tall, engine, (id) => pictures.get(id) ?? null, heroPics).files));
      writeFileSync(resolve(tallDir, "slammast.symbols.json"), romSymbols(engine));
    }
    const result = await powerOnTest(zip, { wasm: readFileSync(WASM) });
    for (const s of result.steps) expect(s.ok || s.skipped, `${s.name}: ${s.detail ?? s.code}`).toBe(true);
    expect(result.ok).toBe(true);
  }, 30000);

  it("draws a pickup with a character of the game (its look), the others with the engine's icons", async () => {
    const p = specProject();
    p.palettes.push(...HERO_PALETTES.map((x) => ({ ...x, colors: [...x.colors] })));
    p.characters.push(heroCharacter());
    const items = p.levels[0]!.layers.find((l) => l.kind === "objects")!;
    if (items.kind !== "objects") throw new Error("objects");
    // two coins in front of player 1: the first drawn with the hero's picture
    items.items.push({ name: "coin_own", type: "pickup", x: 120, y: 416, item: "coin", look: HERO_ID });
    items.items.push({ name: "coin_icon", type: "pickup", x: 160, y: 416, item: "coin" });
    const r = packGame(p, engine, (id) => pictures.get(id) ?? null, heroPics);
    const d = assembleProgram(SLAMMAST, r.files).subarray(WM_DATA_ADDR);
    const table = u32(d, 0xae);
    expect(table).toBeGreaterThan(WM_DATA_ADDR);
    const at = table - WM_DATA_ADDR;
    expect(u32(d, at)).toBeGreaterThan(WM_DATA_ADDR); // the first pickup: a look
    expect(u32(d, at + 4)).toBe(0); // the second: the engine's coin
    const zip = await zipSet(r.files);
    const out = process.env.WM_ROM_OUT;
    if (out) {
      const dir = resolve(out, "pickuplook");
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "slammast.zip"), zip);
      writeFileSync(resolve(dir, "symbols.json"), romSymbols(engine));
    }
    const result = await powerOnTest(zip, { wasm: readFileSync(WASM) });
    for (const s of result.steps) expect(s.ok || s.skipped, `${s.name}: ${s.detail ?? s.code}`).toBe(true);
  }, 30000);
});
