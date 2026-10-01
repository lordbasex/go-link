// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Draws the CPS-1 screen from the board's state: graphics RAM (tilemaps,
// sprite table, palettes), the CPS-A/CPS-B registers and the graphics
// region (docs/rom/hardware.md: video registers, tilemaps, sprites,
// palette, graphics ROM format). Used by the power-on test's screenshot.
//
// Not pixel-perfect against the core: the layers are drawn in the layer
// control's order without the priority masks, the sprite table is the
// current one (the board shows the previous frame's), and there are no row
// scroll, starfields or flip screen.

import type { RomSet } from "./sets.ts";

export const SCREEN_W = 384;
export const SCREEN_H = 224;
/** The visible area's offset in the 512 x 256 bitmap. */
const X0 = 64;
const Y0 = 16;
const TRANSPARENT = 15;

/** A palette word 0xBRGB as [r, g, b]: each channel value * (B + 2), black when B is 0. */
export function paletteRgb(word: number): [number, number, number] {
  const b = (word >> 12) & 15;
  if (!b) return [0, 0, 0];
  const m = b + 2;
  return [((word >> 8) & 15) * m, ((word >> 4) & 15) * m, (word & 15) * m];
}

/** Pen (0-15) of pixel (x, y) of a size x size tile of code c. */
export function tilePen(gfx: Uint8Array, size: 8 | 16 | 32, code: number, x: number, y: number): number {
  let off: number;
  if (size === 8) off = code * 64 + y * 8 + 4;
  else if (size === 16) off = code * 128 + y * 8 + (x >> 3) * 4;
  else off = code * 512 + y * 16 + (x >> 3) * 4;
  if (off + 3 >= gfx.length) return TRANSPARENT;
  const bit = 7 - (x & 7);
  return ((gfx[off]! >> bit) & 1) | (((gfx[off + 1]! >> bit) & 1) << 1) | (((gfx[off + 2]! >> bit) & 1) << 2) | (((gfx[off + 3]! >> bit) & 1) << 3);
}

export interface BoardScreen {
  /** Graphics RAM 0x900000-0x92ffff as words. */
  gfxram: Uint16Array;
  /** CPS-A/CPS-B registers 0x800100-0x8001ff as words. */
  regs: Uint16Array;
  /** The graphics region (joinGfx). */
  gfx: Uint8Array;
  set: RomSet;
}

const base = (regs: Uint16Array, offset: number) => ((regs[offset >> 1]! << 8) & 0x3ffff) >> 1;

const LAYERS = {
  1: { size: 8 as const, scroll: 0x0c, reg: 0x02, pal: 32, index: (r: number, c: number) => (r & 0x1f) + (c << 5) + ((r & 0x20) << 6) },
  2: { size: 16 as const, scroll: 0x10, reg: 0x04, pal: 64, index: (r: number, c: number) => (r & 0x0f) + (c << 4) + ((r & 0x30) << 6) },
  3: { size: 32 as const, scroll: 0x14, reg: 0x06, pal: 96, index: (r: number, c: number) => (r & 0x07) + (c << 3) + ((r & 0x38) << 6) },
};

/** Which layers the layer control enables, and the drawing order (0 sprites, 1-3 scroll1-3; first drawn first). */
export function layerState(regs: Uint16Array, set: RomSet): { control: number; order: number[]; enabled: Record<1 | 2 | 3, boolean> } {
  const control = regs[set.layers.control >> 1]!;
  const order = [0, 1, 2, 3].map((i) => (control >> (6 + 2 * i)) & 3);
  return {
    control,
    order,
    enabled: { 1: !!(control & set.layers.scroll1), 2: !!(control & set.layers.scroll2), 3: !!(control & set.layers.scroll3) },
  };
}

/** The sprite table's entries until the end marker (attribute 0xff00), at most 256. */
export function spriteCount(gfxram: Uint16Array, regs: Uint16Array): number {
  const obj = base(regs, 0x00);
  for (let i = 0; i < 256; i++) if (gfxram[obj + i * 4 + 3] === 0xff00 || obj + i * 4 + 3 >= gfxram.length) return i;
  return 256;
}

