// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Prints case A's level as text: the collision map with its objects.
//
//   node docs/experiments/case-a/tools/levelmap.mjs > docs/experiments/case-a/evidence/level-map.txt

import { buildLevel, COLS, ROWS, OBJECTS } from "../../../../rom/tools/level.mjs";
const gfx = { tile16() {} };
const lv = buildLevel(gfx, 0x4000);
const ch = [".", "#", "=", "H", "C"];
const g = [];
for (let r = 0; r < ROWS; r++) g.push(Array.from({ length: COLS }, (_, c) => ch[lv.col[r * COLS + c]]));
const put = (x, y, s) => {
  const c = Math.floor(x / 16);
  const r = Math.floor((y - 1) / 16);
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) g[r][c] = s;
};
OBJECTS.civilians.forEach((o) => put(o.x, o.y, "V"));
OBJECTS.robots.forEach((o) => {
  for (let x = o.min; x <= o.max; x += 16) if (g[Math.floor((o.y - 1) / 16)][Math.floor(x / 16)] === ".") put(x, o.y, "-");
  put(o.x, o.y, "T");
});
put(OBJECTS.start.x, OBJECTS.start.y, "1");
put(OBJECTS.start.x - 24, OBJECTS.start.y, "2");
for (let x = OBJECTS.exit.x0; x < OBJECTS.exit.x1; x += 16) put(x, OBJECTS.exit.y, "E");
const ruler = (d) => Array.from({ length: COLS }, (_, c) => (d === 10 ? Math.floor(c / 10) % 10 : c % 10)).join("");
console.log(`Case A level: ${COLS} x ${ROWS} cells of 16 px (${COLS * 16} x ${ROWS * 16} px). Each line: row, its top y in px, the cells.`);
console.log("Legend: . empty  # solid  = one-way  H ladder  C crate  1/2 player starts  T Trooper (- its patrol)  V civilian  E exit zone (feet row)");
console.log("         " + ruler(10));
console.log("         " + ruler(1));
g.forEach((row, r) => console.log(`${String(r).padStart(2)} ${String(r * 16).padStart(4)}  ${row.join("")}`));
