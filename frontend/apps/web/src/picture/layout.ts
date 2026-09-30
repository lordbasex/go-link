// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Where the picture goes inside the area the renderer draws: the largest
// rectangle with the game's display aspect that fits, centered. It never
// crops: the whole picture is always inside the area.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The largest rectangle of the given aspect (width / height) inside w x h, centered. */
export function fitRect(w: number, h: number, aspect: number, inset = 0): Rect {
  const aw = Math.max(0, w - 2 * inset);
  const ah = Math.max(0, h - 2 * inset);
  if (aw <= 0 || ah <= 0 || !(aspect > 0) || !Number.isFinite(aspect)) return { x: w / 2, y: h / 2, w: 0, h: 0 };
  let pw = aw;
  let ph = aw / aspect;
  if (ph > ah) {
    ph = ah;
    pw = ah * aspect;
  }
  return { x: (w - pw) / 2, y: (h - ph) / 2, w: pw, h: ph };
}

/**
 * The monitor's surround of the Frame bands, in canvas pixels: a thin
 * bezel that always shows, even when the picture fills the width.
 */
export function frameInset(w: number, h: number, dpr: number): number {
  return Math.round(Math.min(Math.max(Math.min(w, h) * 0.035, 8 * dpr), 36 * dpr));
}

/**
 * The canvas's backing size: the element's CSS size times the device
 * pixel ratio, capped at about a 4K screen's pixels so a huge window
 * never costs more than a 4K one.
 */
export function backingSize(cssW: number, cssH: number, dpr: number, maxPixels = 3840 * 2160): { w: number; h: number; scale: number } {
  let scale = Math.max(1, dpr);
  const pixels = cssW * cssH * scale * scale;
  if (pixels > maxPixels) scale = Math.sqrt(maxPixels / (cssW * cssH));
  return { w: Math.max(1, Math.round(cssW * scale)), h: Math.max(1, Math.round(cssH * scale)), scale };
}

/** Output pixels per source pixel, per axis (how much the game is enlarged). */
export function scaleOf(rect: Rect, srcW: number, srcH: number): { x: number; y: number } {
  return { x: srcW > 0 ? rect.w / srcW : 1, y: srcH > 0 ? rect.h / srcH : 1 };
}
