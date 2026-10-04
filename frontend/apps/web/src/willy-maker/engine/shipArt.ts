// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The horizontal shooter's ship, 32 x 16 px pointing right, as pens: one
// shape drawn by play mode (play/renderer.ts) and turned into the ROM's
// tiles (rom/tools/art.mjs TILE_SHIP), so both show the same ship.

/** Pens: 0 none, 1 the player's color, 2 the cockpit, 3 the outline, 4 the engine's flame. */
export type ShipPen = 0 | 1 | 2 | 3 | 4;

export const SHIP_W = 32;
export const SHIP_H = 16;

function body(x: number, y: number): boolean {
  const dy = Math.abs(y - 8);
  // a dart: thick at the back, narrowing to the nose, with swept wings
  if (x >= 6 && x <= 29 && dy <= Math.round(4 - (4 * (x - 6)) / 24)) return true;
  if (x >= 7 && x <= 15 && dy <= 6 - Math.max(0, x - 9)) return true;
  return false;
}

/** The ship's pen at (x, y), 0-31 x 0-15. */
export function shipPen(x: number, y: number): ShipPen {
  if (body(x, y)) {
    const cx = x - 19;
    const cy = y - 7;
    return cx * cx + 4 * cy * cy <= 9 ? 2 : 1;
  }
  if (x >= 2 && x <= 5 && Math.abs(y - 8) <= 1) return 4;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (body(x + dx, y + dy)) return 3;
  return 0;
}
