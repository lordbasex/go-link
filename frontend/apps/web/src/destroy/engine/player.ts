// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The hero: runs, jumps (higher while the button is held), jumps again in
// the air, flies a moment with a small jetpack after the double jump,
// crouches and crawls, drops through ledges, and fights with a machine gun,
// a knife, a bazooka and a flying kick. Its pose names match the atlas.

import type { Controls } from "./controls";
import { dropThrough, mover, step, type Mover } from "./physics";
import type { World } from "./world";

export const PLAYER_HALF = 14;
export const PLAYER_HEIGHT = 66;
const WALK = 190;
const RUN = 300;
const CRAWL = 80;
const JUMP_V = 640;
const DOUBLE_JUMP_V = 600;
/** The jetpack: upward push, top rising speed and fuel (seconds of flight). */
const JET_PUSH = 3800;
const JET_RISE = 440;
export const JET_FUEL = 3;
const JET_REFILL = 3; // seconds of fuel back per second on the ground (full in 1 s)
const FIRE_EVERY = 0.1; // 10 bullets per second
const KNIFE_EVERY = 0.4; // 2.5 slashes per second
const BAZOOKA_EVERY = 1;
const YAWN_AFTER = 6;

export type Action = "knife" | "bazooka" | "kick" | "thumbs" | "yawn";

/** Where the machine gun points. */
export type Aim = "forward" | "up45" | "up" | "down45" | "down";
const AIM_DIR: Record<Aim, [number, number]> = { forward: [1, 0], up45: [Math.SQRT1_2, -Math.SQRT1_2], up: [0, -1], down45: [Math.SQRT1_2, Math.SQRT1_2], down: [0, 1] };
export const AIM_ANIM: Record<Aim, string> = { forward: "machine_gun", up45: "aim_up45", up: "aim_up", down45: "aim_down45", down: "aim_down" };
/** The shoulder the gun turns around, from the feet, and the gun's length. */
const SHOULDER_UP = 46;
const GUN = 40;
/**
 * Where the gun's muzzle is in each aimed pose, from the feet (x forward, y
 * up), measured on the sprites by the host; without it the bullet leaves a
 * gun turned around the shoulder.
 */
export const MUZZLES: Partial<Record<Aim, { x: number; y: number }>> = {};
/** How long the short poses last: the turn, the take-off, the landing. */
const TURN_TIME = 0.16;
const TAKEOFF_TIME = 0.08;
const LANDING_TIME = 0.1;
const ACTION_TIME: Record<Action, number> = { knife: KNIFE_EVERY, bazooka: 0.38, kick: 0.45, thumbs: 1.1, yawn: 1.3 };
const ACTION_ANIM: Record<Action, string> = { knife: "knife", bazooka: "bazooka", kick: "jump_kick", thumbs: "thumbs_up", yawn: "yawn" };

/** What the hero did this frame, for the game to resolve. */
export type PlayerEvent =
  | { type: "shoot"; x: number; y: number; dx: number; dy: number }
  | { type: "melee"; x: number; y: number; w: number; h: number; kind: "knife" | "kick" }
  | { type: "rocket"; x: number; y: number; dx: number; dy: number }
  | { type: "jump"; double: boolean }
  | { type: "jet" }
  | { type: "land" };

export interface Pose {
  anim: string;
  /** Seconds into the animation. */
  t: number;
  /** A fixed frame index (the jump follows the speed, not the clock). */
  frame?: number;
  face: 1 | -1;
}

/** The buttons that went down this frame. */
export interface Presses {
  jump: boolean;
  fire: boolean;
  knife: boolean;
  bazooka: boolean;
}

export class Player {
  readonly m: Mover;
  face: 1 | -1 = 1;
  /** `down`: the action aims at the floor (down was held when it started). */
  action: { kind: Action; t: number; hit: boolean; down: boolean } | null = null;
  firing = false;
  low = false;
  aim: Aim = "forward";
  /** After a yawn he stays bored (a sleepy loop) until any input. */
  bored = false;
  private turnT = 0;
  private takeoffT = 0;
  private landT = 0;
  private yawned = false;
  /** Jetpack fuel left, in seconds; `jetting` while it burns. */
  fuel = JET_FUEL;
  jetting = false;
  private jumps = 0;
  private fireIn = 0;
  private bazookaIn = 0;
  private idle = 0;
  private clock = 0;
  private jumpHeld = false;
  private shotIndex = 0;

