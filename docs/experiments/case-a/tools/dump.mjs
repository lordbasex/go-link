// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Prints a harness run's state every N frames, one line per frame: mode,
// camera, players 1-2 (state, position, energy, score), each enemy's x and
// hits left (x when down), the civilians rescued and the inputs held.
//
//   node docs/experiments/case-a/tools/dump.mjs RUN_DIR [every=50]

import fs from "node:fs";

const dir = process.argv[2];
const every = +(process.argv[3] || 50);
if (!dir) {
  console.error("usage: node dump.mjs RUN_DIR [every]");
  process.exit(2);
}
const lines = fs.readFileSync(`${dir}/state.jsonl`, "utf8").trim().split("\n");
for (const line of lines) {
  const s = JSON.parse(line);
  const a = s.lab;
  if (!a || (s.f % every && s.f !== lines.length)) continue;
  const ps = a.players
    .slice(0, 2)
    .map((p) => `${p.active ? "A" : "-"}${p.state}(${p.x},${p.y}) e${p.energy} s${p.score}`)
    .join(" | ");
  const en = a.enemies.map((e) => `${e.x}:${e.alive ? e.hp : "x"}`).join(" ");
  const civ = a.civilians.map((c) => (c.rescued ? 1 : 0)).join("");
  console.log(s.f, a.mode, `cam(${a.cam.x},${a.cam.y})`, ps, "en", en, "civ", civ, "in", s.in);
}
