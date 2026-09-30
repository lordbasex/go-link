// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// One mission: the page's world, the hero, the four civilians, rockets,
// bullets and debris. step() advances it and returns what happened, so the
// host can break the page's parts and play sounds. Pure: no DOM, no audio.

import { CIVILIAN_KINDS, Civilian, placeCivilians, seeded, type CivilianKind } from "./civilian";
import { NO_CONTROLS, pressedSince, type Controls } from "./controls";
import { ALERT_RADIUS, ENEMY_KINDS, Enemy, SHOT_SPEED_PX, placeEnemies, shotHits, type EnemyKind, type EnemyShot } from "./enemy";
import { rayBox } from "./grid";
import { mover, step as moveStep, type Mover } from "./physics";
import { Particles } from "./particles";
import { JET_FUEL, Player } from "./player";
import type { Body, BodyInit } from "./types";
import { World, type HitResult } from "./world";

const BULLET_RANGE = 1000;
/**
 * Damage per hit. Per second of effort: bazooka > machine gun > knife.
 * Machine gun 4 × 10/s ≈ 40/s; knife 12 × 2.5/s ≈ 30/s (short reach);
 * flying kick 16; bazooka 40 on the piece struck plus 18 around it, 1/s.
 */
export const DAMAGE = { gun: 4, knife: 12, kick: 16, rocket: 40, splash: 18 } as const;
const ROCKET_SPEED = 720;
const ROCKET_RANGE = 1300;
const BLAST_RADIUS = 80;
/** A health bar shows this long after a piece's last hit. */
export const BAR_TIME = 2;
/** The mission's time limit, in seconds. */
export const TIME_LIMIT = 600;
/** The hero's lives, his health per life, and what hurts him. */
export const LIVES = 4;
export const HEALTH_PER_LIFE = 100;
export const ENEMY_DAMAGE = { shot: 10, melee: 15 } as const;
/** After losing a life he blinks, untouchable, this long; after any hit, a shorter while. */
const INVULNERABLE = 2;
const HIT_GRACE = 1;
/** At most this many villains aim or shoot at the same time. */
const MAX_SHOOTERS = 3;
/** The chance that a broken picture or box drops a health pack, and what it heals. */
const PICKUP_CHANCE = 0.04;
const PICKUP_HEAL = 40;
/** When this share of pieces or less is left and nothing was hit for this long, the rest crumbles. */
const CRUMBLE_SHARE = 0.05;
const CRUMBLE_AFTER = 20;
/** How often empty backdrops are checked, in seconds. */
const COLLAPSE_EVERY = 0.25;

export type Weapon = "gun" | "knife" | "kick" | "bazooka";

export type GameEvent =
  | { type: "shot"; x0: number; y0: number; x1: number; y1: number; hit: boolean }
  | { type: "hit"; weapon: Weapon; result: HitResult; collapse?: boolean }
  | { type: "launch" }
  | { type: "explode"; x: number; y: number; radius: number }
  | { type: "swing"; kind: "knife" | "kick" }
  | { type: "jump"; double: boolean }
  | { type: "jet" }
  | { type: "land" }
  | { type: "freed"; index: number }
  | { type: "rescued"; index: number }
  | { type: "evacuated"; index: number }
  | { type: "complete" }
  | { type: "timeout" }
  | { type: "enemyShot"; kind: EnemyKind }
  | { type: "telegraph" }
  | { type: "enemyHit"; index: number }
  | { type: "enraged"; index: number }
  | { type: "enemyDown"; index: number }
  | { type: "playerHit" }
  | { type: "lifeLost" }
  | { type: "dead" }
  | { type: "pickup" };

export interface Rocket {
  x: number;
  y: number;
  dx: number;
  dy: number;
  travelled: number;
}

export interface Tracer {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  life: number;
}

export interface Stats {
  /** Seconds used and left of the time limit. */
  time: number;
  timeLeft: number;
  /** The mission's progress, 0-1: 70 % destruction, 30 % rescues; 1 only when both are done. */
  progress: number;
  shots: number;
  rockets: number;
  rescued: number;
  /** How many people wait in this run. */
  people: number;
  byKind: Record<CivilianKind, number>;
  /** The Lag gang: how many, how many defeated, of each kind. */
  enemies: number;
  defeated: number;
  defeatedByKind: Record<EnemyKind, number>;
  lives: number;
  health: number;
  chasing: number;
  destroyed: number;
  left: number;
}

