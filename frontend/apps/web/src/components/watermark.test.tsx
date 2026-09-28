// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { cornerPlan, heartbeat } from "./watermark";

describe("watermark", () => {
  it("jumps to another corner every 8 to 15 seconds", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const plan = cornerPlan(120e6, random);
    expect(plan[0]?.atUs).toBe(0);
    for (let i = 1; i < plan.length; i++) {
      const gap = plan[i]!.atUs - plan[i - 1]!.atUs;
      expect(gap).toBeGreaterThanOrEqual(8e6);
      expect(gap).toBeLessThanOrEqual(15e6);
      expect(plan[i]!.corner).not.toBe(plan[i - 1]!.corner);
    }
  });

  it("beats slowly: at rest most of the time, never more than 8 % bigger", () => {
    let max = 0;
    let rest = 0;
    for (let t = 0; t < 3e6; t += 10_000) {
      const s = heartbeat(t);
      max = Math.max(max, s);
      if (s < 1.005) rest++;
    }
    expect(max).toBeGreaterThan(1.07);
    expect(max).toBeLessThanOrEqual(1.08);
    expect(rest / 300).toBeGreaterThan(0.4); // a long pause in every 3 s
    expect(heartbeat(0)).toBeCloseTo(heartbeat(3e6), 6); // one beat every 3 s
  });
});
