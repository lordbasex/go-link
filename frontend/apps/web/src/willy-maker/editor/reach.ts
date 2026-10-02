// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Can the players get everywhere? A flood over the places a hero can stand,
// with the ROM prototype's moves: walking, falling, jumping up to 48 px
// (which also covers the 32 px push-climb), ladders, and dropping through
// one-way ledges. Ledges and objects it never reaches become warnings.

import { CELL, objectLayer, tagGrid, TAG_NUMBER, type CellGrid, type Level } from "../model";
import { measureJump } from "../engine/jump";

/** The hero is 44 px tall: three cells of headroom. */
const BODY = 3;
/** Rows a jump climbs: 48 px. The jump peaks at 61.9 px (-112 + 6 per frame, in 1/16 px), so a ledge 64 px up is out of reach (experiment 1, case C; engine/game.test.tsx). */
const JUMP_ROWS = 3;
/** Cells a jump crosses: farther when landing level or lower. */
const JUMP_REACH_LOW = 5;
const JUMP_REACH_HIGH = 3;

const { solid, oneway, ladder, crate, breakable, hazard } = TAG_NUMBER;
// crates and breakable walls can be shot away, so they never wall a route off
const blocks = (t: number) => t === solid;
const supports = (t: number) => t === solid || t === oneway || t === crate || t === breakable;

export interface Ledge {
  /** Pixels: the ledge's left and right edges and the y the feet stand on. */
  x0: number;
  x1: number;
  y: number;
  /** How far above the nearest reached floor under it, in px (0 when unknown). */
  rise: number;
}

export interface UnreachedObject {
  name: string;
  type: string;
  x: number;
  y: number;
}

export interface Reach {
  /** One flag per cell: a reached standing place (feet on top of the cell below). */
  reached: Uint8Array;
  cols: number;
  rows: number;
  ledges: Ledge[];
  objects: UnreachedObject[];
  /** The cells the search started from (the players' starts). */
  starts: number[];
  /** Rows a jump climbs with this game's rules (jumpRowsFor). */
  jumpRows: number;
}

/** Can a hero stand with the feet at the bottom of cell (c, r)? */
export function canStand(g: CellGrid, c: number, r: number): boolean {
  if (c < 0 || c >= g.cols || r < 0 || r >= g.rows - 1) return false;
  for (let k = 0; k < BODY; k++) {
    const t = g.get(c, r - k);
    if (r - k >= 0 && (blocks(t) || t === hazard)) return false;
  }
  const below = g.get(c, r + 1);
  return supports(below) || (below === ladder && g.get(c, r) !== ladder) || g.get(c, r) === ladder;
}

function bodyFree(g: CellGrid, c: number, r: number): boolean {
  if (c < 0 || c >= g.cols) return false;
  for (let k = 0; k < BODY; k++) if (r - k >= 0 && r - k < g.rows && blocks(g.get(c, r - k))) return false;
  return true;
}

/** No crate or breakable wall where the hero would stand (a real ledge, not inside one). */
function openBody(g: CellGrid, c: number, r: number): boolean {
  for (let k = 0; k < BODY; k++) {
    const t = g.get(c, r - k);
    if (r - k >= 0 && (t === crate || t === breakable)) return false;
  }
  return true;
}

/** Where a hero falling in column c from row r lands (or -1). */
function fall(g: CellGrid, c: number, r: number): number {
  for (let y = r; y < g.rows - 1; y++) {
    if (!bodyFree(g, c, y)) return -1;
    const below = g.get(c, y + 1);
    if (supports(below) || below === ladder) return canStand(g, c, y) ? y : -1;
  }
  return -1;
}

/**
 * The places one move takes a hero standing at (c, r): walking, walking off
 * an edge, dropping through a ledge, ladders and jumps. `to` gets every
 * candidate; the caller keeps the ones where a hero can stand.
 */
/**
 * Rows a jump climbs with a game's rules: measured on play mode's engine
 * (engine/jump.ts, T-13), 61.9 px plain, 107 px with the double jump, 239 px
 * with the jet pack, rounded down to rows with room to land.
 */
