// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The foreground's pictures fitted to the board (model/front.ts): each one
// cropped to what it draws (an image AI's magenta and transparent pixels
// left out), scaled to its height (narrower when it would be wider than
// 128 px), and every piece's 16 px tiles fitted together to ONE palette of
// 15 colors, since the sprites have few palettes left. Pure: pixels in,
// tiles out.

import { FRONT_MAX } from "../model/front";
import { fitLayer, isMagenta, place, scalePicture, type FittedLayer, type KeyImage, type Rgba } from "./picture";

const CELL = 16;

/** The part of a picture that draws something: its bounding box without transparent (or, with `key`, magenta) pixels; null when it draws nothing. */
export function cropDrawn(src: Rgba, key: boolean): Rgba | null {
  let x0 = src.w;
  let y0 = src.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      if (src.data[i + 3]! < 128 || (key && isMagenta(src.data[i]!, src.data[i + 1]!, src.data[i + 2]!))) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(src.data.subarray(((y0 + y) * src.w + x0) * 4, ((y0 + y) * src.w + x0 + w) * 4), y * w * 4);
  return { w, h, data };
}

/** A piece's picture in board colors at its height, at most 128 px wide (shorter when it would be wider); null when it draws nothing. */
export function pieceKeys(src: Rgba, h: number, key: boolean): KeyImage | null {
  const drawn = cropDrawn(src, key);
  if (!drawn) return null;
  const height = Math.max(CELL, Math.min(h, Math.floor((FRONT_MAX.w * drawn.h) / drawn.w)));
  return scalePicture(drawn, height, key);
}

export interface FittedFront {
  /** The tiles of every piece, one palette (`fit.palettes[0]`). */
  fit: FittedLayer;
  /** Each piece's columns, rows and tile per cell (0 = empty), in the order given. */
  pieces: { cols: number; rows: number; cells: Uint16Array }[];
}

/** Every piece's tiles fitted together to one palette of 15 colors. */
export function fitFront(pictures: readonly KeyImage[]): FittedFront {
  const sizes = pictures.map((p) => ({ cols: Math.ceil(p.w / CELL), rows: Math.ceil(p.h / CELL) }));
  // side by side on the 16 px grid, each standing at the top
  const w = Math.max(CELL, sizes.reduce((n, s) => n + s.cols * CELL, 0));
  const h = Math.max(CELL, ...sizes.map((s) => s.rows * CELL));
  const strip: KeyImage = { w, h, keys: new Int16Array(w * h).fill(-1) };
  let at = 0;
  pictures.forEach((p, i) => {
    place(strip, p, at, 0, false);
    at += sizes[i]!.cols * CELL;
  });
  const fit = fitLayer(strip, 16, 1);
  at = 0;
  const pieces = sizes.map((s) => {
    const cells = new Uint16Array(s.cols * s.rows);
    for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) cells[r * s.cols + c] = fit.cells[r * fit.cols + at + c]!;
    at += s.cols;
    return { ...s, cells };
  });
  return { fit, pieces };
}
