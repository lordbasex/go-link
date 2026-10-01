// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Where the browser fetches the board model from. Vite emits the file as a
// same-origin asset; only the code that imports this module loads it.

export const CPS1SIM_WASM_URL = new URL("../wasm/cps1sim.wasm", import.meta.url).href;
