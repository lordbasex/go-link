// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Case B step 2: prints P1, enemies and civilians from a runner's state.jsonl every N frames
import fs from "node:fs";
const [dir, every = "30", from = "0", to = "99999"] = process.argv.slice(2);
for (const line of fs.readFileSync(dir + "/state.jsonl", "utf8").split("\n")) {
  if (!line) continue;
  const s = JSON.parse(line);
  if (s.f < +from || s.f > +to || s.f % +every) continue;
  const l = s.lab;
  if (!l) continue;
  const p = l.players[0];
  const en = l.enemies.map((e) => `${e.alive ? "A" : "-"}${e.hp}@${e.x}`).join(" ");
  const cv = l.civilians.map((c) => (c.rescued ? "R" : "_")).join("");
  console.log(`${s.f} ${l.mode} in=[${s.in}] p1 x${p.x} y${p.y} st=${p.state} e${p.energy} hurt${p.hurt} sc${p.score} cam${l.cam.x},${l.cam.y} | ${en} | civ ${cv} clear=${l.sectionClear}`);
}
