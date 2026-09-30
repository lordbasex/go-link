// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Debris and sparks: small squares with gravity, spin and a lifetime,
// drawn by the host on its canvas.

import type { Rect } from "./types";

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  life: number;
  max: number;
  /** Sparks glow and ignore gravity a little. */
  spark: boolean;
}

export class Particles {
  readonly list: Particle[] = [];

  constructor(
    readonly cap = 1400,
    /** 0-1: fewer particles for reduced motion. */
    readonly density = 1,
    private rand: () => number = Math.random,
  ) {}

  /** A body breaking: debris from all over its box, pushed out and up. */
  shatter(r: Rect, color: string, from?: { x: number; y: number }): void {
    const n = Math.round(Math.min(40, Math.max(5, (r.w * r.h) / 900)) * this.density);
    const cx = from?.x ?? r.x + r.w / 2;
    const cy = from?.y ?? r.y + r.h / 2;
    for (let i = 0; i < n; i++) {
      const x = r.x + this.rand() * r.w;
      const y = r.y + this.rand() * r.h;
      const a = Math.atan2(y - cy, x - cx);
      const f = 80 + this.rand() * 260;
      this.add({ x, y, vx: Math.cos(a) * f, vy: Math.sin(a) * f - 160 - this.rand() * 200, size: 3 + this.rand() * 5, color, rot: this.rand() * 6, vr: (this.rand() - 0.5) * 18, life: 0.9 + this.rand() * 0.8, max: 0, spark: false });
    }
  }

  /** Sparks from a bullet hit or an explosion. */
  sparks(x: number, y: number, n: number, color: string, speed = 260): void {
    n = Math.round(n * this.density);
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const f = speed * (0.3 + this.rand());
      this.add({ x, y, vx: Math.cos(a) * f, vy: Math.sin(a) * f - 60, size: 2 + this.rand() * 2, color, rot: 0, vr: 0, life: 0.25 + this.rand() * 0.35, max: 0, spark: true });
    }
  }

  /** The jetpack's flame: a few hot sparks falling from the pack. */
  flame(x: number, y: number): void {
    const n = Math.max(1, Math.round(3 * this.density));
    for (let i = 0; i < n; i++) {
      const hot = this.rand() < 0.5;
      this.add({ x: x + (this.rand() - 0.5) * 8, y, vx: (this.rand() - 0.5) * 60, vy: 260 + this.rand() * 200, size: 3 + this.rand() * 3, color: hot ? "#ffe29a" : "#f2a33a", rot: 0, vr: 0, life: 0.18 + this.rand() * 0.15, max: 0, spark: true });
    }
  }

  private add(p: Particle): void {
    p.max = p.life;
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push(p);
  }

  update(dt: number, floor: number): void {
    for (const p of this.list) {
      p.vy += (p.spark ? 400 : 1500) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
      if (p.y > floor) {
        p.y = floor;
        p.vy *= -0.3;
        p.vx *= 0.6;
      }
    }
    let w = 0;
    for (const p of this.list) if (p.life > 0) this.list[w++] = p;
    this.list.length = w;
  }
}
