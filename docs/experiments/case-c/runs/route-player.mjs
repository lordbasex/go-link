// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Case C's route player (experiment 1): plays Game Spec v1's level made with
// Willy Maker the way the spec describes it, one goal after another, from
// the lab state (docs/experiments/harness.md, the player protocol). The
// runner records what it pressed as inputs.json; clear.json is that
// recording plus checkpoints and expectations, so the scripted run, the
// real core replay and every juror replay exactly these inputs.
//
//   node rom/tools/lab/run.mjs ZIP --out DIR --player "node docs/experiments/case-c/runs/route-player.mjs"

import readline from "node:readline";

// the spec level as case C built it (frontend/apps/web/src/willy-maker/rom/specFixture.ts)
const LADDER_X = 488;
const PLAN = [
  { why: "walk right: push up the 32 px crate, then the 64 px stack", until: (p) => p.x >= 222 && p.y === 352 && p.ground, act: "right" },
  { why: "jump right onto the one-way ledge (64 px up)", until: (p) => p.y === 352 && p.ground && p.x >= 262, act: "jump", then: "right" },
  { why: "rescue the civilian on the ledge", until: (p, s) => s.civilians[0].rescued, act: "right" },
  { why: "down + jump: drop through the ledge to the dock", until: (p) => p.y === 416 && p.ground, act: "drop", then: "wait" },
  { why: "walk to the lower dock's trooper", until: (p) => p.x >= 520, act: "right" },
  { why: "shoot the lower trooper (3 shots)", until: (p, s) => !s.enemies[0].alive, act: "fire" },
  { why: "back to the ladder", until: (p) => p.x <= LADDER_X + 2, act: "left" },
  { why: "climb the ladder to the upper dock (160 px)", until: (p) => p.y === 256 && p.ground, act: "climb_up" },
  { why: "walk along the upper dock", until: (p) => p.x >= 680, act: "right" },
  { why: "shoot the upper trooper", until: (p, s) => !s.enemies[1].alive, act: "fire" },
  { why: "rescue the civilian on the upper dock", until: (p, s) => s.civilians[1].rescued, act: "right" },
  { why: "walk off the dock's end, down to the lower dock", until: (p) => p.y === 416 && p.ground && p.x > 1030, act: "right" },
  { why: "walk to the trooper guarding the exit", until: (p) => p.x >= 1240, act: "right" },
  { why: "shoot the exit's trooper", until: (p, s) => !s.enemies[2].alive, act: "fire" },
  { why: "into the exit", until: (p, s) => s.sectionClear, act: "right" },
];

let step = 0;
let last = "";
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const m = JSON.parse(line);
  if (m.type !== "state") return;
  const s = m.lab;
  const p = s?.players?.[0];
  let action = "wait";
  if (p && p.active) {
    while (step < PLAN.length && PLAN[step].until(p, s)) step++;
    const g = PLAN[step];
    if (g) action = g.then && last === g.act ? g.then : g.act;
    // after a jump, keep steering right until it lands
    if (g && g.act === "jump" && !p.ground) action = "right";
  }
  last = action;
  process.stdout.write(JSON.stringify({ action, step, goal: PLAN[step]?.why ?? "done" }) + "\n");
});
