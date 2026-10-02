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
import { HERO_ID, HERO_PALETTES, heroCharacter, heroPicture } from "./heroFixture";
import type { Project } from "../model";

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
    expect(u16(d, 4)).toBe(2);
    expect(u16(d, 6)).toBe(0x74);
    expect(u32(d, 0x70)).toBe(0); // no own looks: every player is Willy
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
      (p.levels[0]!.layers.find((l) => l.kind === "objects") as { items: unknown[] }).items.push({ name: "lock_1", type: "camera_lock", x: 0, y: 0, w: 384, h: 224 });
    const r = packGame(p, engine, () => null);
    expect(r.notes.map((n) => n.id)).toEqual(expect.arrayContaining(["camera_lock", "tileset"]));
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
    const anims = [0, 1, 2, 3, 4, 5].map((i) => u32(d, l + i * 4));
    const [idle, run, jump, knife, gun, bazooka] = anims;
    expect(run).not.toBe(idle);
    expect(jump).not.toBe(idle);
    expect([knife, gun, bazooka]).toEqual([idle, idle, idle]); // no knife, fire or bazooka: idle
    // the palettes: the first free run that fits (recruit 1 is worn, recruit 2's four are free)
    expect(u16(d, l + 0x18)).toBe(8);
    expect(u16(d, l + 0x1a)).toBe(3);
    const words = [...Array(48)].map((_, i) => u16(d, l + 0x1c + i * 2));
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

  it("powers on in the board model with the hero (validation level 3)", async () => {
    const r = packGame(heroProject(), engine, (id) => pictures.get(id) ?? null, heroPics);
    const zip = await zipSet(r.files);
    const out = process.env.WM_ROM_OUT;
    if (out) {
      const dir = resolve(out, "hero");
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "slammast.zip"), zip);
      writeFileSync(resolve(dir, "symbols.json"), romSymbols(engine));
    }
    const result = await powerOnTest(zip, { wasm: readFileSync(WASM) });
    for (const s of result.steps) expect(s.ok || s.skipped, `${s.name}: ${s.detail ?? s.code}`).toBe(true);
    expect(result.ok).toBe(true);
  }, 30000);
});