export class Game {
  readonly world: World;
  readonly player: Player;
  readonly civilians: Civilian[];
  readonly particles: Particles;
  readonly rockets: Rocket[] = [];
  readonly tracers: Tracer[] = [];
  readonly flashes: { x: number; y: number; r: number; life: number }[] = [];
  readonly enemies: Enemy[];
  /** The Lag gang's shots in flight. */
  readonly foeShots: EnemyShot[] = [];
  readonly pickups: { m: Mover; life: number }[] = [];
  lives = LIVES;
  health = HEALTH_PER_LIFE;
  /** Until when (game time) the hero cannot be hurt. */
  invulnerableUntil = 0;
  /** How he lost, when the mission failed. */
  failure: "timeout" | "dead" | null = null;
  private rand: () => number;
  /** Pieces hit lately, for their health bars: id → { at, shown (0-1, eases down) }. */
  readonly bars = new Map<number, { at: number; shown: number }>();
  time = 0;
  shots = 0;
  rocketsFired = 0;
  complete = false;
  failed = false;
  private lastHitAt = 0;
  private prev: Controls = NO_CONTROLS;
  private collapseIn = 0;

  /** The run's seed: the same seed hides the people in the same places. */
  readonly seed: number;

  constructor(bodies: readonly BodyInit[], size: { width: number; height: number }, spawn: { x: number; y: number }, opts: { density?: number; rand?: () => number; seed?: number; enemies?: boolean } = {}) {
    this.world = new World(bodies, size);
    this.player = new Player(spawn.x, spawn.y);
    this.seed = opts.seed ?? Date.now();
    const rand = seeded(this.seed);
    this.rand = seeded(this.seed ^ 0x51f15e);
    this.civilians = placeCivilians(this.world, rand, spawn.y);
    this.enemies = opts.enemies === false ? [] : placeEnemies(this.world, seeded(this.seed ^ 0x9e3779b9), spawn.y, this.civilians.map((c) => ({ x: c.m.x, y: c.m.y })));
    this.particles = new Particles(1400, opts.density ?? 1, opts.rand);
  }

  rescued(): number {
    return this.civilians.filter((c) => c.rescued).length;
  }

  /** How many of each kind were rescued. */
  rescuedByKind(): Record<CivilianKind, number> {
    const out = Object.fromEntries(CIVILIAN_KINDS.map((k) => [k, 0])) as Record<CivilianKind, number>;
    for (const c of this.civilians) if (c.rescued) out[c.kind]++;
    return out;
  }

  stats(): Stats {
    const defeatedByKind = Object.fromEntries(ENEMY_KINDS.map((k) => [k, this.enemies.filter((e) => e.kind === k && !e.alive).length])) as Record<EnemyKind, number>;
    return { time: this.time, timeLeft: Math.max(0, TIME_LIMIT - this.time), progress: this.progress(), enemies: this.enemies.length, defeated: this.enemies.filter((e) => !e.alive).length, defeatedByKind, lives: this.lives, health: this.health, chasing: this.chasing(), shots: this.shots, rockets: this.rocketsFired, rescued: this.rescued(), people: this.civilians.length, byKind: this.rescuedByKind(), destroyed: this.world.destroyed(), left: this.world.alive };
  }

  /**
   * The mission's progress, 0-1: the destroyed share, the rescued share and
   * the defeated share (60/25/15, or 70/30 without enemies); exactly 1 only
   * when all three are complete.
   */
  progress(): number {
    const d = this.world.alive === 0 ? 1 : Math.min(this.world.destroyed(), 0.999);
    const n = this.civilians.length;
    const r = n ? this.rescued() / n : 1;
    const e = this.enemies.length;
    if (!e) return 0.7 * d + 0.3 * r;
    const k = this.enemies.filter((x) => !x.alive).length / e;
    return 0.6 * d + 0.25 * r + 0.15 * k;
  }

