// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Case A's extra runs: every script in docs/experiments/case-a/runs/ in the
// simulator (state, checkpoints, MP4) and on the real core (checkpoints,
// MP4), then the pixel comparison at the checkpoints (tolerance 0).
//
//   node docs/experiments/case-a/tools/replay-all.mjs ZIP OUT_DIR DEVICE [name...]
//
// OUT_DIR/<name>/{sim,core,compare}; OUT_DIR/replay-all.json sums it up.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [zip, out, device, ...only] = process.argv.slice(2);
if (!zip || !out || !device) {
  console.error("usage: node replay-all.mjs ZIP OUT_DIR DEVICE [name...]");
  process.exit(2);
}
const runs = "docs/experiments/case-a/runs";
const names = only.length ? only : fs.readdirSync(runs).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
const summary = [];
for (const name of names) {
  const script = path.join(runs, `${name}.json`);
  const dir = path.join(out, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  const sim = spawnSync("node", ["rom/tools/lab/run.mjs", zip, "--out", path.join(dir, "sim"), "--script", script, "--mp4"], { encoding: "utf8" });
  const s = JSON.parse(fs.readFileSync(path.join(dir, "sim", "summary.json"), "utf8"));
  const core = spawnSync(device, ["romtest", "--json", "--input", script, "--frames-dir", path.join(dir, "core", "frames"), "--mp4", path.join(dir, "core", "run.mp4"), zip], { encoding: "utf8" });
  fs.writeFileSync(path.join(dir, "core", "replay.json"), core.stdout);
  execFileSync("node", ["rom/tools/lab/compare.mjs", path.join(dir, "sim", "frames"), path.join(dir, "core", "frames"), "--out", path.join(dir, "compare"), "--tolerance", "0"], { encoding: "utf8" });
  const cmp = JSON.parse(fs.readFileSync(path.join(dir, "compare", "compare.json"), "utf8"));
  const frames = cmp.results;
  const worst = cmp.worstDifferPct;
  const row = {
    name,
    simExit: sim.status,
    coreExit: core.status,
    expectOk: s.expectOk,
    failed: (s.expect || []).filter((e) => !e.ok),
    error: s.error,
    cleared: s.cleared,
    clearFrame: s.clearFrame,
    gameOverFrame: s.gameOverFrame,
    checkpoints: frames.length,
    worstDifferPct: worst,
    seconds: (Date.now() - t0) / 1000,
  };
  summary.push(row);
  console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(out, "replay-all.json"), JSON.stringify(summary, null, 1) + "\n");
