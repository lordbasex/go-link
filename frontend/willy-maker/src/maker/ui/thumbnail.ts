// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A level's small picture (the zip's thumbnails/): its first two screens.

import type { Level } from "../model";
import { drawOverview, FALLBACK_PALETTE } from "./render";

export async function levelThumbnail(level: Level): Promise<Uint8Array | null> {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 224;
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return null;
  const crop = { ...level, size: { w: Math.min(level.size.w, 768), h: level.size.h } };
  drawOverview(ctx, crop, 384, 224, FALLBACK_PALETTE);
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/png");
    } catch {
      resolve(null);
    }
  });
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
