// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Level 1 rules that read the pictures' pixels: colors per tile of every
// background layer and per 16 × 16 sprite cell, in board colors
// (gfx.colors-per-zone), the different tiles of each board layer against
// its budget (gfx.unique-tiles), tileset pictures cut on their grid
// (gfx.tile-grid) and the feet line of every ground animation (anim.pivot).
// The work is a generator: `pictureChecks` runs it at once (tests), and
// `reviewPictures` loads the pictures and runs it in small steps between
// macrotasks, so typing in the editor never waits for it.

import { layerGrid, type Character, type Level, type Project, type TileLayer, type Tileset } from "../../model";
import type { BoardProfile } from "../../board/cps1";
import { decodePng, type RgbaImage } from "../../io/png";
import { getAsset } from "../../io/assets";
import { boardLayerOf, groundAnim, tilesetOf } from "./art";
import type { Check, Target } from ".";

/** Decoded pictures by reference; null when a picture could not be read. */
export type Pictures = Map<string, RgbaImage | null>;

const levelName = (l: Level, i: number) => l.name?.trim() || `${i + 1}`;

/** One channel on the board's 12-bit scale. */
const snap = (v: number) => Math.round(v / 17) * 17;

/** A tile's pixels in board colors: its key (for the different-tiles count) and its colors. */
interface TileInfo {
  key: string;
  colors: number;
  /** Board color per pixel (-1 transparent), for drawing one tile over another. */
  px: Int32Array;
}

function tileOf(img: RgbaImage, x0: number, y0: number, size: number): TileInfo {
  const px = new Int32Array(size * size).fill(-1);
  const seen = new Set<number>();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sx = x0 + x;
      const sy = y0 + y;
      let c = -1;
      if (sx < img.w && sy < img.h) {
        const i = (sy * img.w + sx) * 4;
        if (img.data[i + 3]! >= 128) c = (snap(img.data[i]!) << 16) | (snap(img.data[i + 1]!) << 8) | snap(img.data[i + 2]!);
      }
      px[y * size + x] = c;
      if (c >= 0) seen.add(c);
      h1 = Math.imul(h1 ^ (c + 1), 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (c * 31 + 7), 0x5bd1e995) >>> 0;
    }
  return { key: `${size}:${h1.toString(36)}.${h2.toString(36)}`, colors: seen.size, px };
}

function infoOfPixels(px: Int32Array, size: number): TileInfo {
  const seen = new Set<number>();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let k = 0; k < px.length; k++) {
    const c = px[k]!;
    if (c >= 0) seen.add(c);
    h1 = Math.imul(h1 ^ (c + 1), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c * 31 + 7), 0x5bd1e995) >>> 0;
  }
  return { key: `${size}:${h1.toString(36)}.${h2.toString(36)}`, colors: seen.size, px };
}

/** The tiles of a tileset picture, 1-based (0 = empty). */
function tilesOf(ts: Tileset, img: RgbaImage): TileInfo[] {
  const size = ts.tile;
  const columns = Number(ts.columns) || Math.max(1, Math.floor(img.w / size));
  const rows = Math.max(1, Math.ceil(img.h / size));
  const count = Number(ts.count) || columns * rows;
  const out: TileInfo[] = [];
  for (let i = 0; i < count; i++) out.push(tileOf(img, (i % columns) * size, Math.floor(i / columns) * size, size));
  return out;
}

/**
 * The checks, as steps: each `yield` is a good place to let the page
 * breathe. Checks are pushed into `out`.
 */
