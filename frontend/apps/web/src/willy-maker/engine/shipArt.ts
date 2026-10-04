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

/** The shooter's enemy, a drone 32 x 16 px: 0 none, 1 hull, 2 dome, 3 outline, 4 lights. */
function hull(x: number, y: number): boolean {
  const dx = (x - 16) / 13;
  const dy = (y - 9) / 4;
  if (dx * dx + dy * dy < 1) return true;
  const ex = (x - 16) / 6;
  const ey = (y - 6) / 4;
  return ey <= 0 && ex * ex + ey * ey < 1;
}

export function dronePen(x: number, y: number): ShipPen {
  if (hull(x, y)) {
    if (y <= 6 && Math.abs(x - 16) <= 5) return 2;
    if (y === 10 && (x === 8 || x === 13 || x === 19 || x === 24)) return 4;
    return 1;
  }
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (hull(x + dx, y + dy)) return 3;
  return 0;
}

/** The shooter's power-up, 16 x 16 px: a capsule with a P. 0 none, 1 capsule, 2 letter, 3 outline. */
export function powerPen(x: number, y: number): ShipPen {
  const inCap = (px: number, py: number) => px >= 2 && px <= 13 && py >= 4 && py <= 11 && !((px === 2 || px === 13) && (py === 4 || py === 11));
  if (inCap(x, y)) {
    const P = ["111.", "1..1", "111.", "1...", "1..."];
    const r = y - 5;
    const c = x - 6;
    if (r >= 0 && r < 5 && c >= 0 && c < 4 && P[r]![c] === "1") return 2;
    return 1;
  }
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (inCap(x + dx, y + dy)) return 3;
  return 0;
}

/**
 * The puzzle's gem, 16 x 16 px: a cut stone. 0 none, 1 its color, 2 the
 * shine, 3 the outline, 4 its shade. GEM_COLORS lists play mode's colors,
 * the ROM's palette (rom/tools/art.mjs TILE_GEM) holds the same.
 */
export function gemPen(x: number, y: number): ShipPen {
  const inGem = (px: number, py: number) => Math.abs(px - 7.5) + Math.abs(py - 7.5) <= 8.5 && px >= 1 && px <= 14 && py >= 1 && py <= 14;
  if (inGem(x, y)) {
    if ((x === 5 || x === 6) && (y === 4 || y === 5)) return 2;
    if (x + y >= 18) return 4;
    return 1;
  }
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (inGem(x + dx, y + dy)) return 3;
  return 0;
}

/** The gems' colors, then their shades (pens 1 and 4), by color 1 to 5. */
export const GEM_BODY = ["#ee3344", "#33cc55", "#3388ff", "#ffcc22", "#bb55ee"] as const;
export const GEM_SHADE = ["#991122", "#1a7a33", "#1a4499", "#aa7711", "#6a2a99"] as const;
