// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// CPS-1 graphics ROM writer (docs/rom/hardware.md, "Graphics ROM format").
//
// The graphics region is one address space shared by the three tile sizes:
// a 16x16 tile c is at c*128 (8 bytes per row: pixels 0-7, then 8-15),
// an 8x8 tile c at c*64 (the right 4 bytes of each 8-byte row) and a 32x32
// tile c at c*512 (16 bytes per row). Every 4 bytes hold 8 pixels as four
// bitplanes: pixel j uses bit (7 - j) of byte k for plane k. Pen 15 is
// transparent, so the region starts filled with 0xff.

export const REGION_SIZE = 0x400000;

/** Pens (0-15) by row: px[y][x]. */
export type Pens = readonly (readonly number[])[];

export class GfxRegion {
  readonly data: Uint8Array;

  constructor(size = REGION_SIZE) {
    this.data = new Uint8Array(size).fill(0xff);
  }

  /** Writes 8 pixels (pens 0-15) as the 4 planar bytes at offset. */
  put8(offset: number, pens: readonly number[]): void {
    const b = [0, 0, 0, 0];
    for (let j = 0; j < 8; j++) {
      const p = pens[j]! & 15;
      for (let k = 0; k < 4; k++) if (p & (1 << k)) b[k]! |= 0x80 >> j;
    }
    for (let k = 0; k < 4; k++) this.data[offset + k] = b[k]!;
  }

  /** px[y][x] pens, 8x8, at tile code c. */
  tile8(c: number, px: Pens): void {
    for (let y = 0; y < 8; y++) this.put8(c * 64 + y * 8 + 4, px[y]!);
  }

  /** px[y][x] pens, 16x16, at tile code c. */
  tile16(c: number, px: Pens): void {
    for (let y = 0; y < 16; y++) {
      this.put8(c * 128 + y * 8, px[y]!.slice(0, 8));
      this.put8(c * 128 + y * 8 + 4, px[y]!.slice(8, 16));
    }
  }

  /** px[y][x] pens, 32x32, at tile code c. */
  tile32(c: number, px: Pens): void {
    for (let y = 0; y < 32; y++)
      for (let q = 0; q < 4; q++) this.put8(c * 512 + y * 16 + q * 4, px[y]!.slice(q * 8, q * 8 + 8));
  }

  /**
   * Splits the region into the eight ROM files of the set, inverting the
   * driver's ROM_GROUPWORD | ROM_SKIP(6) loading: in each 8-byte group,
   * bytes 0-1 come from the first file, 2-3 the second, 4-5 the third, 6-7
   * the fourth; the second 2 MB bank uses the next four files.
   */
  split(banks: readonly (readonly string[])[]): Record<string, Uint8Array> {
    const out: Record<string, Uint8Array> = {};
    banks.forEach((files, bank) => {
      const base = bank * 0x200000;
      files.forEach((name, i) => {
        const f = new Uint8Array(0x80000);
        for (let n = 0; n < f.length; n++) f[n] = this.data[base + (n >> 1) * 8 + i * 2 + (n & 1)]!;
        out[name] = f;
      });
    });
    return out;
  }
}

/** A size x size grid of one pen. */
export function solid(size: number, pen: number): number[][] {
  return Array.from({ length: size }, () => new Array<number>(size).fill(pen));
}
