// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Case C's damage player (experiment 1, spec checklist): it walks to the
// lower dock's Trooper and stands in its patrol without shooting, so every
// touch costs 1 of 3 energy (with 1 s of blinking between hits) until the
// player is out and, with no credit left, the game shows GAME OVER.
//
//   node rom/tools/lab/run.mjs ZIP --out DIR --player "node docs/experiments/case-c/runs/touch-player.mjs" --frames 2400

import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin });
let dropped = false;
rl.on("line", (line) => {
  const m = JSON.parse(line);
  if (m.type !== "state") return;
  const p = m.lab?.players?.[0];
  let action = "wait";
  if (p?.active) {
    // the crates, the jump to the ledge and down to the dock, as the route player
    if (!dropped && p.y === 352 && p.x < 240) action = "right";
    if (!dropped && p.y === 352 && p.x >= 222 && p.x < 262 && p.ground) action = "jump";
    else if (!dropped && p.y < 416 && !p.ground) action = "right";
    else if (!dropped && p.y === 352 && p.x >= 262) action = "drop";
    else if (!dropped && p.y === 416 && p.x > 250) dropped = true;
    else if (!dropped) action = "right";
    // then into the Trooper's patrol, and stay there
    if (dropped) action = p.x < 640 ? "right" : "wait";
  }
  process.stdout.write(JSON.stringify({ action }) + "\n");
});
