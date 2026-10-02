// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Case A's script writer: turns a plan (sequential segments on port 1,
// plus fixed steps) into a harness input script (docs/experiments/harness.md).
//
//   node docs/experiments/case-a/tools/gen.mjs OUT.json PLAN.json
//
// A plan: { name, description, frames, checkpoints, expect, start,
// prelude: [steps], segments: [[n, ...buttons]], extra: [steps] }.
// Segments run one after another from frame `start`: [205, "right"] holds
// right for 205 frames, [10] waits 10 frames. `prelude` and `extra` are
// steps copied as they are (other ports, overlapping presses).

import fs from "node:fs";

const [out, planFile] = process.argv.slice(2);
if (!out || !planFile) {
  console.error("usage: node gen.mjs OUT.json PLAN.json");
  process.exit(2);
}
const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
let f = plan.start;
const steps = [...(plan.prelude || [])];
for (const [n, ...buttons] of plan.segments || []) {
  if (buttons.length) steps.push({ from: f, to: f + n - 1, port: 1, buttons });
  f += n;
}
steps.push(...(plan.extra || []));
const script = {
  name: plan.name,
  description: plan.description,
  frames: plan.frames || f + 60,
  checkpoints: plan.checkpoints || [],
  expect: plan.expect || [],
  steps,
};
fs.writeFileSync(out, JSON.stringify(script, null, 1) + "\n");
console.log(`${out}: ${steps.length} steps, segments end at frame ${f}`);
