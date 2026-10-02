// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// The board model in WebAssembly (c/board.c with Musashi, built by
// tools/build.mjs into wasm/cps1sim.wasm): a thin wrapper over its exports.
// No Emscripten runtime: the module is standalone, with no imports to
// satisfy beyond stubs that are never called.

interface Exports {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  board_rom: () => number;
  board_gfxram: () => number;
  board_regs: () => number;
  board_wram: () => number;
  board_stats: () => number;
  board_inputs: (p12: number, sys: number, p3: number, p4: number) => void;
  board_reset: () => void;
  board_frame: () => number;
}

export const FAULT = { none: 0, exception: 1, unmappedRead: 2, unmappedWrite: 3, romWrite: 4, odd: 5, stack: 6 } as const;

/** What the board reports after each frame (board.c, enum ST_*). */
export interface FrameStats {
  fault: number;
  faultAddr: number;
  faultPc: number;
  faultVector: number;
  irqs: number;
  gfxWrites: number;
  palWrites: number;
  objWrites: number;
  regWrites: number;
  soundWrites: number;
  soundLast: number;
  pcLo: number;
  pcHi: number;
  pc: number;
  sp: number;
  sr: number;
  frames: number;
}

const STAT_KEYS: (keyof FrameStats)[] = ["fault", "faultAddr", "faultPc", "faultVector", "irqs", "gfxWrites", "palWrites", "objWrites", "regWrites", "soundWrites", "soundLast", "pcLo", "pcHi", "pc", "sp", "sr", "frames"];

export const PROGRAM_SIZE = 0x200000;
export const GFXRAM_WORDS = 0x18000;
export const REG_WORDS = 0x80;
export const WRAM_WORDS = 0x8000;

export class BoardSim {
  private readonly x: Exports;

  private constructor(x: Exports) {
    this.x = x;
  }

  static async create(wasm: BufferSource | WebAssembly.Module): Promise<BoardSim> {
    const module = wasm instanceof WebAssembly.Module ? wasm : await WebAssembly.compile(wasm);
    // Any import (a libc corner Emscripten keeps) is a stub that must never run.
    const imports: Record<string, Record<string, () => never>> = {};
    for (const imp of WebAssembly.Module.imports(module)) {
      if (imp.kind !== "function") continue;
      (imports[imp.module] ??= {})[imp.name] = () => {
        throw new Error(`cps1sim: unexpected call to ${imp.module}.${imp.name}`);
      };
    }
    const instance = await WebAssembly.instantiate(module, imports);
    const x = instance.exports as unknown as Exports;
    x._initialize?.();
    return new BoardSim(x);
  }

  private u8(ptr: number, n: number) {
    return new Uint8Array(this.x.memory.buffer, ptr, n);
  }

  private u16(ptr: number, n: number) {
    return new Uint16Array(this.x.memory.buffer, ptr, n);
  }

  /** Loads the program space (big-endian bytes, PROGRAM_SIZE long) and powers on. */
  load(program: Uint8Array): void {
    const rom = this.u8(this.x.board_rom(), PROGRAM_SIZE);
    rom.fill(0xff);
    rom.set(program.subarray(0, PROGRAM_SIZE));
    this.reset();
  }

  reset(): void {
    this.x.board_reset();
  }

  /**
   * Inputs as the board reads them, active low: P1 low byte / P2 high byte,
   * system byte, P3, P4. Opposite directions held together are released, as
   * the mame2003-plus core delivers them, so a run gives the core's frames
   * (experiment 1, J-17).
   */
  inputs(p12: number, sys: number, p3 = 0xffff, p4 = 0xffff): void {
    this.x.board_inputs(cancelOpposites(cancelOpposites(p12, 0), 8), sys, cancelOpposites(p3, 0), cancelOpposites(p4, 0));
  }

  frame(): FrameStats {
    this.x.board_frame();
    return this.stats();
  }

  stats(): FrameStats {
    const v = new Uint32Array(this.x.memory.buffer, this.x.board_stats(), STAT_KEYS.length);
    const out = {} as FrameStats;
    STAT_KEYS.forEach((k, i) => (out[k] = v[i]!));
    return out;
  }

  /** Copies of the board's memories. */
  gfxram(): Uint16Array {
    return this.u16(this.x.board_gfxram(), GFXRAM_WORDS).slice();
  }

  regs(): Uint16Array {
    return this.u16(this.x.board_regs(), REG_WORDS).slice();
  }

  wram(): Uint16Array {
    return this.u16(this.x.board_wram(), WRAM_WORDS).slice();
  }
}

/** One port's byte at `shift` of an active-low word with left+right and up+down released. */
export function cancelOpposites(word: number, shift: number): number {
  let v = word & 0xffff;
  const held = ~(v >> shift) & 0x0f;
  if ((held & 0x03) === 0x03) v |= 0x03 << shift;
  if ((held & 0x0c) === 0x0c) v |= 0x0c << shift;
  return v;
}
