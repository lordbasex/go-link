// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { decodePng } from "../io/png";
import { CITY_TILESET, SKY_TILESET } from "../templates/tiles";
import { ENGINE_USE } from "../board/cps1";
import { packGame, type Engine, type Picture } from "./pack";
import { specProject } from "./specFixture";
import { HERO_ID, HERO_PALETTES, heroCharacter, heroPicture } from "./heroFixture";
import { estimateUsage, usageFromPack } from "./usage";

const PUBLIC = resolve(__dirname, "../../../public/willy-maker");
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

describe("board usage (T-27)", () => {
  it("counts the engine's share in the live estimate", () => {
    const u = estimateUsage(specProject());
    const by = Object.fromEntries(u.meters.map((m) => [m.id, m]));
    expect(ENGINE_USE.spritePalettes).toBe(engine.manifest.spritePalettes!.used);
    expect(ENGINE_USE.program).toBe(engine.manifest.program.size);
    expect(by.spritePalettes!.used).toBe(ENGINE_USE.spritePalettes);
    expect(by.program!.used).toBeGreaterThan(ENGINE_USE.program);
    expect(by.sound!.used).toBe(0);
    expect(u.peak.id).toBe("spritePalettes");
    expect(u.meters.every((m) => !m.measured)).toBe(true);
  });

  it("measures a real pack: graphics, program and sprite palettes", () => {
    const p = specProject();
    const pack = packGame(p, engine, (id) => pictures.get(id) ?? null);
    const u = usageFromPack(p, engine, pack);
    const by = Object.fromEntries(u.meters.map((m) => [m.id, m]));
    expect(u.measuredAt).toBeTypeOf("number");
    expect(by.graphics!.measured).toBe(true);
    // at least the engine's sprites and the font, far from the 6 MB
    expect(by.graphics!.used).toBeGreaterThanOrEqual(ENGINE_USE.sprites);
    expect(by.graphics!.used).toBeLessThan(512 * 1024);
    expect(by.program!.used).toBe(engine.manifest.program.size + pack.stats.dataBytes);
    expect(by.spritePalettes!.used).toBe(ENGINE_USE.spritePalettes);
  });

  it("an own hero adds its tiles and, past the engine's, its palettes", () => {
    const p = specProject();
    p.palettes.push(...HERO_PALETTES.map((x) => ({ ...x, colors: [...x.colors] })));
    p.characters.push(heroCharacter());
    p.settings.playerSlots = [
      { character: HERO_ID, variant: 0 },
      { character: "builtin:willy", variant: 1 },
      { character: "builtin:willy", variant: 2 },
      { character: "builtin:willy", variant: 3 },
    ];
    const base = usageFromPack(specProject(), engine, packGame(specProject(), engine, (id) => pictures.get(id) ?? null));
    const pack = packGame(p, engine, (id) => pictures.get(id) ?? null, (id) => (id === HERO_ID ? heroPicture() : null));
    const u = usageFromPack(p, engine, pack);
    const g = (x: typeof u, id: string) => x.meters.find((m) => m.id === id)!.used;
    expect(g(u, "graphics")).toBeGreaterThan(g(base, "graphics"));
    expect(g(u, "spritePalettes")).toBeGreaterThanOrEqual(g(base, "spritePalettes"));
  });
});
