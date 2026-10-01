// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Writes a level as a Tiled map (.tmj), the format docs/rom/art-spec.md
// asks levels in: the far picture as an image layer, the `play` tile layer,
// the `collision` tile layer (tiles typed solid, oneway, ladder…) and the
// `objects` layer with typed objects and their properties. io/tiled.ts
// reads it back (tags and objects round-trip exactly).

import { CELL, layerGrid, objectLayer, tagLayer, TAGS, type Level, type Project, type TileLayer } from "../model";

/** The collision tags drawn in the collision tileset and pictures (art-spec.md section 4). */
export const TAG_COLORS: Record<string, [number, number, number]> = {
  air: [255, 255, 255],
  solid: [0, 0, 0],
  oneway: [0, 255, 0],
  ladder: [0, 0, 255],
  crate: [255, 170, 0],
  breakable: [255, 0, 0],
  hazard: [255, 0, 255],
  water: [0, 255, 255],
};

/** The collision tileset: one 16 px tile per tag after air, in TAGS order. */
export const COLLISION_TILES = TAGS.slice(1);

export interface TiledExportOptions {
  /** Paths are relative to the .tmj file. */
  farImage?: string | null;
  /** The play layer's tileset picture and its size in pixels. */
  playTileset?: { path: string; w: number; h: number } | null;
  collisionTileset: string;
}

type Prop = { name: string; type: "string" | "int" | "float" | "bool"; value: string | number | boolean };

function propsOf(o: Record<string, unknown>, skip: Set<string>): Prop[] {
  const out: Prop[] = [];
  for (const [name, value] of Object.entries(o)) {
    if (skip.has(name) || value === undefined || value === null) continue;
    if (typeof value === "boolean") out.push({ name, type: "bool", value });
    else if (typeof value === "number") out.push({ name, type: Number.isInteger(value) ? "int" : "float", value });
    else out.push({ name, type: "string", value: typeof value === "string" ? value : JSON.stringify(value) });
  }
  return out;
}

/** The play layer of a level (the 16 px tile layer named or id'd "play"). */
export function playLayer(level: Level): TileLayer | undefined {
  const tiles = level.layers.filter((l): l is TileLayer => l.kind === "tiles");
  return tiles.find((l) => l.id === "play") ?? tiles.find((l) => l.grid === CELL);
}

export function levelToTiled(level: Level, project: Project, opts: TiledExportOptions): Record<string, unknown> {
  const cols = Math.ceil(level.size.w / CELL);
  const rows = Math.ceil(level.size.h / CELL);
  const layers: Record<string, unknown>[] = [];
  const tilesets: Record<string, unknown>[] = [];
  let id = 1;
  let firstgid = 1;

  if (opts.farImage) layers.push({ id: id++, name: "far", type: "imagelayer", image: opts.farImage, x: 0, y: 0, offsetx: 0, offsety: 0, opacity: 1, visible: true, parallaxx: 0.5, parallaxy: 0.5, repeatx: false, repeaty: false });

  const play = playLayer(level);
  if (play) {
    const grid = layerGrid(level, play);
    const ts = project.tilesets.find((t) => t.id === play.tileset) ?? project.tilesets.find((t) => t.tile === CELL);
    let max = 0;
    for (const v of grid.cells) if (v > max) max = v;
    const columns = ts?.columns || (opts.playTileset ? Math.max(1, Math.floor(opts.playTileset.w / CELL)) : 8);
    const count = Math.max(ts?.count ?? 0, max);
    if (count) {
      tilesets.push({
        firstgid,
        name: ts?.id ?? "play",
        tilewidth: CELL,
        tileheight: CELL,
        columns,
        tilecount: count,
        margin: 0,
        spacing: 0,
        image: opts.playTileset?.path ?? `${ts?.id ?? "play"}.png`,
        imagewidth: opts.playTileset?.w ?? columns * CELL,
        imageheight: opts.playTileset?.h ?? Math.ceil(count / columns) * CELL,
      });
    }
    layers.push({ id: id++, name: "play", type: "tilelayer", x: 0, y: 0, width: cols, height: rows, opacity: 1, visible: true, data: Array.from(grid.cells, (v) => (v ? firstgid + v - 1 : 0)) });
    firstgid += count;
  }

  const collisionGid = firstgid;
  tilesets.push({
    firstgid: collisionGid,
    name: "collision",
    tilewidth: CELL,
    tileheight: CELL,
    columns: COLLISION_TILES.length,
    tilecount: COLLISION_TILES.length,
    margin: 0,
    spacing: 0,
    image: opts.collisionTileset,
    imagewidth: COLLISION_TILES.length * CELL,
    imageheight: CELL,
    tiles: COLLISION_TILES.map((tag, i) => ({ id: i, type: tag, class: tag })),
  });
  const tags = layerGrid(level, tagLayer(level));
  layers.push({ id: id++, name: "collision", type: "tilelayer", x: 0, y: 0, width: cols, height: rows, opacity: 1, visible: true, data: Array.from(tags.cells, (v) => (v > 0 && v < TAGS.length ? collisionGid + v - 1 : 0)) });

  const skip = new Set(["name", "type", "x", "y", "w", "h"]);
  let objectId = 1;
  const objects = objectLayer(level).items.map((o) => {
    const rect = (o.type === "camera_lock" || o.type === "boss") && typeof o.w === "number" && typeof o.h === "number";
    const base = { id: objectId++, name: o.name, type: o.type, class: o.type, x: o.x, y: o.y, rotation: 0, visible: true, properties: propsOf(o, skip) };
    return rect ? { ...base, width: o.w, height: o.h } : { ...base, width: 0, height: 0, point: true };
  });
  layers.push({ id: id++, name: "objects", type: "objectgroup", draworder: "index", x: 0, y: 0, opacity: 1, visible: true, objects });

  return {
    type: "map",
    version: "1.10",
    tiledversion: "1.10.2",
    orientation: "orthogonal",
    renderorder: "right-down",
    infinite: false,
    width: cols,
    height: rows,
    tilewidth: CELL,
    tileheight: CELL,
    nextlayerid: id,
    nextobjectid: objectId,
    properties: [
      { name: "level_id", type: "string", value: level.id },
      { name: "level_name", type: "string", value: level.name },
      { name: "camera_forward_only", type: "bool", value: level.camera.forwardOnly },
      { name: "camera_backtrack", type: "int", value: level.camera.backtrack },
      { name: "sections", type: "string", value: JSON.stringify(level.sections) },
    ],
    layers,
    tilesets,
  };
}
