// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The browser's side of the importer: pictures in and out through a
// canvas. Kept apart so the rest stays pure (and tests can replace it).

import type { Rgba } from "./detect";
import type { Pixels } from "./pixels";
import { parseSvg, svgSize } from "./svg";
import { downsampleMode } from "./tools";

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

/**
 * An SVG drawn by the browser at the biggest size that fits `maxW` × `maxH`
 * (a vector picture can grow), four times bigger and then brought down
 * (tools.downsampleMode) so its smoothed edges add no in-between colors.
 */
export async function rasterSvg(text: string, maxW: number, maxH: number, snap: (hex: string) => string): Promise<Pixels | null> {
  const root = parseSvg(text);
  if (!root) return null;
  const size = svgSize(root);
  const s = Math.min(maxW / size.w, maxH / size.h);
  const w = Math.max(1, Math.floor(size.w * s));
  const h = Math.max(1, Math.floor(size.h * s));
  const K = 4;
  // without a viewBox a new width and height would crop it instead of scaling it
  if (!root.getAttribute("viewBox")) root.setAttribute("viewBox", `0 0 ${size.w} ${size.h}`);
  root.setAttribute("width", String(w * K));
  root.setAttribute("height", String(h * K));
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = w * K;
    canvas.height = h * K;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w * K, h * K);
    const data = ctx.getImageData(0, 0, w * K, h * K).data;
    return downsampleMode({ w: w * K, h: h * K, data }, K, snap);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
