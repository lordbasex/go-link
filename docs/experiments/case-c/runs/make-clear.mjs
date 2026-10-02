// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Turns a recorded route-player run (rom/tools/lab/run.mjs --player ...)
// into case C's clear script: the inputs it pressed, checkpoints at the
// spec's moments and expectations on the lab state at each of them.
//
//   node docs/experiments/case-c/runs/make-clear.mjs RUN_DIR > docs/experiments/case-c/runs/clear.json

import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const inputs = JSON.parse(fs.readFileSync(path.join(dir, "inputs.json"), "utf8"));
const states = fs
  .readFileSync(path.join(dir, "state.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));
const first = (test) => states.find((s) => s.lab && test(s.lab))?.f;
const at = {
  playing: first((l) => l.mode === "playing"),
  onStack: first((l) => l.players[0].y === 352 && l.players[0].x < 240),
  ledgeCiv: first((l) => l.civilians[0].rescued),
  enemy0: first((l) => !l.enemies[0].alive),
  upperDock: first((l) => l.players[0].y === 256 && l.players[0].ground),
  enemy1: first((l) => !l.enemies[1].alive),
  dockCiv: first((l) => l.civilians[1].rescued),
  enemy2: first((l) => !l.enemies[2].alive),
  clear: first((l) => l.sectionClear),
};
for (const [k, v] of Object.entries(at)) if (v === undefined) throw new Error(`the run never reached ${k}`);
const end = at.clear + 120;
const expect = [
  { frame: 150, path: "mode", equals: "title" },
  { frame: at.playing, path: "mode", equals: "playing" },
  { frame: at.playing, path: "players.0.energy", equals: 3 },
  { frame: at.playing, path: "flags.exit", equals: true },
  { frame: at.onStack, path: "players.0.y", equals: 352 },
  { frame: at.ledgeCiv, path: "civilians.0.rescued", equals: true },
  { frame: at.ledgeCiv, path: "players.0.score", equals: 500 },
  { frame: at.enemy0, path: "enemies.0.alive", equals: false },
  { frame: at.enemy0, path: "players.0.score", equals: 600 },
  { frame: at.upperDock, path: "players.0.y", equals: 256 },
  { frame: at.enemy1, path: "enemies.1.alive", equals: false },
  { frame: at.dockCiv, path: "civilians.1.rescued", equals: true },
  { frame: at.enemy2, path: "enemies.2.alive", equals: false },
  { frame: at.clear, path: "sectionClear", equals: true },
  { frame: at.clear, path: "players.0.x", min: 1440, max: 1504 },
  { frame: end, path: "mode", equals: "clear" },
  { frame: end, path: "players.0.score", equals: 1300 },
  { frame: end, path: "players.0.energy", equals: 3 },
];
const checkpoints = [...new Set([150, at.playing, at.onStack, at.ledgeCiv, at.enemy0, at.upperDock, at.enemy1, at.dockCiv, at.enemy2, at.clear, end])].sort((a, b) => a - b);
const script = {
  name: "case-c-clear",
  description:
    "Case C (Willy Maker's Create ROM, Game Spec v1): Coin, 1P Start, then the route player's recorded inputs: up the crates, a jump to the one-way ledge (civilian 1), down + jump to the dock, the lower trooper shot, up the 160 px ladder, the upper trooper shot, civilian 2, off the dock's end, the exit's trooper shot, into the exit (SECTION CLEAR).",
  frames: end,
  checkpoints,
  expect,
  steps: inputs.steps,
};
process.stdout.write(JSON.stringify(script, null, 1) + "\n");
console.error(JSON.stringify(at));
