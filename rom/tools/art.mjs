// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// The prototype's art, converted for the CPS-1:
//  - characters from the go-link sprite sheets (frontend/apps/web/public/
//    destroy, cut by scripts/destroy-atlas.mjs): scaled to arcade size, a
//    15-color palette per character (pen 15 stays transparent), cut into
//    16x16 tiles laid out for block sprites (tile x,y = code + x + 16*y);
//  - an invented night city: a sky on scroll3 (32x32 tiles) and a skyline
//    with a street on scroll2 (16x16 tiles), each with its own palette.
// It writes the tiles into the graphics region and C tables (art_data.c).

import { ballPen, carPen, dronePen, gemPen, powerPen, shipPen, soldierPen } from "../../frontend/willy-maker/src/maker/engine/shipArt.ts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readImage, writePng } from "./png.mjs";
import { convertCharacter, deltaE, downscaleDominant, renderFrame, toCps1, toLab } from "../../frontend/packages/cps1/src/index.ts";
import { CELL, COLS, CRATES, OBJECTS, PALETTE as LEVEL_PALETTE, ROWS, buildLevel } from "./level.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHEETS = path.resolve(ROOT, "../frontend/apps/web/public/destroy");
// Willy's shirt: painted back by fillEnclosed in a color of its own, kept
// exact in his palettes, so the recruits' palette swap can find it.
const SHIRT = [46, 46, 64];

// ------------------------------------------------------------- colors

/** Median cut to n colors; returns [[r,g,b] 0-255]. */
function medianCut(pixels, n) {
  let boxes = [pixels];
  while (boxes.length < n) {
    let bi = -1;
    let best = -1;
    let axis = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let a = 0; a < 3; a++) {
        let lo = 255;
        let hi = 0;
        for (const p of b) {
          if (p[a] < lo) lo = p[a];
          if (p[a] > hi) hi = p[a];
        }
        const range = (hi - lo) * Math.sqrt(b.length);
        if (range > best) {
          best = range;
          bi = i;
          axis = a;
        }
      }
    });
    if (bi < 0) break;
    const b = boxes[bi].sort((p, q) => p[axis] - q[axis]);
    const mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes.map((b) => [0, 1, 2].map((a) => Math.round(b.reduce((s, p) => s + p[a], 0) / b.length)));
}

/** 8-bit color to the CPS-1 word 0xFRGB (full brightness, 4 bits each). */
const toWord = ([r, g, b]) => 0xf000 | (Math.round(r / 17) << 8) | (Math.round(g / 17) << 4) | Math.round(b / 17);
const fromWord = (w) => [((w >> 8) & 15) * 17, ((w >> 4) & 15) * 17, (w & 15) * 17];

function nearest(pal, p) {
  let best = 0;
  let bd = Infinity;
  pal.forEach((c, i) => {
    const d = (c[0] - p[0]) ** 2 * 3 + (c[1] - p[1]) ** 2 * 4 + (c[2] - p[2]) ** 2 * 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

// --------------------------------------------------------------- frames

/** Box-filtered scale of one atlas frame; returns {w,h,rgba,px,py}. */
function scaleFrame(img, f, s, fillHoles) {
  const w = Math.max(1, Math.round(f.w * s));
  const h = Math.max(1, Math.round(f.h * s));
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = f.x + x / s;
      const y0 = f.y + y / s;
      const x1 = f.x + (x + 1) / s;
      const y1 = f.y + (y + 1) / s;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++)
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          if (sx >= f.x + f.w || sy >= f.y + f.h) continue;
          const o = (sy * img.w + sx) * 4;
          const al = img.rgba[o + 3];
          a += al;
          n++;
          r += img.rgba[o] * al;
          g += img.rgba[o + 1] * al;
          b += img.rgba[o + 2] * al;
        }
      const o = (y * w + x) * 4;
      if (n && a / n >= 110) {
        out[o] = r / a;
        out[o + 1] = g / a;
        out[o + 2] = b / a;
        out[o + 3] = 255;
      }
    }
  if (fillHoles) fillEnclosed(out, w, h, [22, 22, 28]);
  return { w, h, rgba: out, px: Math.round(f.px * s), py: Math.round(f.py * s) };
}

/**
 * The published atlas lost Willy's black T-shirt: the sheet's background
 * is near black, so the cutter keyed the shirt out as background. A
 * transparent pixel counts as outside only when it reaches the frame's
 * border through a passage at least 2r+1 pixels wide (the transparent area
 * is eroded by r, flood-filled from the border, then grown back by r);
 * everything else transparent is inside the silhouette and gets the
 * shirt's color back.
 */
function fillEnclosed(rgba, w, h, color, r = 2) {
  const clear = (x, y) => x < 0 || y < 0 || x >= w || y >= h || !rgba[(y * w + x) * 4 + 3];
  const wide = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let ok = true;
      for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r && ok; dx++) if (!clear(x + dx, y + dy)) ok = false;
      wide[y * w + x] = ok ? 1 : 0;
    }
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (seen[i] || !wide[i]) return;
    seen[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  // grow the outside back by r over transparent pixels
  const outside = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!seen[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && clear(xx, yy)) outside[yy * w + xx] = 1;
        }
    }
  // the strip along the border is always outside
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if ((x < r || y < r || x >= w - r || y >= h - r) && clear(x, y)) outside[y * w + x] = 1;
  for (let i = 0; i < w * h; i++)
    if (!outside[i] && !rgba[i * 4 + 3]) {
      [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]] = color;
      rgba[i * 4 + 3] = 255;
    }
}

