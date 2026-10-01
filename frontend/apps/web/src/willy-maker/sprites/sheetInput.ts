// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The checks a sprite sheet passes before and after it is decoded: a file
// size limit, a picture format, its size read from the file's header (so a
// giant picture is refused before the browser tries to open it), at least
// a few pixels, and something on it besides the background. Each failure
// is an InputError the UI translates.

import { InputError } from "../model";
import { sniffType } from "../io/assets";
import type { KeyResult, Rgba } from "./detect";

export const SHEET_MAX_BYTES = 32 * 1024 * 1024;
/** The longest side of a sheet, and its pixel count (64 MB of RGBA). */
export const SHEET_MAX_SIDE = 8192;
export const SHEET_MAX_PIXELS = 16 * 1024 * 1024;
/** The smallest sheet that can hold a character. */
export const SHEET_MIN_SIDE = 8;

const be32 = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const le16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const le24 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);

/** A picture's width and height from its header (PNG, GIF, JPEG, WebP); null when it cannot tell. */
export function imageSize(b: Uint8Array): { w: number; h: number } | null {
  const type = sniffType(b);
  if (type === "image/png") return b.length >= 24 ? { w: be32(b, 16), h: be32(b, 20) } : null;
  if (type === "image/gif") return b.length >= 10 ? { w: le16(b, 6), h: le16(b, 8) } : null;
  if (type === "image/webp") {
    const chunk = String.fromCharCode(b[12] ?? 0, b[13] ?? 0, b[14] ?? 0, b[15] ?? 0);
    if (chunk === "VP8X" && b.length >= 30) return { w: le24(b, 24) + 1, h: le24(b, 27) + 1 };
    if (chunk === "VP8L" && b.length >= 25) {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8 " && b.length >= 30) return { w: le16(b, 26) & 0x3fff, h: le16(b, 28) & 0x3fff };
    return null;
  }
  if (type === "image/jpeg") {
    // the first start-of-frame marker holds the size
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) return null;
      const marker = b[o + 1]!;
      const len = (b[o + 2]! << 8) | b[o + 3]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { w: (b[o + 7]! << 8) | b[o + 8]!, h: (b[o + 5]! << 8) | b[o + 6]! };
      if (len < 2) return null;
      o += 2 + len;
    }
    return null;
  }
  return null;
}

function checkSize(w: number, h: number): void {
  if (w > SHEET_MAX_SIDE || h > SHEET_MAX_SIDE || w * h > SHEET_MAX_PIXELS) throw new InputError("image.too-big", { w, h, max: SHEET_MAX_SIDE });
  if (w < SHEET_MIN_SIDE || h < SHEET_MIN_SIDE) throw new InputError("image.too-small", { w, h });
}

/** Checks a sheet file before decoding it; returns its media type. */
export function checkSheetFile(bytes: Uint8Array, declaredType = ""): string {
  if (bytes.length > SHEET_MAX_BYTES) throw new InputError("file.too-big", { mb: Math.round(bytes.length / 1048576), max: SHEET_MAX_BYTES / 1048576 });
  const type = sniffType(bytes);
  if (!type.startsWith("image/")) throw new InputError(declaredType.startsWith("image/") ? "image.unreadable" : "image.not-image");
  const size = imageSize(bytes);
  if (size) checkSize(size.w, size.h);
  return type;
}

/** Checks a decoded sheet and its keyed background: a size it can hold, and something drawn on it. */
export function checkSheetImage(img: Rgba, key: KeyResult): void {
  checkSize(img.w, img.h);
  if (!key.mask.some((v) => v === 1)) throw new InputError("image.empty");
}
