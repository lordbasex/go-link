// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Reads a level from a Tiled map (.tmj/.json, or .tmx with CSV data), the
// format docs/rom/art-spec.md asks levels in: a `collision` tile layer whose
// tiles carry a type (solid, oneway, ladder…) and an `objects` layer with
// typed objects. Tile art is not imported (Willy Maker keeps its own
// tilesets); a missing tile type falls back to the tile's order in TAGS.

import { InputError, CELL, defaultLayers, encodeCells, newId, OBJECT_TYPES, TAG_NUMBER, TAGS, type Level, type LevelObject, type ObjectType, type Tag } from "../model";

interface TiledProperty {
  name: string;
  value: unknown;
}

interface TiledTile {
  id: number;
  type?: string;
  class?: string;
  properties?: TiledProperty[];
}

interface TiledTileset {
  firstgid: number;
  tiles?: TiledTile[];
}

interface TiledObject {
  name?: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  point?: boolean;
  properties?: TiledProperty[];
}

interface TiledLayer {
  name: string;
  type: "tilelayer" | "objectgroup" | string;
  width?: number;
  height?: number;
  data?: number[];
  objects?: TiledObject[];
}

interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets?: TiledTileset[];
}

function fromTmx(text: string): TiledMap {
  if (typeof DOMParser === "undefined") throw new InputError("tiled.tmx-here");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const map = doc.querySelector("map");
  if (!map || doc.querySelector("parsererror")) throw new InputError("tiled.not-map");
  const num = (el: Element, a: string) => Number(el.getAttribute(a) ?? 0);
  const props = (el: Element): TiledProperty[] =>
    [...el.querySelectorAll(":scope > properties > property")].map((p) => ({ name: p.getAttribute("name") ?? "", value: p.getAttribute("value") ?? p.textContent ?? "" }));
  const tilesets: TiledTileset[] = [...map.querySelectorAll(":scope > tileset")].map((ts) => ({
    firstgid: num(ts, "firstgid"),
    tiles: [...ts.querySelectorAll(":scope > tile")].map((t) => ({ id: num(t, "id"), type: t.getAttribute("type") ?? t.getAttribute("class") ?? undefined, properties: props(t) })),
  }));
  const layers: TiledLayer[] = [];
  for (const el of map.children) {
    if (el.tagName === "layer") {
      const data = el.querySelector("data");
      if (data && data.getAttribute("encoding") !== "csv") throw new InputError("tiled.tmx-csv");
      layers.push({ name: el.getAttribute("name") ?? "", type: "tilelayer", width: num(el, "width"), height: num(el, "height"), data: (data?.textContent ?? "").split(",").map((v) => Number(v.trim()) || 0) });
    } else if (el.tagName === "objectgroup") {
      layers.push({
        name: el.getAttribute("name") ?? "",
        type: "objectgroup",
        objects: [...el.querySelectorAll(":scope > object")].map((o) => ({
          name: o.getAttribute("name") ?? "",
          type: o.getAttribute("type") ?? o.getAttribute("class") ?? "",
          x: num(o, "x"),
          y: num(o, "y"),
          width: o.hasAttribute("width") ? num(o, "width") : undefined,
          height: o.hasAttribute("height") ? num(o, "height") : undefined,
          point: !!o.querySelector("point"),
          properties: props(o),
        })),
      });
    }
  }
  return { width: num(map, "width"), height: num(map, "height"), tilewidth: num(map, "tilewidth"), tileheight: num(map, "tileheight"), layers, tilesets };
}

/** Parses a Tiled map file into a level. Throws an InputError the UI translates. */
export function levelFromTiled(text: string, fileName: string): Level {
  try {
    return readTiled(text, fileName);
  } catch (e) {
    // anything unexpected in the file is "not a map we can read", never a crash
    throw e instanceof InputError ? e : new InputError("tiled.not-map");
  }
}