  constructor(x: number, y: number) {
    this.m = mover(x, y, PLAYER_HALF);
  }

  /** Starts a one-shot action (a thumbs up after a rescue, for example). */
  act(kind: Action, down = false): void {
    this.action = { kind, t: 0, hit: false, down };
  }

  /** One frame. `canJump` is false when the jump button rescues someone instead. */
  update(dt: number, now: number, c: Controls, p: Presses, world: World, canJump = true): PlayerEvent[] {
    const ev: PlayerEvent[] = [];
    const m = this.m;
    const rooted = this.action !== null && (this.action.kind === "bazooka" || this.action.kind === "thumbs");
    const dir = Math.abs(c.moveX) > 0.2 ? (Math.sign(c.moveX) as 1 | -1) : 0;
    if (dir && !rooted && dir !== this.face) {
      this.face = dir;
      if (m.onGround && !c.fire) this.turnT = TURN_TIME;
    }
    this.turnT = Math.max(0, this.turnT - dt);
    this.takeoffT = Math.max(0, this.takeoffT - dt);
    this.landT = Math.max(0, this.landT - dt);
    // Aim: up or down alone points straight; with a direction, at 45°.
    this.aim = c.up ? (dir ? "up45" : "up") : c.down ? (dir ? "down45" : "down") : "forward";
    this.low = m.onGround && c.down && !c.fire;
    // Speed: a full tilt or the run button runs; crouched it crawls.
    let speed = this.low ? CRAWL : c.run || Math.abs(c.moveX) > 0.85 ? RUN : WALK;
    if (this.firing && m.onGround) speed *= 0.55;
    m.vx = dir && !(rooted && m.onGround) ? dir * speed * (this.low ? 1 : Math.min(1, Math.abs(c.moveX) + 0.25)) : 0;
    // Jumping: on the ground (down + jump drops through the ledge), once
    // more in the air, then the jetpack while the button is held.
    if (m.onGround) this.jumps = 0;
    if (p.jump && canJump) {
      if (m.onGround) {
        if (c.down && m.ground >= 0) dropThrough(m, now);
        else {
          m.vy = -JUMP_V;
          m.onGround = false;
          this.jumpHeld = true;
          this.jumps = 1;
          this.takeoffT = TAKEOFF_TIME;
          ev.push({ type: "jump", double: false });
        }
      } else if (this.jumps < 2) {
        m.vy = Math.min(m.vy, -DOUBLE_JUMP_V);
        this.jumps = 2;
        this.jumpHeld = true;
        ev.push({ type: "jump", double: true });
      }
    }
    if (!c.jump || m.vy >= 0) this.jumpHeld = false;
    this.jetting = !m.onGround && this.jumps >= 2 && c.jump && !this.jumpHeld && this.fuel > 0;
    if (this.jetting) {
      this.fuel = Math.max(0, this.fuel - dt);
      m.vy = Math.max(-JET_RISE, m.vy - JET_PUSH * dt);
      ev.push({ type: "jet" });
    }
    if (m.onGround) this.fuel = Math.min(JET_FUEL, this.fuel + JET_REFILL * dt);
    if (step(m, world, dt, now, this.jumpHeld ? 0.5 : 1).landed) {
      ev.push({ type: "land" });
      this.landT = LANDING_TIME;
      if (this.action?.kind === "kick") this.action = null;
    }
    // Weapons: the knife in the air is a flying kick; holding it repeats.
    this.fireIn -= dt;
    this.bazookaIn -= dt;
    const inAir = !m.onGround;
    if (!this.action && (p.knife || c.knife)) this.act(inAir ? "kick" : "knife", c.down);
    if (!this.action && p.bazooka && this.bazookaIn <= 0) {
      this.act("bazooka", c.down);
      this.bazookaIn = BAZOOKA_EVERY;
    }
    this.firing = c.fire && (!this.action || this.action.kind === "yawn");
    if (this.firing && this.fireIn <= 0) {
      this.fireIn = FIRE_EVERY;
      // The bullet leaves the muzzle, the gun turned around the shoulder;
      // straight ahead a burst alternates chest and knee height (low pieces
      // are hit too), straight down it breaks the floor underfoot.
      const [ax, ay] = AIM_DIR[this.aim];
      const dx = ax * this.face;
      if (this.aim === "forward") ev.push({ type: "shoot", x: m.x + this.face * 34, y: m.y - (this.shotIndex++ % 2 ? 22 : 42), dx, dy: 0 });
      else {
        const mz = MUZZLES[this.aim];
        if (mz) ev.push({ type: "shoot", x: m.x + this.face * mz.x, y: m.y - mz.y, dx, dy: ay });
        else ev.push({ type: "shoot", x: m.x + this.face * 10 + dx * GUN, y: m.y - SHOULDER_UP + ay * GUN, dx, dy: ay });
      }
    }
    const a = this.action;
    if (a) {
      a.t += dt;
      if (!a.hit && a.kind === "knife" && a.t > 0.08) {
        a.hit = true;
        // With down held the blade stabs the floor at the feet.
        if (a.down) ev.push({ type: "melee", x: m.x - 30, y: m.y - 4, w: 60, h: 34, kind: "knife" });
        else ev.push({ type: "melee", x: this.face > 0 ? m.x : m.x - 64, y: m.y - 60, w: 64, h: 56, kind: "knife" });
      } else if (!a.hit && a.kind === "kick" && a.t > 0.1) {
        a.hit = true;
        ev.push({ type: "melee", x: this.face > 0 ? m.x - 6 : m.x - 64, y: m.y - 56, w: 70, h: 60, kind: "kick" });
      } else if (!a.hit && a.kind === "bazooka" && a.t > 0.12) {
        a.hit = true;
        if (a.down) ev.push({ type: "rocket", x: m.x + this.face * 8, y: m.y - 20, dx: 0, dy: 1 });
        else ev.push({ type: "rocket", x: m.x + this.face * 40, y: m.y - 44, dx: this.face, dy: 0 });
      }
      if (a.t >= ACTION_TIME[a.kind]) this.action = null;
    }
    // Bored: a yawn after a while doing nothing, then a sleepy loop; any input wakes him.
    const still = !dir && !c.fire && !c.down && !c.up && !c.jump && !c.knife && !c.bazooka && m.onGround;
    if (!still) {
      this.bored = false;
      this.idle = 0;
      if (this.action?.kind === "yawn") this.action = null;
    } else if (!this.action && !this.bored) {
      this.idle += dt;
      if (this.idle > YAWN_AFTER) {
        this.idle = 0;
        this.act("yawn");
        this.yawned = true;
      }
    }
    // The yawn just ended with nobody touching anything: stay bored.
    if (this.yawned && !this.action) {
      this.yawned = false;
      this.bored = still;
    }
    this.clock += dt;
    return ev;
  }

  pose(): Pose {
    const m = this.m;
    if (this.action) return { anim: ACTION_ANIM[this.action.kind], t: this.action.t, face: this.face };
    if (this.firing) return { anim: AIM_ANIM[this.aim], t: this.clock, face: this.face };
    // Jump: take-off, rising, the top, falling; then a landing crouch.
    if (!m.onGround) return { anim: "jump", t: 0, frame: this.takeoffT > 0 ? 0 : m.vy < -200 ? 1 : m.vy < 120 ? 2 : 3, face: this.face };
    if (this.landT > 0) return { anim: "jump", t: 0, frame: 4, face: this.face };
    if (this.low) return { anim: m.vx ? "crawl" : "crouch", t: m.vx ? this.clock : 1, face: this.face };
    // A quick turn passes through facing the camera.
    if (this.turnT > 0) return { anim: "turn", t: 0, frame: this.turnT > TURN_TIME / 2 ? 0 : 3, face: this.face };
    if (m.vx) return { anim: "run", t: this.clock, face: this.face };
    if (this.bored) return { anim: "bored", t: this.clock, face: this.face };
    return { anim: "idle", t: this.clock, face: this.face };
  }
}
