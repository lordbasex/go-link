// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Puts a picture of the user's own into a level's far or play layer (T-28):
// the layer's current art and the new picture are composed at board scale,
// fitted to the board as one layer (editor/picture.ts), and saved as the
// layer's own tileset with its palettes, in one undo step. The level grows
// when the picture is wider. Several pictures side by side, a small one
// repeated, or one long strip are all the same operation.

import { CELL, layerGrid, type Level, type Project, type TileLayer } from "../model";
import { encodeCells, decodeCells } from "../model/rle";
import { fitLayer, layerKeys, pixelSize, place, scalePicture, type FittedLayer, type KeyImage, type Rgba } from "./picture";
import type { EditorStore } from "./store";

export type PictureLayer = "far" | "play";

export interface PictureOptions {
  layer: PictureLayer;
  /** Board pixels tall: the level's height, or less for a strip at the bottom. */
  height: number;
  /** Where its left edge goes, in px (snapped to the layer's grid). */
  x: number;
  /** Repeat it to the level's right end. */
  repeat: boolean;
  /** Make the level wider when the picture does not fit. */
  grow: boolean;
  /** Read a #FF00FF magenta background as transparent (what the image AI prompts ask for). */
  keyMagenta?: boolean;
}

export interface PreparedPicture {
  options: PictureOptions;
  levelId: string;
  /** The level's width after the import. */
  width: number;
  /** The picture's own size at board scale. */
  picture: { w: number; h: number; pixelSize: number };
  fit: FittedLayer;
  /** The layer as it will look, for the preview. */
  preview: KeyImage;
}

const gridOf = (layer: PictureLayer) => (layer === "far" ? 32 : 16) as 16 | 32;

/** Composes and fits a picture into a layer; `current` is the layer's tileset picture today (null when it has none or no art). */
export function preparePicture(level: Level, src: Rgba, options: PictureOptions, current: { rgba: Rgba; columns: number } | null): PreparedPicture {
  const tile = gridOf(options.layer);
  const layer = level.layers.find((l): l is TileLayer => l.kind === "tiles" && l.id === options.layer);
  if (!layer) throw new Error(`the level has no ${options.layer} layer`);
  const px = pixelSize(src);
  const height = Math.max(tile, Math.min(level.size.h, Math.round(options.height)));
  const pic = scalePicture(src, height, options.keyMagenta === true);
  const x = Math.max(0, Math.round(options.x / tile) * tile);
  // the level grows to the picture's end (on the 32 px grid both layers share)
  const width = options.grow && !options.repeat && x + pic.w > level.size.w ? Math.ceil((x + pic.w) / 32) * 32 : level.size.w;
  const h = level.size.h;
  const base: KeyImage = { w: width, h, keys: new Int16Array(width * h).fill(-1) };
  if (current) {
    const old = layerKeys(level.size.w, h, tile, layerGrid(level, layer).cells, current.rgba, current.columns);
    for (let y = 0; y < h; y++) base.keys.set(old.keys.subarray(y * level.size.w, (y + 1) * level.size.w), y * width);
  }
  // a shorter picture sits on the level's floor
  place(base, pic, x, h - pic.h, options.repeat);
  const fit = fitLayer(base, tile);
  const preview = layerKeys(width, h, tile, fit.cells, fit.tileset, fit.tileset.columns);
  return { options, levelId: level.id, width, picture: { w: pic.w, h: pic.h, pixelSize: px }, fit, preview };
}

/** Widens every grid layer of a level, keeping each row's cells on the left. */
export function growLevel(level: Level, width: number): void {
  if (width <= level.size.w) return;
  for (const l of level.layers) {
    if (l.kind !== "tiles" && l.kind !== "tags") continue;
    const oldCols = Math.ceil(level.size.w / l.grid);
    const cols = Math.ceil(width / l.grid);
    const rows = Math.ceil(level.size.h / l.grid);
    const old = decodeCells(l.data, oldCols * rows);
    const next = new Uint16Array(cols * rows);
    for (let r = 0; r < rows; r++) next.set(old.subarray(r * oldCols, (r + 1) * oldCols), r * cols);
    l.data = encodeCells(next);
  }
  level.size.w = width;
}

/** Saves a prepared picture: its tileset (already stored as `asset`), its palettes and the layer's cells, as one undo step. */
export function applyPicture(store: EditorStore, prepared: PreparedPicture, asset: Project["tilesets"][number]["image"], label: string): void {
  store.editProject(label, (p) => setPicture(p, prepared, asset));
}

/** Puts a prepared picture into a project (no undo: the new game wizard uses it before the editor opens). */
export function setPicture(p: Project, prepared: PreparedPicture, asset: Project["tilesets"][number]["image"]): void {
  const { levelId, options, fit, width } = prepared;
  {
    const level = p.levels.find((l) => l.id === levelId);
    if (!level) return;
    growLevel(level, width);
    const layer = level.layers.find((l): l is TileLayer => l.kind === "tiles" && l.id === options.layer)!;
    const id = `ts-pic-${levelId}-${options.layer}`;
    const palPrefix = `pal-pic-${levelId}-${options.layer}-`;
    // the picture replaces this layer's earlier picture, palettes and all
    p.tilesets = p.tilesets.filter((t) => t.id !== id);
    p.palettes = p.palettes.filter((x) => !x.id.startsWith(palPrefix));
    const group = options.layer === "far" ? "far" : "play";
    const palIds = fit.palettes.map((colors, i) => {
      const pid = `${palPrefix}${i + 1}`;
      p.palettes.push({ id: pid, group, colors });
      return pid;
    });
    p.tilesets.push({ id, tile: fit.tile, image: asset, palettes: palIds, columns: fit.tileset.columns, count: fit.tileset.count, tilePalettes: fit.tilePalettes });
    layer.tileset = id;
    layer.data = encodeCells(fit.cells);
  }
}

/** A level with nothing drawn: no tiles and no collision, for a game started from a picture. */
export function clearLevelArt(level: Level): void {
  for (const l of level.layers) {
    if (l.kind !== "tiles" && l.kind !== "tags") continue;
    const cols = Math.ceil(level.size.w / l.grid);
    const rows = Math.ceil(level.size.h / l.grid);
    l.data = encodeCells(new Uint16Array(cols * rows));
  }
}

/** The cell size of a picture layer (16 px for play, 32 px for far). */
export const pictureGrid = (layer: PictureLayer) => (layer === "far" ? 32 : CELL);
