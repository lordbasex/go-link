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
import { CELL, layerGrid, objectLayer, tagLayer, TAG_NUMBER, type Level, type Project, type TileLayer } from "../model";
import { rulesWith } from "../engine/rules";
import { MENU_FIELDS, menuText, screenLines, type Ink, type MenuScreenId, type TextLine } from "../game/menus";
import { playerSlots } from "../game/settings";
import { BUILTIN_HERO } from "../model";

/** The engine as rom/tools/engine.mjs ships it (engine.json). */
export interface EngineManifest {
  format: number;
  set: string;
  dataAddr: number;
  program: { offset: number; size: number };
  sprites: { offset: number; size: number; code: number };
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
  stats: { level: string; cols: number; rows: number; playTiles: number; farTiles: number; enemies: number; civilians: number; crates: number; pickups: number; dataBytes: number };
}

// rom/engine/wmdata.h
export const WM_DATA_ADDR = 0x100000;
const WM_MAGIC = 0x574d4431;
const WM_VERSION = 1;
const HEADER = 0x70;
const FONT_BIG = 0x0080;
const EMPTY16 = 0x0400;
const EMPTY32 = 0x0200;
const FAR_TILES = 0x0800;
const PLAY_TILES = 0x4000;
const MAX_CELLS = 24576;
const SCR = { title: 0, hud: 1, clear: 2, continue: 3, gameOver: 4, join: 5, ammo: 6, coin: 7 } as const;
const TXT_BIG = 0x10;
const TXT_COUNT = 0x20;
const TXT_BLINK = 0x40;
const INK: Record<Ink, number> = { accent: 0, white: 1, cyan: 2 };
const ITEM: Record<string, number> = { bazooka: 1, health: 2 };
const F_FREE_PLAY = 1;

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

/** A layer's palette: its tileset's first palette (15 colors), or none. */
function layerPalette(project: Project, layer: TileLayer | undefined): [number, number, number][] {
  const ts = layer?.tileset ? project.tilesets.find((t) => t.id === layer.tileset) : undefined;
  const pal = ts ? project.palettes.find((p) => p.id === ts.palettes[0]) : undefined;
  return (pal?.colors ?? []).slice(0, 15).map(hexRgb);
}

function paletteWords(colors: [number, number, number][]): number[] {
  const out = colors.map((c) => toCps1(c).word);
  while (out.length < 16) out.push(0x0000);
  return out;
}

/** Tile n (1-based) of a tileset picture as pens of its palette (pen 15 transparent). */
function tilePens(pic: Picture, columns: number, size: number, n: number, colors: [number, number, number][]): Pens {
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
        const d = (c[0] - r) ** 2 * 3 + (c[1] - g) ** 2 * 4 + (c[2] - b) ** 2 * 2;
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

/**
 * Packs a project into a slammast set with the engine. `pictures` gives the
 * decoded picture of a tileset (by id), or null when it is missing.
 */
export function packGame(project: Project, engine: Engine, pictures: (tilesetId: string) => Picture | null): PackResult {
  const notes: RomNote[] = [];
  const note = (id: string, params?: Record<string, string | number>) => {
    if (!notes.some((n) => n.id === id)) notes.push(params ? { id, params } : { id });
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

  const tileMap = (layer: TileLayer | undefined, size: 16 | 32, base: number, empty: number): { codes: Uint16Array; cols: number; rows: number; used: number } => {
    const lc = Math.ceil(level.size.w / size);
    const lr = Math.ceil(level.size.h / size);
    const codes = new Uint16Array(lc * lr).fill(empty);
    if (!layer) return { codes, cols: lc, rows: lr, used: 0 };
    if (layer.grid !== size) {
      note("grid", { layer: layer.id, grid: layer.grid });
      return { codes, cols: lc, rows: lr, used: 0 };
    }
    const ts = project.tilesets.find((t) => t.id === layer.tileset);
    const pic = ts ? pictures(ts.id) : null;
    const grid = layerGrid(level, layer);
    if (!ts || !pic || ts.tile !== size) {
      if (grid.cells.some((v) => v)) note("tileset", { layer: layer.id });
      return { codes, cols: lc, rows: lr, used: 0 };
    }
    const columns = ts.columns ?? Math.max(1, Math.floor(pic.w / size));
    const colors = layerPalette(project, layer);
    const done = new Set<number>();
    for (let i = 0; i < codes.length; i++) {
      const n = grid.cells[i] ?? 0;
      if (!n) continue;
      codes[i] = base + n - 1;
      if (done.has(n)) continue;
      done.add(n);
      const pens = tilePens(pic, columns, size, n, colors);
      if (size === 16) gfx.tile16(base + n - 1, pens);
      else gfx.tile32(base + n - 1, pens);
    }
    return { codes, cols: lc, rows: lr, used: done.size };
  };
  const play = tileMap(playLayer, 16, PLAY_TILES, EMPTY16);
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
        crates.push([Math.floor(o.x / CELL), Math.floor(o.y / CELL), num(o.size, 32) >= 32 ? 2 : 1, num(o.hp, 3), ITEM[contents] ?? 0, 0]);
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

  // each player's look: Willy, or a recruit's shirt
  const slots = playerSlots(project)
    .slice(0, 4)
    .map((s) => {
      if (s.character !== BUILTIN_HERO) {
        note("characters");
        return 0;
      }
      return Math.max(0, Math.min(3, s.variant));
    });
  while (slots.length < 4) slots.push(slots.length);

  const rules = rulesWith(project.settings.rules);
  const dip = project.settings.dip;

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
  const playColors = layerPalette(project, playLayer);
  const farColors = layerPalette(project, farLayer);
  for (const w of [...paletteWords(playColors), ...paletteWords(farColors)]) out.u16(w);
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
  w16(dip.freePlay ? F_FREE_PLAY : 0);
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
  if (h !== HEADER) throw new Error(`wm_data header is ${h} bytes, expected ${HEADER}`);
  const data = out.bytes();
  if (data.length > 0x100000) throw new Error(`the game's data is ${data.length} bytes: at most 1 MB`);

  // the program space: engine at 0, data at 0x100000
  const space = new Uint8Array(SLAMMAST.programSize).fill(0xff);
  space.set(bin.subarray(manifest.program.offset, manifest.program.offset + manifest.program.size), 0);
  space.set(data, WM_DATA_ADDR);
  const files = new Map<string, Uint8Array>();
  for (const [name, bytes] of Object.entries(splitProgram(SLAMMAST, space))) files.set(name, bytes);
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
      enemies: enemies.length,
      civilians: civs.length,
      crates: crates.length,
      pickups: pickups.length,
      dataBytes: data.length,
    },
  };
}

/** The symbol map of a ROM made with this engine (the harness's symbols.json). */
export function romSymbols(engine: Engine): string {
  return JSON.stringify({ set: engine.manifest.set, lab_state: engine.manifest.lab_state, symbols: engine.manifest.symbols, engine: engine.manifest.sha256 }, null, 1) + "\n";
}
