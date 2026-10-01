// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Turns a recorded touch-player run into case C's damage script: the
// inputs, a checkpoint at each hit and at GAME OVER, and expectations (1 of
// 3 energy per touch, 1 s of blinking in place, game over with no credit).
//
//   node docs/experiments/case-c/runs/make-damage.mjs RUN_DIR > docs/experiments/case-c/runs/damage.json

import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const inputs = JSON.parse(fs.readFileSync(path.join(dir, "inputs.json"), "utf8"));
const states = fs
  .readFileSync(path.join(dir, "state.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));
const hits = [];
let last = 3;
for (const s of states) {
  const p = s.lab?.players?.[0];
  if (!p || s.lab.mode !== "playing" && s.lab.mode !== "game_over") continue;
  const e = p.active ? p.energy : 0;
  if (e < last) hits.push({ f: s.f, energy: e, hurt: p.hurt, x: p.x, before: states[states.indexOf(s) - 1]?.lab?.players?.[0]?.x });
  if (s.lab.mode === "playing" || s.lab.mode === "game_over") last = e;
}
const over = states.find((s) => s.lab?.mode === "game_over")?.f;
if (hits.length < 3 || !over) throw new Error(`expected 3 hits and a game over, got ${hits.length} hits, game over ${over}`);
const expect = [
  { frame: hits[0].f - 1, path: "players.0.energy", equals: 3 },
  { frame: hits[0].f, path: "players.0.energy", equals: 2 },
  { frame: hits[0].f, path: "players.0.hurt", min: 59, max: 60 },
  { frame: hits[0].f, path: "players.0.x", equals: hits[0].before },
  { frame: hits[0].f, path: "flags.damage", equals: true },
  { frame: hits[0].f + 30, path: "players.0.energy", equals: 2 },
  { frame: hits[1].f, path: "players.0.energy", equals: 1 },
  { frame: hits[2].f, path: "players.0.active", equals: false },
  { frame: hits[2].f, path: "players.0.state", equals: "dead" },
  { frame: over, path: "mode", equals: "game_over" },
  { frame: over, path: "credits", equals: 0 },
  { frame: over + 300, path: "mode", equals: "game_over" },
];
const end = over + 420;
const script = {
  name: "case-c-damage",
  description: "Case C, spec checklist: one coin, 1P Start, up the crates, onto the ledge and down, then the player stands in the lower Trooper's patrol without shooting: each touch costs 1 of 3 energy and blinks 1 s in place; at 0 energy with no credit the game shows GAME OVER and goes back to the title.",
  frames: end,
  checkpoints: [...new Set([hits[0].f, hits[0].f + 30, hits[1].f, hits[2].f, over, over + 120, end])].sort((a, b) => a - b),
  expect,
  steps: inputs.steps,
};
process.stdout.write(JSON.stringify(script, null, 1) + "\n");
console.error(JSON.stringify({ hits, over }));
