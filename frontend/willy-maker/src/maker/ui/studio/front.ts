// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The foreground in the editor (model/front.ts, editor/front.ts): Insert ›
// Foreground puts a picture in front of everything, standing on the level's
// bottom where the view is; changing a piece's height, adding or removing
// one fits every piece again to one palette and writes the level's front
// tileset, as one undo step. Moving a piece or changing its speed keeps its
// tiles.

import { fitFront, pieceKeys } from "../../editor/front";
import type { EditorStore } from "../../editor/store";
import { putAsset } from "../../io/assets";
import { FRONT_MAX, FRONT_SPEED, frontPaletteId, frontTilesetId, type FrontPiece, type Level } from "../../model";
import { encodeCells } from "../../model/rle";
import { checkSheetFile } from "../../sprites/sheetInput";
import { decodeImage, encodePng } from "../../sprites/image";
import { hasAiMagenta, isImageFile, sceneSource, sceneSources, type BackgroundResult } from "./background";

export type FrontResult = BackgroundResult | "full" | "empty";

/** A new piece from a picture file, its left edge at `x`, about four fifths of the level high, standing on the bottom. */
export async function addFrontPiece(store: EditorStore, levelId: string, file: File, x: number, label: string): Promise<FrontResult> {
  if (!isImageFile(file)) return "not-image";
  const level = store.level(levelId);
  if (!level) return "failed";
  if ((level.front?.length ?? 0) >= FRONT_MAX.pieces) return "full";
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = checkSheetFile(bytes, file.type) || file.type || "image/png";
    const asset = await putAsset(bytes, type);
    sceneSources.set(asset, await decodeImage(bytes, type));
    const h = Math.round((level.size.h * 0.8) / 16) * 16;
    const piece: FrontPiece = { id: `front-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, asset, name: file.name, x: Math.round(x), y: level.size.h - h, h, speed: FRONT_SPEED.initial, cols: 1, rows: 1, cells: "" };
    return await fitPieces(store, levelId, [...(level.front ?? []), piece], label);
  } catch {
    return "failed";
  }
}

/**
 * Fits the pieces to the board and keeps them with the level (with the
 * front tileset and its palette), as one undo step; with no pieces, the
 * foreground goes. A piece whose picture cannot be read, or draws nothing,
 * is left out.
 */
export async function fitPieces(store: EditorStore, levelId: string, pieces: readonly FrontPiece[], label: string): Promise<FrontResult> {
  try {
    const level = store.level(levelId);
    if (!level) return "failed";
    const kept: { piece: FrontPiece; keys: NonNullable<ReturnType<typeof pieceKeys>> }[] = [];
    for (const p of pieces) {
      const src = await sceneSource(p.asset);
      const keys = src ? pieceKeys(src, p.h, hasAiMagenta(src)) : null;
      if (keys) kept.push({ piece: p, keys });
    }
    if (pieces.length && !kept.length) return "empty";
    const fitted = kept.length ? fitFront(kept.map((k) => k.keys)) : null;
    const image = fitted ? await putAsset(await encodePng(fitted.fit.tileset.w, fitted.fit.tileset.h, fitted.fit.tileset.data), "image/png") : null;
    store.editProject(label, (p) => {
      const l = p.levels.find((x) => x.id === levelId);
      if (!l) return;
      const tsId = frontTilesetId(levelId);
      const palId = frontPaletteId(levelId);
      p.tilesets = p.tilesets.filter((t) => t.id !== tsId);
      p.palettes = p.palettes.filter((x) => x.id !== palId);
      if (!fitted || !image) {
        delete l.front;
        return;
      }
      p.palettes.push({ id: palId, group: "sprite", colors: fitted.fit.palettes[0] ?? [] });
      p.tilesets.push({ id: tsId, tile: 16, image, palettes: [palId], columns: fitted.fit.tileset.columns, count: fitted.fit.tileset.count });
      l.front = kept.map(({ piece, keys }, i) => {
        const f = fitted.pieces[i]!;
        return { ...piece, h: keys.h, cols: f.cols, rows: f.rows, cells: encodeCells(f.cells) };
      });
    });
    return "ok";
  } catch {
    return "failed";
  }
}

/** Moves a piece or changes its speed (its tiles stay). */
export function patchPiece(store: EditorStore, levelId: string, id: string, patch: Partial<Pick<FrontPiece, "x" | "y" | "speed">>, label: string): void {
  store.editLevel(label, levelId, (l: Level) => {
    const p = l.front?.find((x) => x.id === id);
    if (!p) return;
    if (patch.x !== undefined) p.x = Math.round(patch.x);
    if (patch.y !== undefined) p.y = Math.round(patch.y);
    if (patch.speed !== undefined) p.speed = Math.max(FRONT_SPEED.min, Math.min(FRONT_SPEED.max, Math.round(patch.speed)));
  });
}

/** A piece at a new height (fitted again), or without it. */
export function resizePiece(store: EditorStore, levelId: string, id: string, h: number, label: string): Promise<FrontResult> {
  const level = store.level(levelId);
  const pieces = (level?.front ?? []).map((p) => (p.id === id ? { ...p, y: p.y + p.h - Math.round(h), h: Math.round(h) } : { ...p }));
  return fitPieces(store, levelId, pieces, label);
}

export function removePiece(store: EditorStore, levelId: string, id: string, label: string): Promise<FrontResult> {
  const level = store.level(levelId);
  return fitPieces(store, levelId, (level?.front ?? []).filter((p) => p.id !== id), label);
}

export function duplicatePiece(store: EditorStore, levelId: string, id: string, label: string): Promise<FrontResult> {
  const level = store.level(levelId);
  const p = level?.front?.find((x) => x.id === id);
  if (!level || !p || (level.front?.length ?? 0) >= FRONT_MAX.pieces) return Promise.resolve("full");
  return fitPieces(store, levelId, [...level.front!, { ...p, id: `front-${Date.now().toString(36)}`, x: p.x + p.cols * 16 * 2 }], label);
}