  /** How many villains are angry and chasing the hero. */
  chasing(): number {
    return this.enemies.filter((e) => e.alive && e.angry).length;
  }

  /** Everything the win needs: all pieces broken, everyone rescued, the gang defeated. */
  private won(): boolean {
    return this.world.alive === 0 && this.rescued() === this.civilians.length && this.enemies.every((e) => !e.alive);
  }

  /** The hero is hurt: health goes down; at zero a life is lost (none left: the mission is over). */
  hurtPlayer(amount: number, ev: GameEvent[]): void {
    if (this.complete || this.failed || this.time < this.invulnerableUntil) return;
    this.health -= amount;
    ev.push({ type: "playerHit" });
    if (this.health > 0) {
      this.invulnerableUntil = this.time + HIT_GRACE;
      return;
    }
    this.lives--;
    if (this.lives <= 0) {
      this.health = 0;
      this.failed = true;
      this.failure = "dead";
      ev.push({ type: "dead" });
      return;
    }
    this.health = HEALTH_PER_LIFE;
    this.invulnerableUntil = this.time + INVULNERABLE;
    ev.push({ type: "lifeLost" });
    // Back on a safe floor nearby: the nearest ledge above, away from shots.
    this.unstuck();
    this.foeShots.length = 0;
  }

  /** Back onto a floor: the nearest whole piece top above the hero (or the sky), when stuck. */
  unstuck(): void {
    const m = this.player.m;
    const tops = this.world.bodies.filter((b) => b.alive && b.platform && b.y < m.y - 4 && b.w >= 30);
    tops.sort((a, b) => Math.hypot(a.x + a.w / 2 - m.x, a.y - m.y) - Math.hypot(b.x + b.w / 2 - m.x, b.y - m.y));
    const t = tops[0];
    m.x = t ? Math.max(t.x + 14, Math.min(t.x + t.w - 14, m.x)) : m.x;
    m.y = t ? t.y : 0;
    m.vx = 0;
    m.vy = 0;
  }

  /** The civilian the hero can rescue right now, if any. */
  rescuable(): Civilian | undefined {
    const m = this.player.m;
    return this.civilians.find((c) => c.canBeRescued(m.x, m.y));
  }

