// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A tower 4096 px tall (256 rows of 16 px, the play layer's tilemap holds
// 64): a ladder from the floor to the top and ledges on both sides at many
// heights, and a far layer whose rows each look different, so a row the
// engine streamed into the wrong place shows at once. Tests and the lab run
// rom/tools/lab/runs/tall-climb.json use it (engine.c slide).

import { applyAutoArt } from "../editor/autoArt";
import { layerGrid, objectLayer, tagGrid, TAG_NUMBER, type Project, type TileLayer } from "../model";
import { projectFromTemplate } from "../templates";
import { SKY } from "../templates/tiles";

export const TALL = { h: 4096, ladderCol: 12, topRow: 6 };

export function tallProject(): Project {
  const p = projectFromTemplate("empty", { title: "Tall Tower", layout: "slammast", players: 1, levelName: "Tower", screens: 2, height: TALL.h });
  const level = p.levels[0]!;
  const tags = tagGrid(level);
  const play = layerGrid(level, level.layers.find((l): l is TileLayer => l.id === "play")!);
  const paint = (c0: number, r0: number, c1: number, r1: number, tag: number) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) tags.set(c, r, tag);
    applyAutoArt(tags, play, c0, r0, c1, r1);
  };
  let floor = 0;
  while (floor < tags.rows && tags.get(0, floor) !== TAG_NUMBER.solid) floor++;
  // the top floor the ladder leads to, the ladder, and ledges every 6 rows on alternate sides
  paint(4, TALL.topRow, 30, TALL.topRow, TAG_NUMBER.oneway);
  paint(TALL.ladderCol, TALL.topRow, TALL.ladderCol, floor - 1, TAG_NUMBER.ladder);
  for (let r = TALL.topRow + 6, k = 0; r < floor - 2; r += 6, k++) {
    if (k % 2) paint(15, r, 15 + (k % 5) + 3, r, TAG_NUMBER.solid);
    else paint(2 + (k % 4), r, 9, r, TAG_NUMBER.oneway);
  }
  tags.commit();
  play.commit();
  // the far layer: each row its own sky tile, cycling
  const sky = [SKY.sky_0, SKY.sky_1, SKY.sky_2, SKY.sky_3, SKY.sky_4, SKY.sky_5];
  const farLayer = level.layers.find((l): l is TileLayer => l.id === "far")!;
  const far = layerGrid(level, farLayer);
  for (let r = 0; r < far.rows; r++) for (let c = 0; c < far.cols; c++) far.set(c, r, sky[(r + (c >> 3)) % sky.length]!);
  far.commit();
  const start = objectLayer(level).items.find((o) => o.type === "player_start")!;
  Object.assign(start, { x: TALL.ladderCol * 16 + 8, y: floor * 16 });
  return p;
}
