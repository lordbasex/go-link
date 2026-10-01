// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The CPS-1 board profile: its screen, layers and limits (docs/rom/hardware.md
// and docs/rom/art-spec.md) and the budget meters the editor shows. Numbers
// here are the board's; the editor stays board-agnostic by reading them.

import type { LayoutId, Project } from "../model";
import { objectLayer } from "../model";

export interface SetLayout {
  id: LayoutId;
  players: number;
  buttons: number;
}

export interface LayerSpec {
  /** The board's layer name. */
  id: "scroll1" | "scroll2" | "scroll3";
  /** The editor layer kinds it carries. */
  carries: string[];
  tile: 8 | 16 | 32;
  /**
   * Different tiles the layer can use: its tile codes (16 bits; 14 bits for
   * scroll3), and no more than the graphics ROM holds at that size.
   */
  budget: number;
}

export type MeterLevel = "ok" | "warn" | "over";

export interface Meter {
  id: "spritePalettes" | "playPalettes" | "farPalettes" | "colors" | "graphics" | "sprites";
  used: number;
  max: number;
  level: MeterLevel;
  /** "bytes" meters are shown in MB. */
  unit: "count" | "bytes";
}

export interface BoardProfile {
  id: "cps1";
  name: string;
  screen: { w: number; h: number; fps: number };
  layouts: SetLayout[];
  layers: LayerSpec[];
  colors: { bits: 12; perPalette: number; snap(hex: string): string; isBoardColor(hex: string): boolean };
  palettes: { sprite: number; play: number; far: number; text: number };
  rom: { graphicsBytes: number; programBytes: number };
  /**
   * `margin`: how far off the screen (px) the engine still draws a sprite;
   * sprite X and Y are 9 bits and wrap at `wrap` (docs/rom/hardware.md).
   */
  sprites: { perScreen: number; tile: number; margin: number; wrap: number };
  /** Character heights by role, in px (docs/rom/art-spec.md section 1). */
  heights: Record<"hero" | "enemy" | "civilian" | "boss", [number, number]>;
  /**
   * The biggest level, in pixels. The engine streams map columns into the
   * wrapping scroll layers, so the limit is the level data, not the layers.
   */
  levels: { maxW: number; maxH: number; cell: number };
  /** The 8 × 8 font's characters (lowercase is folded to uppercase). */
  font: string;
  /** Bytes one tile of that size takes in the graphics ROM (4 bits per pixel). */
  tileBytes(size: number): number;
  meters(project: Project): Meter[];
}

/** The nearest board color: each channel a multiple of 17 (art-spec.md). */
export function snapColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#000000";
  const n = parseInt(m[1]!, 16);
  const ch = (shift: number) => (Math.round(((n >> shift) & 255) / 17) * 17).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`.toUpperCase();
}

export function isBoardColor(hex: string): boolean {
  return snapColor(hex) === `#${hex.replace(/^#/, "").toUpperCase()}`;
}

function level(used: number, max: number): MeterLevel {
  if (used > max) return "over";
  return used >= max * 0.85 ? "warn" : "ok";
}

/** Sprite tiles (16 × 16) a character on screen takes, by object type. */
const SPRITE_TILES: Record<string, number> = { player_start: 9, enemy: 9, civilian: 6, boss: 36, pickup: 1 };

export const CPS1: BoardProfile = {
  id: "cps1",
  name: "CPS-1",
  screen: { w: 384, h: 224, fps: 60 },
  layouts: [
    { id: "slammast", players: 4, buttons: 3 },
    { id: "captcomm", players: 4, buttons: 2 },
  ],
  layers: [
    { id: "scroll1", carries: ["text"], tile: 8, budget: 65536 },
    { id: "scroll2", carries: ["play"], tile: 16, budget: (6 * 1024 * 1024) / 128 },
    { id: "scroll3", carries: ["far", "mid"], tile: 32, budget: (6 * 1024 * 1024) / 512 },
  ],
  colors: { bits: 12, perPalette: 15, snap: snapColor, isBoardColor },
  palettes: { sprite: 32, play: 32, far: 32, text: 32 },
  rom: { graphicsBytes: 6 * 1024 * 1024, programBytes: 2 * 1024 * 1024 },
  sprites: { perScreen: 256, tile: 16, margin: 64, wrap: 512 },
  heights: { hero: [40, 48], enemy: [16, 64], civilian: [20, 44], boss: [64, 160] },
  levels: { maxW: 16384, maxH: 2048, cell: 16 },
  font: " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ!?.,:-+/'()=%#",
  tileBytes(size) {
    // 4 bits per pixel; 8 × 8 tiles sit in a 16-pixel-wide slot (64 bytes).
    if (size <= 8) return 64;
    return (size * size) / 2;
  },
  meters(project) {
    const count = (g: string) => project.palettes.filter((p) => p.group === g).length;
    const maxColors = project.palettes.reduce((m, p) => Math.max(m, p.colors.length), 0);
    // Graphics: every tile of every tileset, plus every character frame in 16 × 16 tiles.
    let bytes = 0;
    for (const ts of project.tilesets) bytes += (ts.count ?? 0) * this.tileBytes(ts.tile);
    for (const ch of project.characters)
      for (const f of ch.frames) bytes += Math.ceil(f.w / 16) * Math.ceil(f.h / 16) * this.tileBytes(16);
    // Sprites on screen: the busiest screen-wide window of any level.
    let sprites = 0;
    for (const lv of project.levels) {
      const items = objectLayer(lv).items.filter((o) => SPRITE_TILES[o.type]).sort((a, b) => a.x - b.x);
      let j = 0;
      let sum = 0;
      for (let i = 0; i < items.length; i++) {
        sum += SPRITE_TILES[items[i]!.type]!;
        while (items[i]!.x - items[j]!.x > this.screen.w) sum -= SPRITE_TILES[items[j++]!.type]!;
        sprites = Math.max(sprites, sum);
      }
      // the extra players join the first one
      sprites = Math.max(sprites, project.settings.players * 9);
    }
    const meters: Meter[] = [
      { id: "spritePalettes", used: count("sprite"), max: this.palettes.sprite, unit: "count", level: "ok" },
      { id: "playPalettes", used: count("play"), max: this.palettes.play, unit: "count", level: "ok" },
      { id: "farPalettes", used: count("far"), max: this.palettes.far, unit: "count", level: "ok" },
      { id: "colors", used: maxColors, max: this.colors.perPalette, unit: "count", level: "ok" },
      { id: "graphics", used: bytes, max: this.rom.graphicsBytes, unit: "bytes", level: "ok" },
      { id: "sprites", used: sprites, max: this.sprites.perScreen, unit: "count", level: "ok" },
    ];
    // a palette may use all 15 colors; the other meters warn when nearly full
    for (const m of meters) m.level = m.id === "colors" ? (m.used > m.max ? "over" : "ok") : level(m.used, m.max);
    return meters;
  },
};

/** The board profile of a project (only CPS-1 for now). */
export function boardOf(_project?: Project): BoardProfile {
  return CPS1;
}

export function layoutOf(project: Project): SetLayout {
  return CPS1.layouts.find((l) => l.id === project.board.layout) ?? CPS1.layouts[0]!;
}
