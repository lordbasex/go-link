// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Draws a `Game` the way the board shows it: a 384×224 window on the level
// (scaled by a whole number, never smoothed), the collision cells as
// placeholder tiles until the project has its own art, the characters from
// their sheets, the HUD, and the debug overlays play mode can switch on.

import { BODY_H, CELL, SCREEN_H, SCREEN_W, Tag, YAWN_AFTER, type Game } from "../engine";
import { BOSS_HUD_STEP } from "../engine/rules";
import { GEM_BODY, GEM_SHADE, SHIP_H, SHIP_W, dronePen, gemPen, powerPen, shipPen } from "../engine/shipArt";
import { CLEAR_FRAMES, FLY_MID, MASH_TIME, MEM_INPUT, MEM_LEN, MEM_LETTER, MEM_LIT, QUIZ_TIME, TIMING_STEP, TIMING_TIME, TIMING_W, WELL_COLS, WELL_ROWS, WELL_X, WELL_Y } from "../engine/rules";
import { BAR_COL, BAR_ROW, LETTERS, MEM_COL, MEM_ROW, PLAYERS_ROW, PLAYER_COLS, TIME_ROW, kindOf, memorySeq, quizLines, timingCell } from "../engine/quiz";
import { bandX } from "../model/parallax";
import { DOOR_H, DOOR_W, doorAt, doorParts } from "../engine/door";
import { HEIGHTS, drawFrame, frameOf, heroAnim, type PlaySprites, type Sheet } from "./sprites";
import { TEXT_INKS, boardTextWidth, drawBoardText } from "../game/boardText";

export interface Overlays {
  collision: boolean;
  hitboxes: boolean;
  camera: boolean;
  fps: boolean;
}

/** A piece being placed while playing, in world pixels. */
export interface Ghost {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

/** Colors the overlays take from the site's tokens (game art has its own). */
export interface OverlayColors {
  players: string[];
  accent: string;
  camera: string;
  text: string;
  font: string;
}

export const DEFAULT_COLORS: OverlayColors = {
  players: ["#f2a33a", "#7ee2a8", "#4fc3d9", "#e0627a"],
  accent: "#f2a33a",
  camera: "#9d8cf0",
  text: "#e9ecf2",
  font: "monospace",
};

// Placeholder art (the prototype street's palette, rom/tools/level.mjs).
const ART = {
  skyTop: "#1e1a32",
  skyBottom: "#4a3354",
  skyline: "#2a2440",
  skylineLit: "#f2be5a",
  wall: "#342c52",
  wallDark: "#1e1a32",
  window: "#4fc3d9",
  windowWarm: "#f2be5a",
  ground: "#28243a",
  groundTop: "#605a78",
  curb: "#f2a33a",
  plank: "#a0602c",
  plankLight: "#d69650",
  metal: "#6e788e",
  metalLight: "#bec8d7",
  crate: "#a0602c",
  crateDark: "#64381c",
  crateLight: "#d69650",
  brick: "#7a3a4a",
  hazard: "#e0627a",
  water: "#2d6e9c",
  shot: "#ffe07a",
  enemyShot: "#ff7a9a",
  rocket: "#bec8d7",
  pickup: "#7ee2a8",
  doorFrame: "#bec8d7",
  doorInside: "#14111f",
  doorLamp: "#7ee2a8",
};

const TAG_OUTLINE: Record<number, string> = {
  [Tag.Solid]: "#e9ecf2",
  [Tag.Oneway]: "#4fc3d9",
  [Tag.Ladder]: "#7ee2a8",
  [Tag.Crate]: "#f2a33a",
  [Tag.Breakable]: "#f27a3a",
  [Tag.Hazard]: "#e0627a",
  [Tag.Water]: "#5aa0f2",
};

export interface DrawOptions {
  scale: number;
  overlays: Overlays;
  colors?: OverlayColors;
  ghost?: Ghost | null;
  fps?: number;
  /** HUD words: the game's own (Menus tab) or the translated defaults. */
  words: { start: string; cleared: string; over: string; ammo: string; reload?: string; overLine?: string; enemies?: string; exitClosed?: string; rescued?: string; coins?: string };
  /** Each player's shirt (0 = Willy's own colors, 1-3 a recruit's); by player number when missing. */
  variants?: number[];
  /** Each player's own hero, drawn at its saved size; null or missing = the built-in Willy. */
  ownHeroes?: (Sheet | null)[];
  /** The pickups' own pictures by character id (their idle animation). */
  pickupLooks?: Record<string, Sheet | null>;
  /** The level's own art (T-28): its far and play tile layers, drawn as the board does (the far one at half speed). */
  art?: ArtLayer[];
}

/** A tile layer play mode draws: its cells and its tileset picture. */
export interface ArtLayer {
  layer: "far" | "play";
  tile: number;
  cols: number;
  rows: number;
  cells: ArrayLike<number>;
  image: CanvasImageSource;
  columns: number;
}

/** Draws a tile layer's visible cells, the layer scrolled to (ox, oy); `skip` leaves a cell out; `rows` limits it to rows [from, to). */
function drawArt(ctx: CanvasRenderingContext2D, a: ArtLayer, ox: number, oy: number, skip?: (c: number, r: number) => boolean, rows?: [number, number]): void {
  const c0 = Math.max(0, Math.floor(ox / a.tile));
  const c1 = Math.min(a.cols - 1, Math.floor((ox + SCREEN_W) / a.tile));
  const r0 = Math.max(rows ? rows[0] : 0, Math.floor(oy / a.tile));
  const r1 = Math.min(a.rows - 1, rows ? rows[1] - 1 : a.rows - 1, Math.floor((oy + SCREEN_H) / a.tile));
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const n = a.cells[r * a.cols + c] ?? 0;
      if (!n || skip?.(c, r)) continue;
      const sx = ((n - 1) % a.columns) * a.tile;
      const sy = Math.floor((n - 1) / a.columns) * a.tile;
      ctx.drawImage(a.image, sx, sy, a.tile, a.tile, c * a.tile - ox, r * a.tile - oy, a.tile, a.tile);
    }
}

