// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Compares the simulator's frames with the real core's at the same frame
// numbers (docs/experiments/harness.md, acceptance 4): for each
// fNNNNNN.png in both folders, how many pixels differ, by how much, and a
// picture of the difference.
//
//   node rom/tools/lab/compare.mjs SIM_DIR CORE_DIR [--out DIR] [--tolerance T]
//       [--frames 300,600] [--search K] [--json]
//
// --tolerance: a pixel "differs" when a channel differs by more than T
// (default 8; the two draw the same palette words with slightly different
// colour formulas). --search K: when a core frame does not match, also try
// the core's frames N-K..N+K that exist (to find a timing offset).
// --out writes diff-NNNNNN.png (white where pixels differ) and
// pair-NNNNNN.png (sim | core | diff) plus compare.json.

import fs from "node:fs";
import path from "node:path";
import { readPng, writePng } from "../png.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const dirs = args.filter((a, i) => !a.startsWith("--") && !["--out", "--tolerance", "--frames", "--search"].includes(args[i - 1]));
if (dirs.length !== 2) {
  console.error("usage: node rom/tools/lab/compare.mjs SIM_DIR CORE_DIR [--out DIR] [--tolerance T] [--frames LIST] [--search K] [--json]");
  process.exit(2);
}
const [simDir, coreDir] = dirs;
const tol = Number(opt("--tolerance", 8));
const search = Number(opt("--search", 0));
const out = opt("--out", null);
const only = opt("--frames", null)?.split(",").map(Number);
const frameOf = (f) => Number(/^f(\d+)\.png$/.exec(f)?.[1] ?? NaN);
const list = (d) => new Set(fs.readdirSync(d).map(frameOf).filter((n) => !Number.isNaN(n)));
const simFrames = list(simDir);
const coreFrames = list(coreDir);
const frames = (only ?? [...simFrames].filter((n) => coreFrames.has(n))).sort((a, b) => a - b);
const load = (d, n) => readPng(fs.readFileSync(path.join(d, `f${String(n).padStart(6, "0")}.png`)));

/** Pixel difference of two RGBA pictures of the same size. */
export function diff(a, b, t = tol) {
  if (a.w !== b.w || a.h !== b.h) return { sizeMismatch: `${a.w}x${a.h} vs ${b.w}x${b.h}`, differ: 1, exact: 0 };
  const n = a.w * a.h;
  let exact = 0, differ = 0, sum = 0;
  const mask = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const d = Math.max(Math.abs(a.rgba[p] - b.rgba[p]), Math.abs(a.rgba[p + 1] - b.rgba[p + 1]), Math.abs(a.rgba[p + 2] - b.rgba[p + 2]));
    sum += d;
    if (d === 0) exact++;
    const v = d > t ? 255 : Math.round(d * 4);
    if (d > t) differ++;
    mask[p] = mask[p + 1] = mask[p + 2] = v;
    mask[p + 3] = 255;
  }
  return { exact: exact / n, differ: differ / n, meanAbs: sum / n, mask };
}

const results = [];
for (const n of frames) {
  if (!simFrames.has(n) || !coreFrames.has(n)) {
    results.push({ frame: n, missing: !simFrames.has(n) ? "sim" : "core" });
    continue;
  }
  const a = load(simDir, n);
  const b = load(coreDir, n);
  const d = diff(a, b);
  const r = { frame: n, differPct: +(d.differ * 100).toFixed(3), exactPct: +(d.exact * 100).toFixed(3), meanAbs: +(d.meanAbs ?? 0).toFixed(3), ...(d.sizeMismatch ? { sizeMismatch: d.sizeMismatch } : {}) };
  if (search && d.differ > 0.001) {
    let best = { offset: 0, differ: d.differ };
    for (let k = -search; k <= search; k++) {
      if (!k || !coreFrames.has(n + k)) continue;
      const e = diff(a, load(coreDir, n + k));
      if (e.differ < best.differ) best = { offset: k, differ: e.differ };
    }
    r.bestOffset = best.offset;
    r.bestDifferPct = +(best.differ * 100).toFixed(3);
  }
  if (out && d.mask) {
    fs.mkdirSync(out, { recursive: true });
    const tag = String(n).padStart(6, "0");
    writePng(path.join(out, `diff-${tag}.png`), a.w, a.h, d.mask);
    const w = a.w * 3 + 8, pair = new Uint8Array(w * a.h * 4);
    for (let y = 0; y < a.h; y++)
      for (const [img, x0] of [[a.rgba, 0], [b.rgba, a.w + 4], [d.mask, a.w * 2 + 8]]) pair.set(img.subarray(y * a.w * 4, (y + 1) * a.w * 4), (y * w + x0) * 4);
    writePng(path.join(out, `pair-${tag}.png`), w, a.h, pair);
    r.diffPng = `diff-${tag}.png`;
    r.pairPng = `pair-${tag}.png`;
  }
  results.push(r);
}
const summary = { sim: path.resolve(simDir), core: path.resolve(coreDir), tolerance: tol, frames: results.length, worstDifferPct: Math.max(0, ...results.map((r) => r.differPct ?? 100)), results };
if (out) fs.writeFileSync(path.join(out, "compare.json"), JSON.stringify(summary, null, 2) + "\n");
if (args.includes("--json")) console.log(JSON.stringify(summary, null, 2));
else {
  console.log(`frame     differ%   exact%   meanAbs  (tolerance ${tol})`);
  for (const r of results)
    console.log(r.missing ? `${String(r.frame).padEnd(9)} missing in ${r.missing}` : `${String(r.frame).padEnd(9)} ${String(r.differPct).padStart(7)}  ${String(r.exactPct).padStart(7)}  ${String(r.meanAbs).padStart(7)}${r.bestOffset !== undefined ? `  best offset ${r.bestOffset}: ${r.bestDifferPct}%` : ""}`);
  console.log(`worst: ${summary.worstDifferPct}% of the pixels differ`);
}