/** Quantizes frames to one palette (15 colors + transparent pen 15). */
function quantizeFrames(frames) {
  const all = [];
  for (const fr of frames)
    for (let i = 0; i < fr.w * fr.h; i++) if (fr.rgba[i * 4 + 3]) all.push([fr.rgba[i * 4], fr.rgba[i * 4 + 1], fr.rgba[i * 4 + 2]]);
  const pal = medianCut(all, 15).map((c) => fromWord(toWord(c)));
  for (const fr of frames) {
    fr.pens = Array.from({ length: fr.h }, (_, y) =>
      Array.from({ length: fr.w }, (_, x) => {
        const o = (y * fr.w + x) * 4;
        return fr.rgba[o + 3] ? nearest(pal, [fr.rgba[o], fr.rgba[o + 1], fr.rgba[o + 2]]) : 15;
      }),
    );
  }
  return pal;
}

/** Cuts a frame into 16x16 tiles at codes base + x + 16*y. */
function placeFrame(gfx, fr, base) {
  const nx = Math.ceil(fr.w / 16);
  const ny = Math.ceil(fr.h / 16);
  // bottom-align: the feet sit on the last tile row
  const oy = ny * 16 - fr.h;
  for (let ty = 0; ty < ny; ty++)
    for (let tx = 0; tx < nx; tx++) {
      const px = Array.from({ length: 16 }, (_, y) =>
        Array.from({ length: 16 }, (_, x) => {
          const sx = tx * 16 + x;
          const sy = ty * 16 + y - oy;
          return sx < fr.w && sy >= 0 && sy < fr.h ? fr.pens[sy][sx] : 15;
        }),
      );
      gfx.tile16(base + tx + 16 * ty, px);
    }
  return { nx, ny, ax: fr.px, ay: fr.py + oy };
}

// ---------------------------------------------------------- characters

/**
 * Willy's punch for the beat 'em up (genres.md, phase 3), made from his knife
 * frames: the guard (knife_0) and the stab with the arm out (knife_3) with
 * the blade's swoosh taken off: in the frame's upper 62 % (his jeans are
 * below), everything past the fist (72 % of the width), bright blue (at
 * least 136 and 24 over red) and the swoosh's navy outline right of the
 * arm (from 64 %, blue 40 over red). Play mode
 * makes the same frames (play/sprites.ts withPunch). The sheet grows by the
 * new frame on its right; its file is untouched.
 */
function withPunch({ img, json }) {
  const k = json.frames.knife_3;
  const w = img.w + k.w;
  const rgba = Buffer.alloc(w * img.h * 4);
  for (let y = 0; y < img.h; y++) img.rgba.copy(rgba, y * w * 4, y * img.w * 4, (y + 1) * img.w * 4);
  for (let y = 0; y < k.h; y++)
    for (let x = 0; x < k.w; x++) {
      const s = ((k.y + y) * img.w + k.x + x) * 4;
      const d = (y * w + img.w + x) * 4;
      const [r, , b] = [img.rgba[s], img.rgba[s + 1], img.rgba[s + 2]];
      const blade = y < k.h * 0.62 && (x >= k.w * 0.72 || (b >= 136 && b >= r + 24) || (x >= k.w * 0.64 && b >= r + 40));
      for (let c = 0; c < 4; c++) rgba[d + c] = blade ? 0 : img.rgba[s + c];
    }
  const frames = { ...json.frames, punch_1: { ...k, x: img.w, y: 0 } };
  const anims = { ...json.anims, punch: { frames: ["knife_0", "punch_1", "punch_1", "knife_0"], fps: 16, loop: false } };
  return { img: { w, h: img.h, rgba }, json: { ...json, frames, anims } };
}

const CHARACTERS = [
  // moves: the animations of docs/willy-maker/moves.md, converted only for Willy Maker's engine (opts.moves)
  { name: "willy", sheet: "player", height: 44, palettes: 4, fillHoles: true, recruit: true, anims: ["idle", "run", "jump", "machine_gun", "bazooka", "knife"], moves: ["turn", "jump_kick", "crouch", "crawl", "yawn", "thumbs_up", "punch"] },
  { name: "woman", sheet: "npcs", height: 38, palettes: 2, anims: ["woman_worried", "woman_happy"] },
  { name: "child", sheet: "npcs", height: 31, palettes: 2, anims: ["child_worried", "child_happy"] },
  // a Lag android, the enemy of the prototype (the robot sheet)
  // (its walk frames in the published atlas hold two poses each: splitPoses)
  // (boss: a copy of its palettes with red and blue swapped follows them, the beat 'em up's brawler)
  { name: "robot", sheet: "robot", height: 43, palettes: 3, anims: ["walk", "hit", "defeated"], splitPoses: ["walk"], boss: true },
];

/**
 * Splits an atlas frame that holds several poses side by side at its fully
 * transparent columns; each pose gets its own anchor at its middle.
 */
function splitPoses(img, f) {
  const clearCol = (x) => {
    for (let y = f.y; y < f.y + f.h; y++) if (img.rgba[(y * img.w + x) * 4 + 3] > 40) return false;
    return true;
  };
  const parts = [];
  let start = -1;
  for (let x = f.x; x <= f.x + f.w; x++) {
    const clear = x === f.x + f.w || clearCol(x);
    if (!clear && start < 0) start = x;
    if (clear && start >= 0) {
      if (x - start >= 24) parts.push({ x: start, y: f.y, w: x - start, h: f.h, px: Math.round((x - start) / 2), py: f.py });
      start = -1;
    }
  }
  return parts.length ? parts : [f];
}

