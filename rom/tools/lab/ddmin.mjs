// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// The QA run's minimizer (docs/experiments/harness.md, "QA run"): reduces
// the inputs of a finding, as run-length steps, to a short script that
// still makes the board model report the same kind of finding near the
// same place, and writes it as a harness input script (run.mjs --script,
// device romtest --input). Delta debugging (ddmin) after a few coarse
// passes (drop a whole port, drop a whole button, merge a button's
// presses into one hold). Replays restart from a snapshot of the machine
// taken just before the first frame whose inputs changed, so cutting late
// steps costs only the frames after them.
//
//   node rom/tools/lab/ddmin.mjs ZIP --script FILE.json --kind KIND --out FILE.json
//       [--x X --y Y] [--max-seconds 120] [--exit-rule auto|all|touch] [--symbols FILE]
//
// Without --x/--y the target is the first finding of KIND the script gives.

import fs from "node:fs";
import { BUTTONS, Machine, formatScript, readScript } from "./lab.mjs";
import { Checker, KINDS, masksOf } from "./qa.mjs";

/** How close a replay's finding must be to the original one (px). */
const NEAR = { x: 192, y: 112 };
/** Frames between snapshots of a replay. */
const EVERY = 240;

const matches = (x, t) => x.kind === t.kind && (t.x === null || x.x === null || (Math.abs(x.x - t.x) <= NEAR.x && Math.abs(x.y - t.y) <= NEAR.y));
const BITS = BUTTONS.map((b, i) => [b, 1 << i]);
const portsOf = (masks, f) => masks.map((p) => new Set(BITS.filter(([, bit]) => p[f] & bit).map(([b]) => b)));

/**
 * Minimizes `steps` for `target` ({ kind, frame, x, y }). Returns { ok,
 * steps, frame (where the last good replay found it), found (that finding),
 * runs, seconds, complete (false when the time ran out first) }.
 */
export async function minimize({ zip, symbols, steps, target, checkerOpts = {}, maxSeconds = 40 }) {
  const t0 = performance.now();
  const m = await Machine.open(zip, { symbols });
  const limit = target.frame + 600; // a candidate that has not shown it 10 s after the original fails
  const fresh = new Checker(checkerOpts);
  let base = { masks: null, snaps: new Map([[0, { m: m.snapshot(), c: fresh.copyState() }]]) };
  const checker = new Checker(checkerOpts);
  let runs = 0;
  const elapsed = () => (performance.now() - t0) / 1000;

  /** Replays a candidate; { hit, frame, found, masks, snaps }. */
  function test(cand) {
    runs++;
    const masks = masksOf(cand, limit);
    let d = limit;
    if (base.masks)
      for (let f = 0; f < limit && d === limit; f++) for (let p = 0; p < 4; p++) if (masks[p][f] !== base.masks[p][f]) d = f;
    let from = 0;
    for (const k of base.snaps.keys()) if (k <= d && k > from) from = k;
    const snaps = new Map([...base.snaps].filter(([k]) => k <= from));
    const s = snaps.get(from);
    m.restore(s.m);
    checker.setState(s.c);
    for (let f = from; f < limit; f++) {
      if (f > from && f % EVERY === 0) snaps.set(f, { m: m.snapshot(), c: checker.copyState() });
      const ports = portsOf(masks, f);
      try {
        m.step(ports);
      } catch (e) {
        const x = { kind: "fault", x: null, y: null, frame: f + 1, detail: { error: e.message } };
        return matches(x, target) ? { hit: true, frame: f + 1, found: x, masks, snaps } : { hit: false };
      }
      const lab = m.labFast();
      for (const x of checker.check(m.frame, lab, () => m.collisionFast(lab), ports)) if (matches(x, target)) return { hit: true, frame: m.frame, found: x, masks, snaps };
    }
    return { hit: false };
  }

  let cur = steps.filter((s) => s.from < target.frame).map((s) => ({ ...s, to: Math.min(s.to, target.frame - 1) }));
  let best = test(cur);
  if (!best.hit) return { ok: false, steps: cur, frame: null, found: null, runs, seconds: elapsed(), complete: true };
  base = best;
  let complete = true;
  const tryCand = (cand) => {
    if (elapsed() > maxSeconds) {
      complete = false;
      return false;
    }
    if (cand.length === cur.length && JSON.stringify(cand) === JSON.stringify(cur)) return false;
    const r = test(cand);
    if (!r.hit) return false;
    cur = cand;
    best = r;
    base = r;
    return true;
  };

  // coarse passes: a whole port, a whole button, a button's presses merged into one hold
  for (const p of [4, 3, 2, 1]) tryCand(cur.filter((s) => (s.port ?? 1) !== p));
  for (const b of BUTTONS) tryCand(cur.filter((s) => !s.buttons.includes(b)));
  const groups = [...new Set(cur.map((s) => `${s.port ?? 1}:${s.buttons.join("+")}`))];
  for (const g of groups) {
    const mine = cur.filter((s) => `${s.port ?? 1}:${s.buttons.join("+")}` === g);
    if (mine.length < 2) continue;
    const merged = { ...mine[0], from: Math.min(...mine.map((s) => s.from)), to: Math.max(...mine.map((s) => s.to)) };
    tryCand([...cur.filter((s) => !mine.includes(s)), merged].sort((a, b) => a.from - b.from || (a.port ?? 1) - (b.port ?? 1)));
  }

  // ddmin: remove chunks (the latest first: replays of late cuts are cheap)
  let n = 2;
  while (cur.length >= 2 && complete) {
    const size = Math.ceil(cur.length / n);
    const chunks = [];
    for (let i = 0; i < cur.length; i += size) chunks.push([i, i + size]);
    let reduced = false;
    for (let c = chunks.length - 1; c >= 0 && !reduced; c--) {
      const [a, b] = chunks[c];
      if (tryCand([...cur.slice(0, a), ...cur.slice(b)])) {
        reduced = true;
        n = Math.max(n - 1, 2);
      }
    }
    if (!reduced) {
      if (n >= cur.length) break;
      n = Math.min(cur.length, n * 2);
    }
  }
  if (cur.length === 1 && complete) tryCand([]);

  // shorten each hold: end it as early as the finding allows (binary search on
  // "to"; a hold that cannot lose its second half is kept as it is, which
  // saves the replays of holds the finding needs to the end)
  for (let i = 0; i < cur.length && complete; i++) {
    let lo = cur[i].from, hi = cur[i].to;
    if (hi - lo < 2 || !tryCand(cur.map((s, k) => (k === i ? { ...s, to: (lo + hi) >> 1 } : s)))) continue;
    hi = (lo + hi) >> 1;
    while (lo < hi && complete) {
      const mid = (lo + hi) >> 1;
      const cand = cur.map((s, k) => (k === i ? { ...s, to: mid } : s));
      if (tryCand(cand)) hi = mid;
      else lo = mid + 1;
    }
  }
  return { ok: true, steps: cur, frame: best.frame, found: best.found, runs, seconds: elapsed(), complete };
}

