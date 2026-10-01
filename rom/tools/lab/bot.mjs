// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// The route bot of experiment 1 (docs/experiments/harness.md): a player for
// run.mjs's protocol that plays from the lab state and the collision map.
// It plans a path over the level's standing spots (walk, push up a crate,
// fall off an edge, drop through a ledge, climb a ladder, jump up to a
// ledge), heads for the nearest goal (civilians to rescue, enemies when the
// section needs them all down, then the exit), fights the enemies it meets
// on its floor and answers one action of the closed list per decision.
// Deterministic: the same states give the same actions.
//
//   node rom/tools/lab/run.mjs ZIP --out DIR --player "node rom/tools/lab/bot.mjs"
//
// Options (after the command): --no-fight (never fires), --verbose (stderr),
// --seed S (a different but repeatable game: with probability --noise,
// default 0.05 with a seed, a decision is replaced by a random action).

import readline from "node:readline";

const CELL = { EMPTY: 0, SOLID: 1, ONEWAY: 2, LADDER: 3, CRATE: 4 };
const FROM_TEXT = { ".": 0, "#": 1, "=": 2, H: 3, C: 4 };
const COST = { walk: 1, push: 4, fall: 2, drop: 3, climb: 1, jump: 8 };
const argOf = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const opts = {
  fight: !process.argv.includes("--no-fight"),
  verbose: process.argv.includes("--verbose"),
  seed: argOf("--seed") === null ? null : Number(argOf("--seed")),
  noise: argOf("--noise") === null ? null : Number(argOf("--noise")),
};
if (opts.noise === null) opts.noise = opts.seed === null ? 0 : 0.05;
/** mulberry32: a small seeded generator, so seeded games repeat exactly. */
let rngState = (opts.seed ?? 0) >>> 0;
function rand() {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const log = (...a) => opts.verbose && process.stderr.write(a.join(" ") + "\n");

let grid = null; // { cols, rows, at(c, r) }
let hello = null;
const mem = { edge: null, hist: [], blocked: new Set(), stuckTries: 0, lastGoal: null };

function setMap(map) {
  const cells = map.rows_text.map((row) => [...row].map((ch) => FROM_TEXT[ch] ?? 0));
  grid = {
    cols: map.cols,
    rows: map.rows,
    at(c, r) {
      if (c < 0 || c >= this.cols || r >= this.rows) return CELL.SOLID;
      if (r < 0) return CELL.EMPTY;
      return cells[r][c];
    },
  };
}

const solid = (t) => t === CELL.SOLID || t === CELL.CRATE;
const ladderTop = (c, r) => grid.at(c, r) === CELL.LADDER && grid.at(c, r - 1) !== CELL.LADDER;
/** Feet can stand on top of cell row r in column c, with room for the body above. */
function node(c, r) {
  if (c < 0 || c >= grid.cols || r <= 0 || r >= grid.rows) return false;
  const t = grid.at(c, r);
  const support = solid(t) || t === CELL.ONEWAY || ladderTop(c, r);
  return support && !solid(grid.at(c, r - 1)) && !solid(grid.at(c, r - 2)) && !solid(grid.at(c, r - 3));
}
const free = (c, r) => !solid(grid.at(c, r - 1)) && !solid(grid.at(c, r - 2)) && !solid(grid.at(c, r - 3));
const key = (c, r) => r * 256 + c;

/** The moves from a standing spot. */
function edges(c, r) {
  const out = [];
  const add = (kind, c2, r2, extra = {}) => {
    const k = `${kind}:${c},${r}>${c2},${r2}`;
    if (!mem.blocked.has(k)) out.push({ kind, c: c2, r: r2, from: [c, r], id: k, ...extra });
  };
  for (const d of [-1, 1]) {
    const n = c + d;
    if (node(n, r)) add("walk", n, r);
    else if (solid(grid.at(n, r - 1))) {
      // a wall in front: pushed up when it is at most 32 px high
      for (const up of [1, 2]) if (node(n, r - up) && !solid(grid.at(n, r - up - 1)) && free(c, r - up)) {
        add("push", n, r - up);
        break;
      }
    } else if (free(n, r)) {
      for (let r2 = r + 1; r2 < grid.rows; r2++) if (node(n, r2)) {
        add("fall", n, r2);
        break;
      }
    }
  }
  const t = grid.at(c, r);
  if (t === CELL.ONEWAY || ladderTop(c, r)) for (let r2 = r + 1; r2 < grid.rows; r2++) if (node(c, r2)) {
    add("drop", c, r2);
    break;
  }
  // a ladder above the feet: climb to its top
  if (grid.at(c, r - 1) === CELL.LADDER) {
    let top = r - 1;
    while (grid.at(c, top - 1) === CELL.LADDER) top--;
    if (node(c, top)) add("climb", c, top, { dir: "up", rows: r - top });
  }
  if (ladderTop(c, r)) {
    let bottom = r;
    while (grid.at(c, bottom + 1) === CELL.LADDER) bottom++;
    if (node(c, bottom + 1)) add("climb", c, bottom + 1, { dir: "down", rows: bottom + 1 - r });
  }
  // jumps up to 4 rows (64 px) onto a ledge, up to 3 columns away
  for (let up = 1; up <= 4; up++)
    for (let dx = -3; dx <= 3; dx++) {
      const c2 = c + dx, r2 = r - up;
      if (!node(c2, r2) || node(c2, r)) continue;
      if (grid.at(c2, r2) !== CELL.ONEWAY && !ladderTop(c2, r2) && !solid(grid.at(c2, r2))) continue;
      let clear = true;
      for (const cc of dx ? [c, c2] : [c]) for (let rr = r2 - 3; rr < r; rr++) if (solid(grid.at(cc, rr)) && !(cc === c2 && rr === r2)) clear = false;
      if (clear) add("jump", c2, r2, { dx });
    }
  return out;
}

/** Cheapest paths from a spot (Dijkstra over the small grid). */
function paths(c, r) {
  const dist = new Map([[key(c, r), 0]]);
  const prev = new Map();
  const open = [[0, c, r]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
    const [d, cc, rr] = open.shift();
    if (d > (dist.get(key(cc, rr)) ?? Infinity)) continue;
    for (const e of edges(cc, rr)) {
      const nd = d + COST[e.kind] * (e.kind === "climb" ? e.rows : e.kind === "walk" ? 1 : 1);
      const k = key(e.c, e.r);
      if (nd < (dist.get(k) ?? Infinity)) {
        dist.set(k, nd);
        prev.set(k, e);
        open.push([nd, e.c, e.r]);
      }
    }
  }
  return { dist, prev };
}

function firstEdge(prev, c, r, goal) {
  let k = key(goal[0], goal[1]);
  let e = prev.get(k);
  let first = null;
  const route = [];
  while (e) {
    route.unshift(e);
    first = e;
    if (e.from[0] === c && e.from[1] === r) break;
    e = prev.get(key(e.from[0], e.from[1]));
  }
  return { first, route };
}

/** The spot a feet position stands on (or the nearest one in the same row). */
function spotOf(x, y) {
  const r = y >> 4;
  const c = x >> 4;
  for (const dc of [0, (x & 15) < 8 ? -1 : 1, (x & 15) < 8 ? 1 : -1]) if (node(c + dc, r)) return [c + dc, r];
  return null;
}

/** The spot nearest to a world point (a goal), searching down then around. */
function spotNear(x, y) {
  const c0 = x >> 4;
  for (let rr = y >> 4; rr < grid.rows; rr++) for (const dc of [0, -1, 1, -2, 2]) if (node(c0 + dc, rr)) return [c0 + dc, rr];
  return null;
}

function goals(lab) {
  const out = [];
  for (const [i, v] of lab.civilians.entries()) if (!v.rescued) out.push({ kind: "civilian", i, x: v.x, y: v.y });
  const allDownNeeded = lab.flags.exit;
  if (allDownNeeded) for (const [i, e] of lab.enemies.entries()) if (e.alive) out.push({ kind: "enemy", i, x: e.x, y: e.y });
  if (lab.flags.exit && lab.exit.x0 >= 0 && !lab.enemies.some((e) => e.alive)) out.push({ kind: "exit", x: (lab.exit.x0 + lab.exit.x1) >> 1, y: lab.exit.y });
  return out;
}

function toward(me, x) {
  return x > me.x ? "right" : "left";
}

function decide(msg) {
  const lab = msg.lab;
  const me = lab.players[msg.port - 1];
  if (!me?.active) return { action: "wait", why: "not in the game" };
  // remember where we were, to notice being stuck
  mem.hist.push([me.x, me.y]);
  if (mem.hist.length > 16) mem.hist.shift();

  // fight: an enemy on this floor, close enough to shoot
  if (opts.fight) {
    const foes = lab.enemies.filter((e) => e.alive && Math.abs(e.y - me.y) < 16 && Math.abs(e.x - me.x) < 170);
    if (foes.length && me.ground) {
      foes.sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x));
      const f = foes[0];
      const side = f.x >= me.x ? 1 : -1;
      if (side !== me.facing && Math.abs(f.x - me.x) > 4) return { action: side > 0 ? "right" : "left", why: `turn to the enemy at x ${f.x}` };
      return { action: "fire", why: `enemy at x ${f.x}, ${Math.abs(f.x - me.x)} px away` };
    }
  }

  // in the air: steer toward the edge's landing spot
  if (!me.ground && !me.climbing) {
    const e = mem.edge;
    if (e) {
      const tx = e.c * 16 + 8;
      if (Math.abs(tx - me.x) > 3) return { action: toward(me, tx), why: `steer to x ${tx} in the air` };
    }
    return { action: "wait", why: "in the air" };
  }
  if (me.climbing) {
    const e = mem.edge;
    const up = !e || e.kind !== "climb" || e.dir === "up";
    return { action: up ? "climb_up" : "climb_down", why: "on the ladder" };
  }

  const here = spotOf(me.x, me.y);
  const gs = goals(lab);
  if (!gs.length) return { action: "wait", why: "nothing left to do" };
  if (!here) return { action: toward(me, gs[0].x), why: "between spots" };
  const { dist, prev } = paths(here[0], here[1]);
  let best = null;
  for (const g of gs) {
    const s = spotNear(g.x, g.y);
    if (!s) continue;
    const d = dist.get(key(s[0], s[1]));
    if (d === undefined) continue;
    if (!best || d < best.d) best = { g, s, d };
  }
  if (!best) return { action: toward(me, gs[0].x), why: `no path to the ${gs[0].kind}` };
  if (best.d === 0) {
    // on the goal's spot: close the last pixels
    if (Math.abs(best.g.x - me.x) > 6) return { action: toward(me, best.g.x), why: `to the ${best.g.kind} at x ${best.g.x}` };
    return { action: "wait", why: `at the ${best.g.kind}` };
  }
  const { first: e, route } = firstEdge(prev, here[0], here[1], best.s);
  mem.edge = e;

  // stuck: no movement in 16 decisions -> forbid this move for a while
  const [x0, y0] = mem.hist[0];
  if (mem.hist.length >= 16 && Math.abs(x0 - me.x) < 3 && Math.abs(y0 - me.y) < 3) {
    mem.blocked.add(e.id);
    mem.hist = [];
    log("stuck, blocking", e.id);
    return { action: "jump", why: `stuck at x ${me.x}; blocking ${e.kind} to (${e.c},${e.r})` };
  }

  const cx = e.from[0] * 16 + 8;
  const tx = e.c * 16 + 8;
  const goalTxt = `${best.g.kind} at x ${best.g.x}, ${route.length} moves`;
  switch (e.kind) {
    case "walk":
    case "push":
    case "fall": {
      const straight = route.slice(0, 4).every((s) => s.kind === "walk" && s.c > s.from[0]);
      if (straight && route.length >= 4) return { action: "run_right", why: `run right toward the ${goalTxt}` };
      return { action: toward(me, tx), why: `${e.kind} toward the ${goalTxt}` };
    }
    case "drop":
      return { action: "drop", why: `drop through to row ${e.r} for the ${goalTxt}` };
    case "climb":
      if (Math.abs(me.x - cx) > 5) return { action: toward(me, cx), why: `line up with the ladder at x ${cx}` };
      return { action: e.dir === "up" ? "climb_up" : "climb_down", why: `climb ${e.dir} for the ${goalTxt}` };
    case "jump": {
      if (Math.abs(me.x - cx) > 5) return { action: toward(me, cx), why: `line up to jump at x ${cx}` };
      const side = e.dx > 0 ? 1 : e.dx < 0 ? -1 : me.facing;
      if (side !== me.facing) return { action: side > 0 ? "right" : "left", why: "turn before the jump" };
      return { action: "jump", why: `jump up ${e.from[1] - e.r} rows to x ${tx} for the ${goalTxt}` };
    }
  }
  return { action: "wait", why: "no move" };
}

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.type === "hello") {
    hello = msg;
    log("hello", JSON.stringify(hello.actions));
    return;
  }
  if (msg.type === "end") {
    log("end", JSON.stringify(msg.summary));
    process.exit(0);
  }
  if (msg.type !== "state") return;
  if (msg.map) setMap(msg.map);
  let ans;
  try {
    ans = grid ? decide(msg) : { action: "right", why: "no collision map: walk right" };
    if (opts.noise > 0 && rand() < opts.noise) {
      const list = hello?.actions ?? ["right", "left", "jump", "run_right", "fire", "climb_up", "climb_down", "drop", "wait"];
      ans = { action: list[Math.floor(rand() * list.length)], why: `noise (seed ${opts.seed}) instead of ${ans.action}` };
    }
  } catch (e) {
    ans = { error: `bot: ${e.stack || e.message}` };
  }
  process.stdout.write(JSON.stringify(ans) + "\n");
});
