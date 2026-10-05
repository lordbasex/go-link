// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The browser's side of the importer: pictures in and out through a
// canvas. Kept apart so the rest stays pure (and tests can replace it).

import type { Rgba } from "./detect";

/** The pixels of a picture file (PNG, WebP, JPEG: anything the browser opens). */
export async function decodeImage(bytes: Uint8Array, type = "image/png"): Promise<Rgba> {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d canvas");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { w: canvas.width, h: canvas.height, data };
}

/** A PNG file of RGBA pixels. */
export async function encodePng(w: number, h: number, rgba: Uint8Array): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("png encoding failed");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Draws RGBA pixels on a canvas, one canvas pixel per picture pixel. */
export function paint(canvas: HTMLCanvasElement, w: number, h: number, rgba: Uint8Array): void {
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext("2d");
  if (!ctx || !w || !h) return;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
}
