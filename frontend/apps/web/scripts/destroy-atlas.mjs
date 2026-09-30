// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Builds the "Destroy this page" sprite atlases from the character sheets:
// every animation's right-facing frames are cut out of the sheet's regions,
// the background is keyed to transparency (only the background connected to
// the region's edge, so dark clothes stay), labels and separator lines are
// dropped, and the frames are packed into one picture per character (lossless
// WebP when cwebp is installed, else PNG) with a JSON
// manifest (frame boxes, a feet pivot, and animations with their fps).
//
// Usage (needs the e2e workspace's Playwright, which draws with a real canvas):
//   node frontend/apps/web/scripts/destroy-atlas.mjs <sheets dir> [out dir]
// The sheets dir holds raw/01_player_avatar.png, raw/05_rescue_npcs.png and
// manifests/source_regions.json. The output defaults to apps/web/public/destroy.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../../../e2e/package.json"));
const { chromium } = require("playwright");

const src = process.argv[2];
const out = process.argv[3] ?? path.join(here, "../public/destroy");
if (!src) {
  console.error("usage: destroy-atlas.mjs <sheets dir> [out dir]");
  process.exit(1);
}
const regions = JSON.parse(fs.readFileSync(path.join(src, "manifests/source_regions.json"), "utf8")).assets;

/**
 * The characters: which sheet, which regions become which animation, how
 * fast they play, whether they loop, and optional frame picks (indices of
 * the right-facing frames found in the region, in order).
 */
