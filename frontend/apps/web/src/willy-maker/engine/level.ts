// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The engine's view of a level: its size, the collision tag of every 16 px
// cell and the objects placed on it. It is narrow on purpose, so the engine
// does not depend on how the editor stores a project; `levelFromProject`
// maps a project's level (docs/willy-maker/file-format.md) to it.

import { CELL, Tag } from "./rules";

/** One object of a level's object layer (world px; y is the feet for characters). */
export interface LevelObject {
  name: string;
  type: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  [prop: string]: unknown;
}

/** A rectangle drawn behind the players (buildings, signs) when the level has no art. */
export interface Scenery {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "building" | "sign";
}

export interface LevelView {
  name: string;
  /** Size in pixels (a multiple of 16). */
  width: number;
  height: number;
  /** The collision tag of every cell, row by row (`cols × rows`). */
  tags: ArrayLike<number>;
  /** Per-cell properties, keyed "col,row" (e.g. a breakable wall's hp). */
  props?: Record<string, Record<string, unknown>>;
  objects: LevelObject[];
  scenery?: Scenery[];
  /** Named stretches of the level (for the status panel). */
  sections?: { name: string; x0: number; x1: number }[];
}

/**
 * Decodes a tag or tile layer's `data`. Accepts an array, or a string
 * "rle:" followed by runs written "value*count" (or "value:count", "valuexcount")
 * separated by commas; a run with no count is one cell.
 */
export function decodeCells(data: unknown, length: number): Uint8Array {
  const out = new Uint8Array(length);
  if (Array.isArray(data) || ArrayBuffer.isView(data)) {
    const src = data as ArrayLike<number>;
    for (let i = 0; i < length && i < src.length; i++) out[i] = Number(src[i]) || 0;
    return out;
  }
  if (typeof data !== "string") return out;
  const body = data.startsWith("rle:") ? data.slice(4) : data;
  let i = 0;
  for (const run of body.split(",")) {
    if (!run) continue;
    const m = /^(\d+)(?:[*:x](\d+))?$/.exec(run.trim());
    if (!m) continue;
    const v = Number(m[1]);
    const n = m[2] === undefined ? 1 : Number(m[2]);
    for (let k = 0; k < n && i < length; k++) out[i++] = v;
  }
  return out;
}

/** The shape of a project's level that the engine reads (a subset of file-format.md). */
export interface ProjectLevelLike {
  name?: string;
  size?: { w: number; h: number };
  layers?: {
    id?: string;
    kind?: string;
    grid?: number;
    data?: unknown;
    props?: Record<string, Record<string, unknown>>;
    items?: LevelObject[];
  }[];
  sections?: { name: string; x0: number; x1: number }[];
}

/** Maps a project's level to the engine's view: the tag layer and the object layer. */
export function levelFromProject(level: ProjectLevelLike): LevelView {
  const width = level.size?.w ?? 1024;
  const height = level.size?.h ?? 448;
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const tagLayer = level.layers?.find((l) => l.kind === "tags");
  const objLayer = level.layers?.find((l) => l.kind === "objects");
  return {
    name: level.name ?? "",
    width: cols * CELL,
    height: rows * CELL,
    tags: decodeCells(tagLayer?.data, cols * rows),
    props: tagLayer?.props,
    objects: (objLayer?.items ?? []).map((o) => ({ ...o })),
    sections: level.sections,
  };
}

/**
 * The prototype's street (rom/tools/level.mjs, journal step 4): a 1024×448
 * level with a street, two buildings with ladders, fire escapes, crates to
 * climb, two civilians, three androids and a bazooka. Used as the play
 * mode's sample when a project has no level yet, and by the tests.
 */
export function sampleLevel(): LevelView {
  const cols = 64;
  const rows = 28;
  const tags = new Uint8Array(cols * rows);
  const rect = (c0: number, r0: number, c1: number, r1: number, t: number) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) tags[r * cols + c] = t;
  };
  rect(0, 25, 63, 27, Tag.Solid); // the street, top at y 400
  rect(14, 16, 23, 16, Tag.Oneway); // building A's roof, y 256
  rect(13, 16, 13, 24, Tag.Ladder);
  rect(30, 20, 37, 20, Tag.Oneway); // fire escape, y 320
  rect(39, 17, 45, 17, Tag.Oneway); // y 272
  rect(50, 13, 61, 13, Tag.Oneway); // building B's roof, y 208
  rect(49, 13, 49, 24, Tag.Ladder);
  rect(62, 13, 63, 13, Tag.Oneway);
  const crates: [number, number][] = [
    [5, 23],
    [24, 23],
    [26, 21],
    [26, 23],
    [28, 23],
  ];
  for (const [c, r] of crates) rect(c, r, c + 1, r + 1, Tag.Crate);
  const objects: LevelObject[] = [
    { name: "p1_start", type: "player_start", x: 64, y: 400, player: 1 },
    { name: "p2_start", type: "player_start", x: 96, y: 400, player: 2 },
    { name: "woman_roof_a", type: "civilian", x: 19 * 16, y: 256, kind: "woman" },
    { name: "child_roof_b", type: "civilian", x: 57 * 16, y: 208, kind: "child" },
    { name: "android_street", type: "enemy", x: 35 * 16, y: 400, kind: "glitch9", patrol: 16 * 16 },
    { name: "android_roof_a", type: "enemy", x: 20 * 16, y: 256, kind: "glitch9", patrol: 8 * 16 },
    { name: "android_roof_b", type: "enemy", x: 53 * 16, y: 208, kind: "glitch9", patrol: 6 * 16 },
    { name: "bazooka_escape", type: "pickup", x: 42 * 16, y: 272, item: "bazooka" },
    { name: "exit", type: "exit", x: 62 * 16, y: 0, w: 32, h: 448 },
  ];
  for (const [i, [c, r]] of crates.entries()) objects.push({ name: `crate_${i + 1}`, type: "crate", x: c * 16, y: r * 16, size: 32, hp: 3 });
  return {
    name: "Prototype street",
    width: cols * 16,
    height: rows * 16,
    tags,
    objects,
    sections: [
      { name: "Street", x0: 0, x1: 13 * 16 },
      { name: "Building A", x0: 13 * 16, x1: 29 * 16 },
      { name: "Fire escapes", x0: 29 * 16, x1: 49 * 16 },
      { name: "Building B", x0: 49 * 16, x1: 64 * 16 },
    ],
    scenery: [
      { x: 14 * 16, y: 16 * 16, w: 10 * 16, h: 9 * 16, kind: "building" },
      { x: 50 * 16, y: 13 * 16, w: 12 * 16, h: 12 * 16, kind: "building" },
    ],
  };
}