export function drawGame(ctx: CanvasRenderingContext2D, game: Game, sprites: PlaySprites | null, o: DrawOptions): void {
  const colors = o.colors ?? DEFAULT_COLORS;
  const s = o.scale;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const cx = game.camX;
  const cy = game.camY;

  const far = o.art?.find((a) => a.layer === "far");
  const play = o.art?.find((a) => a.layer === "play");
  if (far) {
    ctx.fillStyle = ART.skyTop;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawArt(ctx, far, Math.trunc(cx / 2), Math.trunc(cy / 2));
  } else drawBackdrop(ctx, game);
  if (play) {
    // a crate or breakable wall shot away takes its art with it, as on the board
    const gone = (c: number, r: number) => {
      const was = Number(game.level.tags[r * game.cols + c] ?? 0);
      return (was === Tag.Crate || was === Tag.Breakable) && game.cell(c, r) === Tag.Air;
    };
    // parallax bands (T-26): their rows at their own speed, as the board's row scroll draws them
    const bands = game.level.bands ?? [];
    const inBand = (r: number) => bands.some((b) => r >= b.r0 && r < b.r1);
    drawArt(ctx, play, cx, cy, (c, r) => inBand(r) || gone(c, r));
    for (const b of bands) drawArt(ctx, play, bandX(cx, b.speed), cy, undefined, [b.r0, b.r1]);
  }
  ctx.save();
  ctx.translate(-cx, -cy);
  if (!far) for (const b of game.level.scenery ?? []) drawBuilding(ctx, b.x, b.y, b.w, b.h);
  drawCells(ctx, game, play);
  drawExits(ctx, game);
  if (game.rules.quiz) {
    // the quiz is all text, drawn over the HUD below
  } else if (game.rules.puzzle) drawWells(ctx, game);
  else drawObjects(ctx, game, sprites, o.variants, o.ownHeroes, o.pickupLooks);
  if (o.overlays.collision) drawCollision(ctx, game);
  if (o.overlays.hitboxes) drawHitboxes(ctx, game, colors);
  if (o.ghost) {
    ctx.fillStyle = colors.accent;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(o.ghost.x, o.ghost.y, o.ghost.w, o.ghost.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 1;
    ctx.strokeRect(o.ghost.x + 0.5, o.ghost.y + 0.5, o.ghost.w - 1, o.ghost.h - 1);
  }
  ctx.restore();
  if (o.overlays.camera) drawCamera(ctx, game, colors);
  drawHud(ctx, game, colors, o);
  if (game.rules.crosshair) drawCrosshairs(ctx, game);
  if (game.rules.quiz) drawQuiz(ctx, game);
}

/**
 * The quiz's screen (engine/quiz.ts), as the ROM prints it on its text
 * layer: the question and its answers, the seconds left and who answered;
 * when the answer shows, the right one in cyan and each player's letter,
 * cyan if right, red if not.
 */
function drawQuiz(ctx: CanvasRenderingContext2D, game: Game): void {
  const q = game.questions[game.quizK];
  if (!q) return;
  const at = (col: number, row: number, text: string, ink: string) => drawBoardText(ctx, text, col * 8, row * 8, 1, ink);
  const kind = kindOf(q);
  const show = MEM_LEN * MEM_LETTER;
  for (const l of quizLines(q)) at(l.col, l.row, l.text, kind === "question" && game.quizPhase === 1 && l.answer === q.right ? TEXT_INKS.cyan : TEXT_INKS.white);
  const time = kind === "mash" ? MASH_TIME : kind === "timing" ? TIMING_TIME : kind === "memory" ? show + MEM_INPUT : QUIZ_TIME;
  if (game.quizPhase === 0) at(21, TIME_ROW, `TIME ${String(Math.max(0, Math.ceil((time - game.quizT) / 60))).padStart(2, "0")}`, TEXT_INKS.white);
  if (kind === "timing") {
    // the bar, its middle, and the marker while it runs
    const cells: string[] = Array.from({ length: TIMING_W }, (_, i) => (i === TIMING_W / 2 - 1 || i === TIMING_W / 2 ? "+" : "-"));
    if (game.quizPhase === 0) cells[timingCell(game.quizT, TIMING_W, TIMING_STEP)] = "#";
    at(BAR_COL, BAR_ROW, cells.join(""), TEXT_INKS.white);
  }
  if (kind === "memory" && game.quizPhase === 0) {
    if (game.quizT < show) {
      if (game.quizT % MEM_LETTER < MEM_LIT) at(MEM_COL, MEM_ROW, LETTERS[memorySeq(game.quizK, MEM_LEN)[Math.floor(game.quizT / MEM_LETTER)]!]!, TEXT_INKS.cyan);
    } else at(MEM_COL - 2, MEM_ROW, "GO!", TEXT_INKS.accent);
  }
  for (const p of game.players) {
    if (!p.active || p.index >= PLAYER_COLS.length) continue;
    const col = PLAYER_COLS[p.index]!;
    const tag = `${p.index + 1}P`;
    if (kind === "question") {
      if (game.quizPhase === 0) at(col, PLAYERS_ROW, tag, p.answer >= 0 ? TEXT_INKS.cyan : TEXT_INKS.white);
      else at(col, PLAYERS_ROW, `${tag} ${p.answer >= 0 ? LETTERS[p.answer] : "-"}`, p.answer === q.right ? TEXT_INKS.cyan : TEXT_INKS.red);
    } else if (game.quizPhase === 0) at(col, PLAYERS_ROW, kind === "timing" ? tag : `${tag} ${p.count}`, p.done ? TEXT_INKS.cyan : TEXT_INKS.white);
    else at(col, PLAYERS_ROW, kind === "mash" ? `${tag} ${p.count}` : kind === "memory" ? `${tag} ${p.count}` : `${tag} ${p.done ? p.answer : "-"}`, TEXT_INKS.cyan);
  }
}

/**
 * The puzzle's wells (engine/puzzle.ts): the gems in them, the ones a match
 * clears flashing white, the falling trio, and the next one beside the well
 * (rom/tools/art.mjs TILE_GEM, the ROM draws them as sprites).
 */
function drawWells(ctx: CanvasRenderingContext2D, game: Game): void {
  const gem = (x: number, y: number, v: number, flash = false) =>
    drawPens(ctx, x, y, 16, 16, gemPen, flash ? ["", "#ffffff", "#ffffff", "#000000", "#ccccdd"] : ["", GEM_BODY[v - 1]!, "#ffffff", "#000000", GEM_SHADE[v - 1]!]);
  for (const p of game.players) {
    const w = p.well;
    if (!p.active || !w) continue;
    const x0 = WELL_X[p.index]!;
    const flash = w.clearT > 0 && ((CLEAR_FRAMES - w.clearT) >> 2) & 1;
    for (let r = 0; r < WELL_ROWS; r++)
      for (let c = 0; c < WELL_COLS; c++) {
        const v = w.cells[r * WELL_COLS + c]!;
        if (v) gem(x0 + c * 16, WELL_Y + r * 16, v, w.marks[r * WELL_COLS + c] !== 0 && flash === 1);
      }
    if (!w.clearT) for (let k = 0; k < 3; k++) if (w.row - 2 + k >= 0) gem(x0 + w.col * 16, WELL_Y + (w.row - 2 + k) * 16, w.piece[k]!);
    for (let k = 0; k < 3; k++) gem(x0 + WELL_COLS * 16 + 16, WELL_Y + k * 16, w.next[k]!);
  }
}

/** The light gun's crosshairs, in each player's color, and a flash where a shot lands (rom/tools/art.mjs TILE_CROSS). */
function drawCrosshairs(ctx: CanvasRenderingContext2D, game: Game): void {
  for (const p of game.players) {
    if (!p.active) continue;
    if (p.invulnerable && (p.invulnerable >> 2) & 1) continue;
    const x = p.cx;
    const y = p.cy;
    if (p.shotT) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 4, y, 9, 1);
      ctx.fillRect(x, y - 4, 1, 9);
      ctx.fillStyle = "#ffcc22";
      ctx.fillRect(x - 2, y - 2, 5, 5);
    }
    // the ring with four gaps and a dot in the middle, over a dark outline
    for (const [color, grow] of [["#000000", 1], [CROSS_COLORS[p.index] ?? "#ffffff", 0]] as const) {
      ctx.fillStyle = color;
      ctx.fillRect(x - 6 - grow, y - 1 - grow, 4 + grow, 3 + 2 * grow);
      ctx.fillRect(x + 3, y - 1 - grow, 4 + grow, 3 + 2 * grow);
      ctx.fillRect(x - 1 - grow, y - 6 - grow, 3 + 2 * grow, 4 + grow);
      ctx.fillRect(x - 1 - grow, y + 3, 3 + 2 * grow, 4 + grow);
    }
    ctx.fillRect(x, y, 1, 1);
  }
}