  step(dt: number, c: Controls): GameEvent[] {
    const ev: GameEvent[] = [];
    const p = pressedSince(this.prev, c);
    this.prev = c;
    if (this.failed) return ev;
    if (!this.complete) this.time += dt;
    const now = this.time;
    if (!this.complete && this.time >= TIME_LIMIT) {
      this.time = TIME_LIMIT;
      this.failed = true;
      this.failure = "timeout";
      ev.push({ type: "timeout" });
      return ev;
    }
    // Rescue: its own button, or the jump button next to someone waiting.
    const near = this.rescuable();
    const pm = this.player.m;
    if (near && (p.rescue || (p.jump && pm.onGround) || near.touching(pm.x, pm.y))) {
      near.rescue();
      this.player.act("thumbs");
      // A rescue tops the jetpack up a little.
      this.player.fuel = Math.min(JET_FUEL, this.player.fuel + 0.8);
      ev.push({ type: "rescued", index: this.civilians.indexOf(near) });
    }
    for (const e of this.player.update(dt, now, c, p, this.world, !near)) {
      if (e.type === "shoot") this.shoot(e.x, e.y, e.dx, e.dy, ev);
      else if (e.type === "melee") {
        ev.push({ type: "swing", kind: e.kind });
        const hitIds = this.world.near(e, (b) => b.solid).sort((a, b) => a.w * a.h - b.w * b.h).slice(0, 4);
        for (const b of hitIds) this.hit(b, DAMAGE[e.kind], b.x + b.w / 2, b.y + b.h / 2, e.kind, ev);
        this.enemies.forEach((foe, i) => {
          const r = foe.box();
          if (foe.alive && r.x < e.x + e.w && r.x + r.w > e.x && r.y < e.y + e.h && r.y + r.h > e.y) this.hurtEnemy(i, DAMAGE[e.kind], r.x + r.w / 2, r.y + r.h / 2, ev);
        });
      } else if (e.type === "rocket") {
        this.rockets.push({ x: e.x, y: e.y, dx: e.dx, dy: e.dy, travelled: 0 });
        this.rocketsFired++;
        ev.push({ type: "launch" });
      } else if (e.type === "jet") {
        const m = this.player.m;
        this.particles.flame(m.x - this.player.face * 10, m.y - 30);
        ev.push(e);
      } else ev.push(e);
    }
    this.updateRockets(dt, ev);
    this.updateEnemies(dt, now, ev);
    this.updatePickups(dt, now, ev);
    // Layout bands with nothing left over them crumble by themselves.
    this.collapseIn -= dt;
    if (this.collapseIn <= 0) {
      this.collapseIn = COLLAPSE_EVERY;
      const gone = this.world.collapseBackdrops();
      if (gone.length) {
        const r: HitResult = { kind: "killed", ids: gone, x: 0, y: 0 };
        for (const id of gone) this.particles.shatter(this.world.bodies[id]!, this.world.bodies[id]!.color);
        ev.push({ type: "hit", weapon: "bazooka", result: r, collapse: true });
      }
    }
    this.civilians.forEach((cv, i) => {
      const r = cv.update(dt, now, this.world);
      if (r.freed) ev.push({ type: "freed", index: i });
      if (r.evacuated) ev.push({ type: "evacuated", index: i });
    });
    this.particles.update(dt, this.world.floor);
    // Health bars ease down to the piece's health and go after a while.
    for (const [id, bar] of this.bars) {
      const b = this.world.bodies[id]!;
      if (!b.alive || this.time - bar.at > BAR_TIME) {
        this.bars.delete(id);
        continue;
      }
      const target = Math.max(0, b.hp / b.maxHp);
      bar.shown += (target - bar.shown) * Math.min(1, dt * 10);
    }
    for (const t of this.tracers) t.life -= dt;
    for (let i = this.tracers.length - 1; i >= 0; i--) if (this.tracers[i]!.life <= 0) this.tracers.splice(i, 1);
    for (const f of this.flashes) f.life -= dt;
    for (let i = this.flashes.length - 1; i >= 0; i--) if (this.flashes[i]!.life <= 0) this.flashes.splice(i, 1);
    // Safety net: the last few pieces, left alone for a while, crumble by themselves.
    const pieces = this.world.bodies.length - this.world.bodies.filter((b) => b.kind === "backdrop").length;
    if (!this.complete && this.world.alive > 0 && this.world.alive <= pieces * CRUMBLE_SHARE && now - this.lastHitAt > CRUMBLE_AFTER) {
      for (const b of this.world.bodies)
        if (b.alive && b.kind !== "backdrop") {
          const r: HitResult = { kind: "killed", ids: this.world.kill(b.id), x: b.x + b.w / 2, y: b.y + b.h / 2 };
          this.debris(r);
          ev.push({ type: "hit", weapon: "bazooka", result: r });
        }
    }
    if (!this.complete && !this.failed && this.won()) {
      this.complete = true;
      ev.push({ type: "complete" });
    }
    return ev;
  }

  private shoot(x: number, y: number, dx: number, dy: number, ev: GameEvent[]): void {
    this.shots++;
    const h = this.world.raycast(x, y, dx, dy, BULLET_RANGE);
    // An enemy nearer than the piece takes the bullet.
    let foe = -1;
    let foeT = h ? h.t : BULLET_RANGE;
    this.enemies.forEach((e, i) => {
      if (!e.alive) return;
      const r = rayBox(x, y, dx, dy, e.box());
      if (r && r.tIn < foeT) {
        foeT = r.tIn;
        foe = i;
      }
    });
    const t = foe >= 0 ? foeT : h ? h.t : BULLET_RANGE;
    const x1 = x + dx * t;
    const y1 = y + dy * t;
    this.tracers.push({ x0: x, y0: y, x1, y1, life: 0.06 });
    ev.push({ type: "shot", x0: x, y0: y, x1, y1, hit: foe >= 0 || !!h });
    if (foe >= 0) this.hurtEnemy(foe, DAMAGE.gun, x1, y1, ev);
    else if (h) this.hit(this.world.bodies[h.id]!, DAMAGE.gun, h.x, h.y, "gun", ev);
  }