// ------------------------------------------------------------ background

/** A deterministic pseudo-random generator, so builds repeat. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** The night sky: 512x256 (16x8 tiles of 32x32), gradient, stars and a moon. */
function drawSky() {
  const w = 512;
  const h = 256;
  const rgba = Buffer.alloc(w * h * 4);
  const r = rng(7);
  const top = [16, 10, 36];
  const bottom = [70, 26, 70];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = Math.min(1, y / 230);
      const o = (y * w + x) * 4;
      // banded gradient, like a 16-bit sky
      const band = Math.floor(t * 10) / 10;
      for (let c = 0; c < 3; c++) rgba[o + c] = top[c] + (bottom[c] - top[c]) * band;
      rgba[o + 3] = 255;
    }
  for (let i = 0; i < 120; i++) {
    const x = Math.floor(r() * w);
    const y = Math.floor(r() * 150);
    const o = (y * w + x) * 4;
    const v = r() > 0.8 ? 255 : 170;
    rgba[o] = rgba[o + 1] = rgba[o + 2] = v;
  }
  // the moon
  const mx = 400;
  const my = 56;
  for (let y = -22; y <= 22; y++)
    for (let x = -22; x <= 22; x++) {
      const d = x * x + y * y;
      if (d > 22 * 22) continue;
      const o = ((my + y) * w + (mx + x)) * 4;
      const shade = d > 18 * 18 ? 200 : 235;
      rgba[o] = shade;
      rgba[o + 1] = shade - 20;
      rgba[o + 2] = shade - 60;
    }
  return { w, h, rgba };
}

/** The city: 1024x256 (64x16 tiles of 16x16); sky left transparent. */
function drawCity() {
  const w = 1024;
  const h = 256;
  const rgba = Buffer.alloc(w * h * 4);
  const r = rng(42);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const o = (y * w + x) * 4;
    rgba[o] = c[0];
    rgba[o + 1] = c[1];
    rgba[o + 2] = c[2];
    rgba[o + 3] = 255;
  };
  const ground = 216; // bitmap y of the street (screen y 200)
  // far buildings, then near ones
  for (const layer of [
    { color: [40, 30, 66], win: [[110, 80, 140]], minH: 70, maxH: 150, minW: 40, maxW: 80 },
    { color: [24, 20, 44], win: [[242, 163, 58], [79, 195, 217], [224, 98, 122]], minH: 40, maxH: 110, minW: 48, maxW: 96 },
  ]) {
    let x = 0;
    while (x < w) {
      const bw = Math.floor(layer.minW + r() * (layer.maxW - layer.minW));
      const bh = Math.floor(layer.minH + r() * (layer.maxH - layer.minH));
      const top = ground - bh;
      for (let y = top; y < ground; y++) for (let i = 0; i < bw; i++) set((x + i) % w, y, layer.color);
      // lit windows on a grid, some dark
      for (let y = top + 6; y < ground - 6; y += 8)
        for (let i = 4; i < bw - 4; i += 7) {
          if (r() < 0.45) continue;
          const c = layer.win[Math.floor(r() * layer.win.length)];
          for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) set((x + i + dx) % w, y + dy, c);
        }
      // a neon sign on some near buildings
      if (layer.win.length > 1 && r() < 0.35) {
        const c = layer.win[Math.floor(r() * layer.win.length)];
        for (let i = 6; i < Math.min(bw - 6, 40); i++) {
          set((x + i) % w, top + 3, c);
          set((x + i) % w, top + 4, c);
        }
      }
      x += bw + Math.floor(r() * 6);
    }
  }
  // the street: sidewalk, curb line and asphalt with dashes
  for (let y = ground; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c = y < ground + 4 ? [96, 90, 120] : y === ground + 4 ? [242, 163, 58] : [30, 28, 40];
      if (y >= ground + 14 && y < ground + 16 && x % 48 < 24) c = [200, 200, 210];
      set(x, y, c);
    }
  return { w, h, rgba };
}

/**
 * The backdrop for the two-tier level (scroll3, half the camera's speed in
 * both directions), 1024x384, in layers from far to near:
 *  - the sky (gradient, stars, moon);
 *  - a far skyline: low-contrast silhouettes with dim windows;
 *  - mid buildings: darker, taller, lit windows, water tanks, antennas
 *    with a red light, billboards with neon;
 *  - dark ground below their feet (y 340), so any camera height shows sky
 *    over city. The near layer (facades, street, props) is the level on
 *    scroll2.
 */
