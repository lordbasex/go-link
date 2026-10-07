// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Insert background: a picture of the user's own becomes the level's play
// layer (the one that scrolls with the level, so the zones drawn on it stay
// where they belong in the game), fitted to the board's colors, palettes and
// tiles (editor/picture.ts) as one undo step. The picture is scaled to the
// level's height and the level grows when the picture is wider; a growing
// level ends on the 32 px grid, so the picture is stretched (a few pixels at
// most) to end there too and no strip of the level is left without art.
// Add scene puts another picture (or the same art again) after the level's
// end, so the background goes on: the level grows by its width. A picture
// with an image AI's magenta sky comes in with that sky see-through, and a
// far background (a skyline) goes on the far layer behind it, repeated
// across, scrolling at half speed in the game (parallax). A background
// made of scenes (Level.scenes, editor/scenes.ts) keeps each picture: they
// can be moved, scaled and lined up, and the art is laid out again.

import { setPicture, preparePicture, type PreparedPicture } from "../../editor/pictureImport";
import { isMagenta } from "../../editor/picture";
import type { EditorStore } from "../../editor/store";
import { putAsset } from "../../io/assets";
import type { AssetRef, Level, Project } from "../../model";
import { checkSheetFile } from "../../sprites/sheetInput";
import { decodeImage, encodePng } from "../../sprites/image";
import type { Rgba } from "../../sprites/detect";
import { drawArt, type TileImage } from "../render";
import type { TileLayer } from "../../model";
import { decodeCells } from "../../model/rle";
import { getAsset } from "../../io/assets";
import { fitLayer } from "../../editor/picture";
import { composeScenes, lineUpFloors, nextSceneX } from "../../editor/scenes";
import type { BackgroundScene } from "../../model";

export type BackgroundResult = "ok" | "not-image" | "failed";

/** An image AI's flat magenta background or sky: at least 3 % of the picture is magenta (it is then made see-through). */
export function hasAiMagenta(src: Rgba): boolean {
  let n = 0;
  const step = 4 * 7;
  let seen = 0;
  for (let i = 0; i < src.data.length; i += step) {
    seen++;
    if (src.data[i + 3]! >= 128 && isMagenta(src.data[i]!, src.data[i + 1]!, src.data[i + 2]!)) n++;
  }
  return seen > 0 && n / seen >= 0.03;
}

export function isImageFile(f: File): boolean {
  return f.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name);
}

/** Fits a picture file to a level's play layer and stores the tileset picture; throws when it cannot be read. */
export async function fitBackground(level: Level, file: File, grow: boolean): Promise<{ prepared: PreparedPicture; asset: AssetRef }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = checkSheetFile(bytes, file.type);
  const decoded = await decodeImage(bytes, type || file.type || "image/png");
  const rgba = grow ? onLevelGrid(decoded, level.size.h) : decoded;
  const prepared = preparePicture(level, rgba, { layer: "play", height: level.size.h, x: 0, repeat: false, grow, keyMagenta: hasAiMagenta(decoded) }, null);
  const ts = prepared.fit.tileset;
  const asset = await putAsset(await encodePng(ts.w, ts.h, ts.data), "image/png");
  return { prepared, asset };
}

/**
 * The picture stretched across so that, scaled to `height`, it is a whole number of 32 px columns
 * wide (the grid a level grows on), or as it is when it already is or cannot be made to.
 */
export function onLevelGrid(src: Rgba, height: number): Rgba {
  const f = src.h / height;
  const target = Math.max(32, Math.round(src.w / f / 32) * 32);
  const w = Math.round(target * f);
  if (w === src.w || Math.round(w / f) !== target) return src;
  const data = new Uint8ClampedArray(w * src.h * 4);
  for (let x = 0; x < w; x++) {
    const sx = Math.min(src.w - 1, Math.floor((x * src.w) / w));
    for (let y = 0; y < src.h; y++) {
      const o = (y * w + x) * 4;
      const i = (y * src.w + sx) * 4;
      data[o] = src.data[i]!;
      data[o + 1] = src.data[i + 1]!;
      data[o + 2] = src.data[i + 2]!;
      data[o + 3] = src.data[i + 3]!;
    }
  }
  return { w, h: src.h, data };
}

/** Puts a fitted picture into the project and remembers the file's name (for the background's properties and layer row). */
export function putBackground(p: Project, fitted: { prepared: PreparedPicture; asset: AssetRef }, fileName: string): void {
  setPicture(p, fitted.prepared, fitted.asset);
  const set = p.tilesets.find((t) => t.id === `ts-pic-${fitted.prepared.levelId}-play`);
  if (set) (set as unknown as Record<string, unknown>).file = fileName;
}

