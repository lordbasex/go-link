// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Builds Willy Maker's starter tilesets in public/willy-maker/tiles/ from the
// ROM prototype's own street art (rom/tools/level.mjs), so the "Buenos
// Aires" template looks like the prototype and keeps its board limits
// (15 colors, every channel a multiple of 17):
//   city16.png  16 × 16 play tiles (street, platforms, ladders, crates,
//               building fronts, props and the tag tiles the auto art uses)
//   sky32.png   32 × 32 far tiles (a night sky and a skyline)
// plus a .json manifest each. Run: node apps/web/scripts/willy-maker-tiles.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { buildLevel, PALETTE } from "../../../rom/tools/level.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../public/willy-maker/tiles");
mkdirSync(out, { recursive: true });

const snap = (v) => Math.round(v / 17) * 17;
const PAL = PALETTE.map(([r, g, b]) => [snap(r), snap(g), snap(b)]);
const T = 15; // transparent pen

// --- the prototype's tiles, captured through a fake graphics region ---
const pensOf = new Map();
const fakeGfx = { tile16: (code, pens) => pensOf.set(code, pens.map((row) => row.slice())) };
const lvl = buildLevel(fakeGfx, 0);
const at = (c, r) => pensOf.get(lvl.map[r * 64 + c]);
const hash = (c, r) => (c * 7 + r * 13) % 5;
const findWall = (want) => {
  for (let r = 17; r <= 24; r++) for (let c = 15; c <= 22; c++) if ((c + r) % 2 === 0 && want(hash(c, r))) return at(c, r);
  throw new Error("no such wall cell");
};
const blank = () => Array.from({ length: 16 }, () => new Array(16).fill(T));
const draw = (fn) => {
  const t = blank();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t[y][x] = fn(x, y);
  return t;
};

// Index 0 is "no tile"; the manifest's `auto` names the tiles the editor's
// auto art paints for each collision tag.
const city = [
  ["solid_top", at(1, 25)],
  ["solid_paint", at(1, 26)],
  ["solid", at(0, 27)],
  ["oneway_support", at(30, 20)],
  ["oneway", at(31, 20)],
  ["ladder", at(13, 20)],
  ["crate_tl", at(5, 23)],
  ["crate_tr", at(6, 23)],
  ["crate_bl", at(5, 24)],
  ["crate_br", at(6, 24)],
  ["roof", at(17, 16)],
  ["roof_neon", at(16, 16)],
  ["wall", at(16, 17)],
  ["wall_window_warm", findWall((h) => h < 3)],
  ["wall_window_cyan", findWall((h) => h === 3)],
  ["wall_window_dark", findWall((h) => h === 4)],
  ["wall_left", at(14, 18)],
  ["wall_right", at(23, 18)],
  ["roof_left", at(14, 16)],
  ["roof_right", at(23, 16)],
  ["lamp_head", at(3, 22)],
  ["lamp_post", at(3, 23)],
  ["lamp_base", at(3, 24)],
  ["hydrant", at(9, 24)],
  ["bin", at(10, 24)],
  ["fence_top", at(38, 23)],
  ["fence_bottom", at(38, 24)],
  // tag tiles drawn here: glass to break, a hazard, water, a metal block
  ["breakable", draw((x, y) => (x === 0 || y === 0 || x === 15 || y === 15 ? 0 : (x + y) % 9 === 0 || x - y === 4 ? 10 : 8))],
  ["hazard", draw((x, y) => (y < 2 ? 0 : y < 4 ? 14 : ((x + y) >> 2) % 2 ? 4 : 0))],
  ["water", draw((x, y) => (y === 0 ? 10 : y === 1 ? ((x >> 2) % 2 ? 8 : 10) : (x + y * 3) % 11 === 0 ? 10 : y < 8 ? 8 : 5))],
  ["block", draw((x, y) => (x === 0 || y === 0 || x === 15 || y === 15 ? 0 : x === 1 || y === 1 ? 10 : (x + y) % 6 === 0 ? 0 : 9))],
];

// --- the far layer: night sky bands and a skyline, 32 × 32 ---
const SKY = [
  [17, 17, 34],
  [17, 17, 51],
  [34, 17, 68],
  [51, 34, 85],
  [68, 34, 85],
  [102, 51, 85],
  [17, 17, 17],
  [34, 34, 51],
  [51, 51, 68],
  [238, 187, 85],
  [85, 187, 204],
  [204, 204, 221],
];
const sky = [];
const big = (fn) => Array.from({ length: 32 }, (_, y) => Array.from({ length: 32 }, (_, x) => fn(x, y)));
for (let band = 0; band < 6; band++) sky.push([`sky_${band}`, big((x, y) => ((x * 13 + y * 7 + band * 5) % 97 === 0 && band < 3 ? 11 : band))]);
const tower = (lit, seed) =>
  big((x, y) => {
    if (x < 2 || x > 29) return 7;
    const wx = (x - 4) % 6;
    const wy = (y - 3) % 7;
    if (wx >= 0 && wx < 3 && wy >= 0 && wy < 3 && x > 3 && x < 28) return (x * 3 + y + seed) % lit === 0 ? (seed % 2 ? 10 : 9) : 6;
    return 7;
  });
sky.push(["skyline_a", tower(3, 1)]);
sky.push(["skyline_b", tower(4, 2)]);
sky.push(["skyline_c", tower(5, 3)]);
sky.push(["skyline_top", big((x, y) => (y < 20 ? T : y === 20 ? 8 : x < 2 || x > 29 ? 7 : 6))]);
sky.push(["skyline_antenna", big((x, y) => (y < 20 ? (x === 15 || x === 16 ? (y < 4 ? 9 : 8) : T) : y === 20 ? 8 : 7))]);
sky.push(["skyline_dark", big((x) => (x < 2 || x > 29 ? 6 : 7))]);

// --- writing ---
function crc32(buf) {
  let c;
  let crc = -1;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 255;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

function sheet(name, size, tiles, palette) {
  const columns = 8;
  const rows = Math.ceil(tiles.length / columns);
  const w = columns * size;
  const h = rows * size;
  const rgba = Buffer.alloc(w * h * 4);
  tiles.forEach(([, pens], i) => {
    const ox = (i % columns) * size;
    const oy = Math.floor(i / columns) * size;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const p = pens[y][x];
        if (p === T) continue;
        const o = ((oy + y) * w + ox + x) * 4;
        const [r, g, b] = palette[p];
        rgba.set([r, g, b, 255], o);
      }
  });
  writeFileSync(join(out, `${name}.png`), png(w, h, rgba));
  const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  const manifest = {
    tile: size,
    columns,
    count: tiles.length,
    image: `${name}.png`,
    palette: palette.map(hex),
    // tile number (1-based, 0 = empty) of each named tile
    names: Object.fromEntries(tiles.map(([n], i) => [n, i + 1])),
  };
  writeFileSync(join(out, `${name}.json`), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`${name}: ${tiles.length} tiles, ${w}x${h}`);
}

sheet("city16", 16, city, PAL);
sheet("sky32", 32, sky, SKY);