  private hurtEnemy(i: number, amount: number, x: number, y: number, ev: GameEvent[]): void {
    const e = this.enemies[i]!;
    if (!e.alive) return;
    this.particles.sparks(x, y, 5, "#e9ecf2", 200);
    const down = e.hurt(amount, this.time);
    ev.push({ type: down ? "enemyDown" : "enemyHit", index: i });
    // Hurt once, it turns angry for good and warns the others nearby.
    if (!down && e.enrage()) {
      ev.push({ type: "enraged", index: i });
      this.enemies.forEach((o, j) => {
        if (j !== i && o.alive && Math.hypot(o.m.x - e.m.x, o.m.y - e.m.y) <= ALERT_RADIUS && o.enrage()) ev.push({ type: "enraged", index: j });
      });
    }
    if (down) this.particles.shatter(e.box(), "#b8bcc8");
  }

  private updateEnemies(dt: number, now: number, ev: GameEvent[]): void {
    const pm = this.player.m;
    const hero = { x: pm.x, y: pm.y };
    const heroBox = { x: pm.x - 14, y: pm.y - 66, w: 28, h: 66 };
    let shooters = this.enemies.filter((e) => e.alive && e.shooting).length;
    this.enemies.forEach((e) => {
      const was = e.shooting;
      const events = e.update(dt, now, this.world, hero, shooters < MAX_SHOOTERS || was);
      if (e.shooting && !was) shooters++;
      for (const x of events) {
        if (x.type === "shot") {
          this.foeShots.push({ x: x.x, y: x.y, dx: x.dx, dy: x.dy, kind: x.kind, life: 4 });
          ev.push({ type: "enemyShot", kind: x.kind });
        } else if (x.type === "telegraph") ev.push({ type: "telegraph" });
        else if (x.type === "strike") {
          const b = x.box;
          if (b.x < heroBox.x + heroBox.w && b.x + b.w > heroBox.x && b.y < heroBox.y + heroBox.h && b.y + b.h > heroBox.y) this.hurtPlayer(ENEMY_DAMAGE.melee, ev);
        }
      }
    });
    // Shots: slow, stopped by whole pieces, hurting the hero on contact.
    for (let i = this.foeShots.length - 1; i >= 0; i--) {
      const s = this.foeShots[i]!;
      s.life -= dt;
      if (shotHits(s, dt, heroBox)) {
        this.foeShots.splice(i, 1);
        this.hurtPlayer(ENEMY_DAMAGE.shot, ev);
        continue;
      }
      s.x += s.dx * SHOT_SPEED_PX * dt;
      s.y += s.dy * SHOT_SPEED_PX * dt;
      const blocked = this.world.near({ x: s.x - 2, y: s.y - 2, w: 4, h: 4 }, (b) => b.solid).length > 0;
      if (blocked || s.life <= 0 || s.y > this.world.floor) {
        this.particles.sparks(s.x, s.y, 4, "#f2a33a", 140);
        this.foeShots.splice(i, 1);
      }
    }
  }