/** The crosshairs' colors, the ROM's PAL_CROSS. */
const CROSS_COLORS = ["#ffaa33", "#77eeaa", "#44ccdd", "#ee6677"];

function drawBackdrop(ctx: CanvasRenderingContext2D, game: Game): void {
  const g = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
  g.addColorStop(0, ART.skyTop);
  g.addColorStop(1, ART.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  // a far skyline at half speed (scroll3 on the board)
  const off = Math.floor(game.camX / 2);
  const base = SCREEN_H - 40 - Math.floor(game.camY / 4);
  for (let i = Math.floor(off / 48) - 1; i < Math.floor(off / 48) + 10; i++) {
    const h = 40 + ((i * 37) & 63);
    const x = i * 48 - off;
    ctx.fillStyle = ART.skyline;
    ctx.fillRect(x, base - h, 40, h + 60);
    ctx.fillStyle = ART.skylineLit;
    for (let k = 0; k < 4; k++) if (((i + k) * 7) % 3 === 0) ctx.fillRect(x + 6 + k * 8, base - h + 10 + ((i * k) % 4) * 10, 3, 4);
  }
}

function drawBuilding(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = ART.wall;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = ART.wallDark;
  ctx.fillRect(x, y, w, 4);
  for (let wy = y + 16; wy < y + h - 16; wy += 32)
    for (let wx = x + 12; wx < x + w - 12; wx += 28) {
      ctx.fillStyle = ((wx + wy) / 4) % 3 === 0 ? ART.windowWarm : ART.window;
      ctx.fillRect(wx, wy, 12, 16);
    }
}

function drawCells(ctx: CanvasRenderingContext2D, game: Game, art?: ArtLayer): void {
  const c0 = Math.max(0, Math.floor(game.camX / CELL));
  const c1 = Math.min(game.cols - 1, Math.floor((game.camX + SCREEN_W) / CELL));
  const r0 = Math.max(0, Math.floor(game.camY / CELL));
  const r1 = Math.min(game.rows - 1, Math.floor((game.camY + SCREEN_H) / CELL));
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const t = game.cell(c, r);
      if (t === Tag.Air) continue;
      // the level's own art draws this cell
      if (art && (art.cells[r * art.cols + c] ?? 0)) continue;
      const x = c * CELL;
      const y = r * CELL;
      const above = game.cell(c, r - 1);
      switch (t) {
        case Tag.Solid:
          ctx.fillStyle = ART.ground;
          ctx.fillRect(x, y, CELL, CELL);
          if (above !== Tag.Solid) {
            ctx.fillStyle = ART.groundTop;
            ctx.fillRect(x, y, CELL, 4);
            ctx.fillStyle = ART.curb;
            ctx.fillRect(x, y + 4, CELL, 1);
          }
          break;
        case Tag.Oneway:
          ctx.fillStyle = ART.metal;
          ctx.fillRect(x, y, CELL, 3);
          ctx.fillStyle = ART.metalLight;
          ctx.fillRect(x, y, CELL, 1);
          ctx.fillStyle = ART.metal;
          ctx.fillRect(x + 2, y + 3, 1, 6);
          ctx.fillRect(x + 13, y + 3, 1, 6);
          break;
        case Tag.Ladder:
          ctx.fillStyle = ART.metalLight;
          ctx.fillRect(x + 3, y, 2, CELL);
          ctx.fillRect(x + 11, y, 2, CELL);
          ctx.fillStyle = ART.metal;
          for (let k = 2; k < CELL; k += 5) ctx.fillRect(x + 3, y + k, 10, 2);
          break;
        case Tag.Crate:
          drawCrateCell(ctx, game, c, r);
          break;
        case Tag.Breakable:
          ctx.fillStyle = ART.brick;
          ctx.fillRect(x, y, CELL, CELL);
          ctx.fillStyle = ART.wallDark;
          ctx.fillRect(x, y + 7, CELL, 1);
          ctx.fillRect(x + ((r & 1) ? 4 : 11), y, 1, 7);
          ctx.fillRect(x + ((r & 1) ? 11 : 4), y + 8, 1, 8);
          break;
        case Tag.Hazard:
          ctx.fillStyle = ART.hazard;
          for (let k = 0; k < 4; k++) {
            ctx.beginPath();
            ctx.moveTo(x + k * 4, y + CELL);
            ctx.lineTo(x + k * 4 + 2, y + 6);
            ctx.lineTo(x + k * 4 + 4, y + CELL);
            ctx.fill();
          }
          break;
        case Tag.Water:
          ctx.fillStyle = ART.water;
          ctx.globalAlpha = 0.75;
          ctx.fillRect(x, y + (above === Tag.Water ? 0 : 4), CELL, CELL);
          ctx.globalAlpha = 1;
          break;
      }
    }
}

