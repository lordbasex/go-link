// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Create ROM, stage 2 of Willy Maker (docs/willy-maker/engine.md): a game
// becomes the files of a `slammast` set without compiling anything. The
// prebuilt engine (rom/engine/engine.c, built by rom/tools/engine.mjs and
// shipped in public/willy-maker/engine/) goes at the start of the program
// ROM; this module packs the game as data at 0x100000 (rom/engine/wmdata.h),
// draws the font and the level's tiles into the graphics ROM with
// @go-link/cps1, encrypts the sound program (Kabuki) and lays every file
// out as the set's. Pure: pictures come in decoded, nothing touches the DOM.

import { GfxRegion, KEYS, SLAMMAST, encodeOpcodes, glyphPixels, setFiles, splitProgram, toCps1, unsupportedChars, type Pens } from "@go-link/cps1";
import { CELL, layerGrid, objectLayer, tagLayer, TAG_NUMBER, type Level, type Project, type TileLayer, type Tileset } from "../model";
import { rulesWith } from "../engine/rules";
import { DOOR_H, DOOR_W, doorAt, doorParts } from "../engine/door";
import { MENU_FIELDS, menuText, screenLines, type Ink, type MenuScreenId, type TextLine } from "../game/menus";
import { playerSlots } from "../game/settings";
import { BUILTIN_HERO } from "../model";
import { LOOK_ANIMS, planLooks, type LookAnim, type LooksBudget } from "./looks";

/** The engine as rom/tools/engine.mjs ships it (engine.json). */
export interface EngineManifest {
  format: number;
  set: string;
  dataAddr: number;
  program: { offset: number; size: number };
  sprites: { offset: number; size: number; code: number };
  /** The sprite palettes the engine's own art takes: Willy's, then `recruits` shirts of `recruitOffset` each, up to `used`. */
  spritePalettes?: { used: number; recruitOffset: number; recruits: number };
  z80: { offset: number; size: number };
  kabuki: string;
  sha256: string;
  lab_state: { address: number; size: number; type: string };
  symbols: Record<string, { address: number; size: number; type: string }>;
}

export interface Engine {
  manifest: EngineManifest;
  /** engine.bin: program | sprite tiles | Z80 program. */
  bin: Uint8Array;
}

/** A decoded picture: RGBA, row by row. */
export interface Picture {
  w: number;
  h: number;
  rgba: Uint8Array;
}

/** Something the engine does not do yet, so the ROM leaves it out or draws it another way. */
export interface RomNote {
  id: string;
  params?: Record<string, string | number>;
}

export interface PackResult {
  /** Every file of the set, by name. */
  files: Map<string, Uint8Array>;
  /** The data block (for tests and the record). */
  data: Uint8Array;
  notes: RomNote[];
  stats: { level: string; cols: number; rows: number; playTiles: number; farTiles: number; playPalettes?: number; farPalettes?: number; enemies: number; civilians: number; crates: number; pickups: number; dataBytes: number; looks?: number; lookTiles?: number; gfxBytes?: number; spritePalettes?: number };
}

// rom/engine/wmdata.h
export const WM_DATA_ADDR = 0x100000;
const WM_MAGIC = 0x574d4431;
const WM_VERSION = 4;
const HEADER = 0x84;
/** A layer's palette bank on the board: 32 palettes of 15 colors (wmdata.h WM_LAYER_PALETTES). */
export const LAYER_PALETTES = 32;
const FONT_BIG = 0x0080;
const EMPTY16 = 0x0400;
const EMPTY32 = 0x0200;
const FAR_TILES = 0x0800;
const PLAY_TILES = 0x4000;
/** The players' own looks' tiles end where the far layer's 32 px tiles start in the graphics region. */
const LOOK_TILES_END = (FAR_TILES * 512) / 128;
const MAX_CELLS = 24576;
const SCR = { title: 0, hud: 1, clear: 2, continue: 3, gameOver: 4, join: 5, ammo: 6, coin: 7 } as const;
const TXT_BIG = 0x10;
const TXT_COUNT = 0x20;
const TXT_BLINK = 0x40;
const INK: Record<Ink, number> = { accent: 0, white: 1, cyan: 2 };
const ITEM: Record<string, number> = { bazooka: 1, health: 2 };
const F_FREE_PLAY = 1;
const F_PUSH_CLIMB = 2;
const F_SOON = 4;
const F_DOUBLE_JUMP = 8;
const F_JETPACK = 16;