export function jumpRowsFor(rules: { doubleJump?: boolean; jetpack?: boolean }): number {
  return measureJump(rules).rows;
}

export function moves(g: CellGrid, c: number, r: number, to: (c: number, r: number) => void, jumpRows = JUMP_ROWS): void {
  const rows = g.rows;
  // walk, or walk off an edge and fall
  for (const dc of [-1, 1]) {
    if (canStand(g, c + dc, r)) to(c + dc, r);
    else if (bodyFree(g, c + dc, r)) {
      const land = fall(g, c + dc, r);
      if (land >= 0) to(c + dc, land);
    }
  }
  // drop through a one-way ledge (down + jump), or break the floor
  const under = g.get(c, r + 1);
  if (under === oneway || under === breakable || under === crate) {
    let below = r + 2;
    while (below < rows && g.get(c, below) === under) below++;
    const land = fall(g, c, below);
    if (land >= 0) to(c, land);
  }
  // ladders: up and down the run, and step off it on either side
  if (g.get(c, r) === ladder || g.get(c, r + 1) === ladder) {
    let top = g.get(c, r) === ladder ? r : r + 1;
    while (top > 0 && g.get(c, top - 1) === ladder) top--;
    let bottom = top;
    while (bottom + 1 < rows && g.get(c, bottom + 1) === ladder) bottom++;
    for (let y = top - 1; y <= bottom; y++) {
      to(c, y);
      to(c - 1, y);
      to(c + 1, y);
    }
    const land = fall(g, c, bottom + 1);
    if (land >= 0) to(c, land);
  }
  // jumps: up to 48 px up, landing anywhere lower within reach
  for (let up = 1; up <= jumpRows; up++) {
    // the head must not hit a ceiling on the way up
    if (r - up - BODY + 1 >= 0 && blocks(g.get(c, r - up - BODY + 1))) break;
    const reach = up > 2 ? JUMP_REACH_HIGH : JUMP_REACH_LOW;
    for (const dir of [-1, 1])
      for (let step = dir === -1 ? 1 : 0; step <= reach; step++) {
        const dc = dir * step;
        const tc = c + dc;
        // the way across at that height must be open
        if (step > 0 && !bodyFree(g, tc, r - up)) break;
        // straight ahead or onto a ledge at that height
        if (canStand(g, tc, r - up)) to(tc, r - up);
        else if (dc !== 0 && bodyFree(g, tc, r - up)) {
          const land = fall(g, tc, r - up);
          if (land >= 0) to(tc, land);
        }
      }
  }
}

export function reachability(level: Level, jumpRows = JUMP_ROWS): Reach {
  const g = tagGrid(level);
  const { cols, rows } = g;
  const reached = new Uint8Array(cols * rows);
  const queue: number[] = [];
  const startCells: number[] = [];
  const visit = (c: number, r: number) => {
    if (c < 0 || c >= cols || r < 0 || r >= rows) return;
    const i = r * cols + c;
    if (reached[i] || !canStand(g, c, r)) return;
    reached[i] = 1;
    queue.push(i);
  };
  const objects = objectLayer(level).items;
  const starts = objects.filter((o) => o.type === "player_start");
  for (const s of starts.length ? starts : objects.filter((o) => o.type === "checkpoint")) {
    const c = Math.floor(s.x / CELL);
    const r = Math.round(s.y / CELL) - 1;
    const land = fall(g, c, Math.max(0, r - 1));
    const sr = land >= 0 ? land : r;
    visit(c, sr);
    if (c >= 0 && c < cols && sr >= 0 && sr < rows && reached[sr * cols + c]) startCells.push(sr * cols + c);
  }

  while (queue.length) {
    const i = queue.shift()!;
    const c = i % cols;
    moves(g, c, (i - c) / cols, visit, jumpRows);
  }

  // ledges never reached: runs of standing places on a floor
  const ledges: Ledge[] = [];
  for (let r = 0; r < rows - 1; r++) {
    let c = 0;
    while (c < cols) {
      const isLedge = (x: number) => x < cols && canStand(g, x, r) && !reached[r * cols + x] && supports(g.get(x, r + 1)) && openBody(g, x, r);
      if (!isLedge(c)) {
        c++;
        continue;
      }
      const c0 = c;
      while (isLedge(c)) c++;
      if (c - c0 < 2) continue;
      let rise = 0;
      for (let y = r + 1; y < rows && !rise; y++) for (let x = c0; x < c && !rise; x++) if (reached[y * cols + x]) rise = (y - r) * CELL;
      ledges.push({ x0: c0 * CELL, x1: c * CELL, y: (r + 1) * CELL, rise });
    }
  }

  // objects the players must get to
  const unreached: UnreachedObject[] = [];
  for (const o of objects) {
    if (!["exit", "civilian", "pickup", "checkpoint", "player_start"].includes(o.type)) continue;
    const c = Math.floor(o.x / CELL);
    const r = Math.round(o.y / CELL) - 1;
    let ok = false;
    for (let dr = -2; dr <= 2 && !ok; dr++) for (let dc = -2; dc <= 2 && !ok; dc++) if (reached[(r + dr) * cols + c + dc] && c + dc >= 0 && c + dc < cols && r + dr >= 0 && r + dr < rows) ok = true;
    if (!ok) unreached.push({ name: o.name, type: o.type, x: o.x, y: o.y });
  }
  return { reached, cols, rows, ledges, objects: unreached, starts: [...new Set(startCells)], jumpRows };
}

