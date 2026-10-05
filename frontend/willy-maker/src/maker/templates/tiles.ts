// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The starter tilesets in public/willy-maker/tiles/ (built by
// scripts/willy-maker-tiles.mjs from the ROM prototype's art). Tile numbers
// are 1-based (0 = empty), the same as in each .json manifest; a test keeps
// them in step.

export const CITY_TILESET = {
  id: "ts-city",
  url: "/willy-maker/tiles/city16.png",
  tile: 16,
  columns: 8,
  count: 31,
  palette: "pal-city",
} as const;

export const SKY_TILESET = {
  id: "ts-sky",
  url: "/willy-maker/tiles/sky32.png",
  tile: 32,
  columns: 8,
  count: 12,
  palette: "pal-sky",
} as const;

export const CITY = {
  solid_top: 1,
  solid_paint: 2,
  solid: 3,
  oneway_support: 4,
  oneway: 5,
  ladder: 6,
  crate_tl: 7,
  crate_tr: 8,
  crate_bl: 9,
  crate_br: 10,
  roof: 11,
  roof_neon: 12,
  wall: 13,
  wall_window_warm: 14,
  wall_window_cyan: 15,
  wall_window_dark: 16,
  wall_left: 17,
  wall_right: 18,
  roof_left: 19,
  roof_right: 20,
  lamp_head: 21,
  lamp_post: 22,
  lamp_base: 23,
  hydrant: 24,
  bin: 25,
  fence_top: 26,
  fence_bottom: 27,
  breakable: 28,
  hazard: 29,
  water: 30,
  block: 31,
} as const;

export const SKY = {
  sky_0: 1,
  sky_1: 2,
  sky_2: 3,
  sky_3: 4,
  sky_4: 5,
  sky_5: 6,
  skyline_a: 7,
  skyline_b: 8,
  skyline_c: 9,
  skyline_top: 10,
  skyline_antenna: 11,
  skyline_dark: 12,
} as const;

/** The tiles the auto art paints from collision tags (it may replace only these). */
export const AUTO_TILES: ReadonlySet<number> = new Set([
  CITY.solid_top,
  CITY.solid_paint,
  CITY.solid,
  CITY.oneway_support,
  CITY.oneway,
  CITY.ladder,
  CITY.crate_tl,
  CITY.crate_tr,
  CITY.crate_bl,
  CITY.crate_br,
  CITY.breakable,
  CITY.hazard,
  CITY.water,
  CITY.block,
]);

/** The palettes of the starter tilesets (board colors, from the manifests). */
export const CITY_COLORS = ["#110011", "#222233", "#CCCCCC", "#665577", "#EEAA33", "#222233", "#333355", "#EEBB55", "#55BBDD", "#667788", "#BBCCDD", "#663322", "#996633", "#DD9955", "#DD6677"];
export const SKY_COLORS = ["#111122", "#111133", "#221144", "#332255", "#442255", "#663355", "#111111", "#222233", "#333344", "#EEBB55", "#55BBCC", "#CCCCDD"];