function drawCrateCell(ctx: CanvasRenderingContext2D, game: Game, c: number, r: number): void {
  const x = c * CELL;
  const y = r * CELL;
  ctx.fillStyle = ART.crate;
  ctx.fillRect(x, y, CELL, CELL);
  ctx.fillStyle = ART.crateDark;
  if (game.cell(c - 1, r) !== Tag.Crate) ctx.fillRect(x, y, 2, CELL);
  if (game.cell(c + 1, r) !== Tag.Crate) ctx.fillRect(x + CELL - 2, y, 2, CELL);
  if (game.cell(c, r - 1) !== Tag.Crate) {
    ctx.fillStyle = ART.crateLight;
    ctx.fillRect(x, y, CELL, 2);
  }
  if (game.cell(c, r + 1) !== Tag.Crate) {
    ctx.fillStyle = ART.crateDark;
    ctx.fillRect(x, y + CELL - 2, CELL, 2);
  }
  ctx.fillStyle = ART.crateDark;
  ctx.fillRect(x, y + 7, CELL, 2);
}

/** Each exit's door (engine/door.ts), the same picture the ROM draws, only over empty cells. */
function drawExits(ctx: CanvasRenderingContext2D, game: Game): void {
  const parts = doorParts();
  const ink = [null, ART.doorFrame, ART.doorInside, ART.doorLamp, ART.doorFrame];
  for (const x of game.exits) {
    const at = doorAt(x);
    for (let y = 0; y < DOOR_H; y++)
      for (let k = 0; k < DOOR_W; k++) {
        const v = parts[y]![k]!;
        if (!v || game.cellAt(at.x + k, at.y + y) !== Tag.Air) continue;
        ctx.fillStyle = ink[v]!;
        ctx.fillRect(at.x + k, at.y + y, 1, 1);
      }
  }
}

/** The moving platforms, as the ROM draws them: a steel girder 8 px tall with a bolt every 16 px; a falling one rusty and cracked, shaking before it falls. */
function drawPlatforms(ctx: CanvasRenderingContext2D, game: Game): void {
  for (const pl of game.platforms) {
    if (pl.state === "gone") continue;
    const x0 = pl.x + (pl.state === "shake" ? (pl.t & 2 ? 1 : -1) : 0);
    ctx.fillStyle = pl.falls ? "#884433" : "#3a4a66";
    ctx.fillRect(x0, pl.y, pl.w, 8);
    ctx.fillStyle = pl.falls ? "#cc8855" : "#8fb3e8";
    ctx.fillRect(x0, pl.y, pl.w, 2);
    ctx.fillStyle = "#1c2433";
    ctx.fillRect(x0, pl.y + 7, pl.w, 1);
    ctx.fillRect(x0, pl.y, 1, 8);
    ctx.fillRect(x0 + pl.w - 1, pl.y, 1, 8);
    ctx.fillStyle = pl.falls ? "#331111" : "#d8e6ff";
    if (pl.falls) for (let x = x0 + 5; x < x0 + pl.w; x += 16) ctx.fillRect(x, pl.y + 2, 1, 5);
    else for (let x = x0 + 7; x < x0 + pl.w; x += 16) ctx.fillRect(x, pl.y + 4, 2, 2);
  }
}