const CHARACTERS = {
  player: {
    sheet: "01_player_avatar",
    // The sheet has right- and left-facing sets; only the right ones are kept
    // (flipped at runtime). `leftAt`: the sheet x where a row's left set starts.
    splitLeft: true,
    regions: regions["01_player_avatar_concept.png"].regions,
    anims: {
      idle: { region: "idle", leftAt: 390, fps: 4, loop: true },
      run: { region: "walk_run", leftAt: 1098, fps: 12, loop: true },
      turn: { region: "turn", fps: 12, loop: false },
      jump: { region: "jump", leftAt: 1035, fps: 10, loop: false },
      jump_kick: { region: "jump_kick", leftAt: 773, fps: 14, loop: false },
      crouch: { region: "crouch", leftAt: 332, fps: 8, loop: false },
      crawl: { region: "crawl", leftAt: 1043, fps: 8, loop: true },
      // The first frame holds the gun without firing: the loop is the four shots.
      machine_gun: { region: "machine_gun", leftAt: 780, fps: 14, loop: true, pick: [1, 2, 3, 4] },
      knife: { region: "knife", leftAt: 404, fps: 16, loop: false },
      // The sheet's firing frame also holds the next pose; the rocket and its
      // smoke are drawn by the game, so only the aiming frame is kept.
      bazooka: { region: "bazooka", leftAt: 1148, fps: 10, loop: false, pick: [0] },
      yawn: { region: "yawn", fps: 5, loop: false },
      thumbs_up: { region: "thumbs_up", fps: 7, loop: false },
    },
    // "bored" loops the yawn's sleepy frames after a yawn, until any input.
    // The aim_* poses turn the whole machine gun (stock, body, front hand and
    // muzzle flash) around the rear hand; straight up and down also move the
    // gun forward (`shift`, px) so it stays clear of the face and the legs.
    // `alias` names the same frames under a second animation name.
    derive: [
      { name: "bored", from: "yawn", pickFrames: [2, 4], fps: 1.5, loop: true },
      { name: "aim_up45", from: "machine_gun", aim: -45, alias: "gun_up45", donor: "idle_0" },
      { name: "aim_down45", from: "machine_gun", aim: 45, alias: "gun_down45", donor: "idle_0" },
      { name: "aim_up", from: "machine_gun", aim: -90, shift: [28, -2], alias: "gun_up", donor: "idle_0" },
      { name: "aim_down", from: "machine_gun", aim: 90, shift: [26, -4], alias: "gun_down", donor: "idle_0", dropStock: -4 },
    ],
    // Where the machine gun sits in its frames, in pixels from the feet
    // (x: right of the feet, "above": up from the soles). Measured on the
    // sheet's shooting frames; see aimPose.
    gun: {
      top: 56, // the gun's top row...
      topNear: 52, // ...but lower near the face, so the chin stays (x < chinTo)
      chinTo: 22,
      bottom: 24, // the grip and magazine end here
      stockAbove: 48, // rows at least this high hold the stock, which reaches back to stockFrom
      stockFrom: -17,
      bodyFrom: -8, // lower rows start here (the rear arm is behind this x)
      flashFrom: 47, // from this x on, every row turns: the barrel tip and the flash
      frontFrom: 27, // past the face, whatever is above the gun (flash, ejected casings) turns with it
      pivot: [-1, 44], // the rear hand on the grip
      torso: [-9, 52, 16, 28], // x from, above, x to, above: chest hidden behind the gun, refilled with the shirt
      muzzleAbove: 51, // the muzzle's height when a frame has no flash to find it by
      muzzleFrom: 29, // the flash is looked for from here on (past the front hand; some flashes cover the barrel's tip)
      minSpeck: 40, // loose groups smaller than this (ejected casings, cut crumbs) are dropped
      donorShift: [6, -22], // the idle frame's chest lined up on the shooting frames' chest
    },
  },
  robot: {
    sheet: "02_robot_ai",
    // Its dark blue legs are close to the background: a tighter key keeps them.
    tolerance: 22,
    splitLeft: true,
    regions: regions["02_robot_ai_concept.png"].regions,
    anims: {
      idle: { region: "idle", leftAt: 390, fps: 4, loop: true },
      walk: { region: "walk_run", leftAt: 1100, fps: 10, loop: true },
      turn: { region: "turn", fps: 12, loop: false },
      jump: { region: "jump", leftAt: 1040, fps: 10, loop: false },
      shoot: { region: "arm_cannon", leftAt: 745, fps: 12, loop: false },
      // Its first punch frame still carries the "RIGHT" label.
      melee: { region: "punch", leftAt: 745, fps: 14, loop: false, pick: [1, 2, 3, 4] },
      jump_attack: { region: "jump_attack", leftAt: 745, fps: 12, loop: false },
      hit: { region: "hit", leftAt: 745, fps: 10, loop: false },
      defeated: { region: "defeated", leftAt: 745, fps: 8, loop: false },
    },
  },
  blonde: {
    sheet: "03_blonde_woman",
    splitLeft: true,
    regions: regions["03_blonde_woman_concept.png"].regions,
    anims: {
      idle: { region: "idle", leftAt: 390, fps: 4, loop: true },
      walk: { region: "walk_run", leftAt: 1105, fps: 10, loop: true },
      turn: { region: "turn", fps: 12, loop: false },
      jump: { region: "jump", leftAt: 1047, fps: 10, loop: false },
      jump_attack: { region: "kick_air", leftAt: 776, fps: 12, loop: false },
      melee: { region: "punch", leftAt: 846, fps: 14, loop: false, pick: [1, 2, 3, 4, 5, 6] },
      // Its frames touch the "RIGHT" label and each other's flashes: boxes
      // measured on the sheet (x0, y0, x1, y1), cut at the empty columns.
      shoot: {
        region: "shoot",
        fps: 12,
        loop: false,
        boxes: [
          [28, 723, 110, 789],
          [118, 698, 238, 789],
          [239, 698, 360, 789],
          [361, 698, 490, 789],
          [494, 698, 640, 789],
        ],
      },
      crouch: { region: "crouch", leftAt: 380, fps: 8, loop: false },
      hit: { region: "hit", leftAt: 1135, fps: 10, loop: false },
      taunt: { region: "rescue_victory", leftAt: 650, fps: 6, loop: false },
    },
  },
  alien: {
    sheet: "04_alien",
    splitLeft: true,
    regions: regions["04_alien_concept.png"].regions,
    anims: {
      idle: { region: "idle", leftAt: 393, fps: 4, loop: true },
      walk: {
        region: "walk_skitter",
        fps: 10,
        loop: true,
        boxes: [
          [673, 72, 757, 188],
          [758, 72, 838, 188],
          [839, 72, 904, 188],
          [905, 72, 981, 188],
          [992, 72, 1067, 188],
        ],
      },
      // Jump and plasma rows: dust, jets and the shots join the frames into one
      // shape, so they are cut by boxes measured on the sheet (x0, y0, x1, y1).
      jump: {
        region: "jump_hover",
        fps: 8,
        loop: false,
        boxes: [
          [16, 285, 104, 420],
          [105, 255, 186, 420],
          [187, 255, 280, 420],
          [285, 255, 380, 420],
          [387, 255, 453, 420],
          [454, 255, 548, 420],
          [549, 255, 626, 420],
          [627, 255, 723, 420],
        ],
      },
      shoot: {
        region: "plasma_shot",
        fps: 10,
        loop: false,
        boxes: [
          [24, 500, 104, 612],
          [111, 490, 200, 612],
          [210, 490, 311, 612],
          [312, 490, 436, 612],
          [556, 490, 641, 612],
          [650, 490, 733, 612],
        ],
        // The plasma balls flying off, as their own frames (shoot_fx).
        fx: [
          [439, 538, 487, 588],
          [494, 538, 549, 588],
        ],
      },
      melee: {
        region: "claw",
        fps: 12,
        loop: false,
        boxes: [
          [16, 690, 124, 812],
          [136, 686, 309, 812],
          [310, 686, 447, 812],
          [448, 686, 606, 812],
          [607, 686, 712, 812],
        ],
      },
      hit: { region: "damaged", leftAt: 608, fps: 10, loop: false },
      defeated: {
        region: "defeated",
        fps: 8,
        loop: false,
        boxes: [
          [718, 905, 815, 1024],
          [816, 905, 896, 1024],
          [897, 905, 983, 1024],
          [984, 905, 1106, 1024],
        ],
      },
    },
  },
  npcs: {
    sheet: "05_rescue_npcs",
    splitLeft: false,
    regions: regions["05_rescue_npcs_concept.png"].regions,
    anims: Object.fromEntries(
      Object.keys(regions["05_rescue_npcs_concept.png"].regions).map((name) => [
        name.replace("elderly", "elder").replace("rescued", "happy"),
        { region: name, fps: name.includes("follow") ? 8 : name.includes("idle") ? 3 : 5, loop: !name.includes("thanks") },
      ]),
    ),
  },
};

