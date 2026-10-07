// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A level's own art for play mode (T-28): its far and play tile layers with
// their pictures, as the board draws them, and the foreground's pieces
// (model/front.ts). Shared by both editors.

import { frontTilesetId, layerGrid, type Level, type TileLayer } from "../model";
import { decodeCells } from "../model/rle";
import type { ArtLayer } from "../play/renderer";
import type { TileImage } from "./render";

export function levelArt(level: Level, images: Map<string, TileImage>): ArtLayer[] {
  const out: ArtLayer[] = [];
  for (const id of ["far", "play"] as const) {
    const layer = level.layers.find((l): l is TileLayer => l.kind === "tiles" && l.id === id);
    const image = layer?.tileset ? images.get(layer.tileset) : undefined;
    if (!layer || layer.visible === false || !image) continue;
    const g = layerGrid(level, layer);
    if (!g.cells.some((n) => n)) continue;
    out.push({ layer: id, tile: layer.grid, cols: g.cols, rows: g.rows, cells: g.cells, image: image.img, columns: image.columns });
  }
  const front = images.get(frontTilesetId(level.id));
  if (front)
    for (const p of level.front ?? [])
      out.push({ layer: "front", tile: 16, cols: p.cols, rows: p.rows, cells: decodeCells(p.cells, p.cols * p.rows), image: front.img, columns: front.columns, x: p.x, y: p.y, speed: p.speed });
  return out;
}
