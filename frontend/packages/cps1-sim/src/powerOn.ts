// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Validation level 3 (docs/willy-maker/validation.md): powers on a CPS-1
// ROM set on the board model and checks, step by step, that the 68000
// program starts, draws, keeps running and reads its inputs. Pure: files
// in, steps out; the caller reads the zip and runs this in a Worker.

import { SLAMMAST, assembleProgram, distinctColors, joinGfx, layerState, renderScreen, setFiles, spriteCount, SCREEN_H, SCREEN_W, type RomSet } from "@go-link/cps1";
import { BoardSim, FAULT, type FrameStats } from "./sim.ts";
import { POWER_ON_TEXT, type Params, type PowerOnCode } from "./text.ts";

export const STEP_IDS = ["files", "program", "vectors", "run", "vblank", "palette", "layers", "picture", "alive", "inputs"] as const;
export type StepId = (typeof STEP_IDS)[number];

export interface PowerOnStep {
  name: StepId;
  ok: boolean;
  /** Not run, because an earlier step failed. */
  skipped?: boolean;
  code: PowerOnCode;
  params: Params;
  /** The result in English (POWER_ON_TEXT). */
  detail: string;
}

export interface PowerOnShot {
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  frame: number;
}

export interface PowerOnResult {
  ok: boolean;
  set: string;
  steps: PowerOnStep[];
  /** Frames the program ran (with the inputs script). */
  frames: number;
  shot?: PowerOnShot;
  ms: number;
}

export interface PowerOnOptions {
  /** cps1sim.wasm's bytes or compiled module. */
  wasm: BufferSource | WebAssembly.Module;
  set?: RomSet;
  frames?: number;
  onStep?: (step: PowerOnStep) => void;
}

export const DEFAULT_FRAMES = 300;
/** The inputs script: Coin 1, then Start 1, each held for 6 frames. */
export const SCRIPT = { coin: 120, start: 150, hold: 6 };
/** Frames with no interrupt and no drawing, with the PC inside 16 bytes, before the program counts as stuck. */
const STUCK_FRAMES = 60;
/** The picture must change at least this often (frames). */
const ALIVE_FRAMES = 60;
/** The picture is sampled every this many frames. */
const SHOT_EVERY = 30;
const SYS_COIN1 = 0x01;
const SYS_START1 = 0x10;

const hex = (n: number, digits = 6) => `0x${(n >>> 0).toString(16).padStart(digits, "0")}`;
const be32 = (b: Uint8Array, at: number) => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

class Steps {
  readonly list: PowerOnStep[] = [];
  private readonly onStep?: (s: PowerOnStep) => void;

  constructor(onStep?: (s: PowerOnStep) => void) {
    this.onStep = onStep;
  }

  add(name: StepId, ok: boolean, code: PowerOnCode, params: Params = {}, skipped = false): boolean {
    const step: PowerOnStep = { name, ok, code, params, detail: POWER_ON_TEXT[code](params), ...(skipped ? { skipped } : {}) };
    this.list.push(step);
    this.onStep?.(step);
    return ok;
  }

  /** Marks every step not reported yet as skipped. */
  skipRest(): void {
    for (const id of STEP_IDS) if (!this.list.some((s) => s.name === id)) this.add(id, false, "skipped", {}, true);
  }
}

function result(steps: Steps, set: RomSet, frames: number, started: number, shot?: PowerOnShot): PowerOnResult {
  steps.skipRest();
  return { ok: steps.list.every((s) => s.ok), set: set.id, steps: steps.list, frames, ...(shot ? { shot } : {}), ms: Math.round(now() - started) };
}

/** A result that stops at the files step (for a file that is not a zip). */
export function filesFailure(code: PowerOnCode, params: Params = {}, opts: { set?: RomSet; onStep?: (s: PowerOnStep) => void } = {}): PowerOnResult {
  const set = opts.set ?? SLAMMAST;
  const steps = new Steps(opts.onStep);
  steps.add("files", false, code, params);
  return result(steps, set, 0, now());
}

function checkFiles(set: RomSet, files: ReadonlyMap<string, Uint8Array>, steps: Steps): boolean {
  const want = setFiles(set);
  const missing = want.filter((f) => !files.has(f.name));
  if (missing.length) return steps.add("files", false, "files.missing", { name: missing[0]!.name, n: missing.length });
  const wrong = want.find((f) => files.get(f.name)!.length !== f.size);
  if (wrong) return steps.add("files", false, "files.size", { name: wrong.name, size: files.get(wrong.name)!.length, expected: wrong.size });
  return steps.add("files", true, "files.ok", { n: want.length, set: set.id });
}

