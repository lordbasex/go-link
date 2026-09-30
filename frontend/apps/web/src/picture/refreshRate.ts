// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useState } from "react";

// The display's refresh rate, measured from requestAnimationFrame: browsers
// draw once per screen refresh, so the typical time between two frames is
// the screen's period (60 Hz = 16.7 ms, 120 Hz = 8.3 ms).

const COMMON_HZ = [24, 30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 170, 180, 200, 240, 280, 300, 360];
/** Frames per measurement. */
const SAMPLES = 60;
/** Time between two measurements (the rate can change: another screen, low power mode). */
const EVERY_MS = 5000;

/** The refresh rate from frame intervals (ms): their median, snapped to a common rate. */
export function refreshRateOf(intervals: readonly number[]): number | null {
  const valid = intervals.filter((d) => d > 1 && d < 200).sort((a, b) => a - b);
  if (valid.length < 5) return null;
  const mid = valid.length >> 1;
  const median = valid.length % 2 ? valid[mid]! : (valid[mid - 1]! + valid[mid]!) / 2;
  const hz = 1000 / median;
  const near = COMMON_HZ.find((c) => Math.abs(c - hz) / c < 0.04);
  return near ?? Math.round(hz);
}

/** The measured refresh rate of the screen showing the page, or null until known. */
export function useRefreshRate(active = true): number | null {
  const [hz, setHz] = useState<number | null>(null);
  useEffect(() => {
    if (!active || typeof requestAnimationFrame === "undefined") return;
    let frame = 0;
    let timer = 0;
    let last = 0;
    let intervals: number[] = [];
    const tick = (now: number) => {
      if (last) intervals.push(now - last);
      last = now;
      if (intervals.length >= SAMPLES) {
        const measured = refreshRateOf(intervals);
        if (measured !== null) setHz(measured);
        intervals = [];
        last = 0;
        timer = window.setTimeout(() => (frame = requestAnimationFrame(tick)), EVERY_MS);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    // A hidden page draws nothing: start over when it shows again.
    const visible = () => {
      intervals = [];
      last = 0;
    };
    document.addEventListener("visibilitychange", visible);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [active]);
  return hz;
}
