// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Prints the AI pack's level-1.tmj: its keys, tilesets, every layer and object,
// and each tile layer as text (one character per cell). The builder's first
// reading of the pack (case B, step 2, journal 18:37).
// Usage: node inspect-pack.mjs <unzipped pack dir>

import fs from "node:fs";
const dir = process.argv[2];
const t = JSON.parse(fs.readFileSync(dir + "/levels/level-1.tmj"));
console.log(Object.keys(t), t.width, t.height, t.tilewidth, t.tileheight);
console.log(JSON.stringify(t.tilesets).slice(0, 1200));
console.log(JSON.stringify(t.properties || null));
for (const l of t.layers) {
  const { data, objects, ...rest } = l;
  console.log(JSON.stringify(rest).slice(0, 700));
  if (data) console.log("data len", data.length, "distinct", [...new Set(data)].join(","));
  if (objects) for (const o of objects) console.log(" obj", JSON.stringify(o));
}
for (const l of t.layers) {
  if (!l.data) continue;
  console.log("== " + l.name);
  const w = l.width || t.width;
  const h = l.height || t.height;
  for (let r = 0; r < h; r++) console.log(String(r).padStart(2) + " " + l.data.slice(r * w, (r + 1) * w).map((v) => (v ? (v % 36).toString(36) : ".")).join(""));
}