/** Runs in the page: cuts one region into its right-facing frames. */
function cutRegion(imgData, W, H, rx, ry, rw, rh, splitLeft, leftAt, tolerance = 42) {
  const px = imgData;
  const at = (x, y) => (y * W + x) * 4;
  const x1 = Math.min(W, rx + rw);
  const y1 = Math.min(H, ry + rh);
  const w = x1 - rx;
  const h = y1 - ry;
  // The background: the most common dark color in the region (a corner may
  // sit on a separator line).
  const hist = new Map();
  for (let y = ry; y < y1; y += 3)
    for (let x = rx; x < x1; x += 3) {
      const i = at(x, y);
      if (Math.max(px[i], px[i + 1], px[i + 2]) >= 60) continue;
      const key = ((px[i] >> 2) << 12) | ((px[i + 1] >> 2) << 6) | (px[i + 2] >> 2);
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
  let bgKey = 0;
  let best = -1;
  for (const [k, n] of hist) if (n > best) (best = n), (bgKey = k);
  const bg = [((bgKey >> 12) & 63) * 4 + 2, ((bgKey >> 6) & 63) * 4 + 2, (bgKey & 63) * 4 + 2];
  const near = (i) => Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) < tolerance && Math.max(px[i], px[i + 1], px[i + 2]) < 60;
  // Flood fill the background from the region's edge (so dark clothes stay).
  const isBg = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const k = stack.pop();
    if (isBg[k]) continue;
    const kx = k % w;
    const ky = (k / w) | 0;
    if (!near(at(rx + kx, ry + ky))) continue;
    isBg[k] = 1;
    if (kx > 0) stack.push(k - 1);
    if (kx < w - 1) stack.push(k + 1);
    if (ky > 0) stack.push(k - w);
    if (ky < h - 1) stack.push(k + w);
  }
  // Also key any leftover pixel that is exactly background colored and has
  // a background neighbor (anti-aliased holes between arms and body).
  for (let pass = 0; pass < 2; pass++)
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const k = y * w + x;
        if (isBg[k] || !near(at(rx + x, ry + y))) continue;
        if (isBg[k - 1] || isBg[k + 1] || isBg[k - w] || isBg[k + w]) isBg[k] = 1;
      }
  // Separator and underline strokes: long thin runs of ink with background
  // just above and below them (or left and right, for vertical ones).
  const inkAt = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !isBg[y * w + x];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!inkAt(x, y)) {
        x++;
        continue;
      }
      let e = x;
      while (e < w && inkAt(e, y)) e++;
      if (e - x > 70) {
        let thin = 0;
        for (let k = x; k < e; k++) if (!inkAt(k, y - 4) && !inkAt(k, y + 4)) thin++;
        if (thin > (e - x) * 0.7) for (let k = x; k < e; k++) for (let t = -3; t <= 3; t++) if (inkAt(k, y + t) && !inkAt(k, y + t - 4 * Math.sign(t || 1))) isBg[(y + t) * w + k] = 1;
      }
      x = e;
    }
  }
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!inkAt(x, y)) {
        y++;
        continue;
      }
      let e = y;
      while (e < h && inkAt(x, e)) e++;
      if (e - y > 90) {
        let thin = 0;
        for (let k = y; k < e; k++) if (!inkAt(x - 4, k) && !inkAt(x + 4, k)) thin++;
        if (thin > (e - y) * 0.8) for (let k = y; k < e; k++) for (let t = -2; t <= 2; t++) if (x + t >= 0 && x + t < w) isBg[k * w + x + t] = 1;
      }
      y = e;
    }
  }
  // Components without dilation first: drop lines and label text.
  const label = (dil, keep) => {
    const lab = new Int32Array(w * h).fill(-1);
    const comps = [];
    for (let s = 0; s < w * h; s++) {
      if (isBg[s] || !keep[s] || lab[s] >= 0) continue;
      const id = comps.length;
      let bx0 = w, by0 = h, bx1 = 0, by1 = 0, n = 0, bright = 0;
      const st = [s];
      lab[s] = id;
      while (st.length) {
        const q = st.pop();
        const qx = q % w;
        const qy = (q / w) | 0;
        n++;
        const qi = at(rx + qx, ry + qy);
        bright += px[qi] + px[qi + 1] + px[qi + 2];
        if (qx < bx0) bx0 = qx;
        if (qx > bx1) bx1 = qx;
        if (qy < by0) by0 = qy;
        if (qy > by1) by1 = qy;
        for (let dy = -dil; dy <= dil; dy++)
          for (let dx = -dil; dx <= dil; dx++) {
            const nx = qx + dx;
            const ny = qy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const kk = ny * w + nx;
            if (!isBg[kk] && keep[kk] && lab[kk] < 0) {
              lab[kk] = id;
              st.push(kk);
            }
          }
      }
      comps.push({ x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1, n, light: bright / n > 330 });
    }
    return { lab, comps };
  };
  const all = new Uint8Array(w * h).fill(1);
  const first = label(1, all);
  const keep = new Uint8Array(w * h);
  // Where the red "◆ LEFT" label starts, the right-facing frames end.
  let leftX = Infinity;
  for (let k = 0; k < w * h; k++) {
    const id = first.lab[k];
    if (id < 0) continue;
    const c = first.comps[id];
    const line = c.h <= 5 || (c.w > 120 && c.h <= 8);
    const text = c.y < 70 && c.h < 26 && c.w < 160;
    const speck = c.n < 12;
    if (!line && !text && !speck) keep[k] = 1;
    // The diamond before "LEFT": a small, squarish, saturated red mark
    // with the label's light letters just to its right (red gloves have none).
    if (text && c.h >= 8 && c.h <= 22 && c.w >= 8 && c.w <= 22) {
      const i = at(rx + (k % w), ry + ((k / w) | 0));
      const red = px[i] > 170 && px[i + 1] < 80 && px[i + 2] < 90;
      const label = first.comps.some((o) => o !== c && o.light && o.x > c.x + c.w - 2 && o.x < c.x + c.w + 30 && Math.abs(o.y + o.h / 2 - (c.y + c.h / 2)) < 9 && o.h >= 6 && o.h <= 22);
      if (red && label) leftX = Math.min(leftX, c.x);
    }
  }
  // Now join a sprite's parts (and its effects) with a small dilation.
  const second = label(4, keep);
  let comps = second.comps.map((c, i) => ({ ...c, ids: [i] }));
  const maxH = Math.max(...comps.map((c) => c.h), 1);
  comps = comps.filter((c) => c.h >= maxH * 0.45 && c.n > 250);
  // Merge pieces that overlap a lot horizontally (a knife arc over a body).
  comps.sort((a, b) => a.x - b.x);
  const merged = [];
  for (const c of comps) {
    const m = merged.find((o) => {
      const ov = Math.min(o.x + o.w, c.x + c.w) - Math.max(o.x, c.x);
      return ov > 0.45 * Math.min(o.w, c.w);
    });
    if (m) {
      const nx0 = Math.min(m.x, c.x);
      const ny0 = Math.min(m.y, c.y);
      m.w = Math.max(m.x + m.w, c.x + c.w) - nx0;
      m.h = Math.max(m.y + m.h, c.y + c.h) - ny0;
      m.x = nx0;
      m.y = ny0;
      m.ids.push(...c.ids);
      m.n += c.n;
    } else merged.push({ ...c, ids: [...c.ids] });
  }
  // Effects (smoke, sparks) can bridge frames into one box: split boxes much
  // wider than a frame at columns with (almost) no pixels of theirs.
  // A frame is about as wide as it is tall: when a whole row merged into one
  // box, its height still says how wide a frame is.
  const widths = merged.map((c) => c.w).sort((a, b) => a - b);
  const heights = merged.map((c) => c.h).sort((a, b) => a - b);
  const typical = Math.min(widths[Math.floor(widths.length / 2)] ?? 0, (heights[Math.floor(heights.length / 2)] ?? 0) * 1.3);
  const split = [];
  for (const c of merged) {
    if (!typical || c.w < typical * 1.7) {
      split.push(c);
      continue;
    }
    const ids = new Set(c.ids);
    const cols = new Array(c.w).fill(0);
    for (let yy = c.y; yy < c.y + c.h; yy++) for (let xx = c.x; xx < c.x + c.w; xx++) if (ids.has(second.lab[yy * w + xx])) cols[xx - c.x]++;
    let start = -1;
    const pieces = [];
    for (let i = 0; i <= c.w; i++) {
      const on = i < c.w && cols[i] > 1;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        pieces.push([start, i]);
        start = -1;
      }
    }
    // Join pieces a few columns apart (a gap inside one sprite).
    const joined = [];
    for (const p of pieces) {
      const last = joined[joined.length - 1];
      if (last && p[0] - last[1] < 3) last[1] = p[1];
      else joined.push([...p]);
    }
    for (const [a, b] of joined) {
      let ty0 = Infinity, ty1 = -1;
      for (let yy = c.y; yy < c.y + c.h; yy++) for (let xx = c.x + a; xx < c.x + b; xx++) if (ids.has(second.lab[yy * w + xx])) {
        if (yy < ty0) ty0 = yy;
        if (yy > ty1) ty1 = yy;
      }
      if (ty1 < 0) continue;
      split.push({ x: c.x + a, y: ty0, w: b - a, h: ty1 - ty0 + 1, ids: c.ids, n: 0 });
    }
  }
  const tallest = Math.max(...split.map((c) => c.h), 1);
  merged.length = 0;
  // Much wider than tall is several frames still joined by effects: dropped
  // (the game falls back to the idle animation when one ends up empty).
  merged.push(...split.filter((c) => c.h >= tallest * 0.4 && c.w >= 12 && c.w <= c.h * 3.2));
  // Where the left-facing set starts: measured on the sheet (see `leftAt`), else the red diamond found.
  if (leftAt !== undefined) leftX = leftAt - rx;
  if (!splitLeft) leftX = Infinity;
  const right = merged.filter((c) => c.x + c.w / 2 < leftX).sort((a, b) => a.x - b.x);
  if (window.DEBUG_BOXES) window.DEBUG_BOXES.push({ rx, ry, leftX, boxes: merged.map((c) => [c.x, c.y, c.w, c.h, c.x + c.w / 2 < leftX ? 1 : 0]) });
  // Cut each frame with only its own pixels; the pivot is the feet's center.
  return right.map((c) => {
    const ids = new Set(c.ids);
    const cv = document.createElement("canvas");
    cv.width = c.w;
    cv.height = c.h;
    const cx = cv.getContext("2d");
    const img = cx.createImageData(c.w, c.h);
    let footSum = 0;
    let footN = 0;
    for (let y = 0; y < c.h; y++)
      for (let x = 0; x < c.w; x++) {
        const k = (c.y + y) * w + (c.x + x);
        if (!ids.has(second.lab[k])) continue;
        const i = at(rx + c.x + x, ry + c.y + y);
        const o = (y * c.w + x) * 4;
        img.data[o] = px[i];
        img.data[o + 1] = px[i + 1];
        img.data[o + 2] = px[i + 2];
        img.data[o + 3] = 255;
        if (y >= c.h * 0.8) {
          footSum += x;
          footN++;
        }
      }
    cx.putImageData(img, 0, 0);
    return { w: c.w, h: c.h, px: footN ? Math.round(footSum / footN) : Math.round(c.w / 2), py: c.h, png: cv.toDataURL("image/png") };
  });
}

