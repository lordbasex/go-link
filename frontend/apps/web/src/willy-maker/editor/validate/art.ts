// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Level 1 rules about backgrounds and sprites that need no pictures: every
// tile layer on its board layer's grid with a tileset of that size and tile
// numbers inside it (gfx.tile-grid), pivots inside their frames
// (anim.pivot), character heights within art-spec.md's table (anim.size)
// and sprites small enough not to wrap around the 512 px sprite space
// (sprite.wrap). The checks that read pixels are in pictures.ts.

import { layerGrid, objectLayer, type Character, type Level, type LevelObject, type Project, type TileLayer, type Tileset } from "../../model";
import type { BoardProfile, LayerSpec } from "../../board/cps1";
import type { Check, Target } from ".";

const levelName = (l: Level, i: number) => l.name?.trim() || `${i + 1}`;
const layerName = (l: TileLayer) => l.name?.trim() || l.id;

/** The board layer a tile layer goes to (by its id: play, far, mid, text). */
export function boardLayerOf(layer: TileLayer, board: BoardProfile): LayerSpec | undefined {
  return board.layers.find((s) => s.carries.includes(layer.id));
}

/** The tileset a tile layer draws with: its own, or the first one of its grid size (as the AI pack does). */
export function tilesetOf(p: Project, layer: TileLayer): Tileset | undefined {
  if (layer.tileset) return p.tilesets.find((t) => t.id === layer.tileset);
  return p.tilesets.find((t) => t.tile === layer.grid);
}

export function tileGridChecks(p: Project, board: BoardProfile): Check[] {
  const out: Check[] = [];
  p.levels.forEach((level, i) => {
    const name = levelName(level, i);
    const go: Target = { tab: "build", level: level.id };
    for (const layer of level.layers) {
      if (layer.kind !== "tiles") continue;
      const spec = boardLayerOf(layer, board);
      if (spec && layer.grid !== spec.tile) {
        out.push({ id: "gfx.tile-grid", severity: "error", msg: "gfx.tile-grid", params: { level: name, layer: layerName(layer), size: spec.tile }, target: go });
        continue;
      }
      if (layer.tileset && !p.tilesets.some((t) => t.id === layer.tileset)) {
        out.push({ id: "gfx.tile-grid", severity: "error", msg: "gfx.tileset-missing", params: { level: name, layer: layerName(layer), tileset: layer.tileset }, target: go });
        continue;
      }
      const ts = tilesetOf(p, layer);
      let grid;
      try {
        grid = layerGrid(level, layer);
      } catch {
        continue;
      }
      let max = 0;
      let used = 0;
      for (const v of grid.cells)
        if (v) {
          used++;
          if (v > max) max = v;
        }
      if (!used) continue;
      if (!ts) {
        out.push({ id: "gfx.tile-grid", severity: "error", msg: "gfx.tileset-none", params: { level: name, layer: layerName(layer) }, target: go });
        continue;
      }
      if (ts.tile !== layer.grid) {
        out.push({ id: "gfx.tile-grid", severity: "error", msg: "gfx.tileset-size", params: { level: name, layer: layerName(layer), tileset: ts.id, tile: ts.tile, size: layer.grid }, target: go });
        continue;
      }
      const count = Number(ts.count);
      if (Number.isFinite(count) && count > 0 && max > count) {
        let n = 0;
        for (const v of grid.cells) if (v > count) n++;
        out.push({ id: "gfx.tile-grid", severity: "error", msg: "gfx.tile-range", params: { level: name, layer: layerName(layer), n, max: count }, target: go, fix: "tile-range" });
      }
    }
  });
  if (!out.length && p.levels.length) out.push({ id: "gfx.tile-grid", severity: "ok", msg: "gfx.tile-grid.ok", params: {} });
  return out;
}

/** Clears the cells that point past their tileset's last tile (the gfx.tile-range fix). */
export function clearTilesOutOfRange(p: Project): void {
  for (const level of p.levels)
    for (const layer of level.layers) {
      if (layer.kind !== "tiles") continue;
      const ts = tilesetOf(p, layer);
      const count = Number(ts?.count);
      if (!ts || !(count > 0)) continue;
      const grid = layerGrid(level, layer);
      let changed = false;
      for (let k = 0; k < grid.cells.length; k++)
        if (grid.cells[k]! > count) {
          grid.cells[k] = 0;
          changed = true;
        }
      if (changed) grid.commit();
    }
}

/** Animations whose frames stand on the ground: the feet line must not move. */
export function groundAnim(name: string): boolean {
  return !/jump|fall|climb|hurt|hit|die|death|dead|air|fly|swim/i.test(name);
}

/** Puts every pivot inside its frame (the anim.pivot fix). */
export function clampPivots(p: Project): void {
  for (const ch of p.characters)
    for (const f of ch.frames) {
      const w = Math.max(1, Math.round(Number(f.w) || 1));
      const h = Math.max(1, Math.round(Number(f.h) || 1));
      f.px = Math.min(w - 1, Math.max(0, Math.round(Number(f.px) || 0)));
      f.py = Math.min(h - 1, Math.max(0, Math.round(Number(f.py) || h - 1)));
    }
}

