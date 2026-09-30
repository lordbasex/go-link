// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The four people to rescue. Each waits inside a part of the page (its
// cage) until that part is broken open, calls for help until the hero comes
// close and rescues them, cheers, and then follows the hero around.

import { mover, step, type Mover } from "./physics";
import type { Body } from "./types";
import type { World } from "./world";

export type CivilianKind = "woman" | "child" | "baby" | "elder";
export const CIVILIAN_KINDS: readonly CivilianKind[] = ["woman", "child", "baby", "elder"];
/**
 * How close the hero must be to rescue someone: within this many pixels of
 * their body (the hero's box and theirs), so a small baby is as easy to
 * reach as a grown-up, from the same ledge or one a little higher or lower.
 */
export const REACH = 48;
/** How tall each kind stands, in page pixels, for reaching them. */
const HEIGHT: Record<CivilianKind, number> = { woman: 62, child: 48, baby: 32, elder: 58 };

/**
 * trapped: inside a piece still whole; waiting: free, calling for help;
 * cheering: just rescued (happy, thanks); evacuating: lifted away by a beam
 * of light; gone: safe, off the page. Anyone still on screen and not
 * cheering or lifted is someone to rescue.
 */
export type CivilianState = "trapped" | "waiting" | "cheering" | "evacuating" | "gone";
/** How long they cheer, then how long the beam takes to lift them. */
export const CHEER_TIME = 1.5;
export const LIFT_TIME = 1.1;

export class Civilian {
  readonly m: Mover;
  state: CivilianState = "trapped";
  t = 0;

  constructor(
    readonly kind: CivilianKind,
    x: number,
    y: number,
    /** The body they are trapped in (-1: free from the start). */
    readonly cage: number,
    /** Their place in the line behind the hero. */
    readonly order: number,
  ) {
    this.m = mover(x, y, 10);
    if (cage < 0) this.state = "waiting";
  }

  /** The animation to show and how far into it. */
  pose(): { anim: string; t: number } {
    const a = this.state === "trapped" || this.state === "waiting" ? "worried" : this.state === "cheering" && this.kind === "woman" && this.t > 0.7 ? "thanks" : "happy";
    return { anim: `${this.kind}_${a}`, t: this.t };
  }

  /** The hero (feet at hx, hy; 28 × 66) is within reach of this person. */
  canBeRescued(hx: number, hy: number): boolean {
    if (this.state !== "waiting") return false;
    const gapX = Math.abs(hx - this.m.x) - 14 - this.m.half;
    const top = this.m.y - HEIGHT[this.kind];
    const gapY = Math.max(0, top - hy, hy - 66 - this.m.y);
    return gapX <= REACH && gapY <= REACH;
  }

  get rescued(): boolean {
    return this.state === "cheering" || this.state === "evacuating" || this.state === "gone";
  }

  /** How far the beam has lifted them, 0-1 (0 before it starts). */
  get lift(): number {
    return this.state === "evacuating" ? Math.min(1, this.t / LIFT_TIME) : this.state === "gone" ? 1 : 0;
  }

  /** The hero's body touches this person's (a rescue without a button). */
  touching(hx: number, hy: number): boolean {
    if (this.state !== "waiting") return false;
    return Math.abs(hx - this.m.x) <= 14 + this.m.half && hy >= this.m.y - HEIGHT[this.kind] && hy - 66 <= this.m.y;
  }

  rescue(): void {
    this.state = "cheering";
    this.t = 0;
  }

  update(dt: number, now: number, world: World): { freed: boolean; evacuated: boolean } {
    this.t += dt;
    let freed = false;
    let evacuated = false;
    if (this.state === "trapped") {
      if (world.bodies[this.cage]?.alive) return { freed, evacuated };
      this.state = "waiting";
      this.t = 0;
      freed = true;
    }
    if (this.state === "cheering" && this.t > CHEER_TIME) {
      this.state = "evacuating";
      this.t = 0;
    }
    if (this.state === "evacuating") {
      if (this.t > LIFT_TIME) {
        this.state = "gone";
        evacuated = true;
      }
      return { freed, evacuated };
    }
    if (this.state === "gone") return { freed, evacuated };
    this.m.vx = 0;
    step(this.m, world, dt, now);
    return { freed, evacuated };
  }
}

/** A small seeded random generator (mulberry32), so a run can be replayed. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many people wait in a page this tall: one per ~800 px, 6 to 16. */
export function civilianCount(pageHeight: number): number {
  return Math.max(6, Math.min(16, Math.round(pageHeight / 800)));
}

/**
 * Hides the people at random for this run: one per band of the page (from
 * under the start to the bottom), each inside a different piece that can
 * hold them (a card, a picture, a button group), with the four kinds mixed.
 */
export function placeCivilians(world: World, rand: () => number, startY: number): Civilian[] {
  const n = civilianCount(world.floor - startY);
  const spots = world.bodies.filter((b) => (b.kind === "box" || b.kind === "image" || b.kind === "button") && b.w >= 48 && b.h >= 40 && b.y > startY + 40);
  // A few of each kind, in random order.
  const kinds = Array.from({ length: n }, (_, i) => CIVILIAN_KINDS[i % CIVILIAN_KINDS.length]!);
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
  }
  const used = new Set<number>();
  const out: Civilian[] = [];
  const span = world.floor - startY;
  kinds.forEach((kind, i) => {
    const top = startY + (span * i) / n;
    const bottom = startY + (span * (i + 1)) / n;
    let pool = spots.filter((b) => !used.has(b.id) && b.y + b.h / 2 >= top && b.y + b.h / 2 < bottom);
    if (!pool.length) pool = spots.filter((b) => !used.has(b.id));
    const cage = pool[Math.floor(rand() * pool.length)] as Body | undefined;
    if (cage) {
      used.add(cage.id);
      const x = cage.x + Math.min(cage.w - 12, Math.max(12, cage.w * (0.25 + rand() * 0.5)));
      out.push(new Civilian(kind, x, cage.y + cage.h - 4, cage.id, 0));
    } else out.push(new Civilian(kind, 60 + rand() * (world.width - 120), bottom - 2, -1, 0));
  });
  return out;
}