export function* pictureWork(p: Project, board: BoardProfile, pictures: Pictures, out: Check[]): Generator<void, void, void> {
  const firstLevel = p.levels[0]?.id ?? "";
  // tilesets: their grid, and their tiles in board colors
  const tiles = new Map<string, TileInfo[]>();
  for (const ts of p.tilesets) {
    const img = ts.image ? pictures.get(ts.image) : null;
    if (!img) continue;
    const size = ts.tile;
    const columns = Number(ts.columns) || Math.floor(img.w / size);
    const capacity = Math.floor(img.w / size) * Math.floor(img.h / size);
    if (img.w % size || img.h % size || (Number(ts.count) > 0 && Number(ts.count) > Math.max(capacity, columns * Math.floor(img.h / size)))) {
      out.push({ id: "gfx.tile-grid", severity: "error", msg: "gfx.tileset-image", params: { tileset: ts.id, w: img.w, h: img.h, size }, target: { tab: "build", level: firstLevel } });
    }
    tiles.set(ts.id, tilesOf(ts, img));
    yield;
  }

  // backgrounds: per level, per board layer (far and mid share scroll3)
  const unique = new Map<string, Set<string>>();
  let colorsOk = true;
  const max = board.colors.perPalette;
  for (const [li, level] of p.levels.entries()) {
    const name = levelName(level, li);
    const groups = new Map<string, TileLayer[]>();
    for (const layer of level.layers) {
      if (layer.kind !== "tiles") continue;
      const spec = boardLayerOf(layer, board);
      if (!spec || layer.grid !== spec.tile) continue;
      groups.set(spec.id, [...(groups.get(spec.id) ?? []), layer]);
    }
    for (const [specId, layers] of groups) {
      const parts = layers
        .map((layer) => {
          const ts = tilesetOf(p, layer);
          const list = ts && ts.tile === layer.grid ? tiles.get(ts.id) : undefined;
          return list ? { layer, list, grid: layerGrid(level, layer) } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      if (!parts.length) continue;
      const set = unique.get(specId) ?? new Set<string>();
      unique.set(specId, set);
      const size = parts[0]!.layer.grid;
      const { cols, rows } = parts[0]!.grid;
      const mixed = new Map<string, TileInfo>();
      let bad = 0;
      let first: { x: number; y: number; n: number } | null = null;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          // the layers of one board layer are drawn bottom to top into one tile
          const used: TileInfo[] = [];
          const ids: number[] = [];
          for (const part of parts) {
            const v = part.grid.get(c, r);
            const t = v ? part.list[v - 1] : undefined;
            if (t) {
              used.push(t);
              ids.push(v);
            } else ids.push(0);
          }
          if (!used.length) continue;
          let t = used[0]!;
          if (used.length > 1) {
            const k = ids.join(",");
            let m = mixed.get(k);
            if (!m) {
              const px = Int32Array.from(used[0]!.px);
              for (const u of used.slice(1)) for (let q = 0; q < px.length; q++) if (u.px[q]! >= 0) px[q] = u.px[q]!;
              m = infoOfPixels(px, size);
              mixed.set(k, m);
            }
            t = m;
          }
          if (t.colors > 0) set.add(t.key);
          if (t.colors > max) {
            bad++;
            if (!first) first = { x: c * size, y: r * size, n: t.colors };
          }
        }
      if (first) {
        colorsOk = false;
        const layerLabel = parts.map((x) => x.layer.name?.trim() || x.layer.id).join(" + ");
        out.push({ id: "gfx.colors-per-zone", severity: "error", msg: "gfx.tile-colors", params: { level: name, layer: layerLabel, x: first.x, y: first.y, n: first.n, max, tiles: bad }, target: { tab: "build", level: level.id, x: first.x + size / 2, y: first.y + size } as Target });
      }
      yield;
    }
  }
  for (const spec of board.layers) {
    const n = unique.get(spec.id)?.size ?? 0;
    if (!n) continue;
    const params = { layer: spec.id, n, max: spec.budget, size: spec.tile };
    if (n > spec.budget) out.push({ id: "gfx.unique-tiles", severity: "error", msg: "gfx.unique-tiles-over", params, target: { tab: "build", level: firstLevel } });
    else if (n >= spec.budget * 0.85) out.push({ id: "gfx.unique-tiles", severity: "warning", msg: "gfx.unique-tiles", params, target: { tab: "build", level: firstLevel } });
    else out.push({ id: "gfx.unique-tiles", severity: "ok", msg: "gfx.unique-tiles.ok", params });
  }

  // sprites: colors per 16 × 16 cell, and the feet line of ground animations
  for (const ch of p.characters) {
    const img = ch.sheet ? pictures.get(ch.sheet) : null;
    if (!img) continue;
    const who = ch.name || ch.id;
    const target: Target = { tab: "characters", character: ch.id };
    const cell = board.sprites.tile;
    let worst: { frame: string; n: number } | null = null;
    const feet = new Map<string, number>();
    for (const f of ch.frames) {
      // cells as the ROM cuts them (rom/looks.ts): rows counted from the feet, so the top row may be partial
      const top = f.h - Math.ceil(f.h / cell) * cell;
      for (let y0 = top; y0 < f.h; y0 += cell)
        for (let x0 = 0; x0 < f.w; x0 += cell) {
          const seen = new Set<number>();
          for (let y = Math.max(0, y0); y < Math.min(f.h, y0 + cell); y++)
            for (let x = x0; x < Math.min(f.w, x0 + cell); x++) {
              const sx = f.x + x;
              const sy = f.y + y;
              if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
              const i = (sy * img.w + sx) * 4;
              if (img.data[i + 3]! < 128) continue;
              seen.add((snap(img.data[i]!) << 16) | (snap(img.data[i + 1]!) << 8) | snap(img.data[i + 2]!));
            }
          if (seen.size > max && (!worst || seen.size > worst.n)) worst = { frame: f.id, n: seen.size };
        }
      // the lowest row with a solid pixel, from the pivot
      let low = -1;
      for (let y = f.h - 1; y >= 0 && low < 0; y--)
        for (let x = 0; x < f.w; x++) {
          const sx = f.x + x;
          const sy = f.y + y;
          if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
          if (img.data[(sy * img.w + sx) * 4 + 3]! >= 128) {
            low = y;
            break;
          }
        }
      if (low >= 0) feet.set(f.id, low - f.py);
    }
    if (worst) {
      colorsOk = false;
      out.push({ id: "gfx.colors-per-zone", severity: "error", msg: "gfx.sprite-colors", params: { character: who, frame: worst.frame, n: worst.n, max }, target });
    }
    for (const [anim, a] of Object.entries(ch.anims ?? {})) {
      if (!groundAnim(anim)) continue;
      const lines = (a.frames ?? []).map((id) => feet.get(id)).filter((v): v is number => v !== undefined);
      if (lines.length < 2) continue;
      const d = Math.max(...lines) - Math.min(...lines);
      if (d > 2) {
        out.push({ id: "anim.pivot", severity: "warning", msg: "anim.pivot", params: { character: who, anim, d }, target });
        break;
      }
    }
    yield;
  }
  if (colorsOk && (tiles.size || p.characters.some((c) => c.sheet && pictures.get(c.sheet))))
    out.push({ id: "gfx.colors-per-zone", severity: "ok", msg: "gfx.tile-colors.ok", params: { max } });
}

/** The picture checks at once, over pictures already decoded. */
export function pictureChecks(p: Project, board: BoardProfile, pictures: Pictures): Check[] {
  const out: Check[] = [];
  for (const _ of pictureWork(p, board, pictures, out)) void _;
  return out;
}

/** Every picture a project's checks read. */
export function pictureRefs(p: Project): string[] {
  const refs = new Set<string>();
  for (const t of p.tilesets) if (t.image) refs.add(t.image);
  for (const c of p.characters as Character[]) if (c.sheet) refs.add(c.sheet);
  return [...refs];
}

export interface PictureLoader {
  /** Reads a stored picture (IndexedDB by default). */
  loadAsset?: (ref: string) => Promise<{ bytes: Uint8Array; type: string } | null>;
  /** Decodes a picture that is not a PNG (the browser's canvas by default). */
  decode?: (bytes: Uint8Array, type: string) => Promise<RgbaImage>;
}

async function canvasDecode(bytes: Uint8Array, type: string): Promise<RgbaImage> {
  if (typeof document === "undefined") throw new Error("cannot read this picture here");
  const { decodeImage } = await import("../../sprites/image");
  const img = await decodeImage(bytes, type);
  return { w: img.w, h: img.h, data: new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength) };
}

