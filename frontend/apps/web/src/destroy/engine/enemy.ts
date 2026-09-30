// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Lag gang: Glitch-9 (a robot), Vera Buffer and Jitter (an alien). Each
// guards a spot of the page: walks a short beat on its ledge, and when it
// sees the hero (close enough, at a similar height, nothing whole in
// between) it warns with a flash, then shoots a slow shot the hero can dodge,
// or hits him when he is close. When the pieces around it are broken it
// moves to another spot. The first time the hero hurts one, it turns angry
// for good (and warns the others nearby): it chases him across the ledges,
// warns less and fires more, and uses its whole arsenal: shots from afar,
// blows up close, and a jump attack to reach him on another ledge.

import { rayBox } from "./grid";
import { mover, step, type Mover } from "./physics";
import type { Body, Rect } from "./types";
import type { World } from "./world";

export type EnemyKind = "robot" | "blonde" | "alien";
export const ENEMY_KINDS: readonly EnemyKind[] = ["robot", "blonde", "alien"];
export const ENEMY_HP: Record<EnemyKind, number> = { robot: 120, blonde: 80, alien: 100 };

export type EnemyState = "patrol" | "chase" | "aim" | "shoot" | "melee" | "leap" | "hit" | "relocate" | "defeated";

/** How far they see and how their shots behave. */
const SIGHT = 560;
const SIGHT_UP = 180;
const MELEE_RANGE = 58;
const TELEGRAPH = 0.5;
const TELEGRAPH_ANGRY = 0.25;
/** Angry villains warn the others within this distance. */
export const ALERT_RADIUS = 500;
const CHASE = 150;
const SHOT_SPEED = 250;
const SPREAD = 0.12;
const WALK = 60;
export const ENEMY_HEIGHT = 64;
const HALF = 14;

export type EnemyEvent =
  | { type: "telegraph" }
  | { type: "shot"; x: number; y: number; dx: number; dy: number; kind: EnemyKind }
  | { type: "strike"; box: Rect }
  | { type: "relocate" };

export class Enemy {
  readonly m: Mover;
  hp: number;
  readonly maxHp: number;
  face: 1 | -1 = -1;
  state: EnemyState = "patrol";
  t = 0;
  /** When it was last hurt (for its health bar and the flash). */
  hurtAt = -99;
  /** Hurt by the hero once: it chases him and fights harder, for good. */
  angry = false;
  private cooldown: number;
  private span: [number, number];
  private cover: number;
  private relocateTo: number | null = null;

  constructor(
    readonly kind: EnemyKind,
    x: number,
    y: number,
    /** Which colors it wears (0-3). */
    readonly variant: number,
    private rand: () => number,
    world: World,
  ) {
    this.m = mover(x, y, HALF);
    this.hp = this.maxHp = ENEMY_HP[kind];
    this.cooldown = 1 + rand() * 2;
    this.span = [x - 70, x + 70];
    this.cover = this.coverNow(world);
  }

  get alive(): boolean {
    return this.state !== "defeated";
  }

  box(): Rect {
    return { x: this.m.x - HALF, y: this.m.y - ENEMY_HEIGHT, w: HALF * 2, h: ENEMY_HEIGHT };
  }

  /** The pieces still whole right around it (what hides it). */
  coverNow(world: World): number {
    return world.near({ x: this.m.x - 90, y: this.m.y - 110, w: 180, h: 130 }, (b) => b.kind !== "backdrop").length;
  }

  /** Can it see the hero? Close, at a similar height, and no whole piece in the way. */
  sees(world: World, hx: number, hy: number): boolean {
    const ex = this.m.x;
    const ey = this.m.y - 44;
    const tx = hx;
    const ty = hy - 40;
    const dx = tx - ex;
    const dy = ty - ey;
    if (Math.abs(dx) > SIGHT || Math.abs(dy) > SIGHT_UP) return false;
    const len = Math.hypot(dx, dy);
    if (len < 1) return true;
    const hit = world.raycast(ex, ey, dx / len, dy / len, len);
    return !hit || hit.t >= len - 6;
  }

  /** Turns angry (hurt, or warned by an angry one nearby); true when it was calm. */
  enrage(): boolean {
    if (this.angry || !this.alive) return false;
    this.angry = true;
    return true;
  }

