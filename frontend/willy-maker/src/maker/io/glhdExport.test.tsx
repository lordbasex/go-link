// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { objectLayer } from "../model";
import { projectFromTemplate } from "../templates";
import { buildGlhd, glhdLevel, glhdName, GlhdError } from "./glhdExport";
import { decodePng } from "./png";
import { readZip } from "./zip";

const city = new Uint8Array(readFileSync(resolve(__dirname, "../../../public/willy-maker/tiles/city16.png")));

function platformer() {
  const p = projectFromTemplate("buenos-aires", { title: "Neon Run", layout: "slammast", players: 2, levelName: "L" });
  p.genre = "platformer";
  return p;
}

it("exports a platformer as a go-link HD package the core reads", async () => {
  const p = platformer();
  const zip = await buildGlhd(p, city);
  const files = await readZip(zip);
  expect([...files.keys()].sort()).toEqual(["level.json", "manifest.json", "tiles.png"]);
  const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json")!));
  expect(manifest).toMatchObject({ format: 1, title: "Neon Run", genre: "platformer", players: 2, level: "level.json", pictures: { tiles: "tiles.png" } });
  const level = JSON.parse(new TextDecoder().decode(files.get("level.json")!));
  // the core's limits: 40-1024 columns, 23-64 rows, one letter per cell of the known ones
  expect(level.width).toBeGreaterThanOrEqual(40);
  expect(level.height).toBeGreaterThanOrEqual(23);
  expect(level.height).toBeLessThanOrEqual(64);
  expect(level.rows).toHaveLength(level.height);
  for (const row of level.rows) {
    expect(row).toHaveLength(level.width);
    expect(row).toMatch(/^[.#B=oCFE]+$/);
  }
  const [c, r] = level.start;
  expect(level.rows[r][c]).toBe(".");
  const all = level.rows.join("");
  expect(all).toContain("#");
  expect(all).toContain("E");
  expect(all).toContain("F");
  // the city's ground, brick and platform tiles
  const tiles = await decodePng(files.get("tiles.png")!);
  expect([tiles.w, tiles.h]).toEqual([64, 16]);
  // the same project gives the same bytes
  expect(await buildGlhd(platformer(), city)).toEqual(zip);
  expect(glhdName(p)).toBe("neon_run.glhd");
  // WM_GLHD_OUT keeps the package for the device's end to end test (e2e/tests/hd-core.spec.ts)
  if (process.env.WM_GLHD_OUT) writeFileSync(process.env.WM_GLHD_OUT, zip);
});

it("places coins, checkpoints and the goal on free cells and pads a short level", () => {
  const p = projectFromTemplate("empty", { title: "Tiny", layout: "slammast", players: 1, levelName: "L", screens: 1, height: 224 });
  p.genre = "platformer";
  const items = objectLayer(p.levels[0]!).items;
  items.push({ name: "c1", type: "pickup", item: "coin", x: 100, y: 150 });
  items.push({ name: "k1", type: "checkpoint", x: 200, y: 192 });
  const level = glhdLevel(p);
  expect(level.height).toBe(23); // 14 rows of 16 px, with sky added above
  expect(level.width).toBe(40); // 24 columns, the last one repeated
  const all = level.rows.join("");
  expect(all).toContain("o");
  expect(all).toContain("C");
});

it("exports only platformers", () => {
  const p = platformer();
  p.genre = "beatemup" as typeof p.genre;
  expect(() => glhdLevel(p)).toThrow(GlhdError);
});