/** Decoded pictures are kept per page (pictures are stored by hash, so a reference never changes). */
const cache = new Map<string, Promise<RgbaImage | null>>();
const CACHE_MAX = 64;

export function loadPicture(ref: string, loader: PictureLoader = {}): Promise<RgbaImage | null> {
  const hit = cache.get(ref);
  if (hit) return hit;
  const load = loader.loadAsset ?? (async (r: string) => getAsset(r));
  const decode = loader.decode ?? canvasDecode;
  const job = (async () => {
    try {
      const a = await load(ref);
      if (!a) return null;
      const png = a.bytes[0] === 0x89 && a.bytes[1] === 0x50;
      return png ? await decodePng(a.bytes).catch(() => decode(a.bytes, a.type)) : await decode(a.bytes, a.type);
    } catch {
      return null;
    }
  })();
  cache.set(ref, job);
  // a missing picture may arrive later (a starter tileset still loading)
  void job.then((img) => !img && cache.get(ref) === job && cache.delete(ref));
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return job;
}

/** Waits for the next macrotask, so input and painting go first. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Loads the pictures and runs the picture checks in small steps. Resolves
 * with null when `signal` aborts (the project changed meanwhile).
 */
export async function reviewPictures(p: Project, board: BoardProfile, opts: PictureLoader & { signal?: AbortSignal } = {}): Promise<Check[] | null> {
  const pictures: Pictures = new Map();
  for (const ref of pictureRefs(p)) {
    pictures.set(ref, await loadPicture(ref, opts));
    if (opts.signal?.aborted) return null;
  }
  const out: Check[] = [];
  let last = Date.now();
  for (const _ of pictureWork(p, board, pictures, out)) {
    void _;
    if (Date.now() - last > 8) {
      await breathe();
      last = Date.now();
      if (opts.signal?.aborted) return null;
    }
  }
  return out;
}
