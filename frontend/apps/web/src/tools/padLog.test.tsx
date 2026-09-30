// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { PadLog, buildReport, formatLine, type PadSample } from "./padLog";

const sample = (over: Partial<PadSample> = {}): PadSample => ({
  index: 0,
  id: "Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)",
  mapping: "standard",
  pressed: Array(17).fill(false),
  values: Array(17).fill(0),
  axes: [0, 0, 0, 0],
  ...over,
});
const press = (i: number) => {
  const pressed = Array(17).fill(false);
  const values = Array(17).fill(0);
  pressed[i] = true;
  values[i] = 1;
  return { pressed, values };
};

describe("PadLog", () => {
  it("logs connections, presses with their length and bounces", () => {
    const log = new PadLog();
    log.observe(sample(), 1000);
    log.observe(sample(press(0)), 1100);
    log.observe(sample(), 1160);
    log.observe(sample(press(0)), 1180); // 20 ms after the release: a bounce
    log.observe(sample(), 1300);
    const kinds = log.lines.map((l) => l.kind);
    expect(kinds).toEqual(["sys", "btn", "btn", "btn", "warn", "btn"]);
    expect(log.lines[2]!.text).toContain("released  60 ms");
    const b = log.stats.get(0)!.buttons[0]!;
    expect(b).toMatchObject({ presses: 2, bounces: 1, minMs: 60, released: 2 });
    log.present([], 1400);
    expect(log.lines.at(-1)).toMatchObject({ kind: "sys", text: expect.stringContaining("DISCONNECT") });
    expect(log.stats.get(0)!.disconnects).toBe(1);
  });

  it("logs sticks only when they move enough, and their return to the center", () => {
    const log = new PadLog();
    log.observe(sample(), 0);
    log.observe(sample({ axes: [0.03, 0, 0, 0] }), 100); // too small
    log.observe(sample({ axes: [0.5, 0, 0, 0] }), 200);
    log.observe(sample({ axes: [0.55, 0, 0, 0] }), 300); // too small
    log.observe(sample({ axes: [0, 0, 0, 0] }), 400);
    const axes = log.lines.filter((l) => l.kind === "axis").map((l) => l.text);
    expect(axes).toHaveLength(2);
    expect(axes[0]).toContain("LX");
    expect(axes[1]).toMatch(/0\.50 →\s+0\.00/);
  });

  it("keeps the last lines only", () => {
    const log = new PadLog(3);
    for (let i = 0; i < 5; i++) log.observe(sample(i % 2 ? press(1) : {}), i * 100);
    expect(log.lines).toHaveLength(3);
    expect(log.total).toBe(5);
  });
});

describe("buildReport", () => {
  it("writes instructions, the controller's numbers, the log and the raw data", () => {
    const log = new PadLog();
    log.observe(sample(), 0);
    log.observe(sample(press(1)), 100);
    log.observe(sample(), 180);
    const md = buildReport(
      [
        {
          stats: log.stats.get(0)!,
          brand: "Nintendo",
          model: "Switch Pro Controller",
          vendor: "057e",
          product: "2009",
          rumble: true,
          pollingHz: 0,
          pollingPeakHz: 125,
          sticks: [{ name: "Left", drift: 0.02, jitter: 0.004, circularity: 0.05, coverage: 1, maxRadius: 1, deadzone: 0.06 }],
          triggers: [{ name: "L2", max: 1, returnMs: 32, residual: 0 }],
          checks: [{ label: "Left stick · Drift", value: "0.020", verdict: "Good" }],
        },
      ],
      log.lines,
      { date: "today", userAgent: "UA", platform: "macOS", screenHz: 60, language: "es" },
    );
    expect(md).toContain("Answer in Spanish");
    expect(md).toContain("## Controller 1: Nintendo Switch Pro Controller");
    expect(md).toContain("up to 125 seen");
    expect(md).toContain("| B2 (1) | 1 | 0 | 80 ms | 80 ms |");
    expect(md).toContain("Never pressed: B1 (0)");
    expect(md).toContain(formatLine(log.lines[1]!));
    expect(md).toContain("```json");
  });
});