/**
 * Runs in the page: cuts frames from boxes measured on the sheet ([x0, y0,
 * x1, y1], inclusive), for rows where sprites and effects touch so the shape
 * search cannot tell them apart. The background is keyed from each box's
 * edge (its most common dark color), loose specks go, and the pivot is the
 * feet's center, as in cutRegion.
 */
function cutBoxes(imgData, W, H, boxes, tolerance = 42) {
  const px = imgData;
  const at = (x, y) => (y * W + x) * 4;
  return boxes.map(([bx0, by0, bx1, by1]) => {
    const w = bx1 - bx0 + 1;
    const h = by1 - by0 + 1;
    const hist = new Map();
    for (let y = by0; y <= by1; y += 2)
      for (let x = bx0; x <= bx1; x += 2) {
        const i = at(x, y);
        if (Math.max(px[i], px[i + 1], px[i + 2]) >= 60) continue;
        const key = ((px[i] >> 2) << 12) | ((px[i + 1] >> 2) << 6) | (px[i + 2] >> 2);
        hist.set(key, (hist.get(key) ?? 0) + 1);
      }
    let bgKey = 0;
    let best = -1;
    for (const [k, n] of hist) if (n > best) (best = n), (bgKey = k);
    const bg = [((bgKey >> 12) & 63) * 4 + 2, ((bgKey >> 6) & 63) * 4 + 2, (bgKey & 63) * 4 + 2];
    const near = (i) => Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) < tolerance && Math.max(px[i], px[i + 1], px[i + 2]) < 60;
    const isBg = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    while (stack.length) {
      const k = stack.pop();
      if (isBg[k]) continue;
      const kx = k % w;
      const ky = (k / w) | 0;
      if (!near(at(bx0 + kx, by0 + ky))) continue;
      isBg[k] = 1;
      if (kx > 0) stack.push(k - 1);
      if (kx < w - 1) stack.push(k + 1);
      if (ky > 0) stack.push(k - w);
      if (ky < h - 1) stack.push(k + w);
    }
    for (let pass = 0; pass < 2; pass++)
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          const k = y * w + x;
          if (isBg[k] || !near(at(bx0 + x, by0 + y))) continue;
          if (isBg[k - 1] || isBg[k + 1] || isBg[k - w] || isBg[k + w]) isBg[k] = 1;
        }
    // Specks, and slivers of a neighbor frame on the box's side edges, go.
    const seen = new Uint8Array(w * h);
    for (let s0 = 0; s0 < w * h; s0++) {
      if (seen[s0] || isBg[s0]) continue;
      const st = [s0];
      const group = [];
      let side = false;
      seen[s0] = 1;
      while (st.length) {
        const q = st.pop();
        group.push(q);
        const qx = q % w;
        const qy = (q / w) | 0;
        if (qx === 0 || qx === w - 1) side = true;
        for (let ny = qy - 1; ny <= qy + 1; ny++)
          for (let nx = qx - 1; nx <= qx + 1; nx++) {
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const k = ny * w + nx;
            if (!seen[k] && !isBg[k]) {
              seen[k] = 1;
              st.push(k);
            }
          }
      }
      if (group.length < 12 || (side && group.length < 60)) for (const q of group) isBg[q] = 1;
    }
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (!isBg[y * w + x]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    const cv = document.createElement("canvas");
    cv.width = cw;
    cv.height = ch;
    const cx = cv.getContext("2d");
    const img = cx.createImageData(cw, ch);
    let footSum = 0;
    let footN = 0;
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        if (isBg[(y0 + y) * w + x0 + x]) continue;
        const i = at(bx0 + x0 + x, by0 + y0 + y);
        const o = (y * cw + x) * 4;
        img.data[o] = px[i];
        img.data[o + 1] = px[i + 1];
        img.data[o + 2] = px[i + 2];
        img.data[o + 3] = 255;
        if (y >= ch * 0.8) {
          footSum += x;
          footN++;
        }
      }
    cx.putImageData(img, 0, 0);
    return { w: cw, h: ch, px: footN ? Math.round(footSum / footN) : Math.round(cw / 2), py: ch, png: cv.toDataURL("image/png") };
  });
}

