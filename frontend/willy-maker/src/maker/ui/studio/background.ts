// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Insert background: a picture of the user's own becomes the level's play
// layer (the one that scrolls with the level, so the zones drawn on it stay
// where they belong in the game), fitted to the board's colors, palettes and
// tiles (editor/picture.ts) as one undo step. The picture is scaled to the
// level's height and the level grows when the picture is wider; a growing
// level ends on the 32 px grid, so the picture is stretched (a few pixels at
// most) to end there too and no strip of the level is left without art.

import { setPicture, preparePicture, type PreparedPicture } from "../../editor/pictureImport";
import type { EditorStore } from "../../editor/store";
import { putAsset } from "../../io/assets";
import type { AssetRef, Level, Project } from "../../model";
import { checkSheetFile } from "../../sprites/sheetInput";
import { decodeImage, encodePng } from "../../sprites/image";
import type { Rgba } from "../../sprites/detect";

export type BackgroundResult = "ok" | "not-image" | "failed";

export function isImageFile(f: File): boolean {
  return f.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name);
}

/** Fits a picture file to a level's play layer and stores the tileset picture; throws when it cannot be read. */
export async function fitBackground(level: Level, file: File, grow: boolean): Promise<{ prepared: PreparedPicture; asset: AssetRef }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = checkSheetFile(bytes, file.type);
  const decoded = await decodeImage(bytes, type || file.type || "image/png");
  const rgba = grow ? onLevelGrid(decoded, level.size.h) : decoded;
  const prepared = preparePicture(level, rgba, { layer: "play", height: level.size.h, x: 0, repeat: false, grow, keyMagenta: false }, null);
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

export async function importBackground(store: EditorStore, levelId: string, file: File, label: string): Promise<BackgroundResult> {
  if (!isImageFile(file)) return "not-image";
  try {
    const level = store.level(levelId);
    if (!level) return "failed";
    const fitted = await fitBackground(level, file, true);
    store.editProject(label, (p) => putBackground(p, fitted, file.name));
    return "ok";
  } catch {
    return "failed";
  }
}
