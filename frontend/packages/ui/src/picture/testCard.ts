// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A synthetic arcade frame for the picture demo, drawn in code at a game's
// native size: a test card in the spirit of PM5544 (grid, color bars, gray
// steps, fine gratings, a clock) plus a few moving pixel sprites of our
// own, so every style can be judged on edges, thin lines and motion.

export const CARD_W = 384;
export const CARD_H = 224;
/** Arcade monitors are 4:3, whatever the game's pixel grid is. */
export const CARD_ASPECT = 4 / 3;

// Colors of the picture itself (like the device's test pattern, a picture
// is the same in both themes). They are pixels in a canvas, not UI.
const BARS = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
const GRID = "#e8e8e8";
const BG = "#6a6a6a";

/** A 3x5 pixel font: digits, a colon and a few letters. */
const GLYPHS: Record<string, string> = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
  "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001010010010",
  "8": "111101111101111", "9": "111101111001111", ":": "000010000010000", "x": "000101010101000",
  "G": "111100101101111", "O": "111101101101111", "L": "100100100100111", "I": "111010010010111",
  "N": "101111111101101", "K": "101101110101101", "-": "000000111000000", " ": "000000000000000",
};

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color: string) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of s) {
    const g = GLYPHS[ch] ?? GLYPHS[" "]!;
    for (let i = 0; i < 15; i++) if (g[i] === "1") ctx.fillRect(cx + (i % 3) * px, y + Math.floor(i / 3) * px, px, px);
    cx += 4 * px;
  }
}

/** Our own sprites, drawn from rows of characters ("." = empty). */
const SHIP = [
  "....aa....",
  "...abba...",
  "..abbbba..",
  ".aabccbaa.",
  "aabbccbbaa",
  "a.bbbbbb.a",
  "..d....d..",
];
const COIN = [
  "..eeee..",
  ".efffee.",
  "effeefe.",
  "efeffee.",
  "effeefe.",
  ".efffee.",
  "..eeee..",
];
const SPRITE_COLORS: Record<string, string> = {
  a: "#4fc3d9", b: "#e9ecf2", c: "#e0627a", d: "#f2a33a", e: "#b87a14", f: "#ffd76b",
};

function sprite(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = SPRITE_COLORS[row[i]!];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
    }
  });
}

/** Draws the card at time t (ms). */
export function drawTestCard(ctx: CanvasRenderingContext2D, t: number, now = new Date()): void {
  const W = CARD_W;
  const H = CARD_H;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  // The grid: one pixel lines every 16 pixels.
  ctx.fillStyle = GRID;
  for (let x = 0; x <= W; x += 16) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y <= H; y += 16) ctx.fillRect(0, y, W, 1);
  // The center box.
  const bx = 64;
  const by = 32;
  const bw = W - 128;
  const bh = H - 64;
  ctx.fillStyle = "#000000";
  ctx.fillRect(bx, by, bw, bh);
  // Color bars.
  const barW = Math.floor(bw / BARS.length);
  BARS.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(bx + i * barW, by + 24, barW, 44);
  });
  // Gray steps.
  for (let i = 0; i < 8; i++) {
    const v = Math.round((i / 7) * 255);
    ctx.fillStyle = `rgb(${v} ${v} ${v})`;
    ctx.fillRect(bx + i * (bw / 8), by + 70, Math.ceil(bw / 8), 16);
  }
  // Gratings: stripes one, two and three pixels wide (where smooth blurs).
  const gy = by + 90;
  [1, 2, 3, 4].forEach((step, k) => {
    const gx = bx + 8 + k * 62;
    for (let x = 0; x < 56; x += step * 2) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(gx + x, gy, step, 20);
    }
  });
  // Diagonal lines and a circle outline: jagged edges show resampling.
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 40; i++) {
    ctx.fillRect(bx + 8 + i, gy + 24 + Math.floor(i / 2), 1, 1);
    ctx.fillRect(bx + 60 + i, gy + 24 + Math.floor((40 - i) / 2), 1, 1);
  }
  const cx = bx + bw - 44;
  const cy = gy + 34;
  for (let a = 0; a < 360; a += 2) {
    const r = (a * Math.PI) / 180;
    ctx.fillRect(Math.round(cx + Math.cos(r) * 14), Math.round(cy + Math.sin(r) * 14), 1, 1);
  }
  // The clock and the size, in the pixel font.
  const p2 = (n: number) => String(n).padStart(2, "0");
  text(ctx, `${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`, bx + 100, by + 6, 3, "#ffffff");
  text(ctx, `${W}x${H}`, bx + 110, by + bh - 34, 2, "#c4cad6");
  text(ctx, "GO-LINK", bx + 100, by + bh - 20, 3, "#f2a33a");
  // Moving sprites: a ship crossing, a coin bouncing.
  const s = t / 1000;
  const shipX = ((s * 60) % (W + 20)) - 10;
  sprite(ctx, SHIP, shipX, H - 22);
  const coinX = 20 + Math.abs(((s * 45) % 80) - 40);
  const coinY = 8 + Math.abs(Math.sin(s * 3)) * 12;
  sprite(ctx, COIN, coinX, coinY);
  sprite(ctx, COIN, W - 30 - coinX, coinY);
}
