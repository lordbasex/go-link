// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Draws text the way the board's text layer shows it: go-link's 8 x 8 font
// (@go-link/cps1), folded to uppercase, ink with a dark shadow one pixel
// down-right, at whole-number sizes. Used by the menu previews and play mode.

import { FONT_CELL, glyphPixels } from "@go-link/cps1";

/** Board colors for text (each channel a multiple of 17). */
export const TEXT_INKS = { accent: "#FFAA33", white: "#EEEEEE", cyan: "#55CCDD", red: "#EE5566" } as const;
export const TEXT_SHADOW = "#111111";

const cache = new Map<string, number[][]>();
function pixels(ch: string): number[][] {
  let px = cache.get(ch);
  if (!px) {
    px = glyphPixels(ch, 1, 2);
    cache.set(ch, px);
  }
  return px;
}

/** Draws `text` with its top left at (x, y) board pixels; `scale` multiplies every pixel. */
export function drawBoardText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, ink: string, shadow: string = TEXT_SHADOW): void {
  const up = text.toUpperCase();
  let cx = x;
  for (const ch of up) {
    if (ch !== " ") {
      const px = pixels(ch);
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
          const pen = px[r]![c]!;
          if (pen === 15) continue;
          ctx.fillStyle = pen === 1 ? ink : shadow;
          ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
        }
    }
    cx += FONT_CELL * scale;
  }
}

/** Width in board pixels of `text` at `scale`. */
export function boardTextWidth(text: string, scale = 1): number {
  return [...text].length * FONT_CELL * scale;
}