// ---------------------------------------------------------------- command line

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
  const valued = ["--script", "--kind", "--out", "--x", "--y", "--max-seconds", "--exit-rule", "--symbols"];
  const zip = args.find((a, i) => !a.startsWith("--") && !valued.includes(args[i - 1]));
  const file = opt("--script"), kind = opt("--kind"), out = opt("--out");
  if (!zip || !file || !kind || !out || !KINDS[kind]) {
    console.error(`usage: node rom/tools/lab/ddmin.mjs ZIP --script FILE.json --kind KIND --out FILE.json [--x X --y Y] [--max-seconds S] [--exit-rule R] [--symbols FILE]\nkinds: ${Object.keys(KINDS).join(", ")}`);
    process.exit(2);
  }
  const script = readScript(file);
  const symbols = opt("--symbols");
  const checkerOpts = { exitRule: opt("--exit-rule", "auto") };
  let target;
  if (opt("--x") !== undefined) target = { kind, x: Number(opt("--x")), y: Number(opt("--y")), frame: script.frames ?? 3600 };
  else {
    // the first finding of that kind in the whole script
    const n = script.frames ?? Math.max(...script.steps.map((s) => s.to + 1), 0) + 1800;
    const masks = masksOf(script.steps, n);
    const mm = await Machine.open(zip, { symbols });
    const ck = new Checker(checkerOpts);
    for (let f = 0; f < n && !target; f++) {
      const ports = portsOf(masks, f);
      mm.step(ports);
      const lab = mm.labFast();
      target = ck.check(mm.frame, lab, () => mm.collisionFast(lab), ports).find((x) => x.kind === kind);
    }
    if (!target) {
      console.error(`the script gives no ${kind} finding in ${n} frames`);
      process.exit(1);
    }
  }
  const r = await minimize({ zip, symbols, steps: script.steps, target, checkerOpts, maxSeconds: Number(opt("--max-seconds", 120)) });
  if (!r.ok) {
    console.error(`the script does not give ${kind} near (${target.x}, ${target.y})`);
    process.exit(1);
  }
  fs.writeFileSync(out, formatScript({ name: `${script.name ?? "script"}: ${kind}, minimized`, frames: r.frame + 60, checkpoints: [r.frame], steps: r.steps }));
  console.log(JSON.stringify({ kind, target: { frame: target.frame, x: target.x, y: target.y }, steps: { from: script.steps.length, to: r.steps.length }, frame: r.frame, runs: r.runs, seconds: +r.seconds.toFixed(1), complete: r.complete }, null, 1));
}
