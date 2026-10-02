// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// The ROM sets go-link's games are laid out as (docs/rom/hardware.md, from
// the driver's ROM_START), and the reverse of the loader: the files of a set
// back into the 68000's program space and the graphics region. The same
// table as rom/tools/build.mjs.

/** One program file: 16-bit words (`swap`, ROM_LOAD16_WORD_SWAP) or every other byte (`even`/`odd`, ROM_LOAD16_BYTE). */
export interface ProgramFile {
  name: string;
  at: number;
  size: number;
  swap?: true;
  even?: true;
  odd?: true;
}

export interface RomSet {
  id: string;
  program: ProgramFile[];
  programSize: number;
  gfxSize: number;
  /** Graphics files by bank, in their ROM_GROUPWORD order. */
  gfx: string[][];
  z80: { name: string; size: number };
  samples: { name: string; size: number }[];
  /** CPS-B: the layer control register (offset from 0x800100) and its enable bits. */
  layers: { control: number; scroll1: number; scroll2: number; scroll3: number };
}

const GFX_FILE = 0x80000;

export const SLAMMAST: RomSet = {
  id: "slammast",
  program: [
    { name: "mbe_23e.rom", at: 0x000000, size: 0x80000, swap: true },
    { name: "mbe_24b.rom", at: 0x080000, size: 0x20000, even: true },
    { name: "mbe_28b.rom", at: 0x080001, size: 0x20000, odd: true },
    { name: "mbe_25b.rom", at: 0x0c0000, size: 0x20000, even: true },
    { name: "mbe_29b.rom", at: 0x0c0001, size: 0x20000, odd: true },
    { name: "mbe_21a.rom", at: 0x100000, size: 0x80000, swap: true },
    { name: "mbe_20a.rom", at: 0x180000, size: 0x80000, swap: true },
  ],
  programSize: 0x200000,
  gfxSize: 0x600000,
  gfx: [
    ["mb_gfx01.rom", "mb_gfx03.rom", "mb_gfx02.rom", "mb_gfx04.rom"],
    ["mb_05.bin", "mb_07.bin", "mb_06.bin", "mb_08.bin"],
    ["mb_10.bin", "mb_12.bin", "mb_11.bin", "mb_13.bin"],
  ],
  z80: { name: "mb_qa.rom", size: 0x20000 },
  samples: Array.from({ length: 8 }, (_, i) => ({ name: `mb_q${i + 1}.bin`, size: 0x80000 })),
  layers: { control: 0x56, scroll1: 0x04, scroll2: 0x08, scroll3: 0x10 },
};

export const ROM_SETS: Record<string, RomSet> = { slammast: SLAMMAST };

/** Every file of a set with its exact size, in a stable order. */
export function setFiles(set: RomSet): { name: string; size: number }[] {
  return [
    ...set.program.map((f) => ({ name: f.name, size: f.size })),
    ...set.gfx.flat().map((name) => ({ name, size: GFX_FILE })),
    { name: set.z80.name, size: set.z80.size },
    ...set.samples,
  ];
}

/** The 68000's program space as the loader builds it (big-endian bytes; gaps stay 0xff). */
export function assembleProgram(set: RomSet, files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const space = new Uint8Array(set.programSize).fill(0xff);
  for (const f of set.program) {
    const data = files.get(f.name);
    if (!data) continue;
    const n = Math.min(f.size, data.length);
    if (f.swap) {
      for (let i = 0; i + 1 < n; i += 2) {
        space[f.at + i] = data[i + 1]!;
        space[f.at + i + 1] = data[i]!;
      }
    } else {
      const base = f.at & ~1;
      for (let i = 0; i < n; i++) space[base + i * 2 + (f.odd ? 1 : 0)] = data[i]!;
    }
  }
  return space;
}

/** The graphics region, joining each bank's four files two bytes at a time (the inverse of GfxRegion.split). */
export function joinGfx(set: RomSet, files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const out = new Uint8Array(set.gfxSize).fill(0xff);
  set.gfx.forEach((bank, b) => {
    const base = b * 0x200000;
    bank.forEach((name, i) => {
      const f = files.get(name);
      if (!f) return;
      const n = Math.min(f.length, GFX_FILE);
      for (let k = 0; k < n; k++) out[base + (k >> 1) * 8 + i * 2 + (k & 1)] = f[k]!;
    });
  });
  return out;
}

/** The set's program files from the 68000's program space (big-endian bytes): the loader's work undone, as rom/tools/build.mjs does it. */
export function splitProgram(set: RomSet, space: Uint8Array): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const f of set.program) {
    const data = new Uint8Array(f.size);
    if (f.swap) {
      for (let i = 0; i + 1 < f.size; i += 2) {
        data[i] = space[f.at + i + 1] ?? 0xff;
        data[i + 1] = space[f.at + i] ?? 0xff;
      }
    } else {
      const base = f.at & ~1;
      for (let i = 0; i < f.size; i++) data[i] = space[base + i * 2 + (f.odd ? 1 : 0)] ?? 0xff;
    }
    out[f.name] = data;
  }
  return out;
}
