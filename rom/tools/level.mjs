// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// The Metal Slug-style test level (journal, step 4): a 1024x448 world on
// scroll2 (64x28 cells of 16x16), drawn by code with one fixed 15-color
// palette, plus its collision map and the objects the 68000 places.
//
// Cells: '.' empty, 'G' street (solid), 'W' building facade (scenery the
// players walk in front of; its roof row is a one-way ledge, like Metal
// Slug's upper routes), '=' one-way platform (stand on top, jump up
// through, down+jump drops), 'L' ladder, 'C' crate (2x2 cells, solid,
// destructible). Street props (lamps, hydrants, bins, a fence) are drawn
// into empty cells and never collide.

export const COLS = 64;
export const ROWS = 28;

// collision codes shared with main.c (hw.h has no level, so gfx.h gets them)
export const CELL = { EMPTY: 0, SOLID: 1, ONEWAY: 2, LADDER: 3, CRATE: 4 };

/** The map, built from rectangles so it stays readable. */
function buildMap() {
  const m = Array.from({ length: ROWS }, () => new Array(COLS).fill("."));
  const rect = (c0, r0, c1, r1, ch) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) m[r][c] = ch;
  };
  rect(0, 25, 63, 27, "G"); // the street, top at y 400
  rect(14, 16, 23, 24, "W"); // building A, roof at y 256
  rect(13, 16, 13, 24, "L"); // its fire ladder, street to roof
  rect(30, 20, 37, 20, "="); // fire escape, y 320
  rect(39, 17, 45, 17, "="); // a second one, y 272
  rect(50, 13, 61, 24, "W"); // building B, roof at y 208
  rect(49, 13, 49, 24, "L"); // its ladder
  rect(62, 13, 63, 13, "="); // a ledge past B
  return m;
}

// crates (top-left cell); 2x2 cells each: a step, a stack of two, a step
export const CRATES = [
  [5, 23],
  [24, 23],
  [26, 21],
  [26, 23],
  [28, 23],
];

// objects for the 68000 (world pixels; y = feet)
export const OBJECTS = {
  civilians: [
    { x: 19 * 16, y: 256, child: 0 },
    { x: 57 * 16, y: 208, child: 1 },
  ],
  robots: [
    { x: 35 * 16, y: 400, min: 30 * 16, max: 46 * 16 },
    { x: 20 * 16, y: 256, min: 15 * 16, max: 23 * 16 },
    { x: 53 * 16, y: 208, min: 50 * 16, max: 56 * 16 },
  ],
  pickup: { x: 42 * 16, y: 272 },
};

// the palette (scroll2 palette 0): pens 0-14, 15 transparent
export const PALETTE = [
  [10, 8, 16], // 0 outline
  [40, 36, 52], // 1 asphalt
  [200, 200, 210], // 2 road paint
  [96, 90, 120], // 3 sidewalk
  [242, 163, 58], // 4 curb, accents
  [30, 26, 50], // 5 wall dark
  [52, 44, 82], // 6 wall
  [242, 190, 90], // 7 window, warm
  [79, 195, 217], // 8 window, cyan
  [110, 120, 142], // 9 metal
  [190, 200, 215], // 10 metal light
  [100, 56, 28], // 11 wood dark
  [160, 96, 44], // 12 wood
  [214, 150, 80], // 13 wood light
  [224, 98, 122], // 14 neon
];

const T = 15;
const blank = () => Array.from({ length: 16 }, () => new Array(16).fill(T));

/** The picture of one cell, from its type and its neighbours. */
function drawCell(m, c, r) {
  const at = (cc, rr) => (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS ? "." : m[rr][cc]);
  const ch = m[r][c];
  const t = blank();
  const hash = (c * 7 + r * 13) % 5;
  if (ch === "G") {
    const top = at(c, r - 1) !== "G";
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        let p = 1;
        if (top) p = y < 4 ? 3 : y === 4 ? 4 : y === 5 ? 0 : 1;
        else if (r === 26 && (y === 7 || y === 8) && (c & 1)) p = 2;
        t[y][x] = p;
      }
    if (top) for (let x = 0; x < 16; x += 8) t[1][x] = 0; // sidewalk joints
    return t;
  }
  if (ch === "W") {
    const roof = at(c, r - 1) !== "W";
    const left = at(c - 1, r) !== "W";
    const right = at(c + 1, r) !== "W";
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        let p = (y + (x >> 3)) % 4 === 0 ? 5 : 6; // brick rows
        if (left && x < 2) p = x === 0 ? 0 : 5;
        if (right && x > 13) p = x === 15 ? 0 : 5;
        t[y][x] = p;
      }
    // a lit window every other cell
    if (!roof && (c + r) % 2 === 0 && !left && !right)
      for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) t[y][x] = y === 4 || x === 4 ? 0 : hash < 3 ? 7 : hash === 3 ? 8 : 5;
    if (roof)
      for (let y = 0; y < 5; y++) for (let x = 0; x < 16; x++) t[y][x] = y === 0 ? 0 : y === 1 ? 10 : y < 4 ? 9 : 0;
    if (roof && hash === 0) for (let x = 2; x < 14; x++) t[7][x] = 14; // neon strip
    return t;
  }
  if (ch === "=") {
    for (let x = 0; x < 16; x++) {
      t[0][x] = 0;
      t[1][x] = 10;
      t[2][x] = x % 4 === 0 ? 0 : 9;
      t[3][x] = 9;
      t[4][x] = 0;
    }
    for (let y = 5; y < 16; y++) if (c % 2 === 0) [t[y][3], t[y][4]] = [0, 9]; // supports
    return t;
  }
  if (ch === "L") {
    for (let y = 0; y < 16; y++) {
      [t[y][2], t[y][3], t[y][12], t[y][13]] = [0, 10, 9, 0];
      if (y % 6 === 2) for (let x = 4; x < 12; x++) t[y][x] = 10;
      if (y % 6 === 3) for (let x = 4; x < 12; x++) t[y][x] = 0;
    }
    return t;
  }
  return null;
}

