// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Copies what replay-all.mjs and acceptance.mjs left in the shared folder
// into docs/experiments/case-a/evidence/ (small files only: the sim | core |
// difference pictures, the comparisons, the summaries and the event lists).
//
//   node docs/experiments/case-a/tools/collect-evidence.mjs SHARED_CASE_DIR

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const src = process.argv[2];
if (!src) {
  console.error("usage: node collect-evidence.mjs SHARED_CASE_DIR");
  process.exit(2);
}
const ev = "docs/experiments/case-a/evidence";
const copy = (from, to) => fs.existsSync(from) && fs.copyFileSync(from, to);
const runs = path.join(src, "runs");
for (const name of fs.readdirSync(runs)) {
  const r = path.join(runs, name);
  if (!fs.statSync(r).isDirectory()) continue;
  const d = path.join(ev, "runs", name);
  fs.mkdirSync(d, { recursive: true });
  for (const f of fs.readdirSync(path.join(r, "compare"))) if (/^pair-.*\.png$|^compare\.json$/.test(f)) copy(path.join(r, "compare", f), path.join(d, f));
  copy(path.join(r, "sim", "summary.json"), path.join(d, "sim-summary.json"));
  copy(path.join(r, "core", "replay.json"), path.join(d, "core-replay.json"));
  fs.writeFileSync(path.join(d, "events.txt"), execFileSync("node", ["docs/experiments/case-a/tools/events.mjs", path.join(r, "sim")], { encoding: "utf8" }));
}
copy(path.join(runs, "replay-all.json"), path.join(ev, "runs", "replay-all.json"));
const acc = path.join(src, "acceptance");
if (fs.existsSync(acc)) {
  const d = path.join(ev, "acceptance");
  fs.mkdirSync(d, { recursive: true });
  for (const f of ["acceptance.json", "level3.json", "level3.png", "level4.json"]) copy(path.join(acc, f), path.join(d, f));
  for (const kind of ["bot", "laya"]) {
    const k = path.join(acc, kind);
    if (!fs.existsSync(k)) continue;
    for (const g of fs.readdirSync(k)) {
      fs.mkdirSync(path.join(d, kind, g), { recursive: true });
      copy(path.join(k, g, "summary.json"), path.join(d, kind, g, "summary.json"));
      copy(path.join(k, g, "inputs.json"), path.join(d, kind, g, "inputs.json"));
    }
  }
}
console.log("evidence collected into", ev);
