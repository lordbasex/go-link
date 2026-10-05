// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Create ROM from the command line (experiment 1, T-14): a Willy Maker
// project file (.willy.zip, the Export tab's Save project) in, the ROM set
// out, with no browser. It runs the website's own code (rom/headless.ts,
// loaded through Vite) with the committed engine, so the same project gives
// the same .zip as the Export tab, then powers it on in the board model.
//
//   node rom/tools/willy-rom.mjs GAME.willy.zip [--out DIR] [--force] [--no-power-on]
//
// DIR (default: next to the project file) gets <set>.zip, <set>.symbols.json
// and a copy of the project file, so the ROM is never apart from what makes it.
// --force builds even with review errors. Needs `npm install` in frontend/.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WEB = path.join(ROOT, "frontend/willy-maker");
const ENGINE = path.join(WEB, "public/willy-maker/engine");
const WASM = path.join(ROOT, "frontend/packages/cps1-sim/wasm/cps1sim.wasm");

function args(argv) {
  const o = { out: null, force: false, powerOn: true, project: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") o.out = argv[++i];
    else if (a === "--force") o.force = true;
    else if (a === "--no-power-on") o.powerOn = false;
    else if (a === "-h" || a === "--help") o.help = true;
    else if (!o.project) o.project = a;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  if (o.help || !o.project) {
    console.log("usage: node rom/tools/willy-rom.mjs GAME.willy.zip [--out DIR] [--force] [--no-power-on]");
    process.exit(o.help ? 0 : 2);
  }
  const projectFile = path.resolve(o.project);
  const bytes = new Uint8Array(fs.readFileSync(projectFile));
  const out = path.resolve(o.out ?? path.dirname(projectFile));
  const engine = { manifest: JSON.parse(fs.readFileSync(path.join(ENGINE, "engine.json"), "utf8")), bin: new Uint8Array(fs.readFileSync(path.join(ENGINE, "engine.bin"))) };

  // the website's TypeScript, through Vite's module loader (no bundle, no browser)
  const require = createRequire(path.join(ROOT, "frontend/package.json"));
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const server = await createServer({ root: WEB, configFile: false, logLevel: "error", appType: "custom", server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { romFromProjectFile } = await server.ssrLoadModule("/src/maker/rom/headless.ts");
    const rom = await romFromProjectFile(bytes, engine, { force: o.force });
    fs.mkdirSync(out, { recursive: true });
    const set = engine.manifest.set;
    fs.writeFileSync(path.join(out, rom.name), rom.zip);
    fs.writeFileSync(path.join(out, `${set}.symbols.json`), rom.symbols);
    const kept = path.join(out, path.basename(projectFile));
    if (kept !== projectFile) fs.copyFileSync(projectFile, kept);
    const shown = (f) => (path.relative(process.cwd(), f).startsWith("..") ? f : path.relative(process.cwd(), f));
    console.log(`"${rom.title}": ${shown(path.join(out, rom.name))} (${rom.zip.length} bytes, ${rom.pack.files.size} files), its symbol map and the project file next to it`);
    for (const e of rom.errors) console.log(`error: ${e}`);
    for (const w of rom.warnings) console.log(`warning: ${w}`);
    for (const n of rom.notes) console.log(`not in the ROM yet: ${n}`);
    for (const m of rom.missing) console.log(`missing picture: ${m}`);
    if (o.powerOn) {
      const { powerOnTest } = await server.ssrLoadModule("/src/maker/power/powerOn.ts");
      const result = await powerOnTest(rom.zip, { wasm: fs.readFileSync(WASM) });
      const failed = result.steps.filter((s) => !s.ok && !s.skipped);
      console.log(result.ok ? `power on: ok (${result.steps.length} steps)` : `power on: failed at ${failed.map((s) => `${s.name} (${s.code})`).join(", ")}`);
      if (!result.ok) process.exitCode = 1;
    }
  } finally {
    await server.close();
  }
}

main().catch((e) => {
  console.error(`willy-rom: ${e.message ?? e}`);
  process.exit(1);
});
