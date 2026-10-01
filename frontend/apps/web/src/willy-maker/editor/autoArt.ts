// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// "Auto art": when the pencil paints collision tags, the play layer gets the
// matching starter tiles (street, platform, ladder, crate…), chosen from each
// cell's neighbours, so a level looks like a level while it is being drawn.
// It only ever replaces tiles it could have painted itself (AUTO_TILES), so
// hand-placed art (building fronts, props) stays.

import { TAG_NUMBER, type CellGrid } from "../model";
import { AUTO_TILES, CITY } from "../templates/tiles";

const { air, solid, oneway, ladder, crate, breakable, hazard, water } = TAG_NUMBER;

/** The tile for one cell from the tags around it (0 = none). */
export function autoTile(tags: CellGrid, c: number, r: number): number {
  const t = tags.get(c, r);
  const above = r > 0 ? tags.get(c, r - 1) : air;
  switch (t) {
    case solid:
      if (above !== solid) return CITY.solid_top;
      return r % 2 === 0 && c % 2 === 1 ? CITY.solid_paint : CITY.solid;
    case oneway:
      return c % 2 === 0 ? CITY.oneway_support : CITY.oneway;
    case ladder:
      return CITY.ladder;
    case crate: {
      // which quarter of its 32 px crate: count crate cells to the left/up
      let dc = 0;
      while (tags.get(c - dc - 1, r) === crate) dc++;
      let dr = 0;
      while (tags.get(c, r - dr - 1) === crate) dr++;
      const right = dc % 2 === 1;
      const bottom = dr % 2 === 1;
      return bottom ? (right ? CITY.crate_br : CITY.crate_bl) : right ? CITY.crate_tr : CITY.crate_tl;
    }
    case breakable:
      return CITY.breakable;
    case hazard:
      return CITY.hazard;
    case water:
      return CITY.water;
    default:
      return 0;
  }
}

/**
 * Repaints the play cells in a rectangle (plus a one-cell margin, since
 * neighbours change too). Returns the changed cells as [index, before, after].
 */
export function applyAutoArt(tags: CellGrid, play: CellGrid, c0: number, r0: number, c1: number, r1: number): [number, number, number][] {
  const changes: [number, number, number][] = [];
  // play and tags share the 16 px grid
  for (let r = Math.max(0, r0 - 1); r <= Math.min(tags.rows - 1, r1 + 2); r++)
    for (let c = Math.max(0, c0 - 2); c <= Math.min(tags.cols - 1, c1 + 2); c++) {
      const before = play.get(c, r);
      if (before !== 0 && !AUTO_TILES.has(before)) continue;
      const after = autoTile(tags, c, r);
      if (after === before) continue;
      play.set(c, r, after);
      changes.push([r * play.cols + c, before, after]);
    }
  return changes;
}
