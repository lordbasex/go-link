// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { BoardSim, STEP_IDS, type PowerOnResult } from "@go-link/cps1-sim";
import { readZip, writeZip } from "../io/zip";
import { powerOnTest } from "./powerOn";

// Validation level 3 against the real prototype ROM (rom/tools/build.mjs).
// Without rom/build/slammast.zip (CI builds no ROM) the ROM tests skip.
const WASM = resolve(__dirname, "../../../../packages/cps1-sim/wasm/cps1sim.wasm");
const ROM = resolve(__dirname, "../../../../../rom/build/slammast.zip");
const hasRom = existsSync(ROM);

const wasm = readFileSync(WASM);
let files: Map<string, Uint8Array>;
let module: WebAssembly.Module;

beforeAll(async () => {
  module = await WebAssembly.compile(wasm);
  if (hasRom) files = await readZip(new Uint8Array(readFileSync(ROM)));
});

async function zipOf(change: (f: Map<string, Uint8Array>) => void): Promise<Uint8Array> {
  const copy = new Map([...files].map(([k, v]) => [k, v.slice()]));
  change(copy);
  return writeZip([...copy].map(([name, data]) => ({ name, data })), { compress: false });
}

const step = (r: PowerOnResult, name: string) => r.steps.find((s) => s.name === name)!;

/** The step that failed first, and everything after it skipped. */
function failsAt(r: PowerOnResult, name: (typeof STEP_IDS)[number], code: string) {
  expect(r.ok).toBe(false);
  const s = step(r, name);
  expect(s.ok, s.detail).toBe(false);
  expect(s.code).toBe(code);
  const after = STEP_IDS.slice(STEP_IDS.indexOf(name) + 1);
  for (const id of after) expect(step(r, id).skipped, id).toBe(true);
  return s;
}

/** Writes 16-bit words at a 68000 address of mbe_23e.rom (stored word-swapped). */
function patchProgram(f: Map<string, Uint8Array>, at: number, words: number[]) {
  const rom = f.get("mbe_23e.rom")!;
  words.forEach((w, i) => {
    rom[at + i * 2] = w & 0xff;
    rom[at + i * 2 + 1] = w >> 8;
  });
}

/** The reset PC, read back from the word-swapped file. */
function resetPc(f: Map<string, Uint8Array>): number {
  const r = f.get("mbe_23e.rom")!;
  return ((r[5]! << 24) | (r[4]! << 16) | (r[7]! << 8) | r[6]!) >>> 0;
}

describe("the board model", () => {
  it("is a standalone WebAssembly module of about 100-300 KB", () => {
    expect(wasm.length).toBeGreaterThan(50_000);
    expect(wasm.length).toBeLessThan(400_000);
    const exports = WebAssembly.Module.exports(module).map((e) => e.name);
    for (const name of ["memory", "board_reset", "board_frame", "board_stats"]) expect(exports).toContain(name);
  });

  it("reports an unmapped access instead of reading garbage", async () => {
    const sim = await BoardSim.create(module);
    const program = new Uint8Array(0x200000).fill(0xff);
    // stack 0xfff000, reset 0x400: move.w 0x500000,d0
    program.set([0x00, 0xff, 0xf0, 0x00, 0x00, 0x00, 0x04, 0x00]);
    program.set([0x30, 0x39, 0x00, 0x50, 0x00, 0x00], 0x400);
    sim.load(program);
    const st = sim.frame();
    expect(st.fault).toBe(2);
    expect(st.faultAddr).toBe(0x500000);
    expect(st.faultPc).toBe(0x400);
  });
});

