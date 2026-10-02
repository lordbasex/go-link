// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Case B step 2: the colors of the pack's pictures (node colors.mjs PACK_DIR), evidence for D-104
import fs from "node:fs";
import { readPng } from "../../../../../rom/tools/png.mjs";
const dir = process.argv[2];
for (const f of ["levels/level-1/play.png", "levels/level-1/far.png", "levels/level-1/collision.png", "tilesets/ts-city.png", "tilesets/ts-sky.png"]) {
  const img = readPng(fs.readFileSync(dir + "/" + f));
  const colors = new Map();
  let transparent = 0;
  for (let i = 0; i < img.w * img.h; i++) {
    if (img.rgba[i * 4 + 3] === 0) { transparent++; continue; }
    const k = [0, 1, 2, 3].map((c) => img.rgba[i * 4 + c].toString(16).padStart(2, "0")).join("");
    colors.set(k, (colors.get(k) || 0) + 1);
  }
  console.log(f, img.w, img.h, "transparent", transparent, "colors", colors.size);
  console.log("  ", [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, n]) => k + ":" + n).join(" "));
}
// far: per row band colors
const far = readPng(fs.readFileSync(dir + "/levels/level-1/far.png"));
for (let y = 0; y < far.h; y += 32) {
  const s = new Set();
  for (let yy = y; yy < y + 32; yy++) for (let x = 0; x < far.w; x++) { const o = (yy * far.w + x) * 4; s.add(far.rgba.slice(o, o + 4).toString("hex")); }
  console.log("far row", y / 32, [...s].join(" "));
}
