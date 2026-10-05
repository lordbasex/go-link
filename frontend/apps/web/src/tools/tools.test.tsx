// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { identify, usbIds } from "@go-link/ui/controllers";
import { BounceProbe, DeadzoneProbe, PollingRate, StickRange, TriggerProbe, circularityVerdict, driftVerdict, restStats, triggerVerdict } from "./diagnostics";

describe("identify", () => {
  it("reads the USB ids each browser writes", () => {
    expect(usbIds("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)")).toEqual({ vendor: "057e", product: "2009" });
    expect(usbIds("54c-ce6-DualSense Wireless Controller")).toEqual({ vendor: "054c", product: "0ce6" });
    expect(usbIds("Xbox Wireless Controller")).toEqual({ vendor: "", product: "" });
  });

  it("recognizes the model by its ids, then by its name", () => {
    expect(identify("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)")).toMatchObject({ model: "switchpro", brand: "Nintendo", modelName: "Switch Pro Controller" });
    expect(identify("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)").model).toBe("dualsense");
    expect(identify("Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)").model).toBe("dualshock4");
    expect(identify("Xbox 360 Controller (XInput STANDARD GAMEPAD)").model).toBe("xbox360");
    expect(identify("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)")).toMatchObject({ model: "xboxseries", brand: "Microsoft" });
    expect(identify("Joy-Con (L) (STANDARD GAMEPAD Vendor: 057e Product: 2006)").model).toBe("joycon");
    expect(identify("8BitDo SN30 Pro (Vendor: 2dc8 Product: 6101)").model).toBe("eightbitdo");
    expect(identify("USB Joystick (Vendor: 0e8f Product: 0002)")).toMatchObject({ model: "generic", brand: "", modelName: "USB Joystick" });
  });
});

describe("diagnostics", () => {
  it("measures drift and trembling at rest", () => {
    const quiet = restStats(Array.from({ length: 50 }, () => [0.01, -0.01] as const));
    expect(driftVerdict(quiet.drift)).toBe("good");
    const drifting = restStats(Array.from({ length: 50 }, (_, i) => [0.18 + (i % 2) * 0.01, 0] as const));
    expect(drifting.drift).toBeGreaterThan(0.17);
    expect(driftVerdict(drifting.drift)).toBe("bad");
    expect(drifting.jitter).toBeGreaterThan(0);
  });

  it("scores a stick's circle only once it went all around", () => {
    const r = new StickRange();
    for (let a = 0; a < Math.PI; a += 0.05) r.add(Math.cos(a), Math.sin(a));
    expect(r.circularity()).toBeNull();
    for (let a = 0; a < 2 * Math.PI; a += 0.02) r.add(Math.cos(a), Math.sin(a));
    expect(r.coverage()).toBe(1);
    expect(circularityVerdict(r.circularity()!)).toBe("good");
    // A square gate reaches up to 1.41 in the corners: a big error.
    const sq = new StickRange();
    for (let a = 0; a < 2 * Math.PI; a += 0.02) {
      const k = 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      sq.add(Math.cos(a) * k * 0.8, Math.sin(a) * k * 0.8);
    }
    expect(sq.circularity()!).toBeGreaterThan(0.1);
  });

  it("finds the dead zone from the first value after 0", () => {
    const d = new DeadzoneProbe();
    for (const v of [0, 0, 0, 0.21, 0.3, 0.5, 0, 0, 0.19, 0.4]) d.add(v, 0);
    expect(d.value()).toBeCloseTo(0.19);
  });

  it("times a trigger's return and catches one that stays pressed", () => {
    const t = new TriggerProbe();
    let now = 0;
    for (const v of [0, 0.5, 1, 1, 0.6, 0.2, 0]) t.add(v, (now += 16));
    expect(t.max).toBe(1);
    expect(t.returnMs).toBe(32); // from the first drop (0.6) to 0
    expect(triggerVerdict(t)).toBe("good");
    const sticky = new TriggerProbe();
    now = 0;
    for (const v of [0, 1, 0.3, 0.08]) sticky.add(v, (now += 16));
    for (let i = 0; i < 40; i++) sticky.add(0.08, (now += 16));
    expect(sticky.residual).toBeCloseTo(0.08);
    expect(triggerVerdict(sticky)).toBe("bad");
  });

  it("counts a quick double press as a bounce", () => {
    const b = new BounceProbe();
    b.add([true], 0);
    b.add([false], 100);
    b.add([true], 120);
    b.add([false], 300);
    b.add([true], 500);
    expect(b.presses[0]).toBe(3);
    expect(b.bounces[0]).toBe(1);
  });

  it("counts the controller's reports per second", () => {
    const p = new PollingRate();
    for (let t = 0; t <= 1000; t += 4) p.add(t, t);
    expect(p.hz()).toBeGreaterThanOrEqual(250);
    const slow = new PollingRate();
    for (let t = 0; t <= 1000; t += 16) slow.add(Math.floor(t / 32), t);
    expect(slow.hz()).toBeLessThan(40);
  });
});