// street props: [kind, col, top row]
export const PROPS = [
  ["lamp", 3, 22],
  ["hydrant", 9, 24],
  ["bin", 10, 24],
  ["lamp", 27, 22],
  ["fence", 38, 23],
  ["fence", 39, 23],
  ["fence", 40, 23],
  ["fence", 41, 23],
  ["bin", 44, 24],
  ["lamp", 46, 22],
  ["hydrant", 62, 24],
];

/** The cells of a prop: [[dc, dr, pens]]. */
function drawProp(kind) {
  const cells = [];
  if (kind === "lamp") {
    // a 3-cell street lamp: head with a warm light, then the post
    for (let k = 0; k < 3; k++) {
      const t = blank();
      for (let y = 0; y < 16; y++) {
        if (k === 0 && y < 6) {
          for (let x = 3; x < 13; x++) t[y][x] = y === 0 || x === 3 || x === 12 ? 0 : y < 4 ? 9 : 7;
        } else [t[y][7], t[y][8]] = [9, 0];
      }
      if (k === 2) for (let y = 12; y < 16; y++) for (let x = 5; x < 11; x++) t[y][x] = y === 12 ? 0 : 9;
      cells.push([0, k, t]);
    }
  } else if (kind === "hydrant") {
    const t = blank();
    for (let y = 5; y < 16; y++) for (let x = 4; x < 12; x++) t[y][x] = x === 4 || x === 11 || y === 5 ? 0 : y === 8 ? 13 : 14;
    for (let x = 2; x < 14; x++) t[9][x] = 0;
    cells.push([0, 0, t]);
  } else if (kind === "bin") {
    const t = blank();
    for (let y = 3; y < 16; y++) for (let x = 3; x < 13; x++) t[y][x] = x === 3 || x === 12 || y === 3 ? 0 : y === 4 ? 10 : (x & 3) === 0 ? 0 : 9;
    cells.push([0, 0, t]);
  } else if (kind === "fence") {
    for (let k = 0; k < 2; k++) {
      const t = blank();
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const Y = k * 16 + y;
          if (x % 8 === 0 || Y === 2 || Y === 28) t[y][x] = 9;
          else if ((x + Y) % 8 === 0 || (x - Y + 64) % 8 === 0) t[y][x] = 0; // the chain links
        }
      cells.push([0, k, t]);
    }
  }
  return cells;
}

/** One quarter (qx, qy) of a 32x32 crate. */
function drawCrate(qx, qy) {
  const t = blank();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const X = qx * 16 + x;
      const Y = qy * 16 + y;
      let p = 12;
      if (X === 0 || Y === 0 || X === 31 || Y === 31) p = 0;
      else if (X < 3 || Y < 3 || X > 28 || Y > 28) p = 11;
      else if (Math.abs(X - Y) < 2 || Math.abs(X + Y - 31) < 2) p = 13; // the X brace
      else if (Y % 7 === 0) p = 11; // planks
      t[y][x] = p;
    }
  return t;
}

/**
 * Draws the level into the graphics region (16x16 codes from `base`).
 * Returns the tilemap, the collision map, the crate tiles and the palette.
 */
export function buildLevel(gfx, base) {
  const m = buildMap();
  const codes = new Map();
  let next = base;
  const codeOf = (pens) => {
    const key = pens.map((row) => row.join(",")).join(";");
    if (!codes.has(key)) {
      codes.set(key, next);
      gfx.tile16(next++, pens);
    }
    return codes.get(key);
  };
  const empty = codeOf(blank());
  const map = [];
  const col = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const pic = drawCell(m, c, r);
      map.push(pic ? codeOf(pic) : empty);
      const ch = m[r][c];
      const roof = ch === "W" && (r === 0 || m[r - 1][c] !== "W");
      col.push(ch === "G" ? CELL.SOLID : ch === "=" || roof ? CELL.ONEWAY : ch === "L" ? CELL.LADDER : CELL.EMPTY);
    }
  for (const [kind, cc, rr] of PROPS)
    for (const [dc, dr, pens] of drawProp(kind)) {
      const i = (rr + dr) * COLS + cc + dc;
      if (m[rr + dr][cc + dc] === ".") map[i] = codeOf(pens);
    }
  const crateTiles = [];
  for (let q = 0; q < 4; q++) crateTiles.push(codeOf(drawCrate(q & 1, q >> 1)));
  for (const [cc, rr] of CRATES)
    for (let q = 0; q < 4; q++) {
      const i = (rr + (q >> 1)) * COLS + cc + (q & 1);
      map[i] = crateTiles[q];
      col[i] = CELL.CRATE;
    }
  return { map, col, empty, tiles: next - base, next };
}
