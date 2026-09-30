// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The mini-games' drawings: blocky pixel art on the 320 × 200 board, in the
// site's colors. Only numbers and signs are drawn here; every word the
// player reads is in the page around the board, translated.

import { E, N, S, W, flow, tileMask, type LinkState } from "./link";
import { SNAKE_COLS, SNAKE_ROWS, type SnakeState } from "./snake";
import type { MemoryState } from "./memory";
import { BRICK_COLORS, BRICK_COLS, BRICK_H, BRICK_ROWS, BRICK_W, BRICK_X, BRICK_Y, PADDLE_W, PADDLE_Y, type PaddleState } from "./paddle";
import { ROAD_HALF, roadCenter, type RacerState } from "./racer";
import { ARROWS, type MovesState } from "./moves";
import { BOARD_H, BOARD_W, type Palette } from "./types";

type Ctx = CanvasRenderingContext2D;

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function text(ctx: Ctx, pal: Palette, s: string, x: number, y: number, size: number, c: string, align: CanvasTextAlign = "center"): void {
  ctx.fillStyle = c;
  ctx.font = `700 ${size}px ${pal.mono}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(s, x, y);
}

function clear(ctx: Ctx, pal: Palette, grid = 0): void {
  rect(ctx, 0, 0, BOARD_W, BOARD_H, pal.bg);
  if (!grid) return;
  ctx.fillStyle = pal.grid;
  for (let x = 0; x <= BOARD_W; x += grid) ctx.fillRect(x, 0, 1, BOARD_H);
  for (let y = 0; y <= BOARD_H; y += grid) ctx.fillRect(0, y, BOARD_W, 1);
}

// ------------------------------------------------------------------ Link

export function linkGeometry(s: Pick<LinkState, "cols" | "rows">): { size: number; x0: number; y0: number } {
  const size = Math.min(44, Math.floor(224 / s.cols), Math.floor(184 / s.rows));
  return { size, x0: Math.round((BOARD_W - size * s.cols) / 2), y0: Math.round((BOARD_H - size * s.rows) / 2) };
}

export function drawLink(ctx: Ctx, s: LinkState, pal: Palette, now: number): void {
  clear(ctx, pal, 10);
  const { size, x0, y0 } = linkGeometry(s);
  const { lit, depth, reached } = flow(s);
  // A pulse runs along the lit cables from DEV, one tile every 90 ms.
  const longest = Math.max(0, ...depth);
  const wave = (now / 90) % (longest + 6);
  const arm = Math.max(4, Math.round(size / 5));
  const half = size / 2;
  for (let y = 0; y < s.rows; y++) {
    for (let x = 0; x < s.cols; x++) {
      const i = y * s.cols + x;
      const tx = x0 + x * size;
      const ty = y0 + y * size;
      rect(ctx, tx + 1, ty + 1, size - 2, size - 2, pal.grid);
      const pulse = lit[i] && Math.abs(depth[i]! - wave) < 0.8;
      const c = pulse ? pal.text : lit[i] ? pal.accent : pal.dim;
      const m = tileMask(s, i);
      const cx = tx + half;
      const cy = ty + half;
      if (m & N) rect(ctx, cx - arm / 2, ty, arm, half, c);
      if (m & S) rect(ctx, cx - arm / 2, cy, arm, half, c);
      if (m & W) rect(ctx, tx, cy - arm / 2, half, arm, c);
      if (m & E) rect(ctx, cx, cy - arm / 2, half, arm, c);
      rect(ctx, cx - arm, cy - arm, arm * 2, arm * 2, c);
    }
  }
  // DEV on the left, the players on the right.
  const devY = y0 + s.source * size + half;
  rect(ctx, x0 - 36, devY - 10, 32, 20, pal.grid);
  rect(ctx, x0 - 4, devY - arm / 2, 4, arm, pal.accent);
  text(ctx, pal, "DEV", x0 - 20, devY + 1, 9, pal.accent);
  const colors = [pal.p1, pal.p2, pal.p3];
  s.sinks.forEach((r, k) => {
    const py = y0 + r * size + half;
    const px = x0 + s.cols * size;
    const on = reached[k];
    rect(ctx, px, py - arm / 2, 4, arm, on ? pal.accent : pal.dim);
    rect(ctx, px + 4, py - 10, 28, 20, on ? colors[k]! : pal.grid);
    text(ctx, pal, `P${k + 1}`, px + 18, py + 1, 9, on ? pal.bg : pal.dim);
  });
  // The cursor, pulsing between two colors.
  if (!s.cleared) {
    ctx.strokeStyle = Math.floor(now / 400) % 2 === 0 ? pal.text : pal.p2;
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + s.cx * size + 1, y0 + s.cy * size + 1, size - 2, size - 2);
  }
}

// ----------------------------------------------------------------- Snake

export function drawSnake(ctx: Ctx, s: SnakeState, pal: Palette, now: number): void {
  const cw = BOARD_W / SNAKE_COLS;
  const ch = BOARD_H / SNAKE_ROWS;
  clear(ctx, pal, cw);
  const [fx, fy] = s.food;
  const pulse = 2 + Math.round(Math.sin(now / 150));
  rect(ctx, fx * cw + 3 - pulse / 2, fy * ch + 3 - pulse / 2, cw - 6 + pulse, ch - 6 + pulse, pal.p2);
  s.body.forEach(([x, y], i) => {
    ctx.globalAlpha = i === 0 ? 1 : 0.62;
    rect(ctx, x * cw + 1, y * ch + 1, cw - 2, ch - 2, s.alive ? pal.accent : pal.dim);
  });
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- Memory

/** Where each face button sits: 1 bottom, 2 right, 3 left, 4 top. */
export const MEMORY_SPOTS: [number, number][] = [
  [160, 150],
  [220, 100],
  [100, 100],
  [160, 50],
];

export function drawMemory(ctx: Ctx, s: MemoryState, pal: Palette): void {
  clear(ctx, pal);
  const colors = [pal.p2, pal.p3, pal.p4, pal.p1];
  MEMORY_SPOTS.forEach(([x, y], i) => {
    const on = s.lit === i;
    ctx.globalAlpha = on ? 1 : 0.28;
    ctx.fillStyle = colors[i]!;
    ctx.beginPath();
    ctx.arc(x, y, on ? 27 : 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    text(ctx, pal, String(i + 1), x, y + 1, 16, on ? pal.bg : pal.text);
  });
  // The round in the middle, and the answer's progress under the board.
  text(ctx, pal, String(s.seq.length), 160, 101, 14, pal.accent);
  if (s.phase === "input") {
    const n = s.seq.length;
    const w = Math.min(10, 200 / n);
    for (let i = 0; i < n; i++) rect(ctx, 160 - (n * w) / 2 + i * w + 1, 190, w - 2, 4, i < s.pos ? pal.accent : pal.line);
  }
}

// ---------------------------------------------------------------- Paddle

export function drawPaddle(ctx: Ctx, s: PaddleState, pal: Palette): void {
  clear(ctx, pal);
  const colors = BRICK_COLORS.map((k) => pal[k]);
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      if (s.bricks[r * BRICK_COLS + c]) rect(ctx, BRICK_X + c * (BRICK_W + 3), BRICK_Y + r * (BRICK_H + 3), BRICK_W, BRICK_H, colors[r]!);
    }
  }
  rect(ctx, s.x, PADDLE_Y, PADDLE_W, 5, pal.accent);
  rect(ctx, s.ballX - 2, s.ballY - 2, 4, 4, pal.text);
  for (let i = 0; i < s.lives; i++) rect(ctx, BOARD_W - 12 - i * 9, 6, 6, 6, pal.accent);
}

// ----------------------------------------------------------------- Racer

const CAR_Y = 168;
const PX_PER_M = 0.25; // meters of road per pixel row

export function drawRacer(ctx: Ctx, s: RacerState, pal: Palette): void {
  clear(ctx, pal);
  const half = ROAD_HALF * (BOARD_W / 2);
  for (let y = 0; y < BOARD_H; y += 2) {
    const z = s.z + (CAR_Y - y) * PX_PER_M;
    const cx = BOARD_W / 2 + roadCenter(z) * (BOARD_W / 2);
    const band = Math.floor(z / 6) % 2 === 0;
    rect(ctx, cx - half, y, half * 2, 2, pal.grid);
    rect(ctx, cx - half - 3, y, 3, 2, band ? pal.p4 : pal.text);
    rect(ctx, cx + half, y, 3, 2, band ? pal.p4 : pal.text);
    if (band) rect(ctx, cx - 1, y, 2, 2, pal.dim);
  }
  const carX = BOARD_W / 2 + s.x * (BOARD_W / 2);
  rect(ctx, carX - 7, CAR_Y - 10, 14, 22, s.offRoad ? pal.p3 : pal.accent);
  rect(ctx, carX - 5, CAR_Y - 6, 10, 4, pal.bg);
  rect(ctx, carX - 5, CAR_Y + 4, 10, 4, pal.bg);
  // Trigger bars on the right: R2 then L2.
  [
    ["R2", s.r2, s.r2max],
    ["L2", s.l2, s.l2max],
  ].forEach(([label, v, max], i) => {
    const x = BOARD_W - 34 + i * 16;
    if (i === 0) rect(ctx, x - 6, 14, 38, 104, pal.bg);
    rect(ctx, x, 20, 10, 80, pal.grid);
    rect(ctx, x, 20 + 80 * (1 - (v as number)), 10, 80 * (v as number), i === 0 ? pal.accent : pal.p3);
    rect(ctx, x - 1, 20 + 80 * (1 - (max as number)), 12, 1, pal.text);
    text(ctx, pal, label as string, x + 5, 110, 8, pal.dim);
  });
}

// ----------------------------------------------------------------- Moves

/** The motion as the page and the board write it: ↓ ↘ → + 1. */
export function motionText(m: MovesState["move"]): string {
  return `${m.motion.map((d) => ARROWS[d]).join(" ")} + ${m.button}`;
}

export function drawMoves(ctx: Ctx, s: MovesState, pal: Palette, now: number): void {
  clear(ctx, pal, 20);
  rect(ctx, 0, 176, BOARD_W, 24, pal.grid);
  const m = s.move;
  // The motion to do, with the charge's hold shown as a filling bar.
  text(ctx, pal, motionText(m), 160, 26, 18, pal.accent);
  if (m.chargeMs) {
    const held = s.dir === m.motion[0] ? Math.min(1, (now - (s.buffer[s.buffer.length - 1]?.at ?? now)) / m.chargeMs) : 0;
    rect(ctx, 112, 40, 40, 3, pal.line);
    rect(ctx, 112, 40, 40 * held, 3, held >= 1 ? pal.ok : pal.accent);
  }
  // The stick's gate: eight directions around the center, the held one lit.
  const gx = 160;
  const gy = 104;
  for (const [d, a] of [
    [6, 0],
    [3, 45],
    [2, 90],
    [1, 135],
    [4, 180],
    [7, 225],
    [8, 270],
    [9, 315],
  ] as const) {
    const r = (a * Math.PI) / 180;
    const x = gx + Math.cos(r) * 36;
    const y = gy + Math.sin(r) * 36;
    rect(ctx, x - 7, y - 7, 14, 14, s.dir === d ? pal.accent : pal.line);
  }
  rect(ctx, gx - 6, gy - 6, 12, 12, s.dir === 5 ? pal.text : pal.dim);
  // Two pixel fighters, the left one striking on a hit.
  const hit = s.flash && s.flash.kind !== "late" && s.flash.kind !== "miss" && now - s.flash.at < 400;
  fighter(ctx, 40, 120, pal.p1, !!hit);
  fighter(ctx, 262, 120, pal.p3, false);
  if (hit) rect(ctx, 76 + ((now - s.flash!.at) / 400) * 150, 142, 10, 10, pal.p2);
  // The last directions, oldest first.
  const trail = s.buffer.filter((e) => e.dir !== 5).slice(-10);
  trail.forEach((e, i) => text(ctx, pal, ARROWS[e.dir]!, 160 - (trail.length * 16) / 2 + 8 + i * 16, 188, 12, pal.text));
}

function fighter(ctx: Ctx, x: number, y: number, c: string, punch: boolean): void {
  rect(ctx, x + 4, y, 12, 12, c);
  rect(ctx, x, y + 12, 20, 22, c);
  rect(ctx, x, y + 34, 7, 20, c);
  rect(ctx, x + 13, y + 34, 7, 20, c);
  if (punch) rect(ctx, x + 20, y + 16, 18, 6, c);
}