/** The screen as RGBA, SCREEN_W x SCREEN_H. */
export function renderScreen(s: BoardScreen): Uint8ClampedArray {
  const { gfxram, regs, gfx } = s;
  const palBase = base(regs, 0x0a);
  const colors = new Uint32Array(4096);
  for (let i = 0; i < 4096; i++) {
    const [r, g, b] = paletteRgb(gfxram[(palBase + i) % gfxram.length]!);
    colors[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  const px = new Uint32Array(SCREEN_W * SCREEN_H).fill(colors[4095]!);
  const { order, enabled } = layerState(regs, s.set);

  const drawScroll = (n: 1 | 2 | 3) => {
    const L = LAYERS[n];
    const map = base(regs, L.reg);
    const sx = regs[L.scroll >> 1]!;
    const sy = regs[(L.scroll + 2) >> 1]!;
    const span = L.size * 64;
    for (let y = 0; y < SCREEN_H; y++) {
      const my = (y + Y0 + sy) & (span - 1);
      const row = Math.floor(my / L.size);
      for (let x = 0; x < SCREEN_W; x++) {
        const mx = (x + X0 + sx) & (span - 1);
        const col = Math.floor(mx / L.size);
        const w = map + L.index(row, col) * 2;
        const code = gfxram[w % gfxram.length]!;
        if (n === 1 && code === 0x20) continue;
        const attr = gfxram[(w + 1) % gfxram.length]!;
        let tx = mx % L.size;
        let ty = my % L.size;
        if (attr & 0x20) tx = L.size - 1 - tx;
        if (attr & 0x40) ty = L.size - 1 - ty;
        const pen = tilePen(gfx, L.size, code, tx, ty);
        if (pen !== TRANSPARENT) px[y * SCREEN_W + x] = colors[(L.pal + (attr & 0x1f)) * 16 + pen]!;
      }
    }
  };

  const drawSprites = () => {
    const obj = base(regs, 0x00);
    for (let i = spriteCount(gfxram, regs) - 1; i >= 0; i--) {
      const e = obj + i * 4;
      const x = gfxram[e]!;
      const y = gfxram[e + 1]!;
      const code = gfxram[e + 2]!;
      const attr = gfxram[e + 3]!;
      const fx = !!(attr & 0x20);
      const fy = !!(attr & 0x40);
      const nx = ((attr >> 8) & 15) + 1;
      const ny = ((attr >> 12) & 15) + 1;
      const pal = (attr & 0x1f) * 16;
      for (let by = 0; by < ny; by++)
        for (let bx = 0; bx < nx; bx++) {
          const cx = fx ? nx - 1 - bx : bx;
          const cy = fy ? ny - 1 - by : by;
          const tile = (code & ~0xf) + ((code + cx) & 0xf) + 0x10 * cy;
          const ox = ((x + bx * 16) & 0x1ff) - X0;
          const oy = ((y + by * 16) & 0x1ff) - Y0;
          for (let ty = 0; ty < 16; ty++) {
            const py = oy + ty;
            if (py < 0 || py >= SCREEN_H) continue;
            for (let tx = 0; tx < 16; tx++) {
              const qx = ox + tx;
              if (qx < 0 || qx >= SCREEN_W) continue;
              const pen = tilePen(gfx, 16, tile & 0xffff, fx ? 15 - tx : tx, fy ? 15 - ty : ty);
              if (pen !== TRANSPARENT) px[py * SCREEN_W + qx] = colors[pal + pen]!;
            }
          }
        }
    }
  };

  for (const layer of order) {
    if (layer === 0) drawSprites();
    else if (enabled[layer as 1 | 2 | 3]) drawScroll(layer as 1 | 2 | 3);
  }
  return new Uint8ClampedArray(px.buffer);
}

/** How many different colors a picture has (RGBA). */
export function distinctColors(rgba: Uint8ClampedArray, stop = Infinity): number {
  const seen = new Set<number>();
  const v = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.byteLength >> 2);
  for (let i = 0; i < v.length && seen.size < stop; i++) seen.add(v[i]!);
  return seen.size;
}