/** What the route checks found: places with no way on, the camera's limit and the walk's length. */
export interface Routes {
  /** Reached places from which nobody can get to the exit (feet position, px), leftmost first. */
  traps: { x: number; y: number }[];
  /**
   * With a forward-only camera: null when the exit can be reached while the
   * camera only goes forward, or the farthest x players get to (px).
   */
  cameraStop: number | null;
  /** Frames the shortest route from the start to the exit takes at walking speed (null: no route). */
  walkFrames: number | null;
}

/** Walking: 1 px per frame; ladders 1.5 px per frame (engine/rules.ts). */
const WALK_FRAMES_PER_CELL = CELL;
const CLIMB_FRAMES_PER_CELL = Math.ceil((CELL * 16) / 24);

/**
 * How far the camera lets players go back from the farthest x reached, the
 * way engine/game.ts moves it: the camera aims a third of a screen ahead of
 * the players, never goes back more than `backtrack` from its farthest
 * point, and players stay 12 px inside the screen. `cap` is the farthest
 * the camera may go (a camera lock holding it).
 */
export function cameraMinX(farthest: number, levelW: number, backtrack: number, screenW = 384, cap = Infinity): number {
  const camFar = Math.max(0, Math.min(levelW - screenW, cap, farthest - Math.trunc(screenW / 3)));
  return camFar - backtrack + 12;
}

/** The moves between reached places, as a compact adjacency list: cell i's moves are to[count[i]] .. to[count[i + 1] - 1]. */
interface RouteGraph {
  g: CellGrid;
  count: Int32Array;
  to: Int32Array;
}

function routeGraph(level: Level, reach: Reach): RouteGraph {
  const g = tagGrid(level);
  const { cols, rows, reached } = reach;
  const n = cols * rows;
  const count = new Int32Array(n + 1);
  const each = (i: number, fn: (j: number) => void) => {
    const c = i % cols;
    moves(
      g,
      c,
      (i - c) / cols,
      (tc, tr) => {
        if (tc < 0 || tc >= cols || tr < 0 || tr >= rows) return;
        const j = tr * cols + tc;
        if (j !== i && reached[j]) fn(j);
      },
      reach.jumpRows,
    );
  };
  for (let i = 0; i < n; i++) if (reached[i]) each(i, () => count[i + 1]!++);
  for (let i = 0; i < n; i++) count[i + 1]! += count[i]!;
  const to = new Int32Array(count[n]!);
  const fill = count.slice(0, n);
  for (let i = 0; i < n; i++) if (reached[i]) each(i, (j) => (to[fill[i]!++] = j));
  return { g, count, to };
}

