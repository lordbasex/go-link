// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Lists the frames of a harness run where the game state changes in a way
// that matters (mode, credits, players in or out, energy, enemy hits,
// rescues), from its state.jsonl. Case A wrote its scripts with it.
//
//   node docs/experiments/case-a/tools/events.mjs RUN_DIR

import fs from "node:fs";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node events.mjs RUN_DIR");
  process.exit(2);
}
const lines = fs.readFileSync(`${dir}/state.jsonl`, "utf8").trim().split("\n");
let prev = null;
for (const line of lines) {
  const s = JSON.parse(line);
  const a = s.lab;
  if (!a) continue;
  if (prev) {
    const ev = [];
    if (a.mode !== prev.mode) ev.push(`mode ${prev.mode} -> ${a.mode}`);
    if (a.credits !== prev.credits) ev.push(`credits ${prev.credits} -> ${a.credits}`);
    a.players.forEach((p, i) => {
      const q = prev.players[i];
      if (p.active !== q.active) ev.push(`P${i + 1} active ${q.active} -> ${p.active} at (${p.x},${p.y})`);
      if (p.energy !== q.energy && p.active && q.active) ev.push(`P${i + 1} energy ${q.energy} -> ${p.energy}`);
    });
    a.enemies.forEach((e, i) => {
      const q = prev.enemies[i];
      if (e.hp !== q.hp) ev.push(`enemy ${i} hp ${q.hp} -> ${e.hp}${e.alive ? "" : " (down)"}`);
    });
    a.civilians.forEach((c, i) => {
      if (c.rescued && !prev.civilians[i].rescued) ev.push(`civilian ${i} rescued`);
    });
    if (ev.length) console.log(s.f, ev.join("; "));
  }
  prev = a;
}