/** The objects of the levels a character plays (heroes: the player starts). */
function objectsOf(p: Project, ch: Character): { level: Level; o: LevelObject }[] {
  const out: { level: Level; o: LevelObject }[] = [];
  for (const level of p.levels) {
    let items: LevelObject[] = [];
    try {
      items = objectLayer(level).items;
    } catch {
      continue;
    }
    for (const o of items) {
      const mine = ch.role === "hero" ? o.type === "player_start" : o.type === ch.role && o.kind === ch.id;
      if (mine) out.push({ level, o });
    }
  }
  return out;
}

export function spriteChecks(p: Project, board: BoardProfile): Check[] {
  const out: Check[] = [];
  let pivotOk = true;
  let sizeOk = true;
  let wrapOk = true;
  for (const ch of p.characters) {
    const who = ch.name || ch.id;
    const target: Target = { tab: "characters", character: ch.id };
    // pivots inside their frames
    const outside = ch.frames.find((f) => !(f.px >= 0 && f.px < f.w && f.py >= 0 && f.py < f.h));
    if (outside) {
      pivotOk = false;
      out.push({ id: "anim.pivot", severity: "warning", msg: "anim.pivot-box", params: { character: who, frame: outside.id }, target, fix: "pivots" });
    }
    // the height against the art spec's table
    const range = board.heights[ch.role];
    if (range) {
      const idle = new Set(ch.anims?.idle?.frames ?? []);
      const idleFrames = ch.frames.filter((f) => idle.has(f.id));
      const h = idleFrames.length ? Math.max(...idleFrames.map((f) => f.h)) : Number(ch.height) || 0;
      if (h && (h < range[0] || h > range[1])) {
        sizeOk = false;
        out.push({ id: "anim.size", severity: "warning", msg: "anim.size", params: { character: who, h, min: range[0], max: range[1] }, target });
      }
    }
    // wide sprites wrap: the engine draws a sprite while its pivot is within
    // `margin` px of the screen, so a part farther than that from the pivot
    // goes past the 512 px sprite space and shows up on the other side
    const used = new Set(Object.values(ch.anims ?? {}).flatMap((a) => a.frames ?? []));
    const wide = ch.frames.find((f) => used.has(f.id) && (f.px > board.sprites.margin || f.w - f.px > board.sprites.margin + 1));
    if (wide) {
      wrapOk = false;
      const at = objectsOf(p, ch)[0];
      if (at)
        out.push({ id: "sprite.wrap", severity: "error", msg: "sprite.wrap", params: { character: who, frame: wide.id, x: at.o.x, w: wide.w, margin: board.sprites.margin }, target: { tab: "build", level: at.level.id, x: at.o.x, y: at.o.y, object: at.o.name } });
      else out.push({ id: "sprite.wrap", severity: "error", msg: "sprite.wrap-character", params: { character: who, frame: wide.id, w: wide.w, margin: board.sprites.margin }, target });
    }
  }
  if (p.characters.length) {
    if (pivotOk) out.push({ id: "anim.pivot", severity: "ok", msg: "anim.pivot.ok", params: {} });
    if (sizeOk) out.push({ id: "anim.size", severity: "ok", msg: "anim.size.ok", params: {} });
    if (wrapOk) out.push({ id: "sprite.wrap", severity: "ok", msg: "sprite.wrap.ok", params: { margin: board.sprites.margin } });
  }
  return out;
}

/** The ROM prototype's 68000 program without any level (rom/build/obj/program.bin, rounded up). */
export const ENGINE_BYTES = 64 * 1024;

/**
 * Bytes the program ROM needs for the engine and the game's data: every
 * map cell (2 bytes per tile, 1 per collision tag), objects, palettes,
 * sprite frame tables and the menu texts.
 */
export function programBytes(p: Project): number {
  let bytes = ENGINE_BYTES;
  for (const level of p.levels)
    for (const layer of level.layers) {
      if (layer.kind === "objects") bytes += layer.items.length * 16;
      else {
        const cells = Math.ceil(level.size.w / layer.grid) * Math.ceil(level.size.h / layer.grid);
        bytes += layer.kind === "tags" ? cells : cells * 2;
      }
    }
  bytes += p.palettes.length * 32;
  for (const ch of p.characters) bytes += ch.frames.length * 16 + Object.keys(ch.anims ?? {}).length * 8;
  bytes += JSON.stringify(p.settings.menus ?? {}).length;
  return bytes;
}

export function programChecks(p: Project, board: BoardProfile): Check[] {
  const used = programBytes(p);
  const max = board.rom.programBytes;
  const mb = (v: number) => Math.round((v / 1048576) * 100) / 100;
  return [{ id: "game.size", severity: used > max ? "error" : "ok", msg: used > max ? "game.size" : "game.size.ok", params: { used: mb(used), max: mb(max) }, target: used > max ? { tab: "game" } : undefined }];
}