/** The same graph backwards: the moves into cell j come from from[rcount[j]] .. from[rcount[j + 1] - 1]. */
function reverseGraph(n: number, count: Int32Array, to: Int32Array): { rcount: Int32Array; from: Int32Array } {
  const rcount = new Int32Array(n + 1);
  for (let k = 0; k < to.length; k++) rcount[to[k]! + 1]!++;
  for (let i = 0; i < n; i++) rcount[i + 1]! += rcount[i]!;
  const from = new Int32Array(to.length);
  const rfill = rcount.slice(0, n);
  for (let i = 0; i < n; i++) for (let k = count[i]!; k < count[i + 1]!; k++) from[rfill[to[k]!]!++] = i;
  return { rcount, from };
}

/** The reached places within the window around an object (±2 cells of its feet), the same window the object check uses. */
function windowCells(reach: Reach, o: { x: number; y: number }): number[] {
  const { cols, rows, reached } = reach;
  const c = Math.floor(o.x / CELL);
  const r = Math.round(o.y / CELL) - 1;
  const out: number[] = [];
  for (let dr = -2; dr <= 2; dr++)
    for (let dc = -2; dc <= 2; dc++) {
      const cc = c + dc;
      const rr = r + dr;
      if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) continue;
      const i = rr * cols + cc;
      if (reached[i]) out.push(i);
    }
  return out;
}

/**
 * The route checks over a level the flood already searched: traps (level.trap),
 * the forward-only camera (level.camera) and the walk to the exit
 * (level.timer). They use the same moves as the flood.
 */
export function routes(level: Level, reach: Reach): Routes {
  const { g, count, to } = routeGraph(level, reach);
  const { cols, rows, reached } = reach;
  const n = cols * rows;

  // where the exit is (the same window the object check uses)
  const goal = new Uint8Array(n);
  let goals = 0;
  for (const o of objectLayer(level).items)
    if (o.type === "exit")
      for (const i of windowCells(reach, o))
        if (!goal[i]) {
          goal[i] = 1;
          goals++;
        }
  const out: Routes = { traps: [], cameraStop: null, walkFrames: null };
  if (!goals) return out;

  // traps: walk the moves backwards from the exit
  const { rcount, from } = reverseGraph(n, count, to);
  const good = new Uint8Array(n);
  const queue: number[] = [];
  for (let i = 0; i < n; i++)
    if (goal[i]) {
      good[i] = 1;
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const j = queue[q]!;
    for (let k = rcount[j]!; k < rcount[j + 1]!; k++) {
      const i = from[k]!;
      if (!good[i]) {
        good[i] = 1;
        queue.push(i);
      }
    }
  }
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const i = r * cols + c;
      if (reached[i] && !good[i]) out.traps.push({ x: c * CELL + CELL / 2, y: (r + 1) * CELL });
    }

  const starts = reach.starts;
  // the walk: the shortest route in frames (Dijkstra over the moves)
  const dist = new Float64Array(n).fill(Infinity);
  const heap = new MinHeap();
  for (const s of starts) {
    dist[s] = 0;
    heap.push(0, s);
  }
  while (heap.size) {
    const [d, i] = heap.pop()!;
    if (d > dist[i]!) continue;
    if (goal[i]) {
      out.walkFrames = d;
      break;
    }
    const ci = i % cols;
    const ri = (i - ci) / cols;
    for (let k = count[i]!; k < count[i + 1]!; k++) {
      const j = to[k]!;
      const cj = j % cols;
      const rj = (j - cj) / cols;
      const up = g.get(ci, ri) === ladder || g.get(cj, rj) === ladder ? CLIMB_FRAMES_PER_CELL : 4;
      const nd = d + Math.abs(cj - ci) * WALK_FRAMES_PER_CELL + Math.abs(rj - ri) * up;
      if (nd < dist[j]!) {
        dist[j] = nd;
        heap.push(nd, j);
      }
    }
  }

  // the camera: the smallest "farthest x" each place can be reached with
  if (level.camera?.forwardOnly !== false) {
    const back = Number(level.camera?.backtrack ?? 48);
    const xOf = (i: number) => (i % cols) * CELL + CELL / 2;
    const best = new Float64Array(n).fill(Infinity);
    const cam = new MinHeap();
    for (const s of starts) {
      best[s] = xOf(s);
      cam.push(best[s]!, s);
    }
    let farthest = 0;
    let done = false;
    while (cam.size) {
      const [m, i] = cam.pop()!;
      if (m > best[i]!) continue;
      farthest = Math.max(farthest, xOf(i));
      if (goal[i]) {
        done = true;
        break;
      }
      for (let k = count[i]!; k < count[i + 1]!; k++) {
        const j = to[k]!;
        const nm = Math.max(m, xOf(j));
        if (xOf(j) < cameraMinX(nm, level.size.w, back)) continue;
        if (nm < best[j]!) {
          best[j] = nm;
          cam.push(nm, j);
        }
      }
    }
    if (!done && out.walkFrames !== null) out.cameraStop = farthest;
  }
  return out;
}