/**
 * Runs in the page: where a villain's shot leaves a shooting frame: the
 * nearest column of bright shot pixels (a yellow muzzle flash or a magenta
 * or cyan energy burst) in front of the body. Null when the frame shows no
 * shot (a wind-up frame).
 */
async function shotMuzzle(f) {
  const img = new Image();
  img.src = f.png;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = f.w;
  c.height = f.h;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0);
  const sp = x.getImageData(0, 0, f.w, f.h).data;
  const shot = (i) => {
    const [r, g, b] = [sp[i], sp[i + 1], sp[i + 2]];
    return sp[i + 3] > 128 && ((r >= 240 && g >= 190 && r >= g) || (r > 200 && b > 200 && g < 170) || (b > 220 && g > 200 && r < 150));
  };
  // In front of the body only (hair and suit highlights share the shot's
  // colors), and only a real burst: a few lit dots on a suit are not a shot.
  const from = Math.max(f.px + 12, Math.round(f.w * 0.55));
  let total = 0;
  let core = 0;
  for (let yy = 0; yy < f.h * 0.8; yy++)
    for (let xx = from; xx < f.w; xx++) {
      const i = (yy * f.w + xx) * 4;
      if (!shot(i)) continue;
      total++;
      if (sp[i] > 245 && sp[i + 1] > 225 && sp[i + 2] > 200) core++; // a flash's white-hot center
    }
  if (total < 40 || core < 6) return null;
  for (let xx = from; xx < f.w; xx++) {
    let sy = 0;
    let n = 0;
    for (let yy = 0; yy < f.h * 0.8; yy++)
      if (shot((yy * f.w + xx) * 4)) {
        sy += yy;
        n++;
      }
    if (n >= 4) return { x: xx, y: Math.round(sy / n) };
  }
  return null;
}

/**
 * Runs in the page: where the machine gun's bullets leave a shooting frame,
 * in frame pixels. The flash's first bright column past the barrel, or, in a
 * frame without a flash, the gun's front at its usual height. `g` = the
 * character's `gun` measures.
 */
