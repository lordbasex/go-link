// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The spec level with a foreground (wm_data 29, model/front.ts): three lamp
// posts drawn in code (an iron pole, a lamp with a warm glow) standing on the
// bottom at different speeds, fitted to one palette as the editor does
// (editor/front.ts). Tests and the lab run rom/tools/lab/runs/front-walk.json
// use it (engine.c draw_front).

import { fitFront } from "../editor/front";
import type { KeyImage } from "../editor/picture";
import { encodeCells } from "../model/rle";
import { frontPaletteId, frontTilesetId, type FrontPiece, type Project } from "../model";
import type { Picture } from "./pack";
import { SPEC, specProject } from "./specFixture";

/** The posts: where they stand and how fast they pass. */
export const FRONT_POSTS = [
  { x: 320, speed: 150 },
  { x: 560, speed: 200 },
  { x: 760, speed: 120 },
] as const;
const POST = { w: 28, h: 160 };

/** A lamp post in board color keys (4 bits a channel): pole, lamp and glow. */
function post(): KeyImage {
  const k = (r: number, g: number, b: number) => (r << 8) | (g << 4) | b;
  const keys = new Int16Array(POST.w * POST.h).fill(-1);
  const set = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < POST.w && y < POST.h) keys[y * POST.w + x] = v;
  };
  // the glow, the lamp's cage and its light
  for (let y = 0; y < 30; y++) for (let x = 0; x < POST.w; x++) if ((x - 13.5) ** 2 + (y - 14) ** 2 < 13 ** 2) set(x, y, k(6, 3, 1));
  for (let y = 6; y < 24; y++) for (let x = 7; x < 21; x++) set(x, y, y < 8 || y > 21 || x < 9 || x > 18 ? k(2, 2, 3) : k(15, 13, 6));
  // the pole, lighter on its left edge, and its foot
  for (let y = 24; y < POST.h; y++) for (let x = 11; x < 17; x++) set(x, y, x === 11 ? k(5, 5, 7) : k(2, 2, 3));
  for (let y = POST.h - 12; y < POST.h; y++) for (let x = 6; x < 22; x++) set(x, y, k(2, 2, 3));
  return { w: POST.w, h: POST.h, keys };
}

/** The spec project with its foreground, and the front tileset's picture (what Create ROM decodes). */
export function frontProject(): { project: Project; picture: Picture } {
  const p = specProject();
  const level = p.levels[0]!;
  const fitted = fitFront(FRONT_POSTS.map(post));
  const palId = frontPaletteId(level.id);
  const tsId = frontTilesetId(level.id);
  p.palettes.push({ id: palId, group: "sprite", colors: fitted.fit.palettes[0]! });
  p.tilesets.push({ id: tsId, tile: 16, image: "sha256:front-posts", palettes: [palId], columns: fitted.fit.tileset.columns, count: fitted.fit.tileset.count });
  level.front = FRONT_POSTS.map((s, i): FrontPiece => {
    const f = fitted.pieces[i]!;
    return { id: `post-${i + 1}`, asset: "sha256:post", name: `post ${i + 1}`, x: s.x, y: SPEC.h - f.rows * 16, h: POST.h, speed: s.speed, cols: f.cols, rows: f.rows, cells: encodeCells(f.cells) };
  });
  return { project: p, picture: { w: fitted.fit.tileset.w, h: fitted.fit.tileset.h, rgba: fitted.fit.tileset.data } };
}
