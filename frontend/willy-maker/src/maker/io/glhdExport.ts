// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A platformer project as a go-link HD game package (.glhd, format 1): a
// zip with manifest.json, level.json and PNG pictures, played by go-link
// HD's own libretro core (repository golink-hd, its README documents the
// format). The first level in play order becomes the package's level, one
// letter per 16 px cell, from its collision tags and its objects. Pictures
// are optional in the format: this first export brings the tiles (cut from
// the starter city tileset); the core draws its own hero, enemies, coins,
// checkpoints and goal. Pure: the tileset picture comes in as bytes.

import type { LevelObject, Project } from "../model/types";
import { TAG_NUMBER } from "../model/types";
import { layerGrid, objectLayer, tagLayer } from "../model";
import { crateCells, objectVisible } from "../model/zones";
import { romLevel } from "../rom/pack";
import { decodePng, encodePng } from "./png";
import { writeZip } from "./zip";

/** The package format this export writes. */
export const GLHD_FORMAT = 1;

const CELL = 16;
const MIN_COLS = 40;
const MIN_ROWS = 23;
const MAX_COLS = 1024;
const MAX_ROWS = 64;

/** Starter city tileset (public/willy-maker/tiles/city16.png): 8 columns of 16 px tiles, numbered from 1. */
const CITY_TILES = { groundTop: 1, ground: 3, brick: 28, platform: 5 };
const CITY_COLUMNS = 8;

export interface GlhdLevel {
  width: number;
  height: number;
  /** The cell the players stand in: [column, row]. */
  start: [number, number];
  rows: string[];
}

export class GlhdError extends Error {
  constructor(public readonly code: "genre" | "noLevel" | "tooBig") {
    super(code);
  }
}

const LETTER: Record<number, string> = {
  [TAG_NUMBER.solid]: "#",
  [TAG_NUMBER.oneway]: "=",
  [TAG_NUMBER.breakable]: "B",
  [TAG_NUMBER.crate]: "B",
};

/** The project's first level as go-link HD's rows of letters. */
export function glhdLevel(project: Project): GlhdLevel {
  if (project.genre !== "platformer") throw new GlhdError("genre");
  const level = romLevel(project);
  if (!level) throw new GlhdError("noLevel");
  const grid = layerGrid(level, tagLayer(level));
  const cols = grid.cols;
  const rows = grid.rows;
  if (cols > MAX_COLS || rows > MAX_ROWS) throw new GlhdError("tooBig");
  const cells: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < cols; c++) row.push(LETTER[grid.get(c, r)] ?? ".");
    cells.push(row);
  }
  const objects = objectLayer(level).items.filter((o) => objectVisible(level, o));
  // crates are solid blocks in go-link HD's first format
  for (const o of objects.filter((o) => o.type === "crate")) {
    const { c0, r0, n } = crateCells(o);
    for (let r = r0; r < r0 + n; r++) for (let c = c0; c < c0 + n; c++) if (cells[r]?.[c] === ".") cells[r]![c] = "B";
  }
  // a point object stands on its y (its feet's line): the cell just above it
  const cellOf = (o: LevelObject): [number, number] => [Math.floor(o.x / CELL), Math.floor((o.y - 1) / CELL)];
  const put = (c: number, r: number, letter: string) => {
    // the nearest free cell at or above it
    for (let y = Math.min(r, rows - 1); y >= 0; y--) {
      if (c >= 0 && c < cols && cells[y]![c] === ".") {
        cells[y]![c] = letter;
        return;
      }
    }
  };
  let start: [number, number] = [2, rows - 2];
  for (const o of objects) {
    const [c, r] = cellOf(o);
    if (o.type === "player_start" && (o.player === 1 || o.player === undefined)) start = [Math.max(0, Math.min(cols - 1, c)), Math.max(0, Math.min(rows - 1, r))];
    else if (o.type === "enemy") put(c, r, "E");
    else if (o.type === "pickup" && o.item === "coin") put(c, r, "o");
    else if (o.type === "checkpoint") put(c, r, "C");
    else if (o.type === "exit") {
      // the goal stands on the floor in the middle of the exit
      const gc = Math.floor((o.x + (Number(o.w) || 2 * CELL) / 2) / CELL);
      let floor = rows - 1;
      for (let y = Math.max(0, Math.floor(o.y / CELL)); y < rows; y++)
        if (cells[y]![gc] === "#" || cells[y]![gc] === "B" || cells[y]![gc] === "=") {
          floor = y;
          break;
        }
      put(gc, floor - 1, "F");
    }
  }
  // the core's screen is 40 x 23 cells: a smaller level gets sky above it and its last column repeated
  let out = cells.map((row) => row.join(""));
  if (rows < MIN_ROWS) {
    const pad = MIN_ROWS - rows;
    out = [...Array.from({ length: pad }, () => ".".repeat(cols)), ...out];
    start = [start[0], start[1] + pad];
  }
  if (cols < MIN_COLS) out = out.map((row) => row + row[row.length - 1]!.replace(/[^#B=]/, ".").repeat(MIN_COLS - cols));
  return { width: Math.max(cols, MIN_COLS), height: out.length, start, rows: out };
}

/** The four tiles of go-link HD's format (ground top, ground, brick, platform), cut from the city tileset. */
export async function glhdTiles(cityPng: Uint8Array): Promise<Uint8Array> {
  const city = await decodePng(cityPng);
  const out = new Uint8Array(64 * 16 * 4);
  [CITY_TILES.groundTop, CITY_TILES.ground, CITY_TILES.brick, CITY_TILES.platform].forEach((n, i) => {
    const sx = ((n - 1) % CITY_COLUMNS) * CELL;
    const sy = Math.floor((n - 1) / CITY_COLUMNS) * CELL;
    for (let y = 0; y < CELL; y++)
      for (let x = 0; x < CELL; x++) {
        const from = ((sy + y) * city.w + sx + x) * 4;
        const to = (y * 64 + i * CELL + x) * 4;
        for (let k = 0; k < 4; k++) out[to + k] = city.data[from + k]!;
      }
  });
  return encodePng(64, 16, out);
}

/** The package's file name: the project's title in lower case letters and digits. */
export function glhdName(project: Project): string {
  const base = project.title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 16);
  return `${base || "game"}.glhd`;
}

const ZIP_DATE = new Date(Date.UTC(2026, 0, 1));

/** The whole package; the same project gives the same bytes. */
export async function buildGlhd(project: Project, cityPng: Uint8Array | null): Promise<Uint8Array> {
  const level = glhdLevel(project);
  const manifest = {
    format: GLHD_FORMAT,
    title: project.title.slice(0, 60) || "Willy Maker game",
    version: "1.0.0",
    genre: "platformer",
    players: Math.max(1, Math.min(4, project.settings?.players ?? 4)),
    level: "level.json",
    ...(cityPng ? { pictures: { tiles: "tiles.png" } } : {}),
  };
  const text = (o: unknown) => new TextEncoder().encode(JSON.stringify(o, null, 2) + "\n");
  const files = [
    { name: "manifest.json", data: text(manifest) },
    { name: "level.json", data: text(level) },
    ...(cityPng ? [{ name: "tiles.png", data: await glhdTiles(cityPng) }] : []),
  ];
  return writeZip(files, { compress: true, date: ZIP_DATE });
}