  private updatePickups(dt: number, now: number, ev: GameEvent[]): void {
    const pm = this.player.m;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]!;
      p.life -= dt;
      moveStep(p.m, this.world, dt, now);
      if (Math.abs(p.m.x - pm.x) < 26 && p.m.y > pm.y - 70 && p.m.y < pm.y + 10) {
        this.pickups.splice(i, 1);
        if (this.health >= HEALTH_PER_LIFE && this.lives < LIVES) this.lives++;
        else this.health = Math.min(HEALTH_PER_LIFE, this.health + PICKUP_HEAL);
        ev.push({ type: "pickup" });
      } else if (p.life <= 0) this.pickups.splice(i, 1);
    }
  }

  private hit(b: Body, damage: number, x: number, y: number, weapon: Weapon, ev: GameEvent[]): void {
    const r = this.world.damage(b.id, damage, x, y);
    if (!r) return;
    this.lastHitAt = this.time;
    this.debris(r);
    ev.push({ type: "hit", weapon, result: r });
  }

  private debris(r: HitResult): void {
    if (r.kind === "hurt") this.bars.set(r.id, { at: this.time, shown: this.bars.get(r.id)?.shown ?? 1 });
    else
      for (const id of r.ids) {
        this.bars.delete(id);
        const b = this.world.bodies[id]!;
        // Now and then a broken picture or box drops a health pack.
        if ((b.kind === "box" || b.kind === "image") && this.rand() < PICKUP_CHANCE) this.pickups.push({ m: mover(b.x + b.w / 2, b.y + b.h / 2, 8), life: 20 });
      }
    if (r.kind === "hurt") {
      this.particles.sparks(r.x, r.y, 4, this.world.bodies[r.id]!.color, 180);
      return;
    }
    // The broken part's own debris; its insides break too, with a little less.
    r.ids.forEach((id, i) => {
      const b = this.world.bodies[id]!;
      if (i > 0 && b.kind === "word" && i % 3) return;
      this.particles.shatter(b, b.color, { x: r.x, y: r.y });
    });
  }

  private updateRockets(dt: number, ev: GameEvent[]): void {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]!;
      const d = ROCKET_SPEED * dt;
      r.x += r.dx * d;
      r.y += r.dy * d;
      r.travelled += d;
      this.particles.sparks(r.x - r.dx * 14, r.y - r.dy * 14, 1, "#b8bcc8", 40);
      const struck = this.world.near({ x: r.x - 4, y: r.y - 4, w: 8, h: 8 }, (b) => b.solid).sort((a, b) => a.w * a.h - b.w * b.h)[0];
      const foe = this.enemies.findIndex((e) => {
        const b = e.box();
        return e.alive && r.x > b.x && r.x < b.x + b.w && r.y > b.y && r.y < b.y + b.h;
      });
      if (foe >= 0) {
        this.rockets.splice(i, 1);
        this.hurtEnemy(foe, DAMAGE.rocket, r.x, r.y, ev);
        this.explode(r.x, r.y, -1, ev, foe);
        continue;
      }
      if (struck || r.travelled > ROCKET_RANGE || r.x < 0 || r.x > this.world.width || r.y > this.world.floor) {
        this.rockets.splice(i, 1);
        this.explode(r.x, r.y, struck?.id ?? -1, ev);
      }
    }
  }

  private explode(x: number, y: number, struck: number, ev: GameEvent[], struckFoe = -1): void {
    ev.push({ type: "explode", x, y, radius: BLAST_RADIUS });
    this.flashes.push({ x, y, r: BLAST_RADIUS, life: 0.35 });
    this.particles.sparks(x, y, 26, "#f2a33a", 420);
    this.lastHitAt = this.time;
    this.enemies.forEach((e, i) => {
      if (i === struckFoe || !e.alive) return;
      const b = e.box();
      const nx = Math.max(b.x, Math.min(x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(y, b.y + b.h));
      if (Math.hypot(nx - x, ny - y) <= BLAST_RADIUS) this.hurtEnemy(i, DAMAGE.splash, nx, ny, ev);
    });
    for (const r of this.world.blast(x, y, BLAST_RADIUS, DAMAGE.rocket, DAMAGE.splash, struck)) {
      this.debris(r);
      ev.push({ type: "hit", weapon: "bazooka", result: r });
    }
  }

  /** Test and demo help: breaks everything left and frees everyone. */
  finishForTest(): GameEvent[] {
    const ev: GameEvent[] = [];
    for (const b of this.world.bodies) if (b.alive && b.kind !== "backdrop") {
      const ids = this.world.kill(b.id);
      ev.push({ type: "hit", weapon: "bazooka", result: { kind: "killed", ids, x: b.x, y: b.y } });
    }
    this.enemies.forEach((e, i) => {
      if (e.alive) {
        e.hurt(Infinity, this.time);
        ev.push({ type: "enemyDown", index: i });
      }
    });
    const m = this.player.m;
    this.civilians.forEach((c, i) => {
      if (c.state === "trapped" || c.state === "waiting") {
        c.m.x = m.x - 40 - i * 30;
        c.m.y = m.y;
        c.rescue();
        ev.push({ type: "rescued", index: i });
      }
    });
    return ev;
  }
}
