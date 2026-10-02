// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The characters play mode draws: the built-in ones (Willy, players 2-4 in
// other shirts, the Glitch-9 android and the civilians, from the site's
// character atlases in public/destroy) and a project's own heroes, from the
// picture Characters saved (characterSheet). A sheet that fails to load
// leaves its characters drawn as boxes.

import type { Character } from "../model";

export interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The feet, from the frame's top left. */
  px: number;
  py: number;
}

export interface AnimDef {
  frames: string[];
  fps: number;
  loop: boolean;
}

export interface Sheet {
  image: CanvasImageSource;
  frames: Record<string, FrameBox>;
  anims: Record<string, AnimDef>;
}

export interface PlaySprites {
  /** Willy for players 1-4 (the shirt recolored for 2-4). */
  heroes: Sheet[];
  enemy: Sheet | null;
  civilians: Sheet | null;
}

/** On-screen heights in board pixels (art-spec.md): heroes 44, androids 46, civilians by kind. */
export const HEIGHTS = { hero: 44, enemy: 46, woman: 40, elder: 40, child: 30, baby: 22 } as const;

/** Each extra player's shirt: a hue turn on Willy's colored clothes. */
const PLAYER_SHIFTS = [0, 110, 200, 290];

async function loadSheet(base: string, name: string): Promise<Sheet> {
  const res = await fetch(`${base}/${name}.json`);
  if (!res.ok) throw new Error(`sheet ${name}: ${res.status}`);
  const m = (await res.json()) as { image: string; frames: Sheet["frames"]; anims: Sheet["anims"] };
  const image = new Image();
  image.src = `${base}/${m.image}`;
  await image.decode();
  return { image, frames: m.frames, anims: m.anims };
}

/** The built-in sheets (missing ones stay null; the view still plays). */
export async function loadPlaySprites(base: string): Promise<PlaySprites> {
  const [hero, enemy, civilians] = await Promise.all(["player", "robot", "npcs"].map((n) => loadSheet(base, n).catch(() => null)));
  const heroes = hero ? PLAYER_SHIFTS.map((s) => (s ? recolor(hero, s) : hero)) : [];
  return { heroes, enemy: enemy ?? null, civilians: civilians ?? null };
}

/**
 * A project's own character as a sheet: its saved picture (frames packed
 * 1:1 at board scale), its frames by id and its animations. Null when the
 * picture cannot be loaded or there are no frames.
 */
export async function characterSheet(ch: Character, url: (ref: string) => Promise<string | null>): Promise<Sheet | null> {
  if (!ch.sheet || !ch.frames.length) return null;
  const src = await url(ch.sheet);
  if (!src || typeof Image === "undefined") return null;
  const image = new Image();
  image.src = src;
  await image.decode();
  const frames: Record<string, FrameBox> = {};
  for (const f of ch.frames) frames[f.id] = { x: f.x, y: f.y, w: f.w, h: f.h, px: f.px, py: f.py };
  const anims: Record<string, AnimDef> = {};
  for (const [name, a] of Object.entries(ch.anims ?? {})) anims[name] = { frames: a.frames.filter((id) => frames[id]), fps: a.fps, loop: a.loop };
  return { image, frames, anims };
}

/** The animation a hero sheet has for a move play mode asks for: an own character may name it differently or not have it. */
export function heroAnim(sheet: Sheet, anim: string): string {
  const options: Record<string, string[]> = {
    run: ["run", "walk"],
    // the Characters tab's names (sprites/presets.ts) first: shoot, knife, special
    machine_gun: ["shoot", "fire", "machine_gun"],
    knife: ["knife", "melee", "shoot", "fire"],
    bazooka: ["bazooka", "special", "shoot", "fire"],
    jump: ["jump"],
    // the moves (docs/willy-maker/moves.md) and their fallbacks
    crouch: ["crouch"],
    crawl: ["crawl", "crouch", "walk", "run"],
    land: ["land"],
    turn: ["turn", "run", "walk"],
    jump_kick: ["jump_kick", "knife", "jump"],
    thumbs_up: ["thumbs_up"],
    victory: ["victory", "thumbs_up"],
    yawn: ["yawn", "bored"],
    double_jump: ["double_jump", "jump"],
    jetpack: ["jetpack", "jump"],
  };
  return (options[anim] ?? [anim]).find((n) => sheet.anims[n]?.frames.length) ?? "idle";
}

/**
 * A copy of a sheet whose saturated, non-skin colors turn by `shift`
 * degrees of hue: the clothes change, skin, hair and outlines stay.
 */
export function recolor(sheet: Sheet, shift: number): Sheet {
  const img = sheet.image as HTMLImageElement;
  const w = img.naturalWidth || (img as unknown as HTMLCanvasElement).width;
  const h = img.naturalHeight || (img as unknown as HTMLCanvasElement).height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx || !w || !h) return sheet;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i]! / 255;
    const g = d[i + 1]! / 255;
    const b = d[i + 2]! / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta < 0.12) continue; // greys, black and outlines stay
    const l = (max + min) / 2;
    const sat = delta / (1 - Math.abs(2 * l - 1));
    let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
    if (hue < 45 || hue > 340) continue; // skin and hair
    const nh = (hue + shift) % 360;
    const cc = (1 - Math.abs(2 * l - 1)) * sat;
    const x = cc * (1 - Math.abs(((nh / 60) % 2) - 1));
    const m = l - cc / 2;
    const [r1, g1, b1] = nh < 60 ? [cc, x, 0] : nh < 120 ? [x, cc, 0] : nh < 180 ? [0, cc, x] : nh < 240 ? [0, x, cc] : nh < 300 ? [x, 0, cc] : [cc, 0, x];
    d[i] = Math.round((r1 + m) * 255);
    d[i + 1] = Math.round((g1 + m) * 255);
    d[i + 2] = Math.round((b1 + m) * 255);
  }
  ctx.putImageData(data, 0, 0);
  return { ...sheet, image: c };
}

/** The frame an animation shows `frame` game frames after it started. */
export function frameOf(sheet: Sheet, anim: string, frame: number): FrameBox | undefined {
  const def = sheet.anims[anim]?.frames.length ? sheet.anims[anim] : sheet.anims.idle;
  if (!def?.frames.length) return undefined;
  const n = def.frames.length;
  const i = Math.floor((Math.max(0, frame) / 60) * def.fps);
  const name = def.frames[def.loop ? i % n : Math.min(n - 1, i)];
  return name ? sheet.frames[name] : undefined;
}

/**
 * Draws a frame with its feet at (x, y) in board pixels, `height` board
 * pixels tall for the sheet's reference frame (`ref`), mirrored when flipped.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, sheet: Sheet, f: FrameBox, ref: FrameBox | undefined, x: number, y: number, height: number, flip: boolean, alpha = 1): void {
  const s = height / (ref?.py ?? f.py);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y));
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sheet.image, f.x, f.y, f.w, f.h, -f.px * s, -f.py * s, f.w * s, f.h * s);
  ctx.restore();
}
