// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A puzzle game's level (genres.md, puzzle): the screen's first 24 x 14
// cells as walls around the wells (engine/rules.ts WELL_X, WELL_Y), drawn
// with the starter art, and no objects but the player starts. The wells
// themselves are the engine's; the level only frames them.

import { FIELD_Y0, FIELD_Y1, GOAL_Y0, GOAL_Y1, VS_FLOOR, WELL_COLS, WELL_ROWS, WELL_X, WELL_Y } from "../engine/rules";
import { layerGrid, objectLayer, tagGrid, TAG_NUMBER, type Level, type TileLayer } from "../model";
import { applyAutoArt } from "./autoArt";

/** Whether cell (c, r) is a well's wall or floor. */
export function puzzleWall(c: number, r: number): boolean {
  const top = WELL_Y / 16;
  const floor = top + WELL_ROWS;
  for (const x of WELL_X) {
    const left = x / 16 - 1;
    const right = x / 16 + WELL_COLS;
    if ((c === left || c === right) && r >= top && r <= floor) return true;
    if (r === floor && c > left && c < right) return true;
  }
  return false;
}

/** A puzzle's level (walls around the wells), or with `bare` an empty one (the quiz: nothing behind the text). */
export function shapePuzzleLevel(level: Level, bare = false): void {
  const tags = tagGrid(level);
  const playLayer = level.layers.find((l): l is TileLayer => l.id === "play");
  const play = playLayer ? layerGrid(level, playLayer) : null;
  for (let r = 0; r < tags.rows; r++)
    for (let c = 0; c < tags.cols; c++) {
      tags.set(c, r, !bare && puzzleWall(c, r) ? TAG_NUMBER.solid : TAG_NUMBER.air);
      play?.set(c, r, 0);
    }
  if (play) {
    applyAutoArt(tags, play, 0, 0, tags.cols - 1, tags.rows - 1);
    play.commit();
  }
  tags.commit();
  const items = objectLayer(level).items;
  for (let i = items.length - 1; i >= 0; i--) if (items[i]!.type !== "player_start") items.splice(i, 1);
}

/** A versus fighting game's level: one screen with a floor under VS_FLOOR (engine/rules.ts), drawn with the starter art, no objects but the player starts. */
export function shapeArenaLevel(level: Level): void {
  const tags = tagGrid(level);
  const playLayer = level.layers.find((l): l is TileLayer => l.id === "play");
  const play = playLayer ? layerGrid(level, playLayer) : null;
  for (let r = 0; r < tags.rows; r++)
    for (let c = 0; c < tags.cols; c++) {
      tags.set(c, r, r * 16 >= VS_FLOOR ? TAG_NUMBER.solid : TAG_NUMBER.air);
      play?.set(c, r, 0);
    }
  if (play) {
    applyAutoArt(tags, play, 0, 0, tags.cols - 1, tags.rows - 1);
    play.commit();
  }
  tags.commit();
  const items = objectLayer(level).items;
  for (let i = items.length - 1; i >= 0; i--) if (items[i]!.type !== "player_start") items.splice(i, 1);
}

/** A sports game's field: stands above FIELD_Y0 and under the field, and the goal lines at both ends open between GOAL_Y0 and GOAL_Y1. */
export function shapeFieldLevel(level: Level): void {
  const tags = tagGrid(level);
  const playLayer = level.layers.find((l): l is TileLayer => l.id === "play");
  const play = playLayer ? layerGrid(level, playLayer) : null;
  for (let r = 0; r < tags.rows; r++)
    for (let c = 0; c < tags.cols; c++) {
      const y = r * 16;
      const end = c === 0 || c === tags.cols - 1;
      const stand = y + 16 <= FIELD_Y0 || y >= FIELD_Y1 + 8;
      const post = end && !(y >= GOAL_Y0 - 16 && y < GOAL_Y1);
      tags.set(c, r, stand || post ? TAG_NUMBER.solid : TAG_NUMBER.air);
      play?.set(c, r, 0);
    }
  if (play) {
    applyAutoArt(tags, play, 0, 0, tags.cols - 1, tags.rows - 1);
    play.commit();
  }
  tags.commit();
  const items = objectLayer(level).items;
  for (let i = items.length - 1; i >= 0; i--) if (items[i]!.type !== "player_start") items.splice(i, 1);
}

/** A racing game's track: the wizard's ring (walls around rows 3-12 and columns 1-22 of the first screen, an island at columns 6-17, rows 6-9), which WAYPOINTS follow. */
export function shapeTrackLevel(level: Level): void {
  const tags = tagGrid(level);
  const playLayer = level.layers.find((l): l is TileLayer => l.id === "play");
  const play = playLayer ? layerGrid(level, playLayer) : null;
  for (let r = 0; r < tags.rows; r++)
    for (let c = 0; c < tags.cols; c++) {
      const road = r >= 3 && r <= 12 && c >= 1 && c <= 22 && !(r >= 6 && r <= 9 && c >= 6 && c <= 17);
      tags.set(c, r, road ? TAG_NUMBER.air : TAG_NUMBER.solid);
      play?.set(c, r, 0);
    }
  if (play) {
    applyAutoArt(tags, play, 0, 0, tags.cols - 1, tags.rows - 1);
    play.commit();
  }
  tags.commit();
  const items = objectLayer(level).items;
  for (let i = items.length - 1; i >= 0; i--) if (items[i]!.type !== "player_start") items.splice(i, 1);
}