describe.skipIf(!hasRom)("power-on test of rom/build/slammast.zip", () => {
  it("boots: every step passes, with a picture of the game", async () => {
    const seen: string[] = [];
    const r = await powerOnTest(new Uint8Array(readFileSync(ROM)), { wasm: module, onStep: (s) => seen.push(s.name) });
    for (const s of r.steps) expect(s.ok, `${s.name}: ${s.detail}`).toBe(true);
    expect(r.ok).toBe(true);
    expect(seen).toEqual([...STEP_IDS]);
    expect(r.frames).toBe(300);
    expect(r.shot!.w * r.shot!.h * 4).toBe(r.shot!.rgba.length);
    // the level, Willy and the HUD: far more than a couple of colors
    const colors = new Set<number>();
    const v = new Uint32Array(r.shot!.rgba.buffer);
    for (const c of v) colors.add(c);
    expect(colors.size).toBeGreaterThan(8);
    expect(step(r, "layers").detail).toContain("scroll1, scroll2, scroll3");
  });

  it("fails at the files step on a truncated program ROM", async () => {
    const r = await powerOnTest(await zipOf((f) => f.set("mbe_23e.rom", f.get("mbe_23e.rom")!.slice(0, 0x40000))), { wasm: module });
    expect(failsAt(r, "files", "files.size").detail).toBe("mbe_23e.rom is 262144 bytes. The set needs exactly 524288.");
  });

  it("fails at the files step on a wrong graphics ROM size and a missing file", async () => {
    let r = await powerOnTest(await zipOf((f) => f.set("mb_gfx03.rom", new Uint8Array(0x80001))), { wasm: module });
    expect(failsAt(r, "files", "files.size").params.name).toBe("mb_gfx03.rom");
    r = await powerOnTest(await zipOf((f) => f.delete("mb_qa.rom")), { wasm: module });
    expect(failsAt(r, "files", "files.missing").detail).toBe("mb_qa.rom is missing from the zip.");
  });

  it("fails at the run step when the program is cut short inside its file", async () => {
    // the file keeps its size, but everything after the start-up code is gone
    const r = await powerOnTest(await zipOf((f) => f.get("mbe_23e.rom")!.fill(0xff, 0x800)), { wasm: module });
    const s = failsAt(r, "run", "run.exception");
    expect(s.detail).toMatch(/^The 68000 crashed at 0x[0-9a-f]{6} on frame 0: line F opcode\.$/);
  });

  it("fails at the vectors step with a zeroed reset vector", async () => {
    const r = await powerOnTest(await zipOf((f) => f.get("mbe_23e.rom")!.fill(0, 4, 8)), { wasm: module });
    expect(failsAt(r, "vectors", "vectors.reset").detail).toBe("The reset vector points to 0x000000, outside the program.");
  });

  it("fails at the vectors step with a stack outside work RAM", async () => {
    const r = await powerOnTest(await zipOf((f) => f.get("mbe_23e.rom")!.fill(0, 0, 4)), { wasm: module });
    failsAt(r, "vectors", "vectors.stack");
  });

  it("fails at the run step with an endless loop at reset", async () => {
    const r = await powerOnTest(
      await zipOf((f) => patchProgram(f, resetPc(f), [0x60fe])),
      { wasm: module },
    );
    const s = failsAt(r, "run", "run.stuck");
    expect(s.detail).toMatch(/^The program is stuck in a loop at 0x[0-9a-f]{6} with interrupts off, since frame 0\.$/);
  });

  it("fails at the run step on an illegal instruction and on a jump to nowhere", async () => {
    let r = await powerOnTest(await zipOf((f) => patchProgram(f, resetPc(f), [0x4afc])), { wasm: module });
    expect(failsAt(r, "run", "run.exception").detail).toContain("illegal instruction");
    r = await powerOnTest(await zipOf((f) => patchProgram(f, resetPc(f), [0x4ef9, 0x0050, 0x0000])), { wasm: module });
    expect(failsAt(r, "run", "run.unmapped").detail).toBe("On frame 0 the code at 0x500000 read 0x500000, an address the board does not have.");
  });

  it("refuses a file that is not a zip", async () => {
    const r = await powerOnTest(new TextEncoder().encode("not a zip at all, just text"), { wasm: module });
    failsAt(r, "files", "files.not-zip");
  });
});
