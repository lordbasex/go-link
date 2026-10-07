// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The foreground (Level.front): pictures in front of the players that move
// faster than the camera, like lamp posts passing close to the screen. A
// piece is where the editor shows it when the camera's middle reaches its
// left edge; elsewhere it is drawn at
//   screen x = SCREEN_W / 2 + trunc((x - camX - SCREEN_W / 2) * speed / 100)
// and screen y = y - camY, the same arithmetic in play mode and the ROM
// engine (engine.c draw_front). The board draws it with sprites, all its
// pieces in one palette of 15 colors.

import type { FrontPiece, Level } from "./types";

export const FRONT_SPEED = { min: 110, max: 250, initial: 150 } as const;
/** The most pieces in a level, the widest piece (px) and the sprites the engine gives them in one frame. */
export const FRONT_MAX = { pieces: 16, w: 128, sprites: 64 } as const;
/** The board's screen width and the tile size (px). */
const SCREEN_W = 384;
const CELL = 16;

/** The level's front tileset: every piece's tiles, fitted to one palette. */
export const frontTilesetId = (levelId: string) => `ts-front-${levelId}`;
export const frontPaletteId = (levelId: string) => `pal-front-${levelId}`;

/** Where a piece's left edge is on screen for a camera at camX (play mode and the ROM alike). */
export function frontX(x: number, camX: number, speed: number): number {
  return SCREEN_W / 2 + Math.trunc(((x - camX - SCREEN_W / 2) * speed) / 100);
}

/** A piece's size in the level (px). */
export const frontSize = (p: Pick<FrontPiece, "cols" | "rows">) => ({ w: p.cols * CELL, h: p.rows * CELL });

/** The level's pieces, cleaned: in the level, speeds in range, at most 16. */
export function cleanFront(level: Pick<Level, "size">, raw: unknown[]): FrontPiece[] {
  const out: FrontPiece[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const p = r as Record<string, unknown>;
    if (typeof p.id !== "string" || typeof p.asset !== "string" || !p.asset.startsWith("sha256:") || typeof p.cells !== "string") continue;
    const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    const cols = Math.max(1, Math.min(FRONT_MAX.w / CELL, Math.round(n(p.cols, 1))));
    const rows = Math.max(1, Math.min(Math.ceil(level.size.h / CELL), Math.round(n(p.rows, 1))));
    out.push({
      id: p.id,
      asset: p.asset,
      name: typeof p.name === "string" ? p.name : "",
      x: Math.round(Math.max(-FRONT_MAX.w, Math.min(level.size.w, n(p.x, 0)))),
      y: Math.round(Math.max(-rows * CELL, Math.min(level.size.h, n(p.y, 0)))),
      h: Math.max(CELL, Math.min(level.size.h, Math.round(n(p.h, rows * CELL)))),
      speed: Math.max(FRONT_SPEED.min, Math.min(FRONT_SPEED.max, Math.round(n(p.speed, FRONT_SPEED.initial)))),
      cols,
      rows,
      cells: p.cells,
    });
  }
  return out.slice(0, FRONT_MAX.pieces);
}
