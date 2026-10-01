// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Validation level 3 from the command line: the same power-on test as
// Willy Maker's Export (@go-link/cps1-sim's runPowerOn) on a zip.
//
//   node rom/tools/lab/validate.mjs ZIP [--json] [--shot FILE.png]
//
// Exit code 0 when every step passes.

import fs from "node:fs";
import { readZip, setOf, runPowerOn, WASM } from "./lab.mjs";
import { writePng } from "../png.mjs";

const args = process.argv.slice(2);
const zip = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--shot");
if (!zip) {
  console.error("usage: node rom/tools/lab/validate.mjs ZIP [--json] [--shot FILE.png]");
  process.exit(2);
}
const res = await runPowerOn(readZip(zip), { wasm: fs.readFileSync(WASM), set: setOf(zip) });
const shot = args.includes("--shot") ? args[args.indexOf("--shot") + 1] : null;
if (shot && res.shot) writePng(shot, res.shot.w, res.shot.h, res.shot.rgba);
if (args.includes("--json")) {
  const { shot: s, ...rest } = res;
  console.log(JSON.stringify({ ...rest, shot: s ? { w: s.w, h: s.h, frame: s.frame } : null }, null, 2));
} else {
  console.log(`Power-on test (level 3) of ${zip} (${res.set})`);
  for (const s of res.steps) console.log(`  ${s.ok ? "ok  " : "FAIL"}  ${s.name.padEnd(9)} ${s.detail}`);
  console.log(`${res.ok ? "PASSED" : "FAILED"}: ${res.frames} frames in ${res.ms} ms`);
}
process.exit(res.ok ? 0 : 1);