function drawBackdrop() {
  const w = 1024;
  const h = 384;
  const sky = drawSky();
  const rgba = Buffer.alloc(w * h * 4);
  const set = (x, y, c) => {
    if (y < 0 || y >= h) return;
    x = ((x % w) + w) % w;
    const o = (y * w + x) * 4;
    [rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]] = [c[0], c[1], c[2], 255];
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (y < sky.h) sky.rgba.copy(rgba, o, (y * sky.w + (x % sky.w)) * 4, (y * sky.w + (x % sky.w)) * 4 + 4);
      else set(x, y, [70, 26, 70]);
    }
  const r = rng(99);
  // far skyline
  for (let x = 0; x < w; ) {
    const bw = 30 + Math.floor(r() * 50);
    const top = 300 - 60 - Math.floor(r() * 110);
    for (let y = top; y < 300; y++) for (let i = 0; i < bw; i++) set(x + i, y, [52, 38, 82]);
    for (let y = top + 5; y < 296; y += 6) for (let i = 3; i < bw - 3; i += 5) if (r() < 0.3) set(x + i, y, [120, 84, 140]);
    x += bw + Math.floor(r() * 4);
  }
  for (let y = 300; y < h; y++) for (let x = 0; x < w; x++) set(x, y, [36, 28, 60]);
  // mid buildings
  for (let x = 0; x < w; ) {
    const bw = 56 + Math.floor(r() * 64);
    const top = 340 - 90 - Math.floor(r() * 120);
    for (let y = top; y < 340; y++) for (let i = 0; i < bw; i++) set(x + i, y, i === 0 || i === bw - 1 ? [14, 12, 26] : [26, 22, 46]);
    for (let i = 0; i < bw; i++) set(x + i, top, [60, 52, 92]); // roof edge
    for (let y = top + 8; y < 334; y += 9)
      for (let i = 5; i < bw - 6; i += 8) {
        if (r() < 0.4) continue;
        const c = r() < 0.7 ? [242, 190, 90] : r() < 0.5 ? [79, 195, 217] : [224, 98, 122];
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) set(x + i + dx, y + dy, c);
      }
    const kind = r();
    if (kind < 0.35) {
      // a water tank on legs
      const tx = x + 10 + Math.floor(r() * (bw - 34));
      for (let y = top - 22; y < top - 6; y++) for (let i = 0; i < 18; i++) set(tx + i, y, i < 2 || i > 15 ? [14, 12, 26] : [70, 50, 44]);
      for (let y = top - 6; y < top; y++) [set(tx + 2, y, [14, 12, 26]), set(tx + 15, y, [14, 12, 26])];
      for (let i = -1; i < 19; i++) set(tx + i, top - 23, [14, 12, 26]);
    } else if (kind < 0.65) {
      // an antenna with a red light
      const ax = x + Math.floor(bw / 2);
      for (let y = top - 34; y < top; y++) set(ax, y, [90, 84, 120]);
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) set(ax + dx, top - 36 + dy, [255, 60, 60]);
    } else {
      // a billboard with a neon frame
      const bx = x + 6;
      const c = r() < 0.5 ? [224, 98, 122] : [79, 195, 217];
      for (let y = top - 26; y < top - 4; y++)
        for (let i = 0; i < Math.min(bw - 12, 52); i++) set(bx + i, y, y === top - 26 || y === top - 5 || i === 0 || i === Math.min(bw - 12, 52) - 1 ? c : [34, 30, 58]);
      for (let y = top - 4; y < top; y++) [set(bx + 6, y, [14, 12, 26]), set(bx + 30, y, [14, 12, 26])];
    }
    x += bw + 6 + Math.floor(r() * 24);
  }
  for (let y = 340; y < h; y++) for (let x = 0; x < w; x++) set(x, y, [16, 12, 28]);
  return { w, h, rgba };
}

/** Cuts an image into tiles, dedupes them, returns {codes per cell, pal}. */
function tilesFromImage(gfx, img, size, baseCode, write) {
  const opaque = [];
  for (let i = 0; i < img.w * img.h; i++) if (img.rgba[i * 4 + 3]) opaque.push([img.rgba[i * 4], img.rgba[i * 4 + 1], img.rgba[i * 4 + 2]]);
  const pal = medianCut(opaque, 15).map((c) => fromWord(toWord(c)));
  const cols = img.w / size;
  const rows = img.h / size;
  const seen = new Map();
  const map = [];
  let next = baseCode;
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      const px = Array.from({ length: size }, (_, y) =>
        Array.from({ length: size }, (_, x) => {
          const o = ((ty * size + y) * img.w + tx * size + x) * 4;
          return img.rgba[o + 3] ? nearest(pal, [img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]]) : 15;
        }),
      );
      const key = px.map((r) => r.join(",")).join(";");
      let code = seen.get(key);
      if (code === undefined) {
        code = next++;
        seen.set(key, code);
        write(code, px);
      }
      map.push(code);
    }
  return { map, pal, cols, rows, unique: seen.size };
}

// ----------------------------------------------------------------- main

const cArray = (type, name, values, perLine = 12) => {
  const lines = [];
  for (let i = 0; i < values.length; i += perLine) lines.push("\t" + values.slice(i, i + perLine).join(", ") + ",");
  return `const ${type} ${name}[${values.length}] = {\n${lines.join("\n")}\n};\n`;
};
const hex4 = (v) => "0x" + (v & 0xffff).toString(16).padStart(4, "0");

/**
 * Converts every piece of art; writes art_data.c and the defines.
 * opts.level (default true): the prototype's backdrop and level; Willy
 * Maker's engine (rom/tools/engine.mjs) reads its level as data and leaves
 * them out. opts.recruits: the recruits' shirt colors, one palette set each
 * after Willy's (the prototype has one, green). opts.moves: Willy's moves
 * too (turn, jump kick, crouch, crawl, yawn, thumbs up), for the engine;
 * the prototype leaves them out, so its ROM stays the same.
 */
