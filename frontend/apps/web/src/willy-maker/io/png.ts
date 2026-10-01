// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A small PNG writer and reader with no canvas, so exports are the same
// bytes in every run and tests run without a browser. The writer stores
// RGBA rows in uncompressed deflate blocks (the zip compresses them); the
// reader takes 8-bit gray, RGB, palette and RGBA pictures (and 1-4 bit
// palette and gray), not interlaced, which covers what Willy Maker saves.

import { crc32 } from "./zip";

export interface RgbaImage {
  w: number;
  h: number;
  /** w × h × 4 bytes, row order. */
  data: Uint8Array;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; ) {
    const end = Math.min(data.length, i + 5552);
    for (; i < end; i++) {
      a += data[i]!;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** A zlib stream of stored (uncompressed) deflate blocks. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535;
    const len = Math.min(65535, raw.length - start);
    out[o++] = b === blocks - 1 ? 1 : 0;
    out[o++] = len & 255;
    out[o++] = len >> 8;
    out[o++] = ~len & 255;
    out[o++] = (~len >> 8) & 255;
    out.set(raw.subarray(start, start + len), o);
    o += len;
  }
  new DataView(out.buffer).setUint32(o, adler32(raw));
  return out;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  v.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** An RGBA PNG file. The same pixels always give the same bytes. */
export function encodePng(w: number, h: number, rgba: Uint8Array): Uint8Array {
  if (rgba.length !== w * h * 4) throw new Error("png: wrong pixel count");
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, w);
  iv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlibStored(raw)), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("png: no DecompressionStream");
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  void writer.write(data as Uint8Array<ArrayBuffer>).catch(() => undefined);
  void writer.close().catch(() => undefined);
  const reader = ds.readable.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    size += value.length;
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Reads a PNG file. Throws on anything it does not support. */
export async function decodePng(bytes: Uint8Array): Promise<RgbaImage> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 33 || v.getUint32(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8;
  let w = 0;
  let h = 0;
  let depth = 0;
  let type = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (pos + 8 <= bytes.length) {
    const len = v.getUint32(pos);
    const kind = String.fromCharCode(bytes[pos + 4]!, bytes[pos + 5]!, bytes[pos + 6]!, bytes[pos + 7]!);
    const body = bytes.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") {
      w = v.getUint32(pos + 8);
      h = v.getUint32(pos + 12);
      depth = body[8]!;
      type = body[9]!;
      if (body[12]) throw new Error("png: interlaced pictures are not supported");
    } else if (kind === "PLTE") palette = body;
    else if (kind === "tRNS") trns = body;
    else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
    pos += 12 + len;
  }
  const channels = type === 0 ? 1 : type === 2 ? 3 : type === 3 ? 1 : type === 4 ? 2 : type === 6 ? 4 : 0;
  if (!w || !h || !channels) throw new Error("png: unsupported picture");
  if (depth !== 8 && !((type === 0 || type === 3) && (depth === 1 || depth === 2 || depth === 4))) throw new Error("png: unsupported bit depth");
  if (w * h > 64 * 1024 * 1024) throw new Error("png: too big");
  const joined = new Uint8Array(idat.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of idat) {
    joined.set(p, o);
    o += p.length;
  }
  const raw = await inflate(joined);
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((w * channels * depth) / 8);
  if (raw.length < h * (stride + 1)) throw new Error("png: truncated");
  const rows = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rows[dst + x - bpp]! : 0;
      const b = y ? rows[dst - stride + x]! : 0;
      const c = y && x >= bpp ? rows[dst - stride + x - bpp]! : 0;
      const r = raw[src + x]!;
      rows[dst + x] = (f === 0 ? r : f === 1 ? r + a : f === 2 ? r + b : f === 3 ? r + ((a + b) >> 1) : paeth(a, b, c) + r) & 255;
    }
  }
  const out = new Uint8Array(w * h * 4);
  const sample = (y: number, x: number): number => {
    if (depth === 8) return rows[y * stride + x]!;
    const bit = x * depth;
    return (rows[y * stride + (bit >> 3)]! >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * 4;
      const s = y * stride + x * channels;
      if (type === 6) out.set(rows.subarray(s, s + 4), d);
      else if (type === 2) {
        out[d] = rows[s]!;
        out[d + 1] = rows[s + 1]!;
        out[d + 2] = rows[s + 2]!;
        out[d + 3] = 255;
      } else if (type === 4) {
        out[d] = out[d + 1] = out[d + 2] = rows[s]!;
        out[d + 3] = rows[s + 1]!;
      } else if (type === 0) {
        const g = sample(y, x);
        out[d] = out[d + 1] = out[d + 2] = depth === 8 ? g : Math.round((g * 255) / ((1 << depth) - 1));
        out[d + 3] = 255;
      } else {
        const i = sample(y, x);
        out[d] = palette?.[i * 3] ?? 0;
        out[d + 1] = palette?.[i * 3 + 1] ?? 0;
        out[d + 2] = palette?.[i * 3 + 2] ?? 0;
        out[d + 3] = trns && i < trns.length ? trns[i]! : 255;
      }
    }
  return { w, h, data: out };
}
