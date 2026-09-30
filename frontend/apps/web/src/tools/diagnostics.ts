// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The controller test's measurements, as plain functions and small
// classes fed with the Gamepad API's raw values (sticks -1..1, triggers
// 0..1, times in ms), so they are tested without a controller.

export type Verdict = "good" | "warn" | "bad";

/** Drift: where a stick rests when nobody touches it (distance from 0) and how much it trembles there. */
export function restStats(samples: readonly (readonly [number, number])[]): { drift: number; jitter: number } {
  if (!samples.length) return { drift: 0, jitter: 0 };
  const mx = samples.reduce((s, p) => s + p[0], 0) / samples.length;
  const my = samples.reduce((s, p) => s + p[1], 0) / samples.length;
  const jitter = Math.sqrt(samples.reduce((s, p) => s + (p[0] - mx) ** 2 + (p[1] - my) ** 2, 0) / samples.length);
  return { drift: Math.hypot(mx, my), jitter };
}

export function driftVerdict(drift: number): Verdict {
  return drift < 0.05 ? "good" : drift < 0.12 ? "warn" : "bad";
}

const BINS = 36;

/**
 * The stick's reach all around: turn it against its edge and each of 36
 * directions keeps the farthest point seen. Circularity is how far those
 * points are from a perfect circle of radius 1, on average (0 % is a
 * perfect gate); a stick that never reaches the edge in some direction
 * shows as a high error there.
 */
export class StickRange {
  readonly reach = new Float64Array(BINS);

  add(x: number, y: number): void {
    const r = Math.hypot(x, y);
    if (r < 0.5) return;
    const a = (Math.atan2(y, x) + Math.PI) / (2 * Math.PI);
    const i = Math.min(BINS - 1, Math.floor(a * BINS));
    if (r > this.reach[i]!) this.reach[i] = r;
  }

  /** The share of the 36 directions reached (0-1). */
  coverage(): number {
    return this.reach.reduce((n, r) => n + (r > 0 ? 1 : 0), 0) / BINS;
  }

  /** The average distance from a circle of radius 1, 0-1 (null until 90 % of the directions are reached). */
  circularity(): number | null {
    if (this.coverage() < 0.9) return null;
    let sum = 0;
    let n = 0;
    for (const r of this.reach) {
      if (r > 0) {
        sum += Math.abs(Math.min(r, 1.2) - 1);
        n++;
      }
    }
    return sum / n;
  }

  /** The largest radius seen (1 means the stick reaches its edge). */
  maxRadius(): number {
    return Math.max(0, ...this.reach);
  }

  reset(): void {
    this.reach.fill(0);
  }
}

export function circularityVerdict(error: number): Verdict {
  return error < 0.1 ? "good" : error < 0.2 ? "warn" : "bad";
}

/**
 * The stick's dead zone: pushed slowly from the center, how far it must go
 * before it reports anything. Every jump from exactly 0 to a value is a
 * candidate; the smallest one seen is the dead zone (browsers report 0
 * inside it).
 */
export class DeadzoneProbe {
  private last = 0;
  private best: number | null = null;

  add(x: number, y: number): void {
    const r = Math.hypot(x, y);
    if (this.last === 0 && r > 0 && r < 0.6) this.best = this.best === null ? r : Math.min(this.best, r);
    this.last = r;
  }

  value(): number | null {
    return this.best;
  }
}

export function deadzoneVerdict(dz: number): Verdict {
  return dz < 0.12 ? "good" : dz < 0.25 ? "warn" : "bad";
}

/**
 * A trigger's range and its return: the deepest pull seen, how long it
 * takes to fall back under 2 % after being released from over 50 %, and
 * what it still reports once left alone (a sticky or dirty trigger stays
 * above 0).
 */
export class TriggerProbe {
  max = 0;
  returnMs: number | null = null;
  residual: number | null = null;
  private releaseAt: number | null = null;
  private idleSince: number | null = null;
  private last = 0;

  add(value: number, now: number): void {
    this.max = Math.max(this.max, value);
    if (this.last > 0.5 && value < this.last && this.releaseAt === null) this.releaseAt = now;
    if (this.releaseAt !== null && value < 0.02) {
      this.returnMs = now - this.releaseAt;
      this.releaseAt = null;
    }
    if (value > this.last + 0.01 || value > 0.5) this.idleSince = null;
    else if (this.idleSince === null) this.idleSince = now;
    if (this.idleSince !== null && now - this.idleSince > 500) this.residual = value;
    this.last = value;
  }
}

export function triggerVerdict(t: TriggerProbe): Verdict {
  if (t.residual !== null && t.residual >= 0.05) return "bad";
  if ((t.returnMs !== null && t.returnMs > 200) || (t.residual !== null && t.residual >= 0.02) || (t.max > 0 && t.max < 0.9)) return "warn";
  return "good";
}

/**
 * Button chatter: a worn or dirty contact turns one press into two or three
 * in a row. A press that starts less than 40 ms after the same button was
 * let go counts as a bounce.
 */
export class BounceProbe {
  readonly presses: number[] = [];
  readonly bounces: number[] = [];
  private down: boolean[] = [];
  private releasedAt: number[] = [];

  add(pressed: readonly boolean[], now: number): void {
    pressed.forEach((p, i) => {
      const was = this.down[i] ?? false;
      if (p && !was) {
        this.presses[i] = (this.presses[i] ?? 0) + 1;
        const rel = this.releasedAt[i];
        if (rel !== undefined && now - rel < 40) this.bounces[i] = (this.bounces[i] ?? 0) + 1;
      }
      if (!p && was) this.releasedAt[i] = now;
      this.down[i] = p;
    });
  }
}

/**
 * The controller's update rate: how many new reports (a new Gamepad API
 * timestamp) arrive per second, over the last second. Many browsers only
 * report a controller when something changes, so a controller left alone
 * reads 0: `peak` is the highest rate seen while it was used.
 */
export class PollingRate {
  peak = 0;
  private stamps: number[] = [];
  private lastStamp = -1;

  add(timestamp: number, now: number): void {
    if (timestamp !== this.lastStamp) {
      this.lastStamp = timestamp;
      this.stamps.push(now);
    }
    while (this.stamps.length && now - this.stamps[0]! > 1000) this.stamps.shift();
    this.peak = Math.max(this.peak, this.stamps.length);
  }

  hz(): number {
    return this.stamps.length;
  }
}