export function addArt(gfx, defs, genDir, opts = {}) {
  const withLevel = opts.level !== false;
  const recruits = opts.recruits ?? [[40, 132, 84]];
  const withMoves = opts.moves === true;
  const tmp = path.join(genDir, "tmp.png");
  let c = [];
  const h = [];
  // sprites from tile code 0x1000 on (offset 0x80000, clear of the font and the empties)
  let code = 0x1000;
  const sheets = {};
  // every sprite palette of the game, loaded at once (32 exist)
  const objPalettes = [];
  CHARACTERS.forEach((entry) => {
    const ch = withMoves && entry.moves ? { ...entry, anims: [...entry.anims, ...entry.moves] } : entry;
    if (!sheets[ch.sheet]) {
      sheets[ch.sheet] = {
        img: readImage(path.join(SHEETS, `${ch.sheet}.webp`), tmp),
        json: JSON.parse(fs.readFileSync(path.join(SHEETS, `${ch.sheet}.json`), "utf8")),
      };
    }
    if (ch.anims.includes("punch") && !sheets[ch.sheet].json.anims.punch) sheets[ch.sheet] = withPunch(sheets[ch.sheet]);
    const { img, json } = sheets[ch.sheet];
    const first = json.frames[json.anims[ch.anims[0]].frames[0]];
    const s = ch.height / first.h;
    const animSrc = ch.anims.map((a) =>
      json.anims[a].frames.flatMap((name) => (ch.splitPoses?.includes(a) ? splitPoses(img, json.frames[name]) : [json.frames[name]])),
    );
    // step 2b: dominant-color downscale, several palettes per tile (sprites.mjs)
    const frames = animSrc.flat().map((f) => {
      const fr = downscaleDominant(img, f, s);
      if (ch.fillHoles) fillEnclosed(fr.rgba, fr.w, fr.h, SHIRT);
      return fr;
    });
    const conv = convertCharacter(frames, ch.palettes, { keep: ch.fillHoles ? [SHIRT] : [] });
    const base = objPalettes.length;
    for (const pal of conv.palettes) objPalettes.push([...pal.map((c) => c.word), ...new Array(16 - pal.length).fill(0x0000)]);
    h.push(`#define PAL_${ch.name.toUpperCase()} ${base} /* ${conv.palettes.length} palettes */`);
    if (ch.recruit) {
      // players 2-4 start as Uplink recruits: Willy with a green shirt
      // (story.md). Same tiles, a copy of the palettes with the shirt color
      // swapped; draw_frame adds RECRUIT_PAL_OFFSET to the tiles' palettes.
      const shirt = toLab(SHIRT);
      let swapped = 0;
      for (const rgb of recruits) {
        const color = toCps1(rgb).word;
        for (const pal of conv.palettes)
          objPalettes.push([
            ...pal.map((c) => (deltaE(c.lab, shirt) < 3 ? (swapped++, color) : c.word)),
            ...new Array(16 - pal.length).fill(0),
          ]);
      }
      // the swap needs the shirt painted back by fillEnclosed; an atlas with an
      // opaque shirt needs another way to find it (journal, step 4)
      if (!swapped) console.warn("art: WARNING the recruit palette swap found no shirt color; player 2 looks like Willy");
      h.push(`#define RECRUIT_PAL_OFFSET ${conv.palettes.length} /* palettes after Willy's */`);
      if (recruits.length > 1) h.push(`#define RECRUITS ${recruits.length} /* recruit k (1-based) adds k * RECRUIT_PAL_OFFSET */`);
    }
    if (ch.boss && withMoves) {
      // CPS-1 words are 0xBRGB: swap the R and B nibbles
      for (const pal of conv.palettes)
        objPalettes.push([...pal.map((c) => (c.word & 0xf0f0) | ((c.word >> 8) & 0xf) | ((c.word & 0xf) << 8)), ...new Array(16 - pal.length).fill(0)]);
      h.push(`#define BOSS_PAL_OFFSET ${conv.palettes.length} /* the boss's red copy of the palettes */`);
    }
    console.log(`art: ${ch.name} ${JSON.stringify(conv.stats)}`);
    // tiles, deduplicated by their pens
    const seen = new Map();
    const tileCode = (t) => {
      const key = t.pens.join(",");
      if (!seen.has(key)) {
        seen.set(key, code);
        gfx.tile16(code, Array.from({ length: 16 }, (_, y) => t.pens.slice(y * 16, y * 16 + 16)));
        code++;
      }
      return seen.get(key);
    };
    let fi = 0;
    ch.anims.forEach((a, ai) => {
      const rows = animSrc[ai].map(() => {
        const f = conv.frames[fi++];
        const tiles = f.tiles.map((t) => `{ ${hex4(tileCode(t))}, ${t.dx}, ${t.dy}, ${base + t.pal} }`);
        const id = `${ch.name}_${a.replace(/^(woman|child)_/, "")}_${fi}`;
        c.push(`static const Tile tiles_${id}[] = { ${tiles.join(", ")} };`);
        return `{ tiles_${id}, ${f.tiles.length}, ${f.nx * 16}, ${f.ax}, ${f.ay} }`;
      });
      const id = `${ch.name}_${a.replace(/^(woman|child)_/, "")}`;
      c.push(`static const Frame frames_${id}[] = {\n\t${rows.join(",\n\t")}\n};\n`);
      c.push(`const Anim anim_${id} = { frames_${id}, ${rows.length}, ${json.anims[a].fps} };\n`);
      h.push(`extern const Anim anim_${id};`);
    });
    // preview of the converted frames for the journal
    const pics = conv.frames.map((_, i) => renderFrame(conv, i));
    const pw = pics.reduce((s2, f) => s2 + f.w + 4, 0);
    const ph = Math.max(...pics.map((f) => f.h));
    const prev = Buffer.alloc(pw * ph * 4);
    let ox = 0;
    for (const f of pics) {
      for (let y = 0; y < f.h; y++) prev.set(f.rgba.subarray(y * f.w * 4, (y + 1) * f.w * 4), ((ph - f.h + y) * pw + ox) * 4);
      ox += f.w + 4;
    }
    writePng(path.join(genDir, `preview-${ch.name}.png`), pw, ph, prev);
  });
  // a bullet: a 16x16 tile drawn here (palette 3)
  const bullet = Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) => {
      if (y < 6 || y > 9) return 15;
      if (x > 13) return 15;
      if (y === 6 || y === 9) return x > 3 ? 1 : 15;
      return x > 9 ? 2 : x > 1 ? 1 : 15;
    }),
  );
  gfx.tile16(code, bullet);
  h.push(`#define TILE_BULLET ${hex4(code)}`, `#define PAL_BULLET ${objPalettes.length}`);
  objPalettes.push([0xf000, 0xffa3, 0xfffe, ...new Array(12).fill(0xf000), 0x0000]);
  code += 1;
  // a rocket for the bazooka: a 32x16 block (two tiles side by side), palette 4
  const rocket = Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 32 }, (_, x) => {
      const dy = Math.abs(y - 7.5);
      if (x >= 4 && x < 26 && dy < 3) return dy < 1.5 ? 2 : 1; // body
      if (x >= 26 && x < 31 && dy < 3 - (x - 26) * 0.6) return 3; // nose
      if (x >= 4 && x < 10 && dy >= 3 && dy < 5.5) return 1; // fins
      if (x < 4 && dy < 2.5 && (x + y) % 2) return 4; // flame
      return 15;
    }),
  );
  code = (code + 15) & ~15; // a block needs code + 1 on the same row of 16
  for (let t = 0; t < 2; t++) gfx.tile16(code + t, rocket.map((row) => row.slice(t * 16, t * 16 + 16)));
  h.push(`#define TILE_ROCKET ${hex4(code)} /* 2x1 block */`, `#define PAL_ROCKET ${objPalettes.length}`);
  objPalettes.push([0xf000, 0xf7a8, 0xfcdc, 0xfe54, 0xffb3, ...new Array(10).fill(0xf000), 0x0000]);
  code += 2;
  if (opts.platformer) {
    // the platformer's pickups (Willy Maker, docs/willy-maker/genres.md): a coin and a spring, one palette
    const coin = Array.from({ length: 16 }, (_, y) =>
      Array.from({ length: 16 }, (_, x) => {
        const dx = x - 7.5;
        const dy = y - 7.5;
        const d = Math.sqrt(dx * dx * 1.6 + dy * dy);
        if (d > 7) return 15;
        if (d > 5.8) return 1; // rim
        if (Math.abs(dx) < 1 && Math.abs(dy) < 4) return 3; // the mark
        return dx + dy < -3 ? 4 : 2; // face, with a shine
      }),
    );
    gfx.tile16(code, coin);
    const spring = Array.from({ length: 16 }, (_, y) =>
      Array.from({ length: 16 }, (_, x) => {
        if (y >= 13) return x >= 1 && x <= 14 ? 5 : 15; // base
        if (y <= 2) return x >= 1 && x <= 14 ? 6 : 15; // top plate
        const coil = Math.abs(((y + x * 0.5) % 4) - 2) < 0.9;
        return x >= 3 && x <= 12 && coil ? 7 : 15;
      }),
    );
    gfx.tile16(code + 1, spring);
    // the moving platform: a steel girder 8 px tall, as play mode draws it (play/renderer.ts drawPlatforms);
    // left end, middle, right end, a bolt in the middle of each
    for (let part = 0; part < 3; part++)
      gfx.tile16(
        code + 2 + part,
        Array.from({ length: 16 }, (_, y) =>
          Array.from({ length: 16 }, (_, x) => {
            if (y >= 8) return 15;
            if (y === 7 || (part === 0 && x === 0) || (part === 2 && x === 15)) return 10; // shadow and ends
            if (y < 2) return 9; // the lit top
            if ((x === 7 || x === 8) && (y === 4 || y === 5)) return 11; // the bolt
            return 8;
          }),
        ),
      );
    // the falling platform: the same girder, rusty and cracked (play/renderer.ts drawPlatforms), right after it
    for (let part = 0; part < 3; part++)
      gfx.tile16(
        code + 5 + part,
        Array.from({ length: 16 }, (_, y) =>
          Array.from({ length: 16 }, (_, x) => {
            if (y >= 8) return 15;
            if (y === 7 || (part === 0 && x === 0) || (part === 2 && x === 15)) return 10;
            if ((x === 5 + part * 2 && y >= 2 && y <= 6) || (x === 6 + part * 2 && (y === 3 || y === 6)) || (x === 11 && y === 4)) return 14; // cracks
            if (y < 2) return 13;
            return 12;
          }),
        ),
      );
    // the beat 'em up's pipe lying on the floor (play/renderer.ts): a steel bar, lit on top
    gfx.tile16(
      code + 8,
      Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => (x >= 1 && x <= 14 ? (y === 12 ? 7 : y === 13 || y === 14 ? 5 : 15) : 15))),
    );
    // the beat 'em up's knife lying on the floor, its point to the right (play/renderer.ts drawKnife): a brown handle, a steel blade lit on top
    gfx.tile16(
      code + 9,
      Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => (y === 13 || y === 14 ? (x >= 1 && x <= 5 ? 3 : y === 13 && x >= 6 && x <= 13 ? 4 : y === 14 && x >= 6 && x <= 12 ? 7 : 15) : 15))),
    );
    h.push(`#define TILE_COIN ${hex4(code)}`, `#define TILE_SPRING ${hex4(code + 1)}`, `#define TILE_PLATFORM ${hex4(code + 2)} /* left end, middle, right end; + 3: the falling one's */`, `#define TILE_PIPE ${hex4(code + 8)}`, `#define TILE_KNIFE ${hex4(code + 9)}`, `#define PAL_PICKUPS ${objPalettes.length}`);
    objPalettes.push([0xf000, 0xfb60, 0xffc2, 0xf730, 0xfffd, 0xf555, 0xfe44, 0xfaaa, 0xf346, 0xf8be, 0xf123, 0xfdef, 0xf843, 0xfc85, 0xf311, 0x0000]);
    code += 10;
    // the light gun's crosshairs (play/renderer.ts drawCrosshairs): a ring of four arms
    // and a dot over a black outline, one tile per player color, then the shot's flash
    const ring = (dx, dy) => {
      const arm = (x0, x1, y0, y1) => dx >= x0 && dx <= x1 && dy >= y0 && dy <= y1;
      const color = arm(-6, -3, -1, 1) || arm(3, 6, -1, 1) || arm(-1, 1, -6, -3) || arm(-1, 1, 3, 6) || (dx === 0 && dy === 0);
      const outline = arm(-7, -3, -2, 2) || arm(3, 7, -2, 2) || arm(-2, 2, -7, -3) || arm(-2, 2, 3, 7);
      return color ? 1 : outline ? 0 : 15;
    };
    for (let k = 0; k < 4; k++)
      gfx.tile16(
        code + k,
        Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => { const pen = ring(x - 8, y - 8); return pen === 1 ? 1 + k : pen; })),
      );
    gfx.tile16(
      code + 4,
      Array.from({ length: 16 }, (_, y) =>
        Array.from({ length: 16 }, (_, x) => {
          const dx = x - 8;
          const dy = y - 8;
          if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) return 6;
          return (dy === 0 && Math.abs(dx) <= 4) || (dx === 0 && Math.abs(dy) <= 4) ? 5 : 15;
        }),
      ),
    );
    // the shooter's ships (engine/shipArt.ts), 32 x 16 as two tiles, one pair per player color
    for (let k = 0; k < 4; k++)
      for (let half = 0; half < 2; half++)
        gfx.tile16(
          code + 5 + 2 * k + half,
          Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => [15, 1 + k, 5, 0, 6][shipPen(half * 16 + x, y)])),
        );
    // the shooter's drone (a 2 x 1 block) and power-up, from engine/shipArt.ts too
    for (let half = 0; half < 2; half++)
      gfx.tile16(code + 13 + half, Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => [15, 4, 5, 0, 6][dronePen(half * 16 + x, y)])));
    gfx.tile16(code + 15, Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => [15, 3, 5, 0][powerPen(x, y)])));
    // the vertical shooter's ships, pointing up (the shape turned a quarter): 16 x 32, top and bottom tiles per player
    for (let k = 0; k < 4; k++)
      for (let half = 0; half < 2; half++)
        gfx.tile16(code + 24 + 2 * k + half, Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => [15, 1 + k, 5, 0, 6][shipPen(31 - (half * 16 + y), x)])));
    // the gunship: the drone doubled, 4 x 2 tiles (hull pink, dome yellow, lights white)
    for (let t = 0; t < 8; t++)
      gfx.tile16(code + 16 + t, Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => [15, 4, 6, 0, 5][dronePen(((t & 3) * 16 + x) >> 1, ((t >> 2) * 16 + y) >> 1)])));
    h.push(`#define TILE_CROSS ${hex4(code)} /* + player (0-3); + 4: the shot's flash */`, `#define TILE_SHIP ${hex4(code + 5)} /* + 2 * player: a 2 x 1 block */`, `#define TILE_DRONE ${hex4(code + 13)} /* a 2 x 1 block */`, `#define TILE_POWER ${hex4(code + 15)}`, `#define TILE_GUNSHIP ${hex4(code + 16)} /* 4 x 2 tiles, left to right, top row first */`, `#define TILE_SHIPUP ${hex4(code + 24)} /* + 2 * player: top, then bottom */`, `#define PAL_CROSS ${objPalettes.length}`);
    objPalettes.push([0xf000, 0xffa3, 0xf7ea, 0xf4cd, 0xfe67, 0xffff, 0xffc2, ...new Array(9).fill(0)]);
    code += 32;
    // the puzzle's gems (engine/shipArt.ts gemPen), one tile per color, then the white one a clear flashes:
    // pens 1-5 the colors (GEM_BODY), 6-10 their shades (GEM_SHADE), 11 the shine, 12 the flash's shade, 13-14 the stone's
    for (let k = 0; k < 7; k++)
      gfx.tile16(code + k, Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => {
        const pen = gemPen(x, y);
        if (k === 5) return [15, 11, 11, 0, 12][pen];
        if (k === 6) return [15, 13, 11, 0, 14][pen];
        return [15, 1 + k, 11, 0, 6 + k][pen];
      })));
    // sports: the ball (engine/shipArt.ts ballPen), in the gems' palette: white, the stone's dark gray, black
    gfx.tile16(code + 7, Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => [15, 11, 14, 0][ballPen(x, y)])));
    h.push(`#define TILE_GEM ${hex4(code)} /* + color - 1 (0-4); + 5: the flash; + 6: the rival's stone */`, `#define TILE_BALL ${hex4(code + 7)} /* sports: the ball, in PAL_GEMS */`, `#define PAL_GEMS ${objPalettes.length}`);
    objPalettes.push([0xf000, 0xfe34, 0xf3c5, 0xf38f, 0xffc2, 0xfb5e, 0xf912, 0xf173, 0xf149, 0xfa71, 0xf629, 0xffff, 0xfccd, 0xf889, 0xf445, 0]);
    code += 8;
    // racing: the cars (engine/shipArt.ts carPen), 16 ways for each player color, in the crosshairs' palette
    for (let k = 0; k < 4; k++)
      for (let d = 0; d < 16; d++)
        gfx.tile16(code + k * 16 + d, Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => [15, 1 + k, 5, 0][carPen(x, y, d)])));
    h.push(`#define TILE_CAR ${hex4(code)} /* + 16 x player + way (0-15), in PAL_CROSS */`);
    code += 64;
    // the top-down run and gun's soldier seen from above (engine/shipArt.ts soldierPen), 8 ways per player color
    for (let k = 0; k < 4; k++)
      for (let d = 0; d < 8; d++)
        gfx.tile16(code + k * 8 + d, Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => [15, 1 + k, 6, 5, 0][soldierPen(x, y, d)])));
    h.push(`#define TILE_SOLDIER ${hex4(code)} /* + 8 x player + way (0-7), in PAL_CROSS */`);
    code += 32;
  }
  if (objPalettes.length > 32) throw new Error(`${objPalettes.length} sprite palettes: the board has 32`);
  c.push(cArray("u16", "obj_palettes", objPalettes.flat().map(hex4), 8));
  h.push(`#define OBJ_PALETTES ${objPalettes.length}`, `extern const u16 obj_palettes[${objPalettes.length * 16}];`);
  h.push(`/* sprite tiles used: 0x1000-${hex4(code)} */`);
  if (withLevel) addLevelArt(gfx, c, h, code);
  else console.log(`art: sprites up to tile ${hex4(code)}`);

  defs.push(
    "typedef struct { u16 code; u8 dx, dy, pal; } Tile; /* one sprite entry, with its own palette */",
    "typedef struct { const Tile *tiles; u8 count, w; s16 ax, ay; } Frame; /* (ax, ay) = the feet from the top left of a w-wide box */",
    "typedef struct { const Frame *frames; u16 count; u16 fps; } Anim;",
    ...h,
  );
  fs.writeFileSync(
    path.join(genDir, "art_data.c"),
    `/* Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> */\n/* Generated by rom/tools/art.mjs from the go-link sprite sheets: do not edit. */\n#include "gfx.h"\n\n${c.join("\n")}`,
  );
  fs.rmSync(tmp, { force: true });
  return { spriteEnd: code };
}