/** Something the exit needs (an enemy) or a civilian that players can leave behind the camera for ever. */
export interface LeftBehind {
  name: string;
  type: string;
  x: number;
  y: number;
  /** The point of no return: the smallest farthest x (px) at which players may have lost the way back to it. */
  at: number;
}

const SCREEN_W = 384;

/**
 * The point of no return check (level.noreturn, docs/experiments/verdict.md
 * T-01 and J-01). With a forward-only camera, an object off the main route
 * (an enemy on a dock reached only by a ladder) can end up behind the camera
 * for ever: when the exit needs every enemy down, nothing ends the level.
 *
 * The search works on states (place, farthest x reached), the same camera
 * rule as `routes`. For each object:
 *
 * 1. Meeting it means standing in its window (±2 cells, as the object check).
 *    We assume players deal with what they meet (shoot the enemy, touch the
 *    civilian), so only objects players may never meet are reported.
 * 2. Backwards from the window, a bottleneck search gives each place the
 *    largest farthest x with which the window can still be reached
 *    (`keep[i]`): a smaller farthest x only lets the camera go further back,
 *    so the states that still meet the object are exactly those at or under it.
 * 3. Forwards from the start, without entering the window, every state the
 *    camera allows is visited; one whose farthest x is past its place's
 *    `keep` has lost the object. The smallest such farthest x is reported.
 *
 * A camera lock whose x range holds an enemy stops the camera at its right
 * edge while that enemy stands (engine/game.ts `activeLock`), so the search
 * caps the camera there for that enemy; we assume the lock catches the camera
 * on its way (it does whenever the camera comes from the left). Civilians do
 * not hold locks. One player, at walking moves: a sound approximation, not a
 * proof (an enemy may also walk or be shot from farther than its window).
 */
