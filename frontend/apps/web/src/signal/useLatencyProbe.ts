// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, useState, type RefObject } from "react";
import type { HudRect } from "@go-link/shared";
import type { PressEdge } from "./useHostStream";

/** End to end latency measured on the picture: press to beacon. */
export interface LatencyReading {
  /** The last press or release, in ms. */
  last: number;
  /** The median of the recent ones: the number to trust. */
  median: number;
  worst: number;
  count: number;
}

/** How many recent measurements the median and the worst cover. */
const KEEP = 20;
/** A beacon that takes longer than this is a missed frame, not latency. */
const TOO_LATE_MS = 2000;

/**
 * Turns press edges and what the picture shows into measurements: when the
 * beacon first shows the latest change of the player's pad, the time since
 * that change is the whole way there and back.
 */
export class LatencyMeter {
  private samples: number[] = [];
  private measured = 0; // the edge already measured (its time)
  private lit: boolean | null = null;

  /** One video frame: the beacon is lit or not, shown at shownAt. */
  frame(lit: boolean, shownAt: number, edge: PressEdge): number | null {
    const changed = this.lit !== null && lit !== this.lit;
    this.lit = lit;
    if (!changed || edge.at === 0 || edge.at === this.measured || edge.active !== lit) return null;
    this.measured = edge.at;
    const ms = shownAt - edge.at;
    if (ms < 0 || ms > TOO_LATE_MS) return null;
    this.samples = [...this.samples, ms].slice(-KEEP);
    return ms;
  }

  reading(): LatencyReading | null {
    const n = this.samples.length;
    if (n === 0) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const mid = Math.floor(n / 2);
    const median = n % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    return {
      last: Math.round(this.samples[n - 1]!),
      median: Math.round(median),
      worst: Math.round(sorted[n - 1]!),
      count: n,
    };
  }
}

type VideoWithFrames = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { expectedDisplayTime?: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * Watches the video for this player's beacon while the host draws the
 * controllers on it (beacon is null otherwise) and measures each press and
 * release of the local player that holds the seat.
 */
export function useLatencyProbe(
  videoRef: RefObject<HTMLVideoElement | null>,
  beacon: HudRect | null,
  localPlayer: number | null,
  edges: RefObject<PressEdge[]>,
): LatencyReading | null {
  const [reading, setReading] = useState<LatencyReading | null>(null);
  const key = beacon && localPlayer !== null ? `${beacon.x},${beacon.y},${beacon.w},${beacon.h},${localPlayer}` : "";
  const beaconRef = useRef(beacon);
  beaconRef.current = beacon;

  useEffect(() => {
    if (!key) {
      setReading(null);
      return;
    }
    const video = videoRef.current as VideoWithFrames | null;
    if (!video?.requestVideoFrameCallback) return;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 4;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const meter = new LatencyMeter();
    let handle = 0;
    let stopped = false;
    const onFrame = (now: number, meta: { expectedDisplayTime?: number }) => {
      if (stopped) return;
      const b = beaconRef.current;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (b && w > 0 && h > 0 && localPlayer !== null) {
        // The middle of the beacon, away from its edges (the encoder blurs them).
        const sx = (b.x + b.w * 0.25) * w;
        const sy = (b.y + b.h * 0.25) * h;
        ctx.drawImage(video, sx, sy, b.w * 0.5 * w, b.h * 0.5 * h, 0, 0, 4, 4);
        const px = ctx.getImageData(0, 0, 4, 4).data;
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) sum += px[i]! + px[i + 1]! + px[i + 2]!;
        const lit = sum / (16 * 3) > 128;
        const edge = edges.current?.[localPlayer];
        if (edge && meter.frame(lit, meta.expectedDisplayTime ?? now, edge) !== null) setReading(meter.reading());
      }
      handle = video.requestVideoFrameCallback!(onFrame);
    };
    handle = video.requestVideoFrameCallback(onFrame);
    return () => {
      stopped = true;
      video.cancelVideoFrameCallback?.(handle);
    };
  }, [key, videoRef, localPlayer, edges]);

  return reading;
}
