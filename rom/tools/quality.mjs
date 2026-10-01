// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Before/after pictures for the sprite conversion (journal, step 2b):
// for a few frames, the atlas frame, the first conversion (box filter, one
// 15-color palette per character) and the new one (dominant color, several
// palettes per tile, CPS-1 colors), all at the same displayed size; then
// the new conversion at three heights on a 384x224 screen. Prints the
// color errors and the palette budget.
//
//   node rom/tools/quality.mjs   -> rom/build/quality/*.png

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHARACTERS, fillEnclosed, legacyScale, legacyQuantize, splitPoses, SHEETS } from "./art.mjs";
import { readImage, writePng } from "./png.mjs";
import { convertCharacter, downscaleDominant, gridScore, renderFrame } from "./sprites.mjs";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "build", "quality");
fs.mkdirSync(OUT, { recursive: true });
const tmp = path.join(OUT, "tmp.png");

/** The character's frames in ROM order (same rules as art.mjs). */
function sourceFrames(ch, img, json) {
  return ch.anims.flatMap((a) =>
    json.anims[a].frames.flatMap((name) => (ch.splitPoses?.includes(a) ? splitPoses(img, json.frames[name]) : [json.frames[name]])).map((f) => ({ f, anim: a })),
  );
}

// a canvas of RGBA pictures placed side by side, scaled by nearest neighbour
function compose(items, gap = 12, bg = [34, 30, 46]) {
  const W = items.reduce((s, it) => s + it.w * it.z + gap, gap);
  const H = Math.max(...items.map((it) => it.h * it.z + (it.dy || 0))) + gap * 2;
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) [out[i * 4], out[i * 4 + 1], out[i * 4 + 2], out[i * 4 + 3]] = [...bg, 255];
  let x0 = gap;
  for (const it of items) {
    const y0 = H - gap - it.h * it.z;
    for (let y = 0; y < it.h * it.z; y++)
      for (let x = 0; x < it.w * it.z; x++) {
        const o = (Math.floor(y / it.z) * it.w + Math.floor(x / it.z)) * 4;
        if (it.rgba[o + 3] < 128) continue;
        const d = ((y0 + y) * W + x0 + x) * 4;
        out[d] = it.rgba[o];
        out[d + 1] = it.rgba[o + 1];
        out[d + 2] = it.rgba[o + 2];
      }
    x0 += it.w * it.z + gap;
  }
  return { w: W, h: H, rgba: out };
}

function crop(img, f) {
  const rgba = Buffer.alloc(f.w * f.h * 4);
  for (let y = 0; y < f.h; y++) img.rgba.copy(rgba, y * f.w * 4, ((f.y + y) * img.w + f.x) * 4, ((f.y + y) * img.w + f.x + f.w) * 4);
  return { w: f.w, h: f.h, rgba };
}

const legacyRender = (fr, pal) => {
  const rgba = Buffer.alloc(fr.w * fr.h * 4);
  for (let y = 0; y < fr.h; y++)
    for (let x = 0; x < fr.w; x++) {
      const pen = fr.pens[y][x];
      if (pen === 15) continue;
      const o = (y * fr.w + x) * 4;
      [rgba[o], rgba[o + 1], rgba[o + 2]] = pal[pen];
      rgba[o + 3] = 255;
    }
  return { w: fr.w, h: fr.h, rgba };
};

const SHOW = { willy: ["idle", "run", "machine_gun", "jump"], woman: ["woman_worried"], child: ["child_worried"], robot: ["walk"] };
const sheets = {};
const report = [];
for (const ch of CHARACTERS) {
  if (!sheets[ch.sheet]) sheets[ch.sheet] = { img: readImage(path.join(SHEETS, `${ch.sheet}.webp`), tmp), json: JSON.parse(fs.readFileSync(path.join(SHEETS, `${ch.sheet}.json`), "utf8")) };
  const { img, json } = sheets[ch.sheet];
  const src = sourceFrames(ch, img, json);
  const s = ch.height / src[0].f.h;
  // the first conversion
  const old = src.map(({ f }) => legacyScale(img, f, s, ch.fillHoles));
  const oldPal = legacyQuantize(old);
  // the new one
  const dominant = (f, sc) => {
    const fr = downscaleDominant(img, f, sc);
    if (ch.fillHoles) fillEnclosed(fr.rgba, fr.w, fr.h, [22, 22, 28]);
    return fr;
  };
  const fresh = src.map(({ f }) => dominant(f, s));
  const conv = convertCharacter(fresh, ch.palettes);
  report.push({ name: ch.name, height: ch.height, grid: gridScore(img, src.slice(0, 8).map((x) => x.f)), ...conv.stats });
  const rows = [];
  for (const anim of SHOW[ch.name] || []) {
    const i = src.findIndex((x) => x.anim === anim) + (anim === "run" || anim === "jump" ? 2 : 0);
    const f = src[i].f;
    const zOrig = 2;
    const zConv = Math.max(1, Math.round((f.h * zOrig) / old[i].h));
    rows.push({ ...crop(img, f), z: zOrig }, { ...legacyRender(old[i], oldPal), z: zConv }, { ...renderFrame(conv, i), z: zConv });
  }
  if (rows.length) {
    const pic = compose(rows);
    writePng(path.join(OUT, `compare-${ch.name}.png`), pic.w, pic.h, pic.rgba);
  }
  if (ch.name === "willy") {
    // three heights (step 4: Metal Slug scale), at x3
    const items = [];
    for (const hgt of [40, 44, 48]) {
      const s2 = hgt / src[0].f.h;
      const fr = src.map(({ f }) => dominant(f, s2));
      const cv = convertCharacter(fr, ch.palettes);
      items.push({ ...renderFrame(cv, 0), z: 3 }, { ...renderFrame(cv, src.findIndex((x) => x.anim === "run") + 2), z: 3 }, { ...renderFrame(cv, src.findIndex((x) => x.anim === "machine_gun") + 1), z: 3 });
    }
    const pic = compose(items, 24);
    writePng(path.join(OUT, "heights-willy.png"), pic.w, pic.h, pic.rgba);
  }
}
fs.rmSync(tmp, { force: true });
console.table(report);
