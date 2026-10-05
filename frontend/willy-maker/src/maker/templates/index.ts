// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Templates a new game starts from. They are pure data: the starter
// tilesets' pictures are attached later (io/starter.ts), by hash.

import { layerGrid, newLevel, newProject, tagGrid, type LayoutId, type Project, type TileLayer } from "../model";
import { applyAutoArt } from "../editor/autoArt";
import { buenosAiresLevel } from "./buenosAires";
import { CITY_COLORS, CITY_TILESET, SKY_COLORS, SKY_TILESET } from "./tiles";

export type TemplateId = "buenos-aires" | "empty";

export interface TemplateOptions {
  title: string;
  author?: string;
  layout: LayoutId;
  players: number;
  /** For "empty": the first level's name and size. */
  levelName?: string;
  screens?: number;
  height?: number;
}

/** The starter tilesets and their palettes (pictures attached later). */
export function addStarterTilesets(project: Project): void {
  if (!project.tilesets.some((t) => t.id === CITY_TILESET.id))
    project.tilesets.push({ id: CITY_TILESET.id, tile: CITY_TILESET.tile, image: null, palettes: [CITY_TILESET.palette], columns: CITY_TILESET.columns, count: CITY_TILESET.count });
  if (!project.tilesets.some((t) => t.id === SKY_TILESET.id))
    project.tilesets.push({ id: SKY_TILESET.id, tile: SKY_TILESET.tile, image: null, palettes: [SKY_TILESET.palette], columns: SKY_TILESET.columns, count: SKY_TILESET.count });
  if (!project.palettes.some((p) => p.id === CITY_TILESET.palette)) project.palettes.push({ id: CITY_TILESET.palette, group: "play", colors: [...CITY_COLORS] });
  if (!project.palettes.some((p) => p.id === SKY_TILESET.palette)) project.palettes.push({ id: SKY_TILESET.palette, group: "far", colors: [...SKY_COLORS] });
}

export function projectFromTemplate(id: TemplateId, opts: TemplateOptions): Project {
  const level =
    id === "buenos-aires"
      ? buenosAiresLevel(opts.players)
      : newLevel({ id: "level-1", name: opts.levelName || "Level 1", w: 384 * Math.max(1, Math.min(21, opts.screens ?? 4)), h: opts.height ?? 224, players: opts.players });
  if (id === "empty") {
    for (const l of level.layers) if (l.kind === "tiles" && l.id === "play") l.tileset = CITY_TILESET.id;
    for (const l of level.layers) if (l.kind === "tiles" && l.id === "far") l.tileset = SKY_TILESET.id;
    // the floor gets its street art
    const tags = tagGrid(level);
    const play = layerGrid(level, level.layers.find((l): l is TileLayer => l.id === "play")!);
    applyAutoArt(tags, play, 0, 0, tags.cols - 1, tags.rows - 1);
    play.commit();
  }
  const project = newProject({ title: opts.title, author: opts.author, layout: opts.layout, players: opts.players, levels: [level] });
  addStarterTilesets(project);
  return project;
}
