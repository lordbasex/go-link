// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// @go-link/cps1-sim: the CPS-1 power-on test (validation level 3). A 68000
// (Musashi, MIT) and a minimal board model in WebAssembly, and the checks
// that run a ROM set on it. No DOM and no Node APIs: the caller passes the
// set's files and the wasm bytes (browser: wasmUrl.ts; Node: read the file).

export * from "./sim.ts";
export * from "./powerOn.ts";
export * from "./text.ts";
