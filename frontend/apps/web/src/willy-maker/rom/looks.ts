// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A Willy Maker project's own heroes for the ROM engine (docs/willy-maker/
// engine.md, "Players' looks"): each hero a player slot uses becomes a
// wm_look (rom/engine/wmdata.h). Its saved picture is the 1:1 atlas the
// Characters screen made, colors already fitted to its zone palettes, so a
// frame is cut into 16 x 16 sprite tiles from the feet up (rom/tools/art.mjs
// placeFrame does the same for Willy): each tile row is one zone, so one
// palette per tile. Pure: the picture comes in decoded.

import { type GfxRegion, type Pens, toCps1 } from "@go-link/cps1";
import { BUILTIN_HERO, type Character, type Frame, type PlayerSlot, type Project } from "../model";
import type { Picture } from "./pack";

/** The engine's six animations of a player, in wm_look's order. */
export const LOOK_ANIMS = ["idle", "run", "jump", "knife", "gun", "bazooka"] as const;
export type LookAnimId = (typeof LOOK_ANIMS)[number];

/** Where each engine animation comes from: the first of the hero's own that has frames. */
export const LOOK_SOURCES: Record<LookAnimId, string[]> = {
  idle: ["idle"],
  run: ["run", "walk", "idle"],
  jump: ["jump", "idle"],
  knife: ["knife", "melee", "shoot", "fire", "idle"],
  gun: ["shoot", "fire", "machine_gun", "idle"],
  bazooka: ["bazooka", "special", "shoot", "fire", "idle"],
};

/** At most this many 16 x 16 tiles in one frame (the engine draws up to 200 sprite entries). */
export const MAX_FRAME_TILES = 32;
/** A frame's width fits the Frame record's u8 `w`. */
const MAX_FRAME_COLS = 15;
const TRANSPARENT = 15;

/** One sprite entry of a frame (the engine's Tile): `pal` is relative to the look's first palette. */
export interface LookTile {
  code: number;
  dx: number;
  dy: number;
  pal: number;
}

/** The engine's Frame: (ax, ay) = the feet from the top left of a w-wide box. */
export interface LookFrame {
  tiles: LookTile[];
  w: number;
  ax: number;
  ay: number;
}

export interface LookAnim {
  frames: LookFrame[];
  fps: number;
}

export interface Look {
  character: string;
  name: string;
  /** The hero's animation each engine animation uses. */
  anims: Record<LookAnimId, string>;
  /** Those animations, cut, by the hero's animation name. */
  cut: Map<string, LookAnim>;
  /** The first sprite palette (0-31) its palettes are loaded into. */
  pal: number;
  /** Its zone palettes as CPS-1 words, 16 each (pen 15 transparent). */
  palettes: number[][];
}

export interface LooksPlan {
  looks: Look[];
  /** Per player slot: the index in `looks`, or -1 for Willy. */
  slots: number[];
  /** Tiles written into the graphics region. */
  tiles: number;
}

