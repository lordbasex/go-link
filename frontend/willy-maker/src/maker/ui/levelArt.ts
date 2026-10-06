// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A level's own art for play mode (T-28): its far and play tile layers with
// their pictures, as the board draws them. Shared by both editors.

import { layerGrid, type Level, type TileLayer } from "../model";
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
  return out;
}
