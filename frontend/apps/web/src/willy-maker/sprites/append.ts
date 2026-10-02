// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// One more picture for a character (an image AI's second, third… message):
// the new picture goes under the sheet it has, both with their backgrounds
// already taken off, so the frames found so far and their animations stay.

/** A picture with its background made transparent. */
export interface KeyedImage {
  w: number;
  h: number;
  rgba: Uint8Array;
}

/** Space between the two pictures, so no box of one reaches into the other. */
export const APPEND_GAP = 16;

/** The sheet with `next` under `prev` on transparent ground, and where `next` starts. */
export function appendSheet(prev: KeyedImage, next: KeyedImage): { sheet: KeyedImage; top: number } {
  const top = prev.h + APPEND_GAP;
  const w = Math.max(prev.w, next.w);
  const h = top + next.h;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < prev.h; y++) rgba.set(prev.rgba.subarray(y * prev.w * 4, (y + 1) * prev.w * 4), y * w * 4);
  for (let y = 0; y < next.h; y++) rgba.set(next.rgba.subarray(y * next.w * 4, (y + 1) * next.w * 4), (top + y) * w * 4);
  return { sheet: { w, h, rgba }, top };
}