interface Snapshot {
  frame: number;
  gfxram: Uint16Array;
  regs: Uint16Array;
}

interface Run {
  frames: number;
  fault?: { code: PowerOnCode; params: Params };
  irqFrames: number;
  firstIrq: number;
  firstPal: number;
  palWrites: number;
  lastGfx: number;
  soundWrites: number;
  snapshots: Snapshot[];
  last: FrameStats;
  wram: Uint16Array;
  gfxram: Uint16Array;
}

function runBoard(sim: BoardSim, program: Uint8Array, frames: number, script: boolean): Run {
  sim.load(program);
  const run: Run = { frames: 0, irqFrames: 0, firstIrq: -1, firstPal: -1, palWrites: 0, lastGfx: -1, soundWrites: 0, snapshots: [], last: sim.stats(), wram: new Uint16Array(0), gfxram: new Uint16Array(0) };
  let stuck = 0;
  let stuckFrom = 0;
  for (let f = 0; f < frames; f++) {
    let sys = 0xff;
    if (script && f >= SCRIPT.coin && f < SCRIPT.coin + SCRIPT.hold) sys &= ~SYS_COIN1;
    if (script && f >= SCRIPT.start && f < SCRIPT.start + SCRIPT.hold) sys &= ~SYS_START1;
    sim.inputs(0xffff, sys);
    const st = sim.frame();
    run.last = st;
    run.frames = f + 1;
    if (st.fault) {
      run.fault = faultOf(st, f);
      break;
    }
    if (st.irqs) {
      run.irqFrames++;
      if (run.firstIrq < 0) run.firstIrq = f;
    }
    if (st.palWrites) {
      run.palWrites += st.palWrites;
      if (run.firstPal < 0) run.firstPal = f;
    }
    if (st.gfxWrites) run.lastGfx = f;
    run.soundWrites += st.soundWrites;
    if (!st.irqs && !st.gfxWrites && st.pcHi - st.pcLo < 16) {
      if (!stuck) stuckFrom = f;
      if (++stuck >= STUCK_FRAMES) {
        run.fault = { code: "run.stuck", params: { pc: hex(st.pc), frame: stuckFrom } };
        break;
      }
    } else stuck = 0;
    if (script && ((f + 1) % SHOT_EVERY === 0 || f === frames - 1)) run.snapshots.push({ frame: f + 1, gfxram: sim.gfxram(), regs: sim.regs() });
  }
  run.wram = sim.wram();
  run.gfxram = sim.gfxram();
  return run;
}

function faultOf(st: FrameStats, frame: number): { code: PowerOnCode; params: Params } {
  const pc = hex(st.faultPc);
  const addr = hex(st.faultAddr);
  switch (st.fault) {
    case FAULT.exception:
      return { code: "run.exception", params: { vector: st.faultVector, pc, frame } };
    case FAULT.unmappedRead:
    case FAULT.unmappedWrite:
      return { code: "run.unmapped", params: { addr, pc, frame, access: st.fault === FAULT.unmappedWrite ? "write" : "read" } };
    case FAULT.romWrite:
      return { code: "run.rom-write", params: { addr, pc, frame } };
    case FAULT.odd:
      return { code: "run.odd", params: { addr, pc, frame } };
    default:
      return { code: "run.stack", params: { sp: hex(st.faultAddr, 8), pc, frame } };
  }
}