function findMuzzle(sp, w, h, f, g) {
  const X = (dx) => f.px + dx;
  const Y = (above) => f.py - above;
  for (let x = X(g.muzzleFrom); x < w; x++) {
    let sy = 0;
    let n = 0;
    for (let y = Y(g.top + 12); y <= Y(g.bottom - 8); y++) {
      if (y < 0 || y >= h) continue;
      const i = (y * w + x) * 4;
      if (sp[i + 3] > 128 && sp[i] > 240 && sp[i + 1] > 225 && sp[i + 2] > 160) {
        sy += y;
        n++;
      }
    }
    if (n >= 2) return { x, y: Math.round(sy / n) };
  }
  return { x: X(g.flashFrom), y: Y(g.muzzleAbove) };
}

/**
 * Runs in the page: a shooting frame with the gun aimed `d.aim` degrees
 * (negative = up). The whole gun layer (stock, body, grip, front hand, barrel
 * and flash) is lifted off the body, the chest it hid is refilled with the
 * shirt's color (with a dark edge where it meets the air), and the layer
 * goes back turned around the rear hand, pixel by pixel with no smoothing,
 * then moved by `d.shift`. Alpha stays 0 or 255 and loose specks are
 * dropped, so it stays crisp pixel art. Returns the new frame with its feet
 * pivot and the muzzle (where bullets start), both in the new frame's pixels.
 */
