// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A menu screen drawn at the board's 384 x 224: its background (a level's
// first screen, darkened, or one color), every text line in the board's
// font, and on request the safe area and the lines that do not fit.

import { FONT_CELL } from "@go-link/cps1";
import type { Project } from "../model";
import { drawLevel, type Palette, type TileImage } from "../ui/render";
import { TEXT_INKS, drawBoardText } from "./boardText";
import { SAFE, backgroundLevel, backgroundOf, lineProblems, screenLines, type MenuScreenId } from "./menus";

export const SCREEN_W = 384;
export const SCREEN_H = 224;

export interface PreviewOptions {
  palette: Palette;
  images: Map<string, TileImage>;
  showSafe: boolean;
}

export function drawMenuScreen(ctx: CanvasRenderingContext2D, project: Project, screen: MenuScreenId, o: PreviewOptions): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const bg = backgroundOf(project, screen);
  ctx.fillStyle = bg.kind === "solid" ? bg.color : o.palette.bg;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  const level = backgroundLevel(project, bg);
  if (level) {
    const hasArt = level.layers.some((l) => l.kind === "tiles" && l.id !== "text" && l.visible !== false && o.images.has(l.tileset ?? ""));
    const layers = level.layers.filter((l) => (l.kind === "tiles" && l.id !== "text") || (!hasArt && l.kind === "tags"));
    drawLevel(ctx, { ...level, layers, sections: [] }, {
      view: { x: 0, y: Math.max(0, level.size.h - SCREEN_H), zoom: 1, w: SCREEN_W, h: SCREEN_H },
      dpr: 1,
      palette: { ...o.palette, dangerBg: o.palette.bg },
      images: o.images,
      showGrid: false,
      showScreen: false,
      reach: null,
      selected: null,
      hover: null,
      label: () => "",
      ledgeText: () => "",
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // the HUD is drawn over the game as it plays; menus over a darkened level
    if (screen !== "hud") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
  }
  for (const line of screenLines(project, screen)) {
    const x = line.col * FONT_CELL;
    const y = line.row * FONT_CELL;
    drawBoardText(ctx, line.text, x, y, line.scale, TEXT_INKS[line.ink]);
    if (o.showSafe && lineProblems(line).length) {
      ctx.strokeStyle = o.palette.danger;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 1.5, y - 1.5, line.text.length * FONT_CELL * line.scale + 3, FONT_CELL * line.scale + 3);
    }
  }
  if (o.showSafe) {
    ctx.strokeStyle = o.palette.screen;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(SAFE.col0 * FONT_CELL + 0.5, SAFE.row0 * FONT_CELL + 0.5, (SAFE.col1 - SAFE.col0) * FONT_CELL - 1, (SAFE.row1 - SAFE.row0) * FONT_CELL - 1);
    ctx.setLineDash([]);
  }
}
