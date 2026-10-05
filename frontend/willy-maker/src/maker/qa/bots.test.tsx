// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import { describe, expect, it } from "vitest";
import { specProject } from "../rom/specFixture";
import { Input } from "../engine";
import { harnessScript, minimize, runBot, runQa, seeded } from "./bots";

describe("Test with bots (T-08)", () => {
  const project = specProject();
  const level = project.levels[0]!;

  it("plays every bot on Game Spec v1 and finds the ladder soft-lock (J-01)", () => {
    const t0 = performance.now();
    const qa = runQa(project, level, { fuzzSeeds: [1] });
    const ms = performance.now() - t0;
    console.log(`QA on the spec level: ${qa.bots.length} runs in ${Math.round(ms)} ms`);
    for (const b of qa.bots) console.log(`  ${b.bot}: ${b.cleared ? `clear at ${b.clearFrame}` : b.over ? "game over" : `max x ${b.maxX}`}, ${b.findings.map((f) => `${f.kind}@${f.frame} x${f.x}`).join(", ") || "no findings"}`);
    expect(qa.ok).toBe(false);
    const stuck = qa.findings.find((f) => f.kind === "stuck");
    expect(stuck).toBeTruthy();
    expect(stuck!.enemiesLeft).toBeGreaterThan(0);
  });

  it("finds nothing high on a level where the exit needs no enemy", () => {
    const free = specProject();
    free.settings.rules = { ...free.settings.rules, exitNeedsEnemies: false };
    const r = runBot(free, free.levels[0]!, "runPast");
    expect(r.cleared).toBe(true);
    expect(r.findings.filter((f) => f.severity === "high")).toEqual([]);
  });

  it("is the same every time (seeded)", () => {
    const a = runBot(project, level, "fuzz", { seed: 7, frames: 900 });
    const b = runBot(project, level, "fuzz", { seed: 7, frames: 900 });
    expect(a.inputs).toEqual(b.inputs);
    expect(seeded(3)()).toBe(seeded(3)());
  });

  it("minimizes a finding to a shorter script that still gives it", () => {
    const r = runBot(project, level, "runPast");
    const stuck = r.findings.find((f) => f.kind === "stuck")!;
    expect(stuck).toBeTruthy();
    const small = minimize(project, level, r, stuck, 120);
    const again = runBot(project, level, "runPast", { inputs: small, frames: small.length + 600 });
    expect(again.findings.some((f) => f.kind === "stuck")).toBe(true);
    const presses = (xs: number[][]) => xs.filter((p, i) => i === 0 || p.some((v, k) => v !== xs[i - 1]![k])).length;
    expect(presses(small)).toBeLessThanOrEqual(presses(r.inputs.slice(0, stuck.frame)));
  });

  it("writes the harness's script with a coin and Start first", () => {
    const s = harnessScript([[Input.Right], [Input.Right], [Input.Right | Input.B1], [0]], "test");
    expect(s.steps[0]).toEqual({ from: 120, to: 125, port: 1, buttons: ["coin"] });
    expect(s.steps).toContainEqual({ from: 156, to: 158, port: 1, buttons: ["right"] });
    expect(s.steps).toContainEqual({ from: 158, to: 159, port: 1, buttons: ["right", "b1"] });
  });
});