async function aimPose(f, d, g, donor) {
  const img = new Image();
  img.src = f.png;
  await img.decode();
  const w = f.w;
  const h = f.h;
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sx = src.getContext("2d");
  sx.drawImage(img, 0, 0);
  const sp = sx.getImageData(0, 0, w, h).data;
  // The shirt the gun hid comes from another frame (the idle one), lined up
  // by `g.donorShift` (its pixel = this frame's pixel + shift, from the feet).
  let dp = null;
  if (donor) {
    const di = new Image();
    di.src = donor.png;
    await di.decode();
    const dc = document.createElement("canvas");
    dc.width = donor.w;
    dc.height = donor.h;
    const dx2 = dc.getContext("2d");
    dx2.drawImage(di, 0, 0);
    dp = dx2.getImageData(0, 0, donor.w, donor.h).data;
  }
  const donorAt = (x, y) => {
    if (!dp) return null;
    const ux = donor.px + (x - f.px) + g.donorShift[0];
    const uy = donor.py + (y - f.py) + g.donorShift[1];
    if (ux < 0 || uy < 0 || ux >= donor.w || uy >= donor.h) return null;
    const i = (uy * donor.w + ux) * 4;
    return dp[i + 3] > 128 ? [dp[i], dp[i + 1], dp[i + 2]] : null;
  };
  const X = (dx) => f.px + dx;
  const Y = (above) => f.py - above;
  const inGun = (x, y) => {
    // Pointing down, the stock would swing up to the face: it is left out.
    if (d.dropStock && x < X(d.dropStock)) return false;
    if (x >= X(g.flashFrom)) return true;
    if (x >= X(g.frontFrom) && y < Y(g.top)) return true;
    if (y < Y(x < X(g.chinTo) ? g.topNear : g.top) || y > Y(g.bottom)) return false;
    return x >= (y <= Y(g.stockAbove) ? X(g.stockFrom) : X(g.bodyFrom));
  };
  // The chest patch, with its front corners cut so it reads as cloth, not a box.
  const inTorso = (x, y) => {
    if (x < X(g.torso[0]) || x > X(g.torso[2]) || y < Y(g.torso[1]) || y > Y(g.torso[3])) return false;
    const fromRight = X(g.torso[2]) - x;
    return fromRight >= Math.max(3 - (y - Y(g.torso[1])), 6 - (Y(g.torso[3]) - y), 0);
  };
  // The shirt: the middle of the dark colors in the gun's rows; the edge: the darkest.
  const dark = [];
  for (let y = Math.max(0, Y(g.top)); y <= Math.min(h - 1, Y(g.bottom)); y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (sp[i + 3] > 128 && (sp[i] + sp[i + 1] + sp[i + 2]) / 3 < 40) dark.push([sp[i], sp[i + 1], sp[i + 2]]);
    }
  dark.sort((p, q) => p[0] + p[1] + p[2] - (q[0] + q[1] + q[2]));
  const shirt = dark[Math.floor(dark.length / 2)] ?? [20, 21, 27];
  const edge = dark[0] ?? [8, 8, 12];
  const a = (d.aim * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const pvx = X(g.pivot[0]);
  const pvy = Y(g.pivot[1]);
  const [ox, oy] = d.shift ?? [0, 0];
  const pad = Math.ceil(Math.hypot(w, h));
  const W = w + pad * 2;
  const H = h + pad * 2;
  const out = new Uint8ClampedArray(W * H * 4);
  const filled = new Uint8Array(W * H);
  const put = (x, y, c) => {
    const o = (y * W + x) * 4;
    out[o] = c[0];
    out[o + 1] = c[1];
    out[o + 2] = c[2];
    out[o + 3] = 255;
  };
  const px = (i) => [sp[i], sp[i + 1], sp[i + 2]];
  // The body; the chest under the gun becomes shirt.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (sp[i + 3] < 128) continue;
      if (!inGun(x, y)) put(x + pad, y + pad, px(i));
      else if (inTorso(x, y)) {
        const c = donorAt(x, y);
        put(x + pad, y + pad, c ?? shirt);
        if (!c) filled[(y + pad) * W + x + pad] = 1;
      }
    }
  // The shirt's patch gets a dark edge where it meets the air.
  const opaque = (x, y) => out[(y * W + x) * 4 + 3] > 0;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++)
      if (filled[y * W + x] && (!opaque(x + 1, y) || !opaque(x - 1, y) || !opaque(x, y + 1) || !opaque(x, y - 1))) put(x, y, edge);
  // The muzzle turns with the gun.
  const m = findMuzzle(sp, w, h, f, g);
  const mx = pvx + (m.x - pvx) * cos - (m.y - pvy) * sin + ox + pad;
  const my = pvy + (m.x - pvx) * sin + (m.y - pvy) * cos + oy + pad;
  // Aimed diagonally, nothing of the gun belongs behind the muzzle on the
  // face's side (sparks and casings that turned toward the head).
  const stray = (x, y) => (d.aim < -20 && d.aim > -70 && x < mx - 4 && y < my - 2) || (d.aim > 20 && d.aim < 70 && x < mx - 4 && y > my + 2 && y < my + 40 && x > mx - 40);
  // The gun, turned: every output pixel takes the source pixel it comes from (nearest).
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x - pad - ox - pvx;
      const dy = y - pad - oy - pvy;
      const ux = Math.round(pvx + dx * cos + dy * sin);
      const uy = Math.round(pvy - dx * sin + dy * cos);
      if (ux < 0 || uy < 0 || ux >= w || uy >= h || !inGun(ux, uy)) continue;
      const i = (uy * w + ux) * 4;
      // The flash (past the muzzle) keeps to a cone around the aim: its
      // backward sparks would otherwise land on the face.
      if (ux >= m.x - 2 && Math.abs(d.aim) > 20 && Math.abs(d.aim) < 70) {
        const vx = x - mx;
        const vy = y - my;
        const len = Math.hypot(vx, vy);
        if (len > 4 && (vx * cos + vy * sin) / len < Math.cos((60 * Math.PI) / 180)) continue;
      }
      // Sparks just behind the muzzle but off the barrel's line that land on
      // the face stay off it (the barrel itself runs straight back).
      const back = Math.hypot(x - mx, y - my);
      if (back > 1 && back < 16 && out[(y * W + x) * 4 + 3] && -((x - mx) * cos + (y - my) * sin) / back < Math.cos((25 * Math.PI) / 180)) continue;
      if (sp[i + 3] > 128 && !stray(x, y)) put(x, y, px(i));
    }
  // Loose specks go (8-connected groups under g.minSpeck pixels).
  const seen = new Uint8Array(W * H);
  for (let s0 = 0; s0 < W * H; s0++) {
    if (seen[s0] || !out[s0 * 4 + 3]) continue;
    const stack = [s0];
    const group = [];
    seen[s0] = 1;
    while (stack.length) {
      const q = stack.pop();
      group.push(q);
      const qx = q % W;
      const qy = (q / W) | 0;
      for (let ny = qy - 1; ny <= qy + 1; ny++)
        for (let nx = qx - 1; nx <= qx + 1; nx++) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const k = ny * W + nx;
          if (!seen[k] && out[k * 4 + 3]) {
            seen[k] = 1;
            stack.push(k);
          }
        }
    }
    if (group.length < g.minSpeck) for (const q of group) out[q * 4 + 3] = 0;
  }
  // Trim to what is drawn.
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (out[(y * W + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const full = document.createElement("canvas");
  full.width = W;
  full.height = H;
  full.getContext("2d").putImageData(new ImageData(out, W, H), 0, 0);
  const c = document.createElement("canvas");
  c.width = x1 - x0 + 1;
  c.height = y1 - y0 + 1;
  c.getContext("2d").drawImage(full, -x0, -y0);
  // The feet stay where they were.
  return {
    w: c.width,
    h: c.height,
    px: f.px + pad - x0,
    py: f.py + pad - y0,
    muzzle: { x: Math.round(mx - x0), y: Math.round(my - y0) },
    png: c.toDataURL("image/png"),
  };
}

/** Runs in the page: the muzzle of a frame as it is (the forward shooting frames). */
async function frameMuzzle(f, g) {
  const img = new Image();
  img.src = f.png;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = f.w;
  c.height = f.h;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0);
  return findMuzzle(x.getImageData(0, 0, f.w, f.h).data, f.w, f.h, f, g);
}

const browser = await chromium.launch();
const page = await browser.newPage();
// The cutter runs in the page, where it has a real canvas.
await page.addScriptTag({ content: cutRegion.toString() });
for (const fn of [cutBoxes, shotMuzzle, findMuzzle, aimPose, frameMuzzle]) await page.addScriptTag({ content: fn.toString() });
// DEBUG_ATLAS=1 also writes each sheet with the found frames boxed (green: kept, red: left-facing).
const debug = !!process.env.DEBUG_ATLAS;
fs.mkdirSync(out, { recursive: true });
for (const [name, ch] of Object.entries(CHARACTERS)) {
  const data = "data:image/png;base64," + fs.readFileSync(path.join(src, "raw", `${ch.sheet}.png`)).toString("base64");
  const cut = await page.evaluate(
    async ({ data, jobs, split }) => {
      const img = new Image();
      img.src = data;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, img.width, img.height).data;
      const res = {};
      for (const [anim, r] of Object.entries(jobs))
        res[anim] = r.boxes ? window.cutBoxes(d, img.width, img.height, r.boxes, r.tol ?? undefined) : window.cutRegion(d, img.width, img.height, r[0], r[1], r[2], r[3], split, r[4] ?? undefined, r[5] ?? undefined);
      return res;
    },
    {
      data,
      jobs: Object.fromEntries(
        Object.entries(ch.anims).flatMap(([a, v]) => [
          [a, v.boxes ? { boxes: v.boxes, tol: ch.tolerance } : [...ch.regions[v.region], v.leftAt, ch.tolerance]],
          ...(v.fx ? [[`${a}_fx`, { boxes: v.fx, tol: ch.tolerance }]] : []),
        ]),
      ),
      split: ch.splitLeft,
    },
  );
  if (debug) {
    const shot = await page.evaluate(async ({ data, jobs, split }) => {
      window.DEBUG_BOXES = [];
      const img = new Image();
      img.src = data;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, img.width, img.height).data;
      for (const r of Object.values(jobs)) window.cutRegion(d, img.width, img.height, r[0], r[1], r[2], r[3], split, r[4] ?? undefined, r[5] ?? undefined);
      x.lineWidth = 2;
      for (const reg of window.DEBUG_BOXES) {
        x.strokeStyle = "#ffff00";
        if (reg.leftX < Infinity) x.strokeRect(reg.rx + reg.leftX, reg.ry, 1, 40);
        for (const [bx, by, bw, bh, keep] of reg.boxes) {
          x.strokeStyle = keep ? "#00ff66" : "#ff3344";
          x.strokeRect(reg.rx + bx, reg.ry + by, bw, bh);
        }
      }
      window.DEBUG_BOXES = null;
      return c.toDataURL("image/png");
    }, { data, jobs: Object.fromEntries(Object.entries(ch.anims).filter(([, v]) => v.region && !v.boxes).map(([a, v]) => [a, [...ch.regions[v.region], v.leftAt, ch.tolerance]])), split: ch.splitLeft });
    fs.writeFileSync(path.join(out, `${name}.debug.png`), Buffer.from(shot.split(",")[1], "base64"));
  }
  // The frames kept from the sheet (a row's detached effects become <anim>_fx).
  for (const [a, v] of Object.entries({ ...ch.anims })) if (v.fx) ch.anims[`${a}_fx`] = { fps: v.fps, loop: true };
  const frames = [];
  for (const [anim, list] of Object.entries(cut)) {
    const pick = ch.anims[anim].pick;
    const kept = pick ? pick.map((i) => list[i]).filter(Boolean) : list;
    kept.forEach((f, i) => frames.push({ name: `${anim}_${i}`, anim, ...f }));
  }
  // Where the forward shooting frames' bullets start.
  if (ch.gun) {
    const shooting = frames.filter((f) => f.anim === "machine_gun");
    const muzzles = await page.evaluate(({ shooting, g }) => Promise.all(shooting.map((f) => window.frameMuzzle(f, g))), { shooting, g: ch.gun });
    shooting.forEach((f, i) => (f.muzzle = muzzles[i]));
  }
  // Where a villain's shots start, in its shooting frames.
  if (name !== "player") {
    const shooting = frames.filter((f) => f.anim === "shoot");
    const muzzles = await page.evaluate((shooting) => Promise.all(shooting.map((f) => window.shotMuzzle(f))), shooting);
    shooting.forEach((f, i) => muzzles[i] && (f.muzzle = muzzles[i]));
  }
  // Derived poses (made from frames, so they come back from new sheets too).
  if (ch.derive) {
    for (const d of ch.derive) {
      const all = frames.filter((f) => f.anim === d.from);
      if (d.pickFrames) {
        d.pickFrames.forEach((k, i) => all[k] && frames.push({ ...all[k], name: `${d.name}_${i}`, anim: d.name }));
        ch.anims[d.name] = { fps: d.fps, loop: d.loop };
        continue;
      }
      const donor = d.donor ? frames.find((f) => f.name === d.donor) : undefined;
      const made = await page.evaluate(({ all, d, g, donor }) => Promise.all(all.map((f) => window.aimPose(f, d, g, donor))), { all, d, g: ch.gun, donor });
      made.forEach((f, i) => frames.push({ name: `${d.name}_${i}`, anim: d.name, ...f }));
      ch.anims[d.name] = { fps: d.fps ?? ch.anims[d.from].fps, loop: d.loop ?? ch.anims[d.from].loop };
      if (d.alias) ch.anims[d.alias] = { ...ch.anims[d.name], of: d.name };
    }
  }
  // Pack the frames in rows (2 px apart) into one atlas.
  const ATLAS_W = 1024;
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const f of frames) {
    if (x + f.w > ATLAS_W) {
      x = 0;
      y += rowH + 2;
      rowH = 0;
    }
    f.x = x;
    f.y = y;
    x += f.w + 2;
    rowH = Math.max(rowH, f.h);
  }
  const atlasH = y + rowH;
  const png = await page.evaluate(
    async ({ frames, W, H }) => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const x = c.getContext("2d");
      for (const f of frames) {
        const img = new Image();
        img.src = f.png;
        await img.decode();
        x.drawImage(img, f.x, f.y);
      }
      return c.toDataURL("image/png");
    },
    { frames, W: ATLAS_W, H: atlasH },
  );
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(png.split(",")[1], "base64"));
  const manifest = {
    image: toWebp(out, name),
    frames: Object.fromEntries(frames.map((f) => [f.name, { x: f.x, y: f.y, w: f.w, h: f.h, px: f.px, py: f.py, ...(f.muzzle ? { muzzle: f.muzzle } : {}) }])),
    anims: Object.fromEntries(
      Object.entries(ch.anims).map(([anim, v]) => [anim, { frames: frames.filter((f) => f.anim === (v.of ?? anim)).map((f) => f.name), fps: v.fps, loop: v.loop }]),
    ),
  };
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(manifest));
  console.log(name, Object.entries(manifest.anims).map(([a, v]) => `${a}:${v.frames.length}`).join(" "), `${ATLAS_W}x${atlasH}`);
}
await browser.close();

/**
 * The atlas as lossless WebP when cwebp is installed (about a third lighter,
 * the same pixels: -exact keeps the colors under transparent pixels), else
 * the PNG. Returns the picture's file name for the manifest.
 */
function toWebp(dir, name) {
  const png = path.join(dir, `${name}.png`);
  const webp = path.join(dir, `${name}.webp`);
  try {
    execFileSync("cwebp", ["-quiet", "-lossless", "-z", "9", "-exact", png, "-o", webp]);
    fs.rmSync(png);
    return `${name}.webp`;
  } catch {
    return `${name}.png`;
  }
}
