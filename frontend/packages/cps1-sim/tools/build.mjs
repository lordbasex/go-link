// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Builds the board model, wasm/cps1sim.wasm, from c/ and the vendored
// Musashi (musashi/, MIT) with Emscripten as a standalone module: no
// JavaScript runtime, a fixed 4 MB memory, only the board_* functions
// exported. The result is committed, so the website and CI never need
// Emscripten.
//
//   node tools/build.mjs           -> wasm/cps1sim.wasm and wasm/cps1sim.json
//   node tools/build.mjs --check   -> rebuilds in a temporary folder and fails
//                                     when the committed file differs
//
// Needs emcc and a host C compiler (cc) for Musashi's opcode table
// generator (m68kmake). emcc comes from emsdk: `source ~/emsdk/emsdk_env.sh`
// puts it on PATH; with only EMSDK set, $EMSDK/upstream/emscripten/emcc is
// used.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(PKG, "wasm", "cps1sim.wasm");
const META = path.join(PKG, "wasm", "cps1sim.json");
// https://github.com/kstenerud/Musashi, the commit vendored in musashi/
const MUSASHI = { version: "4.60", commit: "313ebf1bd9f4d0d93341eb5ce21fd8a119e9dbdd" };
const EXPORTS = ["board_rom", "board_gfxram", "board_regs", "board_wram", "board_stats", "board_inputs", "board_reset", "board_frame"];

const check = process.argv.includes("--check");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...opts });
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

// emcc from PATH, else from the emsdk folder EMSDK points to
const EMCC = (() => {
  const inSdk = process.env.EMSDK && path.join(process.env.EMSDK, "upstream", "emscripten", "emcc");
  try {
    execFileSync("emcc", ["--version"], { stdio: "ignore" });
    return "emcc";
  } catch {
    if (inSdk && fs.existsSync(inSdk)) return inSdk;
  }
  console.error("emcc not found: install emsdk and run `source ~/emsdk/emsdk_env.sh` (see frontend/packages/cps1-sim/README.md)");
  process.exit(2);
})();
const emccVersion = run(EMCC, ["--version"]).split("\n")[0].trim();
const work = fs.mkdtempSync(path.join(os.tmpdir(), "cps1sim-"));
try {
  // 1. Musashi's opcode handlers (m68kops.c/.h), generated from m68k_in.c.
  const gen = path.join(work, "gen");
  fs.mkdirSync(gen);
  run("cc", ["-O1", "-o", path.join(work, "m68kmake"), path.join(PKG, "musashi", "m68kmake.c")]);
  run(path.join(work, "m68kmake"), [gen, path.join(PKG, "musashi", "m68k_in.c")]);

  // 2. The module. Relative paths and prefix maps keep the build the same on every machine.
  const wasm = path.join(work, "cps1sim.wasm");
  run(
    EMCC,
    [
      "-Os",
      "-flto",
      "-sSTANDALONE_WASM",
      "--no-entry",
      "-sINITIAL_MEMORY=4194304",
      "-sALLOW_MEMORY_GROWTH=0",
      "-sSTACK_SIZE=65536",
      "-sFILESYSTEM=0",
      "-sSUPPORT_LONGJMP=0", // see c/conf.h
      `-sEXPORTED_FUNCTIONS=${EXPORTS.map((e) => `_${e}`).join(",")}`,
      `-ffile-prefix-map=${work}=build`,
      `-ffile-prefix-map=${PKG}=.`,
      "-DMUSASHI_CNF=\"conf.h\"",
      "-w",
      "-Ic",
      "-Imusashi",
      `-I${gen}`,
      "c/board.c",
      "c/nofpu.c",
      "musashi/m68kcpu.c",
      path.join(gen, "m68kops.c"),
      "-o",
      wasm,
    ],
    { cwd: PKG },
  );
  const bytes = fs.readFileSync(wasm);
  const imports = WebAssembly.Module.imports(new WebAssembly.Module(bytes));
  const meta = { emcc: emccVersion, musashi: MUSASHI, bytes: bytes.length, sha256: sha256(bytes), imports: imports.map((i) => `${i.module}.${i.name}`) };

  if (check) {
    const committed = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, "utf8")) : null;
    if (committed && committed.emcc !== emccVersion) console.warn(`note: the committed file was built with "${committed.emcc}", this is "${emccVersion}"`);
    const old = fs.existsSync(OUT) ? fs.readFileSync(OUT) : Buffer.alloc(0);
    if (!old.equals(bytes)) {
      console.error(`wasm/cps1sim.wasm is out of date (committed ${old.length} bytes ${sha256(old).slice(0, 12)}, rebuilt ${bytes.length} bytes ${meta.sha256.slice(0, 12)}): run npm run wasm -w @go-link/cps1-sim`);
      process.exit(1);
    }
    console.log(`wasm/cps1sim.wasm is up to date (${bytes.length} bytes)`);
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, bytes);
    fs.writeFileSync(META, `${JSON.stringify(meta, null, 2)}\n`);
    console.log(`built wasm/cps1sim.wasm: ${bytes.length} bytes, imports: ${meta.imports.join(", ") || "none"}`);
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
