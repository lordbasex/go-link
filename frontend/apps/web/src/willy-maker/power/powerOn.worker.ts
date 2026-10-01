// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The power-on test's Web Worker: fetches the board model (same origin,
// only now that a test runs), runs the test on the zip it is sent and posts
// each step as it finishes, then the result. The page never freezes.

import { CPS1SIM_WASM_URL } from "@go-link/cps1-sim/wasm-url";
import { powerOnTest } from "./powerOn";
import type { PowerOnRequest, PowerOnReply } from "./client";

interface WorkerScope {
  onmessage: ((e: MessageEvent<PowerOnRequest>) => void) | null;
  postMessage(msg: PowerOnReply, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

let module: Promise<WebAssembly.Module> | null = null;

async function loadModule(): Promise<WebAssembly.Module> {
  const res = await fetch(CPS1SIM_WASM_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // compileStreaming needs the application/wasm type; compile the bytes otherwise
  if (typeof WebAssembly.compileStreaming === "function" && res.headers.get("content-type")?.startsWith("application/wasm")) return WebAssembly.compileStreaming(res);
  return WebAssembly.compile(await res.arrayBuffer());
}

scope.onmessage = async (e) => {
  const { id, zip } = e.data;
  try {
    module ??= loadModule();
    const wasm = await module.catch((err: unknown) => {
      module = null;
      throw err;
    });
    const result = await powerOnTest(new Uint8Array(zip), { wasm, onStep: (step) => scope.postMessage({ id, type: "step", step }) });
    scope.postMessage({ id, type: "done", result }, result.shot ? [result.shot.rgba.buffer as ArrayBuffer] : []);
  } catch (err) {
    scope.postMessage({ id, type: "error", message: (err as Error).message || String(err) });
  }
};