function drawObjects(ctx: CanvasRenderingContext2D, game: Game, sprites: PlaySprites | null, variants?: number[], ownHeroes?: (Sheet | null)[], pickupLooks?: Record<string, Sheet | null>): void {
  const f = game.frame;
  drawPlatforms(ctx, game);
  // the maze's dots, one at each cell's middle (the ROM prints them on its text layer)
  if (game.rules.maze) {
    ctx.fillStyle = "#ffcc88";
    for (let i = 0; i < game.dots.length; i++) if (game.dots[i]) ctx.fillRect((i % game.cols) * 16 + 7, Math.floor(i / game.cols) * 16 + 7, 2, 2);
  }
  for (const k of game.pickups) {
    if (!k.live) continue;
    const own = k.look ? pickupLooks?.[k.look] : undefined;
    if (own) {
      // the game's own picture, at board scale, standing on the pickup's place (as the ROM draws it)
      const anim = own.anims.idle ? "idle" : (Object.keys(own.anims)[0] ?? "idle");
      const ref = own.frames[own.anims[anim]?.frames[0] ?? ""];
      sheetDraw(ctx, own, anim, anim, f, k.x, k.fy, ref?.py ?? 16, false, 1);
      continue;
    }
    if (k.item === "coin") {
      // the platformer's coin, as the ROM draws it (gold, bobbing a pixel)
      const y = k.fy - 8 - ((f >> 3) & 1);
      ctx.fillStyle = "#b86010";
      ctx.beginPath();
      ctx.ellipse(k.x, y, 5.5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffcc22";
      ctx.beginPath();
      ctx.ellipse(k.x, y, 4.2, 5.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7a3300";
      ctx.fillRect(k.x - 1, y - 4, 2, 8);
      continue;
    }
    if (k.item === "power") {
      // the shooter's power-up (engine/shipArt.ts), as the ROM draws it
      drawPens(ctx, k.x - 8, k.fy - 16, 16, 16, powerPen, ["", "#44ccdd", "#ffffff", "#000000"]);
      continue;
    }
    if (k.item === "knife") {
      // the beat 'em up's knife, as the ROM draws it: a brown handle and a steel blade
      drawKnife(ctx, k.x, k.fy - 3, 1);
      continue;
    }
    if (k.item === "pipe") {
      // the beat 'em up's pipe, as the ROM draws it: a steel bar lying on the floor
      ctx.fillStyle = "#555555";
      ctx.fillRect(k.x - 7, k.fy - 4, 14, 3);
      ctx.fillStyle = "#aaaaaa";
      ctx.fillRect(k.x - 7, k.fy - 4, 14, 1);
      continue;
    }
    if (k.item === "spring") {
      ctx.fillStyle = "#555555";
      ctx.fillRect(k.x - 7, k.fy - 3, 14, 3);
      ctx.strokeStyle = "#aaaaaa";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) ctx.lineTo(k.x + (i % 2 ? 5 : -5), k.fy - 3 - i * 2.5);
      ctx.stroke();
      ctx.fillStyle = "#ee4444";
      ctx.fillRect(k.x - 7, k.fy - 16, 14, 3);
      continue;
    }
    const bob = Math.round(Math.sin(f / 8) * 2);
    ctx.fillStyle = ART.pickup;
    ctx.fillRect(k.x - 9, k.fy - 12 + bob, 18, 8);
    ctx.fillStyle = ART.wallDark;
    ctx.fillRect(k.x - 9, k.fy - 9 + bob, 18, 2);
  }
  // the actors, each with its depth: drawn in this order, or back to front
  // in a beat 'em up (the depth rule), so the one nearer the screen is in front
  const actors: { fy: number; draw: () => void }[] = [];
  const civ = sprites?.civilians;
  for (const v of game.civilians) actors.push({ fy: v.fy, draw: () => {
    if (v.rescued && v.t > 120) return;
    const kind = ["woman", "child", "baby", "elder"].includes(v.kind) ? v.kind : "woman";
    const anim = v.rescued ? `${kind}_happy` : v.trappedIn ? `${kind}_worried` : `${kind}_idle`;
    const h = HEIGHTS[kind as keyof typeof HEIGHTS];
    if (civ && civ.anims[anim]) sheetDraw(ctx, civ, anim, `${kind}_idle`, v.t, v.x, v.fy, h, false, v.rescued ? 1 - v.t / 120 : 1);
    else box(ctx, v.x, v.fy, 14, h, ART.windowWarm);
  } });
  for (const e of game.enemies) actors.push({ fy: e.fy, draw: () => {
    if (e.state === "off" || e.state === "hidden") return;
    // the shooter's enemies are drones (engine/shipArt.ts); a downed one blinks out
    if (game.rules.ship) {
      if (e.state === "down" && (e.t > 30 || (e.t >> 2) & 1)) return;
      // the gunship is the drone at twice the size, in its own colors
      if (e.path === 3) drawPens(ctx, e.x - SHIP_W, e.fy - FLY_MID - SHIP_H, SHIP_W, SHIP_H, dronePen, ["", "#ee6677", "#ffcc22", "#000000", "#ffffff"], 2);
      else drawPens(ctx, e.x - (SHIP_W >> 1), e.fy - FLY_MID - (SHIP_H >> 1), SHIP_W, SHIP_H, dronePen, ["", "#ee6677", "#ffffff", "#000000", "#ffcc22"]);
      return;
    }
    const en = e.boss ? (sprites?.boss ?? sprites?.enemy) : sprites?.enemy;
    const anim = e.state === "down" || e.state === "fall" ? "defeated" : e.state === "hit" || e.state === "held" ? "hit" : e.state === "attack" || e.fireWait > 80 ? "shoot" : "walk";
    // the maze: an eaten chaser is gone until it is home again; a fleeing one is faint, blinking at the end
    if (game.rules.maze && e.state === "down") return;
    const fleeing = game.rules.maze && game.frightT > 0 ? (game.frightT < 90 && (game.frightT >> 3) & 1 ? 1 : 0.45) : 1;
    const blink = e.state === "down" && e.t > 60 && (e.t >> 2) & 1 ? 0.3 : fleeing;
    if (en) sheetDraw(ctx, en, anim, "idle", e.state === "walk" ? e.t : e.t, e.x, e.fy, HEIGHTS.enemy, e.flip, blink);
    else box(ctx, e.x, e.fy, 18, HEIGHTS.enemy, ART.hazard);
  } });
  for (const p of game.players) actors.push({ fy: p.y >> 4, draw: () => {
    // the light gun's players are their crosshairs (drawCrosshairs)
    if (!p.active || game.rules.crosshair) return;
    // the shooter's players are their ships, with their shots
    if (game.rules.ship) {
      ctx.fillStyle = ART.shot;
      for (const b of p.shots) ctx.fillRect(b.x - 3, b.y, 6, 2);
      if (!(p.invulnerable && (p.invulnerable >> 2) & 1)) {
        // the vertical shooter's ship points up (the shape turned a quarter, the ROM's TILE_SHIPUP)
        if (game.rules.vertical) drawPens(ctx, game.camX + p.cx - (SHIP_H >> 1), game.camY + p.cy - (SHIP_W >> 1), SHIP_H, SHIP_W, (px, py) => shipPen(SHIP_W - 1 - py, px), ["", CROSS_COLORS[p.index] ?? "#ffffff", "#ffffff", "#000000", "#ffcc22"]);
        else drawShip(ctx, game.camX + p.cx - (SHIP_W >> 1), game.camY + p.cy - (SHIP_H >> 1), p.index);
      }
      return;
    }
    if (p.invulnerable && (p.invulnerable >> 2) & 1) return;
    const sheet = sprites?.heroes[variants?.[p.index] ?? p.index] ?? sprites?.heroes[0];
    // a beat 'em up's hop: drawn over its shadow on the floor
    if (p.hop < 0) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y >> 4, 10, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const fy = (p.y >> 4) + (p.hop >> 4);
    const moving = (p.pad & 3) !== 0;
    let anim = "idle";
    let t = p.t;
    // the moves of docs/willy-maker/moves.md, most specific first
    if (p.climbing) {
      anim = "jump";
      t = (p.y >> 7) & 1 ? 12 : 6;
    } else if (!p.onGround) {
      if (p.kickT) {
        anim = "jump_kick";
        t = 20 - p.kickT;
      } else if (p.jetting) anim = "jetpack";
      else if (p.airJumps && p.vy < 0) {
        anim = "double_jump";
        t = p.vy < -60 ? 6 : 12;
      } else {
        anim = "jump";
        t = p.vy < -60 ? 6 : p.vy < 0 ? 12 : p.vy < 60 ? 18 : 24;
      }
    } else if (p.grabbed) {
      // holding an enemy: the guard pose
      anim = "knife";
      t = 0;
    } else if (p.punchT) {
      // the beat 'em up's punches, and the combo's kick
      anim = p.combo === 3 ? "jump_kick" : "punch";
      t = (p.combo === 3 ? 20 : 16) - p.punchT;
    } else if (p.crouching) anim = moving ? "crawl" : "crouch";
    else if (p.knifeT) {
      anim = "knife";
      t = 16 - p.knifeT;
    } else if (p.bazookaT) anim = "bazooka";
    else if (p.firing) anim = "machine_gun";
    else if (p.landT) anim = "land";
    else if (p.turnT && moving) anim = "turn";
    else if (moving) {
      anim = "run";
      t = p.running ? p.t : p.t / 2;
    } else if (game.outcome === "cleared") anim = "victory";
    else if (p.thumbsT) anim = "thumbs_up";
    else if (p.idleT >= YAWN_AFTER) anim = "yawn";
    const own = ownHeroes?.[p.index];
    if (own) {
      // an own hero is saved at board scale: its idle frame's feet give its height
      const ref = own.frames[own.anims.idle?.frames[0] ?? ""];
      sheetDraw(ctx, own, heroAnim(own, anim), "idle", t, p.x, fy, ref?.py ?? HEIGHTS.hero, p.flip, 1);
    } else if (sheet) sheetDraw(ctx, sheet, heroAnim(sheet, anim), "idle", t, p.x, fy, HEIGHTS.hero, p.flip, 1);
    else box(ctx, p.x, fy, 14, HEIGHTS.hero, DEFAULT_COLORS.players[p.index] ?? ART.window);
    ctx.fillStyle = ART.shot;
    for (const b of p.shots) ctx.fillRect(b.x - 3, b.y, 6, 2);
    // the top-down grenade in flight and its burst (the ROM draws them with its own tiles)
    if (p.grenade) {
      ctx.fillStyle = "#335533";
      ctx.fillRect(p.grenade.x - 2, p.grenade.y - 2, 5, 5);
    }
    if (p.boom) {
      const r = 6 + (12 - p.boom.t) * 2;
      ctx.fillStyle = (p.boom.t >> 1) & 1 ? "#ffcc22" : "#ff6633";
      ctx.beginPath();
      ctx.arc(p.boom.x, p.boom.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p.blade) drawKnife(ctx, p.blade.x, (p.blade.fy) - 24, p.blade.dir);
    if (p.rocket) {
      ctx.fillStyle = ART.rocket;
      ctx.fillRect(p.rocket.x + 4, p.rocket.y + 6, 24, 5);
      ctx.fillStyle = ART.hazard;
      ctx.fillRect(p.rocket.dir > 0 ? p.rocket.x + 28 : p.rocket.x, p.rocket.y + 6, 4, 5);
    }
  } });
  if (game.walkBand) actors.sort((a, b) => a.fy - b.fy);
  for (const a of actors) a.draw();
  ctx.fillStyle = ART.enemyShot;
  for (const s of game.enemyShots) ctx.fillRect(s.x - 2, s.y - 1, 4, 3);
}

function sheetDraw(ctx: CanvasRenderingContext2D, sheet: Sheet, anim: string, refAnim: string, t: number, x: number, y: number, h: number, flip: boolean, alpha: number): void {
  const f = frameOf(sheet, anim, t);
  const refName = sheet.anims[refAnim]?.frames[0];
  if (f) drawFrame(ctx, sheet, f, refName ? sheet.frames[refName] : undefined, x, y, h, flip, alpha);
}

function box(ctx: CanvasRenderingContext2D, x: number, fy: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, fy - h, w, h);
}

function drawCollision(ctx: CanvasRenderingContext2D, game: Game): void {
  const c0 = Math.max(0, Math.floor(game.camX / CELL));
  const c1 = Math.min(game.cols - 1, Math.floor((game.camX + SCREEN_W) / CELL));
  const r0 = Math.max(0, Math.floor(game.camY / CELL));
  const r1 = Math.min(game.rows - 1, Math.floor((game.camY + SCREEN_H) / CELL));
  ctx.lineWidth = 1;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const t = game.cell(c, r);
      const color = TAG_OUTLINE[t];
      if (!color) continue;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.8;
      if (t === Tag.Solid) {
        // only the faces players touch: a solid block reads as its outline
        const x = c * CELL;
        const y = r * CELL;
        ctx.beginPath();
        if (game.cell(c, r - 1) !== Tag.Solid) (ctx.moveTo(x, y + 0.5), ctx.lineTo(x + CELL, y + 0.5));
        if (game.cell(c - 1, r) !== Tag.Solid) (ctx.moveTo(x + 0.5, y), ctx.lineTo(x + 0.5, y + CELL));
        if (game.cell(c + 1, r) !== Tag.Solid) (ctx.moveTo(x + CELL - 0.5, y), ctx.lineTo(x + CELL - 0.5, y + CELL));
        if (game.cell(c, r + 1) !== Tag.Solid) (ctx.moveTo(x, y + CELL - 0.5), ctx.lineTo(x + CELL, y + CELL - 0.5));
        ctx.stroke();
      } else if (t === Tag.Oneway) {
        ctx.beginPath();
        ctx.moveTo(c * CELL, r * CELL + 0.5);
        ctx.lineTo(c * CELL + CELL, r * CELL + 0.5);
        ctx.stroke();
      } else ctx.strokeRect(c * CELL + 0.5, r * CELL + 0.5, CELL - 1, CELL - 1);
    }
  ctx.globalAlpha = 1;
}

