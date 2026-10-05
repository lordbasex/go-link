// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Starts a power-on test in its own Web Worker. The Worker, and the board
// model it fetches, load only when a test starts.

import type { PowerOnResult, PowerOnStep } from "@go-link/cps1-sim";

export interface PowerOnRequest {
  id: number;
  zip: ArrayBuffer;
}

export type PowerOnReply = { id: number; type: "step"; step: PowerOnStep } | { id: number; type: "done"; result: PowerOnResult } | { id: number; type: "error"; message: string };

export interface PowerOnRun {
  result: Promise<PowerOnResult>;
  cancel(): void;
}

let next = 1;

export function startPowerOn(zip: Uint8Array, onStep: (step: PowerOnStep) => void): PowerOnRun {
  const worker = new Worker(new URL("./powerOn.worker.ts", import.meta.url), { type: "module" });
  const id = next++;
  let settle: ((v: PowerOnResult) => void) | null = null;
  let fail: ((e: Error) => void) | null = null;
  const result = new Promise<PowerOnResult>((res, rej) => {
    settle = res;
    fail = rej;
  });
  const end = () => worker.terminate();
  worker.onmessage = (e: MessageEvent<PowerOnReply>) => {
    const m = e.data;
    if (m.id !== id) return;
    if (m.type === "step") onStep(m.step);
    else if (m.type === "done") {
      end();
      settle?.(m.result);
    } else {
      end();
      fail?.(new Error(m.message));
    }
  };
  worker.onerror = (e) => {
    end();
    fail?.(new Error(e.message || "worker error"));
  };
  const copy = zip.slice().buffer;
  worker.postMessage({ id, zip: copy } satisfies PowerOnRequest, [copy]);
  return {
    result,
    cancel: () => {
      end();
      fail?.(new Error("cancelled"));
    },
  };
}