  /** Takes damage; true when that defeats it. */
  hurt(amount: number, now: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.hurtAt = now;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = "defeated";
      this.t = 0;
      return true;
    }
    if (this.state === "patrol" || this.state === "relocate") {
      this.state = "hit";
      this.t = 0;
    }
    return false;
  }

  /**
   * One frame. `mayShoot`: fewer than the most villains allowed to shoot
   * at once are already doing so.
   */
  update(dt: number, now: number, world: World, hero: { x: number; y: number }, mayShoot = true): EnemyEvent[] {
    const ev: EnemyEvent[] = [];
    const m = this.m;
    this.t += dt;
    this.cooldown -= dt;
    if (this.state === "defeated") {
      m.vx = 0;
      step(m, world, dt, now);
      return ev;
    }
    const seen = this.sees(world, hero.x, hero.y);
    const dist = Math.abs(hero.x - m.x);
    switch (this.state) {
      case "hit":
        m.vx = 0;
        if (this.t > 0.3) this.to(this.angry ? "chase" : "patrol");
        break;
      case "chase": {
        // Angry: after the hero, and every weapon it has.
        const dy = hero.y - m.y;
        this.face = hero.x >= m.x ? 1 : -1;
        if (seen && this.cooldown <= 0) {
          if (dist < MELEE_RANGE && Math.abs(dy) < 60) {
            this.to("melee");
            m.vx = 0;
            break;
          }
          if (mayShoot) {
            this.to("aim");
            ev.push({ type: "telegraph" });
            m.vx = 0;
            break;
          }
        }
        // On another ledge within a jump: a jump attack at him.
        if (m.onGround && this.cooldown <= 0 && dist < 220 && dy < -50 && dy > -260) {
          this.to("leap");
          m.vy = -700;
          m.vx = this.face * 200;
          break;
        }
        m.vx = dist > 70 ? this.face * CHASE : 0;
        // Down through its ledge when he is below, a hop up when he is above.
        if (m.onGround && dy > 90 && dist < 200 && m.ground >= 0) {
          m.dropLine = m.y + 1;
          m.dropUntil = now + 0.28;
          m.onGround = false;
          m.vy = 60;
        } else if (m.onGround && dy < -60 && dist < 160 && this.t > 0.5) {
          m.vy = -640;
          this.t = 0;
        }
        break;
      }
      case "leap":
        if (this.t > 0.15 && this.t - dt <= 0.15) ev.push({ type: "strike", box: { x: this.face > 0 ? m.x - 10 : m.x - 60, y: m.y - 70, w: 70, h: 70 } });
        if (m.onGround && this.t > 0.2) {
          this.cooldown = 0.9 + this.rand() * 0.6;
          this.to("chase");
        }
        break;
      case "patrol": {
        // Its cover is gone: off to another spot.
        const cover = this.coverNow(world);
        if ((this.cover >= 3 && cover < this.cover * 0.4) || (m.onGround && m.ground >= 0 && !world.bodies[m.ground]?.alive)) {
          this.relocateTo = this.pickSpot(world, hero);
          this.to("relocate");
          ev.push({ type: "relocate" });
          break;
        }
        if (this.angry) {
          this.to("chase");
          break;
        }
        if (seen) {
          this.face = hero.x >= m.x ? 1 : -1;
          m.vx = 0;
          if (this.cooldown <= 0 && mayShoot) {
            if (dist < MELEE_RANGE && Math.abs(hero.y - m.y) < 60) this.to("melee");
            else {
              this.to("aim");
              ev.push({ type: "telegraph" });
            }
          }
          break;
        }
        // A short beat on its ledge, turning at its ends or before a drop.
        const ahead = world.near({ x: m.x + this.face * 22 - 2, y: m.y, w: 4, h: 6 }, (b) => b.platform).length > 0 || m.y >= world.floor - 1;
        if (m.x <= this.span[0] || m.x >= this.span[1] || (m.onGround && !ahead)) this.face = m.x <= this.span[0] ? 1 : m.x >= this.span[1] ? -1 : ((-this.face) as 1 | -1);
        m.vx = this.face * WALK;
        break;
      }
      case "aim":
        m.vx = 0;
        this.face = hero.x >= m.x ? 1 : -1;
        if (this.t >= (this.angry ? TELEGRAPH_ANGRY : TELEGRAPH)) {
          if (seen) {
            const ex = m.x + this.face * 22;
            const ey = m.y - 40;
            const a = Math.atan2(hero.y - 38 - ey, hero.x - ex) + (this.rand() - 0.5) * 2 * SPREAD;
            ev.push({ type: "shot", x: ex, y: ey, dx: Math.cos(a), dy: Math.sin(a), kind: this.kind });
          }
          this.cooldown = this.angry ? 1 + this.rand() * 0.6 : 2.2 + this.rand() * 1.2;
          this.to("shoot");
        }
        break;
      case "shoot":
        m.vx = 0;
        if (this.t > 0.4) this.to(this.angry ? "chase" : "patrol");
        break;
      case "melee":
        m.vx = 0;
        if (this.t > 0.2 && this.t - dt <= 0.2) ev.push({ type: "strike", box: { x: this.face > 0 ? m.x : m.x - 60, y: m.y - 60, w: 60, h: 56 } });
        if (this.t > 0.5) {
          this.cooldown = this.angry ? 0.8 + this.rand() * 0.5 : 1.4 + this.rand();
          this.to(this.angry ? "chase" : "patrol");
        }
        break;
      case "relocate": {
        const tx = this.relocateTo ?? m.x;
        const dx = tx - m.x;
        this.face = dx >= 0 ? 1 : -1;
        m.vx = Math.abs(dx) > 10 ? this.face * 170 : 0;
        // Hop over gaps and up to a higher ledge.
        if (m.onGround && (this.t > 0.2 && Math.abs(dx) > 30) && (Math.abs(m.vx) > 0 && this.t % 1.2 < dt)) m.vy = -620;
        if (Math.abs(dx) <= 10 || this.t > 4) {
          this.span = [m.x - 70, m.x + 70];
          this.cover = this.coverNow(world);
          this.to("patrol");
        }
        break;
      }
    }
    step(m, world, dt, now);
    return ev;
  }

  private to(s: EnemyState): void {
    this.state = s;
    this.t = 0;
  }

  /** A nearby ledge (within 350 px) with pieces around it, away from the hero. */
  private pickSpot(world: World, hero: { x: number; y: number }): number {
    const m = this.m;
    const ledges = world.near({ x: m.x - 350, y: m.y - 260, w: 700, h: 400 }, (b) => b.platform && b.w >= 60);
    let best: Body | null = null;
    let score = -Infinity;
    for (const b of ledges) {
      const cx = b.x + b.w / 2;
      const s = world.near({ x: cx - 90, y: b.y - 110, w: 180, h: 130 }, (o) => o.kind !== "backdrop").length - Math.abs(cx - m.x) / 200 + Math.min(4, Math.abs(cx - hero.x) / 100);
      if (s > score) {
        score = s;
        best = b;
      }
    }
    return best ? best.x + best.w / 2 : m.x + (this.rand() < 0.5 ? -120 : 120);
  }

  /** It is aiming or shooting right now (for the cap on shooters). */
  get shooting(): boolean {
    return this.state === "aim" || this.state === "shoot";
  }

  /** The animation to show. */
  pose(): { anim: string; t: number; frame?: number } {
    const s = this.state;
    if (s === "defeated") return { anim: "defeated", t: this.t };
    if (s === "hit") return { anim: "hit", t: this.t };
    if (s === "melee") return { anim: "melee", t: this.t };
    if (s === "leap") return { anim: "jump_attack", t: this.t };
    if (s === "shoot") return { anim: "shoot", t: this.t + 0.2 };
    if (s === "aim") return { anim: "shoot", t: 0, frame: 0 };
    if (!this.m.onGround) return { anim: "jump", t: 0, frame: 2 };
    return { anim: Math.abs(this.m.vx) > 5 ? "walk" : "idle", t: this.t };
  }
}