const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function readTiled(text: string, fileName: string): Level {
  let map: TiledMap;
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<")) map = fromTmx(text);
  else {
    try {
      map = JSON.parse(text) as TiledMap;
    } catch {
      throw new InputError("tiled.not-map");
    }
  }
  if (!map || typeof map !== "object" || !Array.isArray(map.layers) || !Number.isInteger(map.width) || !Number.isInteger(map.height) || map.width < 1 || map.height < 1) throw new InputError("tiled.not-map");
  if (map.tilewidth !== CELL || map.tileheight !== CELL) throw new InputError("tiled.grid", { cell: CELL, w: Number.isFinite(map.tilewidth) ? map.tilewidth : "?", h: Number.isFinite(map.tileheight) ? map.tileheight : "?" });
  const w = map.width * CELL;
  const h = map.height * CELL;
  if (w > 16384 || h > 2048) throw new InputError("tiled.too-big", { maxW: 16384, maxH: 2048 });
  const tagOfGid = new Map<number, number>();
  for (const ts of map.tilesets ?? [])
    for (const t of Array.isArray(ts?.tiles) ? ts.tiles : []) {
      if (!t || typeof t !== "object") continue;
      const kind = (t.type ?? t.class ?? t.properties?.find((p) => p.name === "type")?.value ?? "") as string;
      if ((TAGS as readonly string[]).includes(kind)) tagOfGid.set(ts.firstgid + t.id, TAG_NUMBER[kind as Tag]);
    }
  const level: Level = {
    id: `level-${newId().slice(0, 8)}`,
    name: fileName.replace(/\.(tmj|json|tmx)$/i, "") || "Tiled map",
    size: { w, h },
    camera: { forwardOnly: true, backtrack: 48 },
    layers: defaultLayers(w, h),
    sections: [],
  };
  map.layers = map.layers.filter((l) => l && typeof l === "object").map((l) => ({ ...l, name: String(l.name ?? "") }));
  const collision = map.layers.find((l) => l.type === "tilelayer" && l.name.toLowerCase() === "collision");
  if (Array.isArray(collision?.data)) {
    const cells = new Uint16Array(map.width * map.height);
    for (let i = 0; i < cells.length; i++) {
      const gid = finite(collision!.data![i]) & 0x1fffffff;
      if (!gid) continue;
      cells[i] = tagOfGid.get(gid) ?? (gid < TAGS.length ? gid : TAG_NUMBER.solid);
    }
    const tags = level.layers.find((l) => l.kind === "tags");
    if (tags && tags.kind === "tags") tags.data = encodeCells(cells);
  }
  const objectsLayer = level.layers.find((l) => l.kind === "objects");
  const group = map.layers.find((l) => l.type === "objectgroup" && l.name.toLowerCase() === "objects") ?? map.layers.find((l) => l.type === "objectgroup");
  if (Array.isArray(group?.objects) && objectsLayer?.kind === "objects") {
    const used = new Set<string>();
    for (const o of group!.objects!) {
      if (!o || typeof o !== "object") continue;
      const type = String(o.type || o.class || "") as ObjectType;
      if (!(OBJECT_TYPES as readonly string[]).includes(type)) continue;
      const base = String(o.name || type).replace(/[^A-Za-z0-9_]+/g, "_").slice(0, 28) || type;
      let name = base;
      for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
      used.add(name);
      const item: LevelObject = { name, type, x: Math.round(finite(o.x)), y: Math.round(finite(o.y)) };
      // rectangles keep their size; points and tiles stand on y
      if (finite(o.width) > 0 && finite(o.height) > 0 && !o.point) {
        if (type === "camera_lock" || type === "boss") {
          item.w = Math.round(finite(o.width));
          item.h = Math.round(finite(o.height));
        } else item.y = Math.round(finite(o.y) + finite(o.height));
      }
      for (const p of Array.isArray(o.properties) ? o.properties : []) if (p && typeof p.name === "string" && p.name && !(p.name in item)) item[p.name] = p.value;
      objectsLayer.items.push(item);
    }
  }
  return level;
}