/** The first level in play order. */
export function romLevel(project: Project): Level | undefined {
  const id = project.settings.levels[0];
  return project.levels.find((l) => l.id === id) ?? project.levels[0];
}

/** Big-endian writer that grows. */
class Out {
  buf = new Uint8Array(64 * 1024);
  n = 0;
  private room(k: number) {
    if (this.n + k <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.n + k) size *= 2;
    const b = new Uint8Array(size);
    b.set(this.buf.subarray(0, this.n));
    this.buf = b;
  }
  u8(v: number) {
    this.room(1);
    this.buf[this.n++] = v & 0xff;
  }
  u16(v: number) {
    this.room(2);
    this.buf[this.n++] = (v >> 8) & 0xff;
    this.buf[this.n++] = v & 0xff;
  }
  u32(v: number) {
    this.u16((v >>> 16) & 0xffff);
    this.u16(v & 0xffff);
  }
  align() {
    if (this.n & 1) this.u8(0);
  }
  /** The 68000 address of the next byte. */
  get addr() {
    return WM_DATA_ADDR + this.n;
  }
  patch16(at: number, v: number) {
    this.buf[at] = (v >> 8) & 0xff;
    this.buf[at + 1] = v & 0xff;
  }
  patch32(at: number, v: number) {
    this.patch16(at, (v >>> 16) & 0xffff);
    this.patch16(at + 2, v & 0xffff);
  }
  bytes() {
    return this.buf.slice(0, this.n);
  }
}

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1]!, 16) : 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

type Rgb = [number, number, number];

/** A layer's palettes as the ROM loads them into its bank, and the slot each tile uses. */
interface LayerPalettes {
  /** The palettes in bank order (at least one: slot 0 is the tileset's first palette, the exit door's and the far layer's backdrop color). */
  colors: Rgb[][];
  /** Tile n's (1-based) slot in `colors`. */
  slot: (n: number) => number;
  /** Distinct palettes the tiles asked for, before the bank's limit. */
  wanted: number;
}

function paletteColors(project: Project, id: string | undefined): Rgb[] {
  const pal = id === undefined ? undefined : project.palettes.find((p) => p.id === id);
  return (pal?.colors ?? []).slice(0, 15).map(hexRgb);
}

const rgbDistance = (a: Rgb, b: Rgb) => (a[0] - b[0]) ** 2 * 3 + (a[1] - b[1]) ** 2 * 4 + (a[2] - b[2]) ** 2 * 2;

/**
 * The palettes a layer's tiles use (Tileset.tilePalettes, T-28): its
 * tileset's first palette always, then every other one a used tile names, in
 * the tileset's order, each once. Past the bank's 32 a palette's tiles take
 * the kept palette closest to its colors.
 */
