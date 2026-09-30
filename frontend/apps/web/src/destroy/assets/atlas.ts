// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A character atlas as scripts/destroy-atlas.mjs writes it: one image and a
// manifest with each frame's box, its feet pivot and the animations.

import { frameAt, type AnimDef } from "../engine/anim";

export interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The feet: where the frame stands, from its top left. */
  px: number;
  py: number;
  /** Where the bullets leave the gun, from the frame's top left (gun frames only). */
  muzzle?: { x: number; y: number };
}

export interface Atlas {
  /** The picture (a recolored copy is a canvas). */
  image: HTMLImageElement | HTMLCanvasElement;
  /** Where the picture is served (for CSS backgrounds). */
  url: string;
  frames: Record<string, FrameBox>;
  anims: Record<string, AnimDef>;
}

export async function loadAtlas(base: string, name: string): Promise<Atlas> {
  const res = await fetch(`${base}/${name}.json`);
  if (!res.ok) throw new Error(`atlas ${name}: ${res.status}`);
  const manifest = (await res.json()) as { image: string; frames: Atlas["frames"]; anims: Atlas["anims"] };
  const image = new Image();
  image.src = `${base}/${manifest.image}`;
  await image.decode();
  return { image, url: `${base}/${manifest.image}`, frames: manifest.frames, anims: manifest.anims };
}

/**
 * A recolored copy of an atlas: the pixels whose hue lies in `range` (a
 * character's clothes, degrees, may wrap past 360) turn by `shift` degrees;
 * skin, hair and outlines keep their colors. Pixel art stays crisp: only
 * the hue changes, pixel by pixel.
 */
export function recolor(atlas: Atlas, range: [number, number], shift: number): Atlas {
  const img = atlas.image;
  const w = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const h = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return atlas;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  const inRange = (hue: number) => (range[0] <= range[1] ? hue >= range[0] && hue <= range[1] : hue >= range[0] || hue <= range[1]);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i]! / 255;
    const g = d[i + 1]! / 255;
    const b = d[i + 2]! / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const delta = max - min;
    if (delta < 0.08) continue; // greys and outlines stay
    const sat = delta / (1 - Math.abs(2 * l - 1));
    let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
    if (!inRange(hue)) continue;
    const nh = (hue + shift) % 360;
    // Back from HSL to RGB.
    const cc = (1 - Math.abs(2 * l - 1)) * sat;
    const x = cc * (1 - Math.abs(((nh / 60) % 2) - 1));
    const m = l - cc / 2;
    const [r1, g1, b1] = nh < 60 ? [cc, x, 0] : nh < 120 ? [x, cc, 0] : nh < 180 ? [0, cc, x] : nh < 240 ? [0, x, cc] : nh < 300 ? [x, 0, cc] : [cc, 0, x];
    d[i] = Math.round((r1 + m) * 255);
    d[i + 1] = Math.round((g1 + m) * 255);
    d[i + 2] = Math.round((b1 + m) * 255);
  }
  ctx.putImageData(data, 0, 0);
  return { ...atlas, image: c };
}

/**
 * Draws an animation's frame with its feet at (x, y) in canvas pixels,
 * `height` pixels tall for the tallest idle frame, mirrored when `face` is -1.
 */
export function drawAnim(ctx: CanvasRenderingContext2D, atlas: Atlas, anim: string, t: number, x: number, y: number, scale: number, face: number, frameIndex?: number, alpha = 1): void {
  // An animation the sheet does not have (or lost) falls back to idle.
  const def = atlas.anims[anim]?.frames.length ? atlas.anims[anim] : atlas.anims.idle;
  if (!def) return;
  const name = frameIndex !== undefined ? def.frames[Math.min(def.frames.length - 1, frameIndex)] : frameAt(def, t);
  const f = name ? atlas.frames[name] : undefined;
  if (!f) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y));
  if (face < 0) ctx.scale(-1, 1);
  ctx.drawImage(atlas.image, f.x, f.y, f.w, f.h, -f.px * scale, -f.py * scale, f.w * scale, f.h * scale);
  ctx.restore();
}

/** A frame as a CSS background (for small icons in the HUD). */
export function frameStyle(atlas: Atlas, _base: string, frame: string, height: number): Record<string, string> {
  const f = atlas.frames[frame];
  if (!f) return {};
  const s = height / f.h;
  return {
    width: `${Math.round(f.w * s)}px`,
    height: `${height}px`,
    backgroundImage: `url(${atlas.url})`,
    backgroundPosition: `${-f.x * s}px ${-f.y * s}px`,
    backgroundSize: `${(atlas.image instanceof HTMLImageElement ? atlas.image.naturalWidth : atlas.image.width) * s}px ${(atlas.image instanceof HTMLImageElement ? atlas.image.naturalHeight : atlas.image.height) * s}px`,
  };
}

/**
 * The gun's muzzle in an animation's first frame, from the feet in drawn
 * pixels (x forward, y up), or null when the frame has none.
 */
export function muzzleOf(atlas: Atlas, anim: string, scale: number): { x: number; y: number } | null {
  const name = atlas.anims[anim]?.frames[0];
  const f = name ? atlas.frames[name] : undefined;
  if (!f?.muzzle) return null;
  return { x: (f.muzzle.x - f.px) * scale, y: (f.py - f.muzzle.y) * scale };
}