export interface LooksBudget {
  /** The first free 16 x 16 tile code (after the engine's own sprites). */
  firstCode: number;
  /** One past the last code the looks may use. */
  endCode: number;
  /** Free sprite palettes: [first, count] runs. */
  palettes: [number, number][];
}

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1]!, 16) : 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** A palette's pen for a color: the exact one, else the nearest (the tile packer's distance). */
function penOf(colors: [number, number, number][], cache: Map<number, number>, r: number, g: number, b: number): number {
  const key = (r << 16) | (g << 8) | b;
  let p = cache.get(key);
  if (p !== undefined) return p;
  let best = 0;
  let bd = Infinity;
  colors.forEach((c, i) => {
    const d = (c[0] - r) ** 2 * 3 + (c[1] - g) ** 2 * 4 + (c[2] - b) ** 2 * 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  p = colors.length ? best : TRANSPARENT;
  cache.set(key, p);
  return p;
}

interface CutTile {
  pens: number[];
  dx: number;
  dy: number;
  pal: number;
}

interface CutFrame {
  tiles: CutTile[];
  w: number;
  ax: number;
  ay: number;
}

type Cut = { ok: true; frame: CutFrame | null } | { ok: false; reason: "big" | "zones" };

/**
 * Cuts a frame of the atlas into 16 x 16 tiles, bottom-aligned so the feet
 * sit on the last tile row and every tile row is one zone (counted from the
 * feet, file-format.md); empty tiles are dropped, a frame with no pixels
 * gives null.
 */
function cutFrame(pic: Picture, f: Frame, zonePal: (id: string) => number, colors: (pal: number) => [number, number, number][], caches: Map<number, number>[]): Cut {
  const nx = Math.ceil(f.w / 16);
  const ny = Math.ceil(f.h / 16);
  if (nx < 1 || ny < 1) return { ok: true, frame: null };
  const oy = ny * 16 - f.h;
  const tiles: CutTile[] = [];
  for (let ty = 0; ty < ny; ty++) {
    // the zone of this tile row: the frame's zones list top to bottom, one per row from the feet
    const fromBottom = ny - 1 - ty;
    const zoneId = f.zones[f.zones.length - 1 - fromBottom] ?? f.zones[0];
    const pal = zoneId === undefined ? -1 : zonePal(zoneId);
    for (let tx = 0; tx < nx; tx++) {
      const pens: number[] = [];
      let any = false;
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const sx = tx * 16 + x;
          const sy = ty * 16 + y - oy;
          let pen = TRANSPARENT;
          const ax = f.x + sx;
          const ay = f.y + sy;
          if (sx < f.w && sy >= 0 && sy < f.h && ax >= 0 && ay >= 0 && ax < pic.w && ay < pic.h) {
            const o = (ay * pic.w + ax) * 4;
            if (pic.rgba[o + 3]! >= 128) {
              if (pal < 0) return { ok: false, reason: "zones" };
              pen = penOf(colors(pal), caches[pal]!, pic.rgba[o]!, pic.rgba[o + 1]!, pic.rgba[o + 2]!);
              any = true;
            }
          }
          pens.push(pen);
        }
      if (any) tiles.push({ pens, dx: tx * 16, dy: ty * 16, pal: Math.max(0, pal) });
    }
  }
  if (!tiles.length) return { ok: true, frame: null };
  if (nx > MAX_FRAME_COLS || tiles.length > MAX_FRAME_TILES) return { ok: false, reason: "big" };
  return { ok: true, frame: { tiles, w: nx * 16, ax: f.px, ay: f.py + oy } };
}

/**
 * The looks of the active player slots' own heroes: their tiles written into
 * `gfx` (deduplicated, from `budget.firstCode`), their palettes placed in
 * free sprite palettes. A hero that cannot be drawn stays Willy, with a note.
 */
export function planLooks(
  project: Project,
  slots: readonly PlayerSlot[],
  players: number,
  gfx: GfxRegion,
  pictures: (characterId: string) => Picture | null,
  budget: LooksBudget,
  note: (id: string, params: Record<string, string | number>) => void,
): LooksPlan {
  const looks: Look[] = [];
  const bySlot = slots.map(() => -1);
  const failed = new Set<string>();
  const seen = new Map<string, number>(); // tile pens -> code
  let code = budget.firstCode;
  const free = budget.palettes.map(([a, n]) => [a, n] as [number, number]);

  const make = (ch: Character): Look | null => {
    const name = ch.name || ch.id;
    const pic = ch.sheet ? pictures(ch.id) : null;
    if (!pic) {
      note("heroPicture", { name });
      return null;
    }
    // the hero's palettes: every zone its frames use, in first use order
    const ids: string[] = [];
    for (const f of ch.frames) for (const z of f.zones) if (!ids.includes(z)) ids.push(z);
    const pals = ids.map((id) => project.palettes.find((p) => p.id === id));
    const colors = pals.map((p) => (p?.colors ?? []).slice(0, 15).map(hexRgb));
    const caches = colors.map(() => new Map<number, number>());
    const zonePal = (id: string) => {
      const i = ids.indexOf(id);
      return i >= 0 && pals[i] ? i : -1;
    };
    const framesById = new Map(ch.frames.map((f) => [f.id, f]));
    // cut the animations the engine needs
    const cut = new Map<string, LookAnim>();
    const cutPens = new Map<LookFrame, CutFrame>();
    const tryAnim = (animName: string): LookAnim | null => {
      if (cut.has(animName)) return cut.get(animName)!;
      const a = ch.anims[animName];
      if (!a) return null;
      const frames: LookFrame[] = [];
      for (const id of a.frames) {
        const f = framesById.get(id);
        if (!f) continue;
        const r = cutFrame(pic, f, zonePal, (p) => colors[p]!, caches);
        if (!r.ok) throw r.reason;
        if (!r.frame) continue;
        const lf: LookFrame = { tiles: [], w: r.frame.w, ax: r.frame.ax, ay: r.frame.ay };
        cutPens.set(lf, r.frame);
        frames.push(lf);
      }
      if (!frames.length) return null;
      const anim = { frames, fps: Math.max(1, Math.min(60, Math.round(a.fps || 1))) };
      cut.set(animName, anim);
      return anim;
    };
    const anims = {} as Record<LookAnimId, string>;
    try {
      for (const id of LOOK_ANIMS) {
        const chain = id === "idle" ? ["idle", "walk", "run", ...Object.keys(ch.anims)] : LOOK_SOURCES[id];
        const src = chain.find((n) => tryAnim(n)) ?? anims.idle;
        if (!src) {
          note("heroFrames", { name });
          return null;
        }
        anims[id] = src;
      }
    } catch (reason) {
      if (reason === "big") note("heroBig", { name, max: MAX_FRAME_TILES });
      else note("heroZones", { name });
      return null;
    }
    // the palettes: one run of free sprite palettes, the smallest that fits
    const need = Math.max(1, ids.length);
    const run = free.filter(([, n]) => n >= need).sort((a, b) => a[1] - b[1])[0];
    if (!run) {
      note("heroPalettes", { name, n: need, free: Math.max(0, ...free.map(([, n]) => n)) });
      return null;
    }
    // the tiles: only the new ones count against the room left
    const fresh = new Set<string>();
    for (const cf of cutPens.values()) for (const t of cf.tiles) {
      const key = t.pens.join(",");
      if (!seen.has(key)) fresh.add(key);
    }
    if (code + fresh.size > budget.endCode) {
      note("heroTiles", { name, max: budget.endCode - budget.firstCode });
      return null;
    }
    for (const [lf, cf] of cutPens) {
      lf.tiles = cf.tiles.map((t) => {
        const key = t.pens.join(",");
        let c = seen.get(key);
        if (c === undefined) {
          c = code++;
          seen.set(key, c);
          gfx.tile16(c, Array.from({ length: 16 }, (_, y) => t.pens.slice(y * 16, y * 16 + 16)) as Pens);
        }
        return { code: c, dx: t.dx, dy: t.dy, pal: t.pal };
      });
    }
    const pal = run[0];
    run[0] += need;
    run[1] -= need;
    const palettes = colors.map((cs) => {
      const words = cs.map((c) => toCps1(c).word);
      while (words.length < 16) words.push(0x0000);
      return words;
    });
    if (!palettes.length) palettes.push(new Array<number>(16).fill(0));
    return { character: ch.id, name, anims, cut, pal, palettes };
  };

  const shirts = new Set<string>();
  slots.forEach((s, i) => {
    if (i >= players || s.character === BUILTIN_HERO) return;
    const ch = project.characters.find((c) => c.id === s.character);
    if (!ch || ch.role !== "hero") {
      note("characters", { name: ch?.name || s.character });
      return;
    }
    if (failed.has(ch.id)) return;
    let k = looks.findIndex((l) => l.character === ch.id);
    if (k < 0) {
      const look = make(ch);
      if (!look) {
        failed.add(ch.id);
        return;
      }
      k = looks.push(look) - 1;
    }
    bySlot[i] = k;
    if (s.variant > 0 && !shirts.has(ch.id)) {
      shirts.add(ch.id);
      note("heroShirt", { name: looks[k]!.name });
    }
  });
  return { looks, slots: bySlot, tiles: code - budget.firstCode };
}