function layerPalettes(project: Project, ts: Tileset | undefined, used: Iterable<number>): LayerPalettes {
  const ids = ts?.palettes ?? [];
  const index = (n: number) => {
    const k = ts?.tilePalettes?.[n - 1];
    return typeof k === "number" && Number.isInteger(k) && k >= 0 && k < ids.length ? k : 0;
  };
  const ks = new Set<number>([0]);
  for (const n of used) ks.add(index(n));
  const order: string[] = [];
  for (const k of [...ks].sort((a, b) => a - b)) if (ids[k] !== undefined && !order.includes(ids[k]!)) order.push(ids[k]!);
  const kept = order.slice(0, LAYER_PALETTES);
  const colors = kept.length ? kept.map((id) => paletteColors(project, id)) : [[]];
  const slotOf = new Map<string, number>(kept.map((id, i) => [id, i]));
  for (const id of order.slice(LAYER_PALETTES)) {
    const own = paletteColors(project, id);
    let best = 0;
    let bd = Infinity;
    colors.forEach((pal, i) => {
      // how far each of its colors is from the closest color of a kept palette
      const d = pal.length ? own.reduce((sum, c) => sum + Math.min(...pal.map((p) => rgbDistance(c, p))), 0) : Infinity;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    slotOf.set(id, best);
  }
  return { colors, slot: (n) => slotOf.get(ids[index(n)]!) ?? 0, wanted: Math.max(1, order.length) };
}

function paletteWords(colors: Rgb[]): number[] {
  const out = colors.map((c) => toCps1(c).word);
  while (out.length < 16) out.push(0x0000);
  return out;
}

/** Tile n (1-based) of a tileset picture as pens of its palette (pen 15 transparent). */
function tilePens(pic: Picture, columns: number, size: number, n: number, colors: Rgb[]): Pens {
  const tx = ((n - 1) % columns) * size;
  const ty = Math.floor((n - 1) / columns) * size;
  const cache = new Map<number, number>();
  const pen = (r: number, g: number, b: number) => {
    const key = (r << 16) | (g << 8) | b;
    let p = cache.get(key);
    if (p === undefined) {
      let best = 0;
      let bd = Infinity;
      colors.forEach((c, i) => {
        const d = rgbDistance(c, [r, g, b]);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      p = colors.length ? best : 15;
      cache.set(key, p);
    }
    return p;
  };
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const px = tx + x;
      const py = ty + y;
      if (px >= pic.w || py >= pic.h) return 15;
      const o = (py * pic.w + px) * 4;
      return pic.rgba[o + 3]! < 128 ? 15 : pen(pic.rgba[o]!, pic.rgba[o + 1]!, pic.rgba[o + 2]!);
    }),
  );
}

/** The double-size glyph of a character, as its four 8 x 8 quarters (top left, top right, bottom left, bottom right). */
export function bigGlyph(ch: string): number[][][] {
  const small = glyphPixels(ch);
  const big = Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => small[y >> 1]![x >> 1]!));
  return [0, 1, 2, 3].map((q) => big.slice((q >> 1) * 8, (q >> 1) * 8 + 8).map((row) => row.slice((q & 1) * 8, (q & 1) * 8 + 8)));
}

/** The text lines of the screens, in the engine's table. */
function textLines(project: Project): { scr: number; line: TextLine; attr: number }[] {
  const out: { scr: number; line: TextLine; attr: number }[] = [];
  const add = (scr: number, line: TextLine, extra = 0) => out.push({ scr, line, attr: INK[line.ink] | (line.scale === 2 ? TXT_BIG : 0) | extra });
  for (const l of screenLines(project, "title")) add(SCR.title, l, l.field === "prompt" ? TXT_BLINK : 0);
  for (const l of screenLines(project, "hud")) {
    if (l.field === "rescued") add(SCR.hud, l, TXT_COUNT);
    else if (l.field === "cleared") add(SCR.clear, l);
  }
  for (const l of screenLines(project, "continue")) if (l.field !== "slots") add(SCR.continue, l);
  for (const l of screenLines(project, "gameOver")) add(SCR.gameOver, l);
  const single = (scr: number, screen: MenuScreenId, field: string, row: number) => {
    const text = menuText(project, screen, field).toUpperCase();
    if (!text) return;
    const col = Math.max(0, Math.floor((48 - text.length) / 2));
    add(scr, { field, text, row, col, scale: 1, ink: "white" });
  };
  single(SCR.join, "hud", "join", 0);
  single(SCR.ammo, "hud", "ammo", 1);
  const prompt = MENU_FIELDS.title.find((f) => f.id === "prompt");
  single(SCR.coin, "attract", "prompt", prompt?.row ?? 19);
  return out;
}

