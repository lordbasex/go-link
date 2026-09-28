// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, useState } from "react";

/** How many samples the charts keep: 5 minutes at one sample every 2 s. */
export const HISTORY_SIZE = 150;

/**
 * Keeps the last HISTORY_SIZE samples of some figures. A new sample is
 * added each time key changes (the device's sampled_at), so the device's
 * own 2 s rhythm drives the charts. The device keeps no history: it starts
 * when this page opens.
 */
export function useHistory<T extends Record<string, number>>(
  key: string | undefined,
  sample: T | null,
): Record<keyof T, number[]> {
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const sampleRef = useRef(sample);
  sampleRef.current = sample;
  useEffect(() => {
    const s = sampleRef.current;
    if (!key || !s) return;
    setHistory((cur) => {
      const next: Record<string, number[]> = {};
      for (const [name, value] of Object.entries(s))
        next[name] = [...(cur[name] ?? []), value].slice(-HISTORY_SIZE);
      return next;
    });
  }, [key]);
  return history as Record<keyof T, number[]>;
}
