// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The destructible page: its bodies, the grid that finds them, damage,
// chain destruction (a broken card takes everything on it) and how much of
// the page is gone.

import { SpatialGrid, rayBox } from "./grid";
import { healthOf, weightOf, type Body, type BodyInit, type Rect } from "./types";

/** What a hit did, for the host to show and play. */
export type HitResult =
  | { kind: "hurt"; id: number; x: number; y: number }
  | { kind: "killed"; ids: number[]; x: number; y: number };

export interface RayHit {
  id: number;
  t: number;
  x: number;
  y: number;
}

export class World {
  readonly bodies: Body[];
  readonly grid = new SpatialGrid();
  readonly totalWeight: number;
  destroyedWeight = 0;
  alive = 0;
  /** Where the page ends: the ground under everything. */
  readonly floor: number;
  readonly width: number;

  constructor(inits: readonly BodyInit[], size: { width: number; height: number }) {
    this.width = size.width;
    this.floor = size.height;
    this.bodies = inits.map((b, id) => {
      const hp = healthOf(b.kind, b.w, b.h);
      return {
        ...b,
        id,
        children: [],
        hp,
        maxHp: hp,
        alive: true,
        weight: weightOf(b.kind),
        platform: b.kind !== "backdrop",
        solid: b.kind !== "backdrop",
      };
    });
    for (const b of this.bodies) if (b.parent >= 0) this.bodies[b.parent]?.children.push(b.id);
    for (const b of this.bodies) this.grid.insert(b.id, b);
    this.alive = this.bodies.filter((b) => b.kind !== "backdrop").length;
    this.totalWeight = this.bodies.reduce((s, b) => s + b.weight, 0);
  }

  /** The share of the page destroyed, 0-1. */
  destroyed(): number {
    return this.totalWeight ? this.destroyedWeight / this.totalWeight : 1;
  }

  /**
   * Backdrops with nothing left over them crumble (their ids, for the host
   * to hide). Call now and then; there are only a few.
   */
  collapseBackdrops(): number[] {
    const out: number[] = [];
    for (const b of this.bodies) {
      if (!b.alive || b.kind !== "backdrop") continue;
      // Hiding a band hides everything inside it on the page, even what
      // sticks out of its box: all of it must be gone first.
      if (this.hasAliveInside(b.id)) continue;
      if (this.near(b, (o) => o.kind !== "backdrop").length) continue;
      b.alive = false;
      this.grid.remove(b.id);
      out.push(b.id);
    }
    return out;
  }

  /** Whether any piece (not a band) inside a body is still whole. */
  hasAliveInside(id: number): boolean {
    const stack = [...this.bodies[id]!.children];
    while (stack.length) {
      const b = this.bodies[stack.pop()!]!;
      if (b.alive && b.kind !== "backdrop") return true;
      stack.push(...b.children);
    }
    return false;
  }

  /** Alive bodies whose boxes touch a rectangle. */
  near(r: Rect, pred?: (b: Body) => boolean): Body[] {
    const out: Body[] = [];
    for (const id of this.grid.query(r)) {
      const b = this.bodies[id]!;
      if (!b.alive || (pred && !pred(b))) continue;
      if (b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y) out.push(b);
    }
    return out;
  }

  /** The first solid body a ray hits: the nearest one, box or word. */
  raycast(ox: number, oy: number, dx: number, dy: number, len: number): RayHit | null {
    let best: RayHit | null = null;
    for (const id of this.grid.alongRay(ox, oy, dx, dy, len)) {
      const b = this.bodies[id]!;
      if (!b.alive || !b.solid) continue;
      const r = rayBox(ox, oy, dx, dy, b);
      if (!r || r.tIn > len) continue;
      // The smaller of two bodies at the same distance (a word on its card's edge).
      if (!best || r.tIn < best.t - 0.5 || (Math.abs(r.tIn - best.t) <= 0.5 && b.w * b.h < this.bodies[best.id]!.w * this.bodies[best.id]!.h)) best = { id, t: r.tIn, x: ox + dx * r.tIn, y: oy + dy * r.tIn };
    }
    return best;
  }

  /** Hurts one body; at zero health it and everything on it are destroyed. */
  damage(id: number, amount: number, x: number, y: number): HitResult | null {
    const b = this.bodies[id];
    if (!b || !b.alive || !b.solid) return null;
    b.hp -= amount;
    if (b.hp > 0) return { kind: "hurt", id, x, y };
    return { kind: "killed", ids: this.kill(id), x, y };
  }

  /** Destroys a body and everything on it, and any backdrop left empty. */
  kill(id: number): number[] {
    const out: number[] = [];
    const stack = [id];
    while (stack.length) {
      const k = stack.pop()!;
      const b = this.bodies[k]!;
      if (!b.alive) continue;
      b.alive = false;
      b.hp = 0;
      if (b.kind !== "backdrop") this.alive--;
      this.destroyedWeight += b.weight;
      this.grid.remove(k);
      out.push(k);
      stack.push(...b.children);
    }
    return out;
  }

  /**
   * An explosion: the piece struck takes `direct`, every other piece within
   * `radius` takes `splash`.
   */
  blast(cx: number, cy: number, radius: number, direct: number, splash: number, struck: number): HitResult[] {
    const out: HitResult[] = [];
    const bodies = this.near({ x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 }, (b) => b.solid);
    // The smallest first, so words go before the card holding them.
    bodies.sort((a, b) => a.w * a.h - b.w * b.h);
    for (const b of bodies) {
      if (!b.alive) continue;
      const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
      const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
      if (Math.hypot(nx - cx, ny - cy) > radius) continue;
      const r = this.damage(b.id, b.id === struck ? direct : splash, nx, ny);
      if (r) out.push(r);
    }
    if (struck >= 0 && this.bodies[struck]?.alive && !bodies.some((b) => b.id === struck)) {
      const r = this.damage(struck, direct, cx, cy);
      if (r) out.push(r);
    }
    return out;
  }
}