function drawHitboxes(ctx: CanvasRenderingContext2D, game: Game, colors: OverlayColors): void {
  ctx.lineWidth = 1;
  for (const p of game.players) {
    if (!p.active) continue;
    const fy = p.y >> 4;
    ctx.strokeStyle = colors.players[p.index] ?? colors.text;
    ctx.strokeRect(p.x - 8 + 0.5, fy - BODY_H + 0.5, 15, BODY_H - 1);
  }
  ctx.strokeStyle = colors.players[3] ?? colors.accent;
  for (const e of game.enemies) if (e.state === "walk" || e.state === "hit") ctx.strokeRect(e.x - 9 + 0.5, e.fy - 40 + 0.5, 17, 39);
}

function drawCamera(ctx: CanvasRenderingContext2D, game: Game, colors: OverlayColors): void {
  ctx.strokeStyle = colors.camera;
  ctx.fillStyle = colors.camera;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  // how far back the camera may still go
  const back = game.camFar - game.backtrack - game.camX;
  if (back > -SCREEN_W) {
    ctx.beginPath();
    ctx.moveTo(Math.max(0, back) + 0.5, 0);
    ctx.lineTo(Math.max(0, back) + 0.5, SCREEN_H);
    ctx.stroke();
  }
  ctx.strokeRect(12.5, 8.5, SCREEN_W - 25, SCREEN_H - 17);
  ctx.setLineDash([]);
  const lock = game.activeLock();
  if (lock) {
    ctx.strokeStyle = colors.accent;
    ctx.strokeRect(lock.x - game.camX + 0.5, lock.y - game.camY + 0.5, lock.w - 1, lock.h - 1);
  }
}

