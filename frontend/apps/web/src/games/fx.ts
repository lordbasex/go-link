// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The board's effects: particles, points floating up, a flash and a short
// shake, started by the games' events (sfx.ts) and drawn over the board.
// The rules never see them; with reduced motion there is no shake and
// fewer particles.

import { rng } from "./input";
import type { SfxAt, SfxEvent } from "./sfx";
import { BOARD_H, BOARD_W, type Palette } from "./types";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  size: number;
  color: string;
}

interface Pop {
  x: number;
  y: number;
  text: string;
  born: number;
  color: string;
}

const MAX_PARTICLES = 240;

export class BoardFx {
  private particles: Particle[] = [];
  private pops: Pop[] = [];
  private shakeUntil = 0;
  private shakeSize = 0;
  private flashUntil = 0;
  private flashColor = "";
  private next = rng(12345);

  constructor(private reduced = false) {}

  /** Reacts to one game event at time `now` (ms). */
  on(e: SfxEvent, at: SfxAt | undefined, pal: Palette, now: number): void {
    const c = at?.color ? pal[at.color] : pal.accent;
    const x = at?.x ?? BOARD_W / 2;
    const y = at?.y ?? BOARD_H / 2;
    switch (e) {
      case "brick":
        this.burst(x, y, 14, c, now, 0.08, 520);
        break;
      case "eat":
        this.burst(x, y, 12, c, now, 0.06, 450);
        break;
      case "clear":
        this.burst(x, y, 40, c, now, 0.14, 900);
        this.flash(pal.text, now, 180);
        break;
      case "perfect":
        this.burst(x + 20, y, 24, c, now, 0.12, 700);
        this.flash(pal.ok, now, 140);
        break;
      case "great":
      case "good":
        this.burst(x + 20, y, 10, c, now, 0.08, 500);
        break;
      case "paddle":
        this.burst(x, y, 4, c, now, 0.04, 250);
        break;
      case "lose":
      case "offroad":
        this.shake(now, 3, 260);
        this.burst(x, y, 10, c, now, 0.07, 500);
        break;
      case "over":
        this.shake(now, 5, 420);
        this.burst(x, y, 22, c, now, 0.1, 800);
        this.flash(pal.p3, now, 160);
        break;
    }
    if (at?.points) this.pops.push({ x, y: y - 6, text: `+${at.points}`, born: now, color: pal.text });
  }

  private burst(x: number, y: number, n: number, color: string, now: number, speed: number, life: number): void {
    const count = this.reduced ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = this.next() * Math.PI * 2;
      const v = speed * (0.4 + this.next() * 0.8);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, born: now, life: life * (0.6 + this.next() * 0.5), size: this.next() < 0.35 ? 4 : 3, color });
    }
    if (this.particles.length > MAX_PARTICLES) this.particles.splice(0, this.particles.length - MAX_PARTICLES);
  }

  private shake(now: number, size: number, ms: number): void {
    if (this.reduced) return;
    this.shakeUntil = Math.max(this.shakeUntil, now + ms);
    this.shakeSize = Math.max(size, now < this.shakeUntil ? this.shakeSize : 0);
  }

  private flash(color: string, now: number, ms: number): void {
    this.flashColor = color;
    this.flashUntil = now + (this.reduced ? ms / 2 : ms);
  }

  /** How far to move the board this frame (0, 0 when still). */
  offset(now: number): [number, number] {
    if (now >= this.shakeUntil) return [0, 0];
    const k = this.shakeSize * ((this.shakeUntil - now) / 420 + 0.3);
    return [Math.round((this.next() * 2 - 1) * k), Math.round((this.next() * 2 - 1) * k)];
  }

  /** Whether anything is still moving (the page may skip drawing otherwise). */
  busy(now: number): boolean {
    return this.particles.length > 0 || this.pops.length > 0 || now < this.flashUntil || now < this.shakeUntil;
  }

  /** Draws the effects over the board (board coordinates). */
  draw(ctx: CanvasRenderingContext2D, pal: Palette, now: number): void {
    this.particles = this.particles.filter((p) => now - p.born < p.life);
    for (const p of this.particles) {
      const t = Math.max(0, now - p.born);
      const x = p.x + p.vx * t;
      const y = p.y + p.vy * t + 0.00012 * t * t;
      ctx.globalAlpha = Math.max(0, 1 - t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(x), Math.round(y), p.size, p.size);
    }
    this.pops = this.pops.filter((p) => now - p.born < 800);
    for (const p of this.pops) {
      const t = Math.max(0, now - p.born);
      ctx.globalAlpha = Math.max(0, 1 - t / 800);
      ctx.fillStyle = p.color;
      ctx.font = `700 10px ${pal.mono}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.text, p.x, p.y - t * 0.03);
    }
    if (now < this.flashUntil) {
      ctx.globalAlpha = 0.25 * ((this.flashUntil - now) / 180);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    }
    ctx.globalAlpha = 1;
  }

  /** Counts, for tests. */
  get counts(): { particles: number; pops: number } {
    return { particles: this.particles.length, pops: this.pops.length };
  }
}