export function leftBehind(level: Level, reach: Reach, objects: { name: string; type: string; x: number; y: number }[]): LeftBehind[] {
  if (level.camera?.forwardOnly === false || !objects.length || !reach.starts.length) return [];
  const { count, to } = routeGraph(level, reach);
  const { cols, rows, reached } = reach;
  const n = cols * rows;
  const { rcount, from } = reverseGraph(n, count, to);
  const back = Number(level.camera?.backtrack ?? 48);
  const levelW = level.size.w;
  const xOf = (i: number) => (i % cols) * CELL + CELL / 2;
  const locks = objectLayer(level).items.filter((o) => o.type === "camera_lock");
  // the reached places, numbered compactly
  const id = new Int32Array(n).fill(-1);
  const cells: number[] = [];
  for (let i = 0; i < n; i++) if (reached[i]) id[i] = cells.push(i) - 1;
  const out: LeftBehind[] = [];

  /**
   * Backwards from a window: for each place, the largest farthest x with
   * which a player standing there can still get into the window (-Infinity:
   * never). `cap` is the camera lock holding the camera, if any.
   */
  const keepFrom = (win: number[], cap: number) => {
    const camMin = (far: number) => cameraMinX(far, levelW, back, SCREEN_W, cap);
    const maxX = Number.isFinite(cap) ? cap + SCREEN_W - 12 : Infinity;
    // the largest farthest x with which a player may still stand at x
    const stay = (x: number) => (camMin(1e9) <= x ? Infinity : x + Math.trunc(SCREEN_W / 3) + back - 12);
    const keep = new Float64Array(n).fill(-Infinity);
    const heap = new MinHeap();
    for (const w of win)
      if (xOf(w) <= maxX) {
        keep[w] = Infinity;
        heap.push(-Infinity, w);
      }
    while (heap.size) {
      const [negK, j] = heap.pop()!;
      if (-negK < keep[j]!) continue;
      // a move into j works from a state whose farthest x is at most m
      const m = Math.min(keep[j]!, stay(xOf(j)));
      if (xOf(j) > m) continue;
      for (let k = rcount[j]!; k < rcount[j + 1]!; k++) {
        const i = from[k]!;
        if (xOf(i) > maxX || m <= keep[i]!) continue;
        keep[i] = m;
        heap.push(-m, i);
      }
    }
    return keep;
  };
  // only states that can still get to the exit count: the others are level.trap's and level.camera's
  const exitKeep = keepFrom(
    objectLayer(level)
      .items.filter((o) => o.type === "exit")
      .flatMap((o) => windowCells(reach, o)),
    Infinity,
  );

  for (const o of objects) {
    const win = windowCells(reach, o);
    if (!win.length) continue; // nobody reaches it at all: level.object-reach says so
    let cap = Infinity;
    if (o.type === "enemy")
      for (const l of locks) {
        const w = Number(l.w ?? SCREEN_W);
        if (o.x >= l.x && o.x <= l.x + w) cap = Math.min(cap, Math.max(l.x, l.x + w - SCREEN_W));
      }
    const camMin = (far: number) => cameraMinX(far, levelW, back, SCREEN_W, cap);
    // players stay 12 px inside the screen: past a held camera's right side nobody goes
    const maxX = Number.isFinite(cap) ? cap + SCREEN_W - 12 : Infinity;
    const open = (i: number) => xOf(i) <= maxX;
    const inWin = new Uint8Array(n);
    for (const w of win) inWin[w] = 1;
    // 2. backwards
    const keep = keepFrom(win, cap);

    // 3. forwards: states (place, farthest column), avoiding the window
    const span = Math.ceil((SCREEN_W + back) / CELL) + 2;
    const seen = new Uint8Array(cells.length * span);
    const queue: number[] = [];
    let at = Infinity;
    const visit = (i: number, far: number) => {
      const off = far - (i % cols);
      if (off < 0 || off >= span || inWin[i] || !open(i)) return;
      const s = id[i]! * span + off;
      if (seen[s]) return;
      seen[s] = 1;
      queue.push(i, far);
    };
    for (const s of reach.starts) visit(s, s % cols);
    for (let q = 0; q < queue.length; q += 2) {
      const i = queue[q]!;
      const far = queue[q + 1]!;
      const farX = far * CELL + CELL / 2;
      if (farX > keep[i]! && farX <= exitKeep[i]! && farX < at) at = farX;
      for (let k = count[i]!; k < count[i + 1]!; k++) {
        const j = to[k]!;
        const nf = Math.max(far, j % cols);
        if (xOf(j) < camMin(nf * CELL + CELL / 2)) continue;
        visit(j, nf);
      }
    }
    if (Number.isFinite(at)) out.push({ name: o.name, type: o.type, x: o.x, y: o.y, at });
  }
  return out;
}

/** A small binary heap of [key, value] pairs, smallest key first. */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(k: number, v: number): void {
    const { keys, vals } = this;
    let i = keys.length;
    keys.push(k);
    vals.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= k) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = k;
    vals[i] = v;
  }
  pop(): [number, number] | undefined {
    const { keys, vals } = this;
    if (!keys.length) return undefined;
    const top: [number, number] = [keys[0]!, vals[0]!];
    const k = keys.pop()!;
    const v = vals.pop()!;
    if (keys.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= keys.length) break;
        const r = l + 1;
        const c = r < keys.length && keys[r]! < keys[l]! ? r : l;
        if (keys[c]! >= k) break;
        keys[i] = keys[c]!;
        vals[i] = vals[c]!;
        i = c;
      }
      keys[i] = k;
      vals[i] = v;
    }
    return top;
  }
}