/** A shot in flight: slow and visible, so it can be dodged. */
export interface EnemyShot {
  x: number;
  y: number;
  dx: number;
  dy: number;
  kind: EnemyKind;
  life: number;
}

export const SHOT_SPEED_PX = SHOT_SPEED;

/** Does a shot's short step cross a box? */
export function shotHits(s: EnemyShot, dt: number, r: Rect): boolean {
  const len = SHOT_SPEED * dt + 4;
  const hit = rayBox(s.x, s.y, s.dx, s.dy, { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 });
  return !!hit && hit.tIn <= len;
}

/** How many of the Lag gang guard a page this tall: one per ~700 px, 3 to 14. */
export function enemyCount(pageHeight: number): number {
  return Math.max(3, Math.min(14, Math.round(pageHeight / 700)));
}

/**
 * Where they stand: on ledges spread down the page, most near the people to
 * rescue (they guard them), never in the start strip.
 */
export function placeEnemies(world: World, rand: () => number, startY: number, near: readonly { x: number; y: number }[]): Enemy[] {
  const n = enemyCount(world.floor - startY);
  const ledges = world.bodies.filter((b) => b.platform && b.w >= 70 && b.y > startY + 220);
  const used = new Set<number>();
  const out: Enemy[] = [];
  for (let i = 0; i < n && ledges.length; i++) {
    const guard = near.length && rand() < 0.7 ? near[Math.floor(rand() * near.length)]! : null;
    let pool = ledges.filter((b) => !used.has(b.id));
    if (guard) {
      const close = pool.filter((b) => Math.abs(b.x + b.w / 2 - guard.x) < 320 && Math.abs(b.y - guard.y) < 220);
      if (close.length) pool = close;
    } else {
      const band = (world.floor - startY) / n;
      const inBand = pool.filter((b) => b.y >= startY + band * i && b.y < startY + band * (i + 1));
      if (inBand.length) pool = inBand;
    }
    const spot = pool[Math.floor(rand() * pool.length)];
    if (!spot) break;
    used.add(spot.id);
    const kind = ENEMY_KINDS[Math.floor(rand() * ENEMY_KINDS.length)]!;
    out.push(new Enemy(kind, spot.x + spot.w * (0.25 + rand() * 0.5), spot.y, Math.floor(rand() * 4), rand, world));
  }
  return out;
}
