// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Measures the spec's rules on recorded runs (state.jsonl of the harness):
// how far the camera ever went back from its farthest x while playing, the
// highest jump (feet rise from the floor it left), the climbing speed, the
// Troopers' patrol range, and the frames of blinking after each hit.
//
//   node docs/experiments/case-a/tools/rules-check.mjs RUN_DIR...

import fs from "node:fs";

const out = { camBackMax: 0, jumpPeak: 0, climbPxPerFrame: [], patrol: {}, blink: [] };
for (const dir of process.argv.slice(2)) {
  const lines = fs.readFileSync(`${dir}/state.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  let far = 0, jumpFrom = null, prev = null, play = false;
  for (const { f, lab } of lines) {
    if (!lab) continue;
    if (lab.mode === "playing" && !play) far = lab.cam.x;
    play = lab.mode === "playing";
    if (play) {
      far = Math.max(far, lab.cam.x);
      out.camBackMax = Math.max(out.camBackMax, far - lab.cam.x);
      const p = lab.players[0];
      const q = prev && prev.players[0];
      if (q && p.active && q.active) {
        if (p.state === "air" && q.state !== "air" && q.state !== "climb" && p.y < q.y) jumpFrom = q.y;
        if (jumpFrom !== null && p.state === "air") out.jumpPeak = Math.max(out.jumpPeak, jumpFrom - p.y);
        if (p.state !== "air") jumpFrom = null;
        if (p.state === "climb" && q.state === "climb" && p.y !== q.y) out.climbPxPerFrame.push(Math.abs(p.y - q.y));
        if (p.energy < q.energy) out.blink.push({ dir, f, hurt: p.hurt });
      }
      lab.enemies.forEach((e, i) => {
        const r = (out.patrol[i] ||= { min: Infinity, max: -Infinity });
        if (e.alive) [r.min, r.max] = [Math.min(r.min, e.x), Math.max(r.max, e.x)];
      });
    }
    prev = lab;
  }
}
const c = out.climbPxPerFrame;
out.climbPxPerFrame = c.length ? { frames: c.length, mean: +(c.reduce((a, b) => a + b, 0) / c.length).toFixed(3) } : null;
for (const r of Object.values(out.patrol)) r.range = r.max - r.min;
console.log(JSON.stringify(out, null, 1));