function drawHud(ctx: CanvasRenderingContext2D, game: Game, colors: OverlayColors, o: DrawOptions): void {
  ctx.font = `6px ${colors.font}`;
  ctx.textBaseline = "top";
  const slots = game.players.length;
  const w = SCREEN_W / slots;
  for (const p of game.players) {
    const x = p.index * w + 6;
    ctx.fillStyle = colors.players[p.index] ?? colors.text;
    ctx.fillText(`${p.index + 1}P`, x, 4);
    ctx.fillStyle = colors.text;
    if (!p.active) {
      if ((game.frame >> 5) & 1 || game.frame === 0) ctx.fillText(o.words.start, x + 14, 4);
      continue;
    }
    ctx.fillText(String(p.score).padStart(6, "0"), x + 14, 4);
    for (let k = 0; k < p.lives; k++) ctx.fillRect(x + 14 + k * 5, 12, 3, 3);
    if (p.ammo) ctx.fillText(`${o.words.ammo} ${p.ammo}`, x + 34, 12);
    // the light gun: an empty gun says to reload (B2)
    else if (game.rules.crosshair && ((game.frame >> 4) & 1 || p.reloadT)) ctx.fillText(p.reloadT ? "..." : (o.words.reload ?? "RELOAD"), x + 34, 12);
    // the light gun's bombs (B3) and the shooter's (B2), as the ROM's Os
    if (game.rules.crosshair || game.rules.ship || game.rules.topdown) ctx.fillText("O".repeat(p.bombs), x + 62, 12);
  }
  // the platformer's coins taken (T-22)
  if (game.coinTotal) {
    ctx.fillStyle = colors.text;
    const two = (n: number) => String(n).padStart(2, "0");
    ctx.fillText(`${(o.words.coins ?? "COINS").toUpperCase()} ${two(game.coins)}/${two(game.coinTotal)}`, 96, SCREEN_H - 10);
  }
  // what the exit still needs, and why it does not open yet (experiment 1, J-11)
  if (game.rules.exitNeedsEnemies && game.exits.length && game.outcome === "playing") {
    const left = game.enemies.filter((e) => e.state === "walk" || e.state === "hit" || e.state === "attack" || e.state === "fall").length;
    ctx.fillStyle = colors.text;
    ctx.fillText(`${o.words.enemies ?? "ENEMY"} ${left}`, 6, SCREEN_H - 10);
    if (game.exitClosed && (game.frame >> 4) & 1) {
      const line = (o.words.exitClosed ?? "DEFEAT EVERY ENEMY").toUpperCase();
      drawBoardText(ctx, line, Math.floor((SCREEN_W - boardTextWidth(line)) / 16) * 8, 128, 1, TEXT_INKS.white);
    }
  }
  // the beat 'em up: the health of the enemy last hit, for two seconds (as the ROM prints it, column 24)
  // a boss's in BOSS_HUD_STEP hits a mark, in the accent ink
  if (game.lastHit && game.lastHitT && game.lastHit.hp > 0) {
    const boss = game.lastHit.boss;
    ctx.fillStyle = boss ? "#ffaa33" : "#ff4c4c";
    const marks = boss ? Math.ceil(game.lastHit.hp / BOSS_HUD_STEP) : game.lastHit.hp;
    for (let k = 0; k < Math.min(12, marks); k++) ctx.fillRect(192 + k * 8 + 2, SCREEN_H - 9, 4, 4);
  }
  if (o.overlays.fps && o.fps !== undefined) {
    ctx.fillStyle = colors.accent;
    ctx.fillText(`${Math.round(o.fps)} FPS`, SCREEN_W - 34, SCREEN_H - 10);
  }
  if (game.outcome === "over" && o.words.overLine !== undefined) {
    // the Game over screen in the board's font, as the Menus tab designs it
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    const head = o.words.over.toUpperCase();
    drawBoardText(ctx, head, Math.floor((SCREEN_W - boardTextWidth(head, 2)) / 16) * 8, 88, 2, TEXT_INKS.accent);
    const line = o.words.overLine.toUpperCase();
    if (line) drawBoardText(ctx, line, Math.floor((SCREEN_W - boardTextWidth(line)) / 16) * 8, 120, 1, TEXT_INKS.white);
  } else if (game.outcome !== "playing") {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, SCREEN_H / 2 - 16, SCREEN_W, 32);
    ctx.font = `12px ${colors.font}`;
    ctx.textAlign = "center";
    ctx.fillStyle = game.outcome === "cleared" ? colors.players[1] ?? colors.text : colors.players[3] ?? colors.text;
    ctx.fillText(game.outcome === "cleared" ? o.words.cleared : o.words.over, SCREEN_W / 2, SCREEN_H / 2 - 6);
    ctx.textAlign = "start";
    if (game.outcome === "cleared") drawTally(ctx, game, o);
  }
}