/** The prototype's backdrop (scroll3) and level (scroll2), with their C tables. */
function addLevelArt(gfx, c, h, code) {
  // backdrop on scroll3: sky and far skyline (32x32 codes from 0x0800 = offset 0x100000)
  const sky = tilesFromImage(gfx, drawBackdrop(), 32, 0x0800, (cc, px) => gfx.tile32(cc, px));
  c.push(cArray("u16", "sky_map", sky.map.map(hex4)), cArray("u16", "pal_sky", [...sky.pal.map(toWord), 0x0000].map(hex4), 8));
  h.push(`extern const u16 sky_map[${sky.map.length}];`, `#define SKY_COLS ${sky.cols}`, `#define SKY_ROWS ${sky.rows}`, "extern const u16 pal_sky[16];");
  // the level on scroll2 (16x16 codes from 0x4000 = offset 0x200000), level.mjs
  const lv = buildLevel(gfx, 0x4000);
  c.push(
    cArray("u16", "level_map", lv.map.map(hex4), 16),
    cArray("u8", "level_col", lv.col, 32),
    cArray("u16", "pal_level", [...LEVEL_PALETTE.map((rgb) => toCps1(rgb).word), 0x0000].map(hex4), 8),
    cArray("s16", "crate_cells", CRATES.flat(), 2),
    cArray("s16", "civ_spawn", OBJECTS.civilians.flatMap((o) => [o.x, o.y, o.child]), 3),
    cArray("s16", "robot_spawn", OBJECTS.robots.flatMap((o) => [o.x, o.y, o.min, o.max]), 4),
  );
  h.push(
    `#define LEVEL_COLS ${COLS}`,
    `#define LEVEL_ROWS ${ROWS}`,
    `#define LEVEL_W ${COLS * 16}`,
    `#define LEVEL_H ${ROWS * 16}`,
    `#define TILE16_LEVEL_EMPTY ${hex4(lv.empty)}`,
    ...Object.entries(CELL).map(([k, v]) => `#define CELL_${k} ${v}`),
    `extern const u16 level_map[${lv.map.length}];`,
    `extern const u8 level_col[${lv.col.length}];`,
    "extern const u16 pal_level[16];",
    `#define CRATES ${CRATES.length}`,
    `extern const s16 crate_cells[${CRATES.length * 2}]; /* col, row of each 2x2 crate */`,
    `#define CIVILIANS ${OBJECTS.civilians.length}`,
    `extern const s16 civ_spawn[${OBJECTS.civilians.length * 3}]; /* x, feet y, child */`,
    `#define ROBOTS ${OBJECTS.robots.length}`,
    `extern const s16 robot_spawn[${OBJECTS.robots.length * 4}]; /* x, feet y, patrol min, max */`,
    `#define PICKUP_X ${OBJECTS.pickup.x}`,
    `#define PICKUP_Y ${OBJECTS.pickup.y}`,
  );
  console.log(`art: sprites up to tile ${hex4(code)}, backdrop ${sky.unique} tiles, level ${lv.tiles} tiles`);
}

// The first conversion (step 2), kept for the before/after comparisons
// of rom/tools/quality.mjs.
export { CHARACTERS, scaleFrame as legacyScale, quantizeFrames as legacyQuantize, splitPoses, fillEnclosed, SHEETS };