const same = (a: Uint16Array, b: Uint16Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Powers on a set's files (name -> bytes) and runs every check. */
export async function runPowerOn(files: ReadonlyMap<string, Uint8Array>, opts: PowerOnOptions): Promise<PowerOnResult> {
  const started = now();
  const set = opts.set ?? SLAMMAST;
  const frames = opts.frames ?? DEFAULT_FRAMES;
  const steps = new Steps(opts.onStep);
  if (!checkFiles(set, files, steps)) return result(steps, set, 0, started);

  // program
  const program = assembleProgram(set, files);
  let used = program.length;
  while (used > 0 && program[used - 1] === 0xff) used--;
  if (!used || program.subarray(0, used).every((b) => b === 0)) {
    steps.add("program", false, "program.empty");
    return result(steps, set, 0, started);
  }
  steps.add("program", true, "program.ok", { bytes: used });

  // vectors
  const sp = be32(program, 0);
  const pc = be32(program, 4);
  const vbl = be32(program, 26 * 4);
  if (sp & 1 || sp < 0xff0000 || sp > 0x1000000) {
    steps.add("vectors", false, "vectors.stack", { sp: hex(sp, 8) });
    return result(steps, set, 0, started);
  }
  if (pc & 1 || pc < 0x400 || pc >= used) {
    steps.add("vectors", false, "vectors.reset", { pc: hex(pc) });
    return result(steps, set, 0, started);
  }
  const inRam = (a: number) => a >= 0xff0000 || (a >= 0x900000 && a < 0x930000);
  if (vbl & 1 || !((vbl >= 0x400 && vbl < used) || inRam(vbl))) {
    steps.add("vectors", false, "vectors.vblank", { addr: hex(vbl, 8) });
    return result(steps, set, 0, started);
  }
  steps.add("vectors", true, "vectors.ok", { pc: hex(pc), sp: hex(sp), vblank: hex(vbl) });

  // run, with the inputs script
  const sim = await BoardSim.create(opts.wasm);
  const run = runBoard(sim, program, frames, true);
  if (run.fault) {
    steps.add("run", false, run.fault.code, run.fault.params);
    return result(steps, set, run.frames, started);
  }
  steps.add("run", true, "run.ok", { frames: run.frames, seconds: Math.round(run.frames / 6) / 10, sound: run.soundWrites });

  // vblank
  if (!run.irqFrames) steps.add("vblank", false, "vblank.none", { sr: hex(run.last.sr, 4) });
  else {
    const expected = frames - run.firstIrq;
    if (run.irqFrames < expected * 0.9) steps.add("vblank", false, "vblank.missed", { count: run.irqFrames, frames: expected });
    else steps.add("vblank", true, "vblank.ok", { count: run.irqFrames, frames });
  }

  // palette
  const end = run.snapshots[run.snapshots.length - 1]!;
  const palBase = (end.regs[0x0a >> 1]! << 8) & 0x3ffff;
  if (!run.palWrites) steps.add("palette", false, "palette.none");
  else if (palBase + 0x2000 > end.gfxram.length * 2) steps.add("palette", false, "palette.base", { base: hex(0x900000 + palBase) });
  else {
    const pal = end.gfxram.subarray(palBase >> 1, (palBase >> 1) + 4096);
    const colors = pal.reduce((n, w) => n + (w >> 12 && w & 0xfff ? 1 : 0), 0);
    if (!colors) steps.add("palette", false, "palette.black");
    else steps.add("palette", true, "palette.ok", { frame: run.firstPal, colors });
  }

  // layers
  const ls = layerState(end.regs, set);
  const sprites = spriteCount(end.gfxram, end.regs);
  const on = ([1, 2, 3] as const).filter((n) => ls.enabled[n]);
  const badLayer = on.find((n) => ((end.regs[n]! << 8) & 0x3ffff) + 0x4000 > end.gfxram.length * 2);
  if (!on.length && !sprites) steps.add("layers", false, "layers.none", { control: hex(ls.control, 4) });
  else if (badLayer) steps.add("layers", false, "layers.base", { layer: `scroll${badLayer}`, base: hex(0x900000 + ((end.regs[badLayer]! << 8) & 0x3ffff)) });
  else steps.add("layers", true, "layers.ok", { layers: on.map((n) => `scroll${n}`).join(", ") || "-", sprites });

  // picture
  const gfx = joinGfx(set, files);
  let shot: PowerOnShot | undefined;
  let firstPicture = -1;
  for (const s of run.snapshots) {
    if (firstPicture >= 0 && s !== end) continue;
    const rgba = renderScreen({ gfxram: s.gfxram, regs: s.regs, gfx, set });
    if (firstPicture < 0 && distinctColors(rgba, 2) >= 2) firstPicture = s.frame;
    if (s === end) shot = { w: SCREEN_W, h: SCREEN_H, rgba, frame: s.frame };
  }
  if (firstPicture < 0) steps.add("picture", false, "picture.flat", { frames });
  else steps.add("picture", true, "picture.ok", { frame: firstPicture });

  // alive
  const since = frames - 1 - run.lastGfx;
  if (run.lastGfx < 0 || since > ALIVE_FRAMES) steps.add("alive", false, "alive.frozen", { frame: run.lastGfx < 0 ? -1 : run.lastGfx + 1 });
  else steps.add("alive", true, "alive.ok", { frame: run.lastGfx + 1 });

  // inputs: the same frames from power-on without Coin and Start must end differently
  const quiet = runBoard(sim, program, frames, false);
  if (same(quiet.wram, run.wram) && same(quiet.gfxram, run.gfxram)) steps.add("inputs", false, "inputs.ignored", { coin: SCRIPT.coin, start: SCRIPT.start });
  else steps.add("inputs", true, "inputs.ok");

  return result(steps, set, run.frames, started, shot);
}