/** Insert background: the picture becomes the background's one scene (replacing every other), laid out. */
export async function importBackground(store: EditorStore, levelId: string, file: File, label: string): Promise<BackgroundResult> {
  if (!isImageFile(file)) return "not-image";
  try {
    const scene = await newScene(file, 0);
    if (!scene) return "failed";
    return await layOutScenes(store, levelId, [scene], label);
  } catch {
    return "failed";
  }
}

// the scenes' pictures, decoded once per session
export const sceneSources = new Map<string, Rgba>();
export async function sceneSource(asset: string): Promise<Rgba | null> {
  const hit = sceneSources.get(asset);
  if (hit) return hit;
  const stored = await getAsset(asset);
  if (!stored) return null;
  const rgba = await decodeImage(stored.bytes, stored.type || "image/png");
  sceneSources.set(asset, rgba);
  return rgba;
}
async function sourcesOf(scenes: readonly BackgroundScene[]): Promise<Map<string, Rgba>> {
  const out = new Map<string, Rgba>();
  for (const s of scenes) {
    const src = await sceneSource(s.asset);
    if (src) out.set(s.asset, src);
  }
  return out;
}

/** A new scene from a picture file: the file kept as an asset, standing on the level's bottom at full height. */
async function newScene(file: File, x: number): Promise<BackgroundScene | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = checkSheetFile(bytes, file.type) || file.type || "image/png";
  const asset = await putAsset(bytes, type);
  const rgba = await decodeImage(bytes, type);
  sceneSources.set(asset, rgba);
  return { id: `scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, asset, name: file.name, x, dy: 0, scale: 1 };
}

/**
 * Lays the scenes out as the background (the play layer's art, fitted to the
 * board) and keeps them with the level, as one undo step. Scenes whose
 * picture cannot be read are kept but left out of the art.
 */
export async function layOutScenes(store: EditorStore, levelId: string, scenes: BackgroundScene[], label: string): Promise<BackgroundResult> {
  try {
    const level = store.level(levelId);
    if (!level) return "failed";
    const sources = await sourcesOf(scenes);
    const { keys, width } = composeScenes(level, scenes, sources, hasAiMagenta);
    const fit = fitLayer(keys, 16);
    const prepared = { options: { layer: "play" as const, height: level.size.h, x: 0, repeat: false, grow: true }, levelId, width, picture: { w: keys.w, h: keys.h, pixelSize: 1 }, fit, preview: keys } satisfies PreparedPicture;
    const asset = await putAsset(await encodePng(fit.tileset.w, fit.tileset.h, fit.tileset.data), "image/png");
    store.editProject(label, (p) => {
      putBackground(p, { prepared, asset }, scenes.map((s) => s.name).join(" + "));
      const l = p.levels.find((x) => x.id === levelId);
      if (l) l.scenes = scenes.map((s) => ({ ...s }));
    });
    return "ok";
  } catch {
    return "failed";
  }
}

/** Line up the floor: every scene moved up or down so its floor line meets the first one's, laid out again. */
export async function lineUpScenes(store: EditorStore, levelId: string, label: string): Promise<BackgroundResult> {
  const level = store.level(levelId);
  if (!level?.scenes?.length) return "failed";
  const sources = await sourcesOf(level.scenes);
  return layOutScenes(store, levelId, lineUpFloors(level, level.scenes, sources), label);
}

/** A tileset picture's pixels, from the image the canvas already draws (null when it is not loaded). */
export function tilesetPixels(img: TileImage | undefined): { rgba: Rgba; columns: number } | null {
  if (!img || typeof document === "undefined") return null;
  const el = img.img as HTMLImageElement;
  const w = el.naturalWidth || (el as unknown as { width: number }).width;
  const h = el.naturalHeight || (el as unknown as { height: number }).height;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(el, 0, 0);
  return { rgba: { w, h, data: ctx.getImageData(0, 0, w, h).data }, columns: img.columns };
}

/** The level's art as one picture at board scale (what the canvas shows), or null when it cannot be drawn. */
export function levelPicture(level: Level, images: Map<string, TileImage>): Rgba | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = level.size.w;
  canvas.height = level.size.h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  drawArt(ctx, level, { x: 0, y: 0, zoom: 1, w: level.size.w, h: level.size.h }, 1, images);
  return { w: level.size.w, h: level.size.h, data: ctx.getImageData(0, 0, level.size.w, level.size.h).data };
}

/** Where the background's art ends: the right edge of its last drawn column (0 when it has none). */
export function artEnd(level: Level): number {
  const play = level.layers.find((l): l is TileLayer => l.kind === "tiles" && l.id === "play");
  if (!play) return 0;
  const cols = Math.ceil(level.size.w / play.grid);
  const rows = Math.ceil(level.size.h / play.grid);
  const cells = decodeCells(play.data, cols * rows);
  for (let c = cols - 1; c >= 0; c--) for (let r = 0; r < rows; r++) if (cells[r * cols + c]! > 0) return Math.min(level.size.w, (c + 1) * play.grid);
  return 0;
}

/**
 * Add scene: a picture file (or `"repeat"`: the background's own art again)
 * goes after the end of the background's art (not of the level, which may be
 * wider) on the play layer, scaled to the level's height, and
 * the level grows by its width; the art already there stays, as one undo
 * step. The same art repeated adds no new tiles.
 */
export async function appendBackground(store: EditorStore, levelId: string, images: Map<string, TileImage>, source: File | "repeat", label: string): Promise<BackgroundResult> {
  if (source !== "repeat" && !isImageFile(source)) return "not-image";
  try {
    const level = store.level(levelId);
    if (!level) return "failed";
    // a background made of scenes: one more scene after the last
    if (level.scenes?.length) {
      const scenes = level.scenes.map((s) => ({ ...s }));
      const at = nextSceneX(level, scenes, await sourcesOf(scenes));
      const added = source === "repeat" ? { ...scenes[scenes.length - 1]!, id: `scene-${Date.now().toString(36)}`, x: at } : await newScene(source, at);
      if (!added) return "failed";
      return await layOutScenes(store, levelId, [...scenes, added], label);
    }
    let src: Rgba | null;
    let key = false;
    const end = artEnd(level);
    if (source === "repeat") {
      // the drawn part only: a wider level's empty end is not repeated
      const whole = levelPicture(level, images);
      src = whole && end ? { w: end, h: whole.h, data: cropColumns(whole, end) } : whole;
    }
    else {
      const bytes = new Uint8Array(await source.arrayBuffer());
      const type = checkSheetFile(bytes, source.type);
      const decoded = await decodeImage(bytes, type || source.type || "image/png");
      key = hasAiMagenta(decoded);
      src = onLevelGrid(decoded, level.size.h);
    }
    if (!src) return "failed";
    const play = level.layers.find((l): l is TileLayer => l.kind === "tiles" && l.id === "play");
    const current = tilesetPixels(images.get(play?.tileset ?? ""));
    const prepared = preparePicture(level, src, { layer: "play", height: level.size.h, x: end || level.size.w, repeat: false, grow: true, keyMagenta: key }, current);
    const ts = prepared.fit.tileset;
    const asset = await putAsset(await encodePng(ts.w, ts.h, ts.data), "image/png");
    store.editProject(label, (p) => {
      const before = p.tilesets.find((t) => t.id === `ts-pic-${levelId}-play`) as unknown as { file?: string } | undefined;
      putBackground(p, { prepared, asset }, source === "repeat" ? (before?.file ?? "") : before?.file ? `${before.file} + ${source.name}` : source.name);
    });
    return "ok";
  } catch {
    return "failed";
  }
}

/** The far background's file name, or null when the far layer has no picture. */
export function farBackgroundFile(p: Project, level: Level): string | null {
  const id = `ts-pic-${level.id}-far`;
  const set = p.tilesets.find((t) => t.id === id) as unknown as { file?: string } | undefined;
  const far = level.layers.find((l): l is TileLayer => l.kind === "tiles" && l.id === "far");
  if (!set || !far || far.tileset !== id) return null;
  // removed: the layer keeps its tileset but has no cell drawn
  const cells = decodeCells(far.data, Math.ceil(level.size.w / far.grid) * Math.ceil(level.size.h / far.grid));
  return cells.some((v) => v > 0) ? (set.file ?? "") : null;
}

/**
 * A far background: a skyline on the far layer (32 px tiles, its own 32
 * palettes), scaled to the level's height and repeated across it, behind
 * the background; the game scrolls it at half speed (parallax), so it
 * needs to be only about half the level's width plus a screen. One undo step.
 */
export async function importFarBackground(store: EditorStore, levelId: string, file: File, label: string): Promise<BackgroundResult> {
  if (!isImageFile(file)) return "not-image";
  try {
    const level = store.level(levelId);
    if (!level) return "failed";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = checkSheetFile(bytes, file.type);
    const decoded = await decodeImage(bytes, type || file.type || "image/png");
    const prepared = preparePicture(level, decoded, { layer: "far", height: level.size.h, x: 0, repeat: true, grow: false, keyMagenta: false }, null);
    const ts = prepared.fit.tileset;
    const asset = await putAsset(await encodePng(ts.w, ts.h, ts.data), "image/png");
    store.editProject(label, (p) => {
      setPicture(p, prepared, asset);
      const set = p.tilesets.find((t) => t.id === `ts-pic-${levelId}-far`);
      if (set) (set as unknown as Record<string, unknown>).file = file.name;
    });
    return "ok";
  } catch {
    return "failed";
  }
}

/** The left `w` columns of a picture. */
function cropColumns(src: Rgba, w: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * src.h * 4);
  for (let y = 0; y < src.h; y++) out.set(src.data.subarray(y * src.w * 4, (y * src.w + w) * 4), y * w * 4);
  return out;
}