/** The sprite palettes and tiles the players' own looks may use, after the engine's art. */
export function looksBudget(manifest: EngineManifest, slots: readonly { character: string; variant: number }[], players: number): LooksBudget {
  const sp = manifest.spritePalettes ?? { used: 25, recruitOffset: 4, recruits: 3 };
  const palettes: [number, number][] = [];
  // a recruit's shirt no active Willy wears leaves its palettes free
  for (let k = 1; k <= sp.recruits; k++)
    if (!slots.some((s, i) => i < players && s.character === BUILTIN_HERO && Math.max(0, Math.min(3, s.variant)) === k)) palettes.push([k * sp.recruitOffset, sp.recruitOffset]);
  if (sp.used < 32) palettes.push([sp.used, 32 - sp.used]);
  return { firstCode: manifest.sprites.code + Math.ceil(manifest.sprites.size / 128), endCode: LOOK_TILES_END, palettes };
}

/**
 * Packs a project into a slammast set with the engine. `pictures` gives the
 * decoded picture of a tileset (by id), or null when it is missing;
 * `characterPictures` the saved picture of a character (by id).
 */
export function packGame(
  project: Project,
  engine: Engine,
  pictures: (tilesetId: string) => Picture | null,
  characterPictures: (characterId: string) => Picture | null = () => null,
): PackResult {
  const notes: RomNote[] = [];
  // a note about one hero is kept once per hero, any other once
  const noteKey = (id: string, params?: Record<string, string | number>) => (params?.name !== undefined ? `${id}:${params.name}` : id);
  const note = (id: string, params?: Record<string, string | number>) => {
    if (!notes.some((n) => noteKey(n.id, n.params) === noteKey(id, params))) notes.push(params ? { id, params } : { id });
  };
  const level = romLevel(project);
  if (!level) throw new Error("the game has no level");
  if (project.board.layout !== "slammast") note("layout", { layout: project.board.layout });
  if (project.levels.length > 1) note("levels", { n: project.levels.length });
  const cols = Math.ceil(level.size.w / CELL);
  const rows = Math.ceil(level.size.h / CELL);
  if (cols * rows > MAX_CELLS || rows > 64) throw new Error(`the level is too big for the engine: ${level.size.w} x ${level.size.h} px (at most ${MAX_CELLS} cells of 16 px and 1024 px tall)`);

  // the collision tags (crates from their objects, as play mode adds them)
  const tags = new Uint8Array(cols * rows);
  const tagGrid = layerGrid(level, tagLayer(level));
  for (let i = 0; i < tags.length; i++) tags[i] = tagGrid.cells[i] ?? 0;
  if (tags.some((t) => t === TAG_NUMBER.water)) note("water");
  const objects = objectLayer(level).items;
  for (const o of objects)
    if (o.type === "crate") {
      const n = Number(o.size ?? 32) >= 32 ? 2 : 1;
      const c0 = Math.floor(o.x / CELL);
      const r0 = Math.floor(o.y / CELL);
      for (let r = r0; r < r0 + n; r++) for (let c = c0; c < c0 + n; c++) if (c < cols && r < rows && tags[r * cols + c] === 0) tags[r * cols + c] = TAG_NUMBER.crate;
    }

  // graphics: the font, its double size, the engine's sprites, the level's tiles
  const gfx = new GfxRegion(SLAMMAST.gfxSize);
  for (let c = 0x21; c < 0x60; c++) {
    const ch = String.fromCharCode(c);
    gfx.tile8(c, glyphPixels(ch));
    bigGlyph(ch).forEach((q, i) => gfx.tile8(FONT_BIG + (c - 0x21) * 4 + i, q));
  }
  const { manifest, bin } = engine;
  gfx.data.set(bin.subarray(manifest.sprites.offset, manifest.sprites.offset + manifest.sprites.size), manifest.sprites.code * 128);

  const layerById = (id: string) => level.layers.find((l): l is TileLayer => l.kind === "tiles" && l.id === id);
  const playLayer = layerById("play");
  const farLayer = layerById("far");
  const mid = layerById("mid");
  if (mid && layerGrid(level, mid).cells.some((v) => v)) note("mid");
  if (level.layers.some((l) => l.kind === "tiles" && !["far", "mid", "play", "text"].includes(l.id) && layerGrid(level, l).cells.some((v) => v))) note("layers");

  type LayerMap = { codes: Uint16Array; cols: number; rows: number; used: number; palettes: LayerPalettes; table: Uint8Array };
  const tileMap = (layer: TileLayer | undefined, size: 16 | 32, base: number, empty: number): LayerMap => {
    const lc = Math.ceil(level.size.w / size);
    const lr = Math.ceil(level.size.h / size);
    const codes = new Uint16Array(lc * lr).fill(empty);
    const ts = layer?.tileset ? project.tilesets.find((t) => t.id === layer.tileset) : undefined;
    // without tiles the layer still loads its tileset's first palette (the door's colors, the backdrop)
    const none = (): LayerMap => ({ codes, cols: lc, rows: lr, used: 0, palettes: layerPalettes(project, ts, []), table: new Uint8Array(0) });
    if (!layer) return none();
    if (layer.grid !== size) {
      note("grid", { layer: layer.id, grid: layer.grid });
      return none();
    }
    const pic = ts ? pictures(ts.id) : null;
    const grid = layerGrid(level, layer);
    if (!ts || !pic || ts.tile !== size) {
      if (grid.cells.some((v) => v)) note("tileset", { layer: layer.id });
      return none();
    }
    const columns = ts.columns ?? Math.max(1, Math.floor(pic.w / size));
    const used = new Set<number>();
    for (let i = 0; i < codes.length; i++) {
      const n = grid.cells[i] ?? 0;
      if (!n) continue;
      codes[i] = base + n - 1;
      used.add(n);
    }
    const palettes = layerPalettes(project, ts, used);
    if (palettes.wanted > LAYER_PALETTES) note("layerPalettes", { layer: layer.id, n: palettes.wanted, max: LAYER_PALETTES });
    // the palette of each tile code from `base`, for the engine's attribute words; each tile cut with its own palette's pens
    const table = new Uint8Array(used.size ? Math.max(...used) : 0);
    for (const n of [...used].sort((a, b) => a - b)) {
      const slot = palettes.slot(n);
      table[n - 1] = slot;
      const pens = tilePens(pic, columns, size, n, palettes.colors[slot]!);
      if (size === 16) gfx.tile16(base + n - 1, pens);
      else gfx.tile32(base + n - 1, pens);
    }
    return { codes, cols: lc, rows: lr, used: used.size, palettes, table };
  };
  const play = tileMap(playLayer, 16, PLAY_TILES, EMPTY16);
  // the exit door's six 16 px tiles go right after the highest tile the play layer uses (a picture may use thousands)
  let doorTiles = PLAY_TILES;
  for (const c of play.codes) if (c !== EMPTY16 && c >= doorTiles) doorTiles = c + 1;
  const far = tileMap(farLayer, 32, FAR_TILES, EMPTY32);
  // crate and breakable cells without art get the starter crate look from the tags only when painted; nothing to do here

  // objects
  type Row = [number, number, number, number, number, number];
  const enemies: Row[] = [];
  const civs: Row[] = [];
  const crates: Row[] = [];
  const pickups: Row[] = [];
  const startX = [-1, -1, -1, -1];
  const startY = [-1, -1, -1, -1];
  let exit: [number, number, number, number] = [0, 0, 0, 0];
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  for (const o of objects) {
    switch (o.type) {
      case "player_start": {
        const p = num(o.player, 1);
        if (p >= 1 && p <= 4) {
          startX[p - 1] = o.x;
          startY[p - 1] = o.y;
        }
        break;
      }
      case "enemy": {
        const patrol = num(o.patrol, 6 * CELL);
        enemies.push([o.x, o.y, Math.round(o.x - patrol / 2), Math.round(o.x + patrol / 2), num(o.hp, 0), o.facing === "right" ? 1 : -1]);
        break;
      }
      case "civilian":
        civs.push([o.x, o.y, o.kind === "child" || o.kind === "baby" ? 1 : 0, 0, 0, 0]);
        if (typeof o.trapped_in === "string" && o.trapped_in) note("trapped");
        break;
      case "crate": {
        const contents = String(o.contents ?? "nothing");
        if (contents !== "nothing" && !ITEM[contents]) note("contents", { item: contents });
        // hits 0 tells the engine the crate never breaks from shots
        crates.push([Math.floor(o.x / CELL), Math.floor(o.y / CELL), num(o.size, 32) >= 32 ? 2 : 1, o.breakable === false ? 0 : Math.max(1, num(o.hp, 3)), ITEM[contents] ?? 0, 0]);
        break;
      }
      case "pickup": {
        const item = String(o.item ?? "bazooka");
        if (!ITEM[item]) note("item", { item });
        else pickups.push([o.x, o.y, ITEM[item]!, 0, 0, 0]);
        break;
      }
      case "exit":
        exit = [o.x, o.y, num(o.w, 2 * CELL), num(o.h, level.size.h)];
        break;
      case "camera_lock":
        note("camera_lock");
        break;
      case "checkpoint":
        note("checkpoint");
        break;
      case "boss":
        note("boss");
        break;
    }
  }
  if (enemies.length > 16) note("enemies", { n: enemies.length, max: 16 });
  if (civs.length > 8) note("civilians", { n: civs.length, max: 8 });
  if (crates.length > 32) note("crates", { n: crates.length, max: 32 });
  if (new Set(objects.filter((o) => o.type === "enemy").map((o) => String(o.kind ?? ""))).size > 1 || objects.some((o) => o.type === "enemy" && o.kind !== "trooper")) note("enemyArt");

  // each player's look: Willy (or a recruit's shirt), or one of the game's own heroes
  const players = Math.max(1, Math.min(4, project.settings.players));
  const slotList = playerSlots(project).slice(0, 4);
  const slots = slotList.map((s) => (s.character === BUILTIN_HERO ? Math.max(0, Math.min(3, s.variant)) : 0));
  while (slots.length < 4) slots.push(slots.length);
  const looks = planLooks(project, slotList, players, gfx, characterPictures, looksBudget(manifest, slotList, players), note);

  const rules = rulesWith(project.settings.rules);
  const dip = project.settings.dip;

  // the exit's door (engine/door.ts), in the play layer's own colors (its first palette, which the engine gives codes past the table), over empty cells only
  const playColors = play.palettes.colors[0]!;
  if (exit[2] > 0 && playColors.length) {
    const lum = (c: [number, number, number]) => c[0] * 3 + c[1] * 4 + c[2] * 2;
    const by = (score: (c: [number, number, number]) => number) => playColors.reduce((best, c, i) => (score(c) > score(playColors[best]!) ? i : best), 0);
    const pens = [15, by(lum), by((c) => -lum(c)), by((c) => c[1] * 2 - c[0] - c[2]), by(lum)];
    const parts = doorParts();
    const at = doorAt({ x: exit[0], y: exit[1], w: exit[2] });
    const c0 = Math.floor(at.x / CELL);
    const r0 = Math.floor(at.y / CELL);
    for (let tr = 0; tr < DOOR_H / CELL; tr++)
      for (let tc = 0; tc < DOOR_W / CELL; tc++) {
        const c = c0 + tc;
        const r = r0 + tr;
        if (c < 0 || r < 0 || c >= cols || r >= rows || tags[r * cols + c] !== 0) continue;
        const code = doorTiles + tr * (DOOR_W / CELL) + tc;
        gfx.tile16(
          code,
          Array.from({ length: CELL }, (_, y) => Array.from({ length: CELL }, (_, x) => pens[parts[tr * CELL + y]![tc * CELL + x]! as number] ?? 15)),
        );
        play.codes[r * cols + c] = code;
      }
  }

  // the data block
  const out = new Out();
  for (let i = 0; i < HEADER; i++) out.u8(0);
  const tagsAt = out.addr;
  for (const t of tags) out.u8(t);
  out.align();
  const playAt = out.addr;
  for (const c of play.codes) out.u16(c);
  const farAt = out.addr;
  for (const c of far.codes) out.u16(c);
  const palAt = out.addr;
  const farColors = far.palettes.colors[0]!;
  for (const pal of [...play.palettes.colors, ...far.palettes.colors]) for (const w of paletteWords(pal)) out.u16(w);
  const playPalAt = out.addr;
  for (const k of play.table) out.u8(k);
  const farPalAt = out.addr;
  for (const k of far.table) out.u8(k);
  out.align();
  const objAt = out.addr;
  for (const row of [...enemies.slice(0, 16), ...civs.slice(0, 8), ...crates.slice(0, 32), ...pickups.slice(0, 16)]) for (const v of row) out.u16(v & 0xffff);
  const textAt = out.addr;
  for (const { scr, line, attr } of textLines(project)) {
    const text = [...line.text].map((ch) => (unsupportedChars(ch).length ? " " : ch)).join("").slice(0, 48);
    out.u8(scr);
    out.u8(line.row);
    out.u8(line.col);
    out.u8(attr);
    out.u8(text.length);
    for (const ch of text) out.u8(ch.charCodeAt(0));
    out.align();
  }
  out.u8(0xff);
  out.u8(0);
  const titleAt = out.addr;
  for (const ch of project.title.slice(0, 60)) out.u8(ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : 0x3f);
  out.u8(0);
  out.align();

  // the players' own looks: their Tile, Frame and Anim records (gfx.h's layout), each wm_look and its palettes, then looks[4]
  let looksAt = 0;
  if (looks.looks.length) {
    const lookAt: number[] = [];
    for (const look of looks.looks) {
      const animAt = new Map<LookAnim, number>();
      for (const anim of new Set(look.cut.values())) {
        const tilesAt = anim.frames.map((f) => {
          const at = out.addr;
          for (const t of f.tiles) {
            out.u16(t.code);
            out.u8(t.dx);
            out.u8(t.dy);
            out.u8(t.pal);
            out.u8(0);
          }
          return at;
        });
        const framesAt = out.addr;
        anim.frames.forEach((f, i) => {
          out.u32(tilesAt[i]!);
          out.u8(f.tiles.length);
          out.u8(f.w);
          out.u16(f.ax & 0xffff);
          out.u16(f.ay & 0xffff);
        });
        animAt.set(anim, out.addr);
        out.u32(framesAt);
        out.u16(anim.frames.length);
        out.u16(anim.fps);
      }
      lookAt.push(out.addr);
      for (const id of LOOK_ANIMS) out.u32(animAt.get(look.cut.get(look.anims[id])!)!);
      out.u16(look.pal);
      out.u16(look.palettes.length);
      for (const pal of look.palettes) for (const w of pal) out.u16(w);
    }
    looksAt = out.addr;
    for (const k of looks.slots) out.u32(k >= 0 ? lookAt[k]! : 0);
  }

  // the header (wm_data)
  let h = 0;
  const w16 = (v: number) => {
    out.patch16(h, v & 0xffff);
    h += 2;
  };
  const w32 = (v: number) => {
    out.patch32(h, v >>> 0);
    h += 4;
  };
  w32(WM_MAGIC);
  w16(WM_VERSION);
  w16(HEADER);
  w16(Math.max(1, Math.min(4, project.settings.players)));
  w16((dip.freePlay ? F_FREE_PLAY : 0) | (rules.crateClimb === "push" ? F_PUSH_CLIMB : 0) | (rules.extraPorts === "soon" ? F_SOON : 0) | (rules.doubleJump ? F_DOUBLE_JUMP : 0) | (rules.jetpack ? F_JETPACK : 0));
  w16(level.size.w);
  w16(level.size.h);
  w16(cols);
  w16(rows);
  w16(far.cols);
  w16(far.rows);
  w32(tagsAt);
  w32(playAt);
  w32(farAt);
  w32(palAt);
  w32(objAt);
  w32(textAt);
  w16(Math.min(16, enemies.length));
  w16(Math.min(8, civs.length));
  w16(Math.min(32, crates.length));
  w16(Math.min(16, pickups.length));
  startX.forEach((v) => w16(v));
  startY.forEach((v) => w16(v));
  exit.forEach((v) => w16(v));
  slots.forEach((v) => w16(v));
  w16(farColors.length ? toCps1(farColors[0]!).word : 0xf102);
  w16(level.camera.forwardOnly ? Math.max(0, Math.min(level.size.w, level.camera.backtrack)) : level.size.w);
  // wm_rules
  const lives = Math.max(1, Math.min(9, Math.round(dip.lives)));
  const runTap = Math.max(1, Math.min(60, Math.round(((project.settings.runTapMs ?? 250) * 60) / 1000)));
  for (const b of [lives, Math.min(255, rules.enemyHp), +rules.touchHurts, +rules.enemiesChase, +rules.enemiesShoot, +rules.exitNeedsEnemies, +rules.respawnOnHurt, runTap]) {
    out.buf[h++] = b;
  }
  w16(rules.hurtFrames);
  w16(rules.enemyScore);
  w16(rules.rescueScore);
  w16(rules.crateScore);
  w32(titleAt);
  w32(looksAt);
  w16(play.palettes.colors.length);
  w16(far.palettes.colors.length);
  w32(play.table.length ? playPalAt : 0);
  w32(far.table.length ? farPalAt : 0);
  w16(play.table.length);
  w16(far.table.length);
  if (h !== HEADER) throw new Error(`wm_data header is ${h} bytes, expected ${HEADER}`);
  const data = out.bytes();
  if (data.length > 0x100000) throw new Error(`the game's data is ${data.length} bytes: at most 1 MB`);

  // the program space: engine at 0, data at 0x100000
  const space = new Uint8Array(SLAMMAST.programSize).fill(0xff);
  space.set(bin.subarray(manifest.program.offset, manifest.program.offset + manifest.program.size), 0);
  space.set(data, WM_DATA_ADDR);
  const files = new Map<string, Uint8Array>();
  for (const [name, bytes] of Object.entries(splitProgram(SLAMMAST, space))) files.set(name, bytes);
  // how much of the graphics region the ROM fills (the board usage meter, T-27): 128-byte tile slots that are not empty
  let gfxBytes = 0;
  for (let o = 0; o < gfx.data.length; o += 128) {
    let used = false;
    for (let k = o; k < o + 128 && !used; k++) if (gfx.data[k] !== 0xff) used = true;
    if (used) gfxBytes += 128;
  }
  for (const [name, bytes] of Object.entries(gfx.split(SLAMMAST.gfx))) files.set(name, bytes);
  // the sound program, encrypted the way the QSound board decrypts it
  const z80 = bin.subarray(manifest.z80.offset, manifest.z80.offset + manifest.z80.size);
  const sound = new Uint8Array(SLAMMAST.z80.size).fill(0xff);
  sound.set(encodeOpcodes(z80, KEYS[manifest.kabuki] ?? KEYS.slammast!));
  files.set(SLAMMAST.z80.name, sound);
  for (const s of SLAMMAST.samples) files.set(s.name, new Uint8Array(s.size));
  for (const f of setFiles(SLAMMAST)) if (files.get(f.name)?.length !== f.size) throw new Error(`${f.name}: ${files.get(f.name)?.length} bytes, the set needs ${f.size}`);

  return {
    files,
    data,
    notes,
    stats: {
      level: level.name,
      cols,
      rows,
      playTiles: play.used,
      farTiles: far.used,
      playPalettes: play.palettes.colors.length,
      farPalettes: far.palettes.colors.length,
      enemies: enemies.length,
      civilians: civs.length,
      crates: crates.length,
      pickups: pickups.length,
      dataBytes: data.length,
      looks: looks.looks.length,
      lookTiles: looks.tiles,
      gfxBytes,
      // the engine's own, plus the heroes' palettes loaded past them (a hero in a free recruit's slots adds none)
      spritePalettes: Math.min(32, (manifest.spritePalettes?.used ?? 25) + looks.looks.reduce((n, l) => n + l.palettes.filter((_, i) => l.pal + i >= (manifest.spritePalettes?.used ?? 25)).length, 0)),
    },
  };
}

/** The symbol map of a ROM made with this engine (the harness's symbols.json). */
export function romSymbols(engine: Engine): string {
  return JSON.stringify({ set: engine.manifest.set, lab_state: engine.manifest.lab_state, symbols: engine.manifest.symbols, engine: engine.manifest.sha256 }, null, 1) + "\n";
}
