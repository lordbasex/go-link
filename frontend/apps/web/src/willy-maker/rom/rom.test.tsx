// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assembleProgram, joinGfx, setFiles, SLAMMAST } from "@go-link/cps1";
import { decodePng } from "../io/png";
import { readZip } from "../io/zip";
import { powerOnTest } from "../power/powerOn";
import { CITY_TILESET, SKY_TILESET } from "../templates/tiles";
import { bigGlyph, packGame, romSymbols, WM_DATA_ADDR, type Engine, type Picture } from "./pack";
import { zipSet } from "./createRom";
import { SPEC, specProject } from "./specFixture";

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
    expect(u16(d, 4)).toBe(1);
    expect(u16(d, 6)).toBe(0x70);
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
    expect(r.stats.playTiles).toBeGreaterThan(5);
    expect(r.stats.farTiles).toBe(6);
    // the graphics: the engine's sprites and the font in place
    const gfx = joinGfx(SLAMMAST, r.files);
    const sprites = engine.bin.subarray(engine.manifest.sprites.offset, engine.manifest.sprites.offset + engine.manifest.sprites.size);
    expect(gfx.subarray(engine.manifest.sprites.code * 128, engine.manifest.sprites.code * 128 + sprites.length)).toEqual(sprites);
    expect(gfx.subarray(0x41 * 64, 0x41 * 64 + 64).some((b) => b !== 0xff)).toBe(true); // "A"
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
