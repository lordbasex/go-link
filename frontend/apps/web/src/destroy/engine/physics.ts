// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Gravity and one-way floors: every part of the page is a ledge you land on
// from above and pass through from below, like the platforms of an arcade
// game. A mover's position is the center of its feet.

import type { World } from "./world";

export const GRAVITY = 1800; // px/s²
export const MAX_FALL = 1100; // px/s

export interface Mover {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Half the body's width, for standing on a ledge. */
  half: number;
  onGround: boolean;
  /** The body stood on (-1 on the page's floor, -2 in the air). */
  ground: number;
  /** While dropping through: ledges at or above this line are ignored. */
  dropLine: number;
  dropUntil: number;
}

export function mover(x: number, y: number, half: number): Mover {
  return { x, y, vx: 0, vy: 0, half, onGround: false, ground: -2, dropLine: -Infinity, dropUntil: 0 };
}

/** Starts falling through the ledge under the feet (down + jump). */
export function dropThrough(m: Mover, now: number): void {
  if (!m.onGround || m.ground < 0) return;
  m.dropLine = m.y + 1;
  m.dropUntil = now + 0.28;
  m.onGround = false;
  m.ground = -2;
  m.vy = 60;
}

/**
 * Moves a mover for `dt` seconds: sideways (clamped to the page), then down
 * with gravity, landing on the highest ledge crossed by its feet.
 * `gravityScale` below 1 makes a held jump go higher.
 */
export function step(m: Mover, world: World, dt: number, now: number, gravityScale = 1): { landed: boolean } {
  m.x = Math.max(m.half, Math.min(world.width - m.half, m.x + m.vx * dt));
  m.vy = Math.min(MAX_FALL, m.vy + GRAVITY * gravityScale * dt);
  const from = m.y;
  const to = m.y + m.vy * dt;
  const wasGround = m.onGround;
  m.onGround = false;
  m.ground = -2;
  if (m.vy >= 0) {
    // Ledges whose top edge the feet cross (or rest on) this step.
    const ledges = world.near({ x: m.x - m.half, y: from - 2, w: m.half * 2, h: to - from + 4 }, (b) => b.platform);
    let best = Infinity;
    let bestId = -2;
    for (const b of ledges) {
      if (b.y < from - 1 || b.y > to + 0.5) continue;
      if (now < m.dropUntil && b.y <= m.dropLine) continue;
      // Stand only with a real part of the feet on it.
      const overlap = Math.min(m.x + m.half, b.x + b.w) - Math.max(m.x - m.half, b.x);
      if (overlap < Math.min(8, b.w * 0.5)) continue;
      if (b.y < best) {
        best = b.y;
        bestId = b.id;
      }
    }
    if (bestId >= 0) {
      m.y = best;
      m.vy = 0;
      m.onGround = true;
      m.ground = bestId;
      return { landed: !wasGround };
    }
  }
  if (to >= world.floor) {
    m.y = world.floor;
    m.vy = 0;
    m.onGround = true;
    m.ground = -1;
    return { landed: !wasGround };
  }
  m.y = to;
  return { landed: false };
}
