// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Create ROM without a browser (T-14): Game Spec v1 saved as a project file
// and rebuilt by rom/headless.ts gives the same .zip as the Export tab's path.
// WM_PROJECT_OUT=<dir> also writes the project file there (for
// rom/tools/willy-rom.mjs).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { putAsset } from "../io/assets";
import { exportProjectZip, zipName } from "../io/projectZip";
import { CITY_TILESET, SKY_TILESET } from "../templates/tiles";
import { createRom } from "./createRom";
import { romFromProjectFile } from "./headless";
import type { Engine } from "./pack";
import { specProject } from "./specFixture";

const PUBLIC = resolve(__dirname, "../../../public/willy-maker");

function engine(): Engine {
  return { manifest: JSON.parse(readFileSync(resolve(PUBLIC, "engine/engine.json"), "utf8")), bin: new Uint8Array(readFileSync(resolve(PUBLIC, "engine/engine.bin"))) };
}

describe("Create ROM from a project file (T-14)", () => {
  it("gives the Export tab's .zip, byte for byte, with the review and the notes", async () => {
    const p = specProject();
    for (const ts of [CITY_TILESET, SKY_TILESET]) {
      const t = p.tilesets.find((x) => x.id === ts.id);
      if (t) t.image = await putAsset(new Uint8Array(readFileSync(resolve(PUBLIC, ts.url.replace("/willy-maker/", "")))), "image/png");
    }
    const file = await exportProjectZip(p);
    const out = process.env.WM_PROJECT_OUT;
    if (out) {
      mkdirSync(out, { recursive: true });
      writeFileSync(resolve(out, zipName(p)), file);
    }
    const rom = await romFromProjectFile(file, engine());
    expect(rom.title).toBe(p.title);
    expect(rom.errors).toEqual([]);
    expect(rom.missing).toEqual([]);
    expect(rom.name).toBe("slammast.zip");
    // the browser's path: the same project, its pictures from the asset store
    const browser = await createRom(p, () => {}, async () => engine());
    expect(rom.zip).toEqual(browser.zip);
    expect(rom.symbols).toBe(browser.symbols);
    // and the pictures were really used: the play tiles are in the graphics
    expect(rom.pack.stats.playTiles).toBeGreaterThan(1);
  });

  it("stops at review errors unless forced", async () => {
    const p = specProject();
    p.levels = [];
    p.settings.levels = [];
    const file = await exportProjectZip(p);
    await expect(romFromProjectFile(file, engine())).rejects.toThrow(/the review found \d+ error/);
  });
});
