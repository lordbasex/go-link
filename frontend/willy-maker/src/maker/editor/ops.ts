// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The editor's operations, built on the store's commands: pencil strokes
// over a layer (with the auto art), object stamps, moves and property
// changes, and the edits that arrive from play mode.

import {
  CELL,
  layerGrid,
  objectLayer,
  OBJECT_TYPES,
  TAG_NUMBER,
  uniqueName,
  type Level,
  type LevelObject,
  type TagLayer,
  type TileLayer,
} from "../model";
import { applyAutoArt, autoArtFits } from "./autoArt";
import { baseName, type Part } from "./parts";
import { cellsCommand, type CellChange, type EditorStore } from "./store";

/**
 * A pencil, eraser or fill stroke on one layer: cells change at once (so
 * the canvas shows them), and `end()` records the whole stroke as one undo
 * step.
 */
export class Stroke {
  private changes = new Map<number, [number, number]>();
  private art = new Map<number, [number, number]>();

  constructor(
    private store: EditorStore,
    private levelId: string,
    private layerId: string,
    private value: number,
    private autoArt: boolean,
    private label: string,
  ) {}

  private layers(): { level: Level; layer: TileLayer | TagLayer; play: TileLayer | undefined } | null {
    const level = this.store.level(this.levelId);
    const layer = level?.layers.find((l) => l.id === this.layerId);
    if (!level || !layer || (layer.kind !== "tiles" && layer.kind !== "tags")) return null;
    const play = level.layers.find((l): l is TileLayer => l.id === "play" && l.kind === "tiles");
    return { level, layer, play };
  }

  /** Paints the cells of a rectangle (inclusive, in the layer's grid). */
  paint(c0: number, r0: number, c1: number, r1: number): void {
    const found = this.layers();
    if (!found) return;
    const { level, layer, play } = found;
    const grid = layerGrid(level, layer);
    const [ca, cb] = c0 <= c1 ? [c0, c1] : [c1, c0];
    const [ra, rb] = r0 <= r1 ? [r0, r1] : [r1, r0];
    let changed = false;
    for (let r = Math.max(0, ra); r <= Math.min(grid.rows - 1, rb); r++)
      for (let c = Math.max(0, ca); c <= Math.min(grid.cols - 1, cb); c++) {
        const i = r * grid.cols + c;
        const before = grid.cells[i]!;
        if (before === this.value) continue;
        grid.cells[i] = this.value;
        const prev = this.changes.get(i);
        this.changes.set(i, [prev ? prev[0] : before, this.value]);
        changed = true;
      }
    if (!changed) return;
    grid.commit();
    if (this.autoArt && layer.kind === "tags" && play && play.grid === CELL && autoArtFits(play)) {
      const playGrid = layerGrid(level, play);
      for (const [i, b, a] of applyAutoArt(grid, playGrid, ca, ra, cb, rb)) {
        const prev = this.art.get(i);
        this.art.set(i, [prev ? prev[0] : b, a]);
      }
      playGrid.commit();
    }
    this.store.touch();
  }

  /** Puts back every cell this stroke changed, leaving no undo step (a second finger turned it into a pinch). */
  cancel(): void {
    const found = this.layers();
    if (!found) return;
    const { level, layer, play } = found;
    const grid = layerGrid(level, layer);
    for (const [i, [before]] of this.changes) grid.cells[i] = before;
    grid.commit();
    if (this.art.size && play) {
      const playGrid = layerGrid(level, play);
      for (const [i, [before]] of this.art) playGrid.cells[i] = before;
      playGrid.commit();
    }
    this.changes.clear();
    this.art.clear();
    this.store.touch();
  }

  end(): void {
    const list = (m: Map<number, [number, number]>): CellChange[] => [...m].filter(([, [b, a]]) => b !== a).map(([i, [b, a]]) => [i, b, a]);
    const parts = [{ layerId: this.layerId, changes: list(this.changes) }];
    if (this.art.size) parts.push({ layerId: "play", changes: list(this.art) });
    if (!parts.some((p) => p.changes.length)) return;
    this.store.run(cellsCommand(this.label, this.levelId, parts), true);
  }
}

function crateCells(level: Level, c: number, r: number, tag: number, autoArt: boolean) {
  const tags = level.layers.find((l): l is TagLayer => l.kind === "tags");
  if (!tags) return;
  const grid = layerGrid(level, tags);
  for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) grid.set(c + dc, r + dr, tag);
  grid.commit();
  const play = level.layers.find((l): l is TileLayer => l.id === "play" && l.kind === "tiles");
  if (autoArt && play && autoArtFits(play)) {
    const playGrid = layerGrid(level, play);
    applyAutoArt(grid, playGrid, c, r, c + 1, r + 1);
    playGrid.commit();
  }
}