/** The clear's tally, as the ROM shows it (T-12): the enemies down, the rescued civilians and every player's score. */
function drawTally(ctx: CanvasRenderingContext2D, game: Game, o: DrawOptions): void {
  const lines: string[] = [];
  const two = (n: number) => String(n).padStart(2, "0");
  if (game.enemies.length) lines.push(`${(o.words.enemies ?? "ENEMY").toUpperCase()} ${two(game.enemies.filter((e) => e.state === "down" || e.state === "off").length)}/${two(game.enemies.length)}`);
  if (game.civilians.length) lines.push(`${(o.words.rescued ?? "RESCUED").toUpperCase()} ${game.rescued}/${game.civilians.length}`);
  lines.push(game.players.map((p, i) => `${i + 1}P ${String(p.score).padStart(6, "0")}`).join("  "));
  lines.forEach((line, i) => drawBoardText(ctx, line, Math.floor((SCREEN_W - boardTextWidth(line)) / 16) * 8, SCREEN_H / 2 + 24 + i * 16, 1, TEXT_INKS.white));
}

/** The beat 'em up's knife (rom/tools/art.mjs TILE_KNIFE): lying on the floor, or flying along its lane (dir: which way the blade points). */
function drawKnife(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number): void {
  const at = (dx: number, w: number) => (dir > 0 ? x + dx : x - dx - w);
  ctx.fillStyle = "#773300";
  ctx.fillRect(at(-7, 5), y, 5, 2);
  ctx.fillStyle = "#ffffdd";
  ctx.fillRect(at(-2, 8), y, 8, 1);
  ctx.fillStyle = "#aaaaaa";
  ctx.fillRect(at(-2, 7), y + 1, 7, 1);
}

/** The shooter's ship in a player's color (engine/shipArt.ts, the ROM's TILE_SHIP). */
function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, player: number): void {
  drawPens(ctx, x, y, SHIP_W, SHIP_H, shipPen, ["", CROSS_COLORS[player] ?? "#ffffff", "#ffffff", "#000000", "#ffcc22"]);
}

/** A shape of engine/shipArt.ts, pen by pen in the given colors (scale 2: each pixel doubled). */
function drawPens(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pen: (px: number, py: number) => number, colors: string[], scale = 1): void {
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const c = pen(px, py);
      if (!c) continue;
      ctx.fillStyle = colors[c] ?? "#ffffff";
      ctx.fillRect(x + px * scale, y + py * scale, scale, scale);
    }
}