/** Places a part's object at a world point (feet at y). Returns its name. */
export function placePart(store: EditorStore, levelId: string, part: Part, x: number, y: number, autoArt: boolean, label: string): string | null {
  let name: string | null = null;
  store.editLevel(label, levelId, (level) => {
    const items = objectLayer(level).items;
    if (part.kind === "crate") {
      const c = Math.floor(x / CELL);
      const r = Math.floor(y / CELL);
      name = uniqueName(level, "crate");
      crateCells(level, c, r, TAG_NUMBER.crate, autoArt);
      items.push({ name, type: "crate", x: c * CELL, y: r * CELL, size: 32, hp: 2, contents: "nothing" });
      return;
    }
    if (part.kind !== "object") return;
    name = uniqueName(level, baseName(part));
    const o: LevelObject = { name, type: part.type, x: Math.round(x / 8) * 8, y: Math.round(y / CELL) * CELL, ...part.props };
    if (part.type === "platform") {
      // its top on a 16 px row, its left on an 8 px column
      o.x = Math.max(0, Math.round(x / 8) * 8 - 24);
      o.y = Math.floor(y / CELL) * CELL;
    }
    if (part.type === "camera_lock") {
      o.x = Math.max(0, Math.min(level.size.w - 384, Math.floor(x / CELL) * CELL));
      o.y = Math.max(0, Math.min(level.size.h - 224, Math.floor(y / CELL) * CELL - 112));
    }
    // a player start replaces the same player's old one
    if (part.type === "player_start") {
      const old = items.findIndex((i) => i.type === "player_start" && i.player === part.props.player);
      if (old >= 0) items.splice(old, 1);
      o.name = uniqueName(level, baseName(part));
      name = o.name;
    }
    if (part.type === "exit") {
      const old = items.findIndex((i) => i.type === "exit");
      if (old >= 0) items.splice(old, 1);
    }
    items.push(o);
  });
  return name;
}

export function updateObject(store: EditorStore, levelId: string, name: string, patch: Partial<LevelObject>, label: string): void {
  store.editLevel(label, levelId, (level) => {
    const o = objectLayer(level).items.find((i) => i.name === name);
    if (!o) return;
    // a crate's cells move with it
    if (o.type === "crate" && (patch.x !== undefined || patch.y !== undefined)) {
      crateCells(level, Math.floor(o.x / CELL), Math.floor(o.y / CELL), TAG_NUMBER.air, true);
      const nx = patch.x ?? o.x;
      const ny = patch.y ?? o.y;
      crateCells(level, Math.floor(nx / CELL), Math.floor(ny / CELL), TAG_NUMBER.crate, true);
    }
    Object.assign(o, patch);
  });
}

export function deleteObject(store: EditorStore, levelId: string, name: string, label: string): void {
  store.editLevel(label, levelId, (level) => {
    const items = objectLayer(level).items;
    const i = items.findIndex((o) => o.name === name);
    if (i < 0) return;
    const o = items[i]!;
    if (o.type === "crate") crateCells(level, Math.floor(o.x / CELL), Math.floor(o.y / CELL), TAG_NUMBER.air, true);
    items.splice(i, 1);
  });
}

/** Is `name` free to give the object now called `current`? */
export function nameFree(level: Level, name: string, current: string): boolean {
  return /^[A-Za-z0-9_]+$/.test(name) && !objectLayer(level).items.some((o) => o.name === name && o.name !== current);
}

/** An edit from play mode: cells to tag, or an object to add. */
export type PlayModeEdit =
  | { kind: "cells"; cells: { col: number; row: number; tag: number }[] }
  | { kind: "object"; object: { name: string; type: string; x: number; y: number; [prop: string]: unknown } };

export function applyPlayEdit(store: EditorStore, levelId: string, edit: PlayModeEdit, label: string): void {
  store.editLevel(label, levelId, (level) => {
    const tags = level.layers.find((l): l is TagLayer => l.kind === "tags");
    if (!tags) return;
    if (edit.kind === "cells") {
      const grid = layerGrid(level, tags);
      let c0 = Infinity;
      let r0 = Infinity;
      let c1 = -Infinity;
      let r1 = -Infinity;
      for (const c of edit.cells) {
        grid.set(c.col, c.row, c.tag);
        c0 = Math.min(c0, c.col);
        r0 = Math.min(r0, c.row);
        c1 = Math.max(c1, c.col);
        r1 = Math.max(r1, c.row);
      }
      grid.commit();
      const play = level.layers.find((l): l is TileLayer => l.id === "play" && l.kind === "tiles");
      if (play && edit.cells.length) {
        const playGrid = layerGrid(level, play);
        applyAutoArt(grid, playGrid, c0, r0, c1, r1);
        playGrid.commit();
      }
      return;
    }
    if (!(OBJECT_TYPES as readonly string[]).includes(edit.object.type)) return;
    const o = { ...edit.object, name: uniqueName(level, edit.object.name) } as LevelObject;
    if (o.type === "crate") crateCells(level, Math.floor(o.x / CELL), Math.floor(o.y / CELL), TAG_NUMBER.crate, true);
    objectLayer(level).items.push(o);
  });
}

/** The object under a world point, topmost first. */
export function objectAt(level: Level, x: number, y: number, box: (o: LevelObject) => { x: number; y: number; w: number; h: number }): LevelObject | null {
  const items = objectLayer(level).items;
  for (let i = items.length - 1; i >= 0; i--) {
    const o = items[i]!;
    const b = box(o);
    // big rectangles (camera locks) are picked by their border only
    const big = b.w >= 200 && b.h >= 150;
    const inside = x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    const nearEdge = x - b.x < 12 || b.x + b.w - x < 12 || y - b.y < 12 || b.y + b.h - y < 12;
    if (inside && (!big || nearEdge)) return o;
  }
  return null;
}
