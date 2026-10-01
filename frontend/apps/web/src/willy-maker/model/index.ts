// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The project model: types (file-format.md), cell encoding, factories for
// new projects and levels, and the small helpers every part of the module
// uses to read a level (its layers, its cells, its objects).

import { decodeCells, encodeCells } from "./rle";
import { InputError } from "./inputError";
import {
  BUILTIN_HERO,
  PROJECT_FORMAT,
  TAG_NUMBER,
  TAGS,
  type BoardRef,
  type GameSettings,
  type Animation,
  type Character,
  type Frame,
  type Layer,
  type Level,
  type LevelObject,
  type MenuScreen,
  type MenuSettings,
  type ObjectLayer,
  type Palette,
  type PlayerSlot,
  type Project,
  type Tag,
  type TagLayer,
  type TileLayer,
  type Tileset,
} from "./types";

export * from "./types";
export * from "./inputError";
export { decodeCells, encodeCells } from "./rle";

/** The collision grid, in pixels. */
export const CELL = 16;

/** A random id (UUID v4 when the browser has it). */
export function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // not a secure context
  }
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`;
}

/** The credits line new games start with. */
export const DEFAULT_CREDITS = "(C) 2026 go-link";
/** The double-tap window for running (docs/rom/story.md), and its bounds. */
export const RUN_TAP_MS = 250;
export const RUN_TAP_MIN = 100;
export const RUN_TAP_MAX = 400;

/** Willy for player 1; players 2-4 are recruits: Willy in their own shirt. */
export function defaultPlayerSlots(): PlayerSlot[] {
  return [0, 1, 2, 3].map((variant) => ({ character: BUILTIN_HERO, variant }));
}

/** Each menu screen's starting background, music slot and credits line ("" level = the first level). */
export function defaultMenus(): MenuSettings {
  const screen = (bg: "level" | "solid", music: string, credits: boolean, extra: Partial<MenuScreen> = {}): MenuScreen => ({
    blocks: [],
    texts: {},
    background: bg === "level" ? { kind: "level", level: "" } : { kind: "solid", color: "#000000" },
    music,
    credits,
    ...extra,
  });
  return {
    title: screen("level", "title", true),
    attract: screen("level", "none", true, { demoLevel: "", panels: [] }),
    select: screen("solid", "select", false, { characters: [] }),
    hud: screen("level", "stage", false),
    continue: screen("solid", "continue", false),
    gameOver: screen("solid", "game-over", false),
    highScores: screen("solid", "high-scores", true),
  };
}

export function defaultSettings(players = 4, layout: BoardRef["layout"] = "slammast"): GameSettings {
  return {
    players: Math.min(4, Math.max(1, Math.round(players))),
    buttons: { b1: "jump", b2: "fire", b3: layout === "captcomm" ? "b1+b2" : "special", run: "double-tap" },
    actionLabels: {},
    runTapMs: RUN_TAP_MS,
    playerSlots: defaultPlayerSlots(),
    credits: DEFAULT_CREDITS,
    dip: { difficulty: "normal", lives: 3, freePlay: false, demoSound: true },
    menus: defaultMenus(),
    levels: [],
  };
}

/** The standard layer stack of a CPS-1 level, empty. */
export function defaultLayers(w: number, h: number): Layer[] {
  const cells = (grid: number) => encodeCells(new Uint16Array(Math.ceil(w / grid) * Math.ceil(h / grid)));
  return [
    { id: "far", kind: "tiles", grid: 32, data: cells(32), name: "Far background", visible: true, locked: false, opacity: 1 },
    { id: "mid", kind: "tiles", grid: 32, data: cells(32), name: "Middle background", visible: true, locked: false, opacity: 1 },
    { id: "play", kind: "tiles", grid: 16, data: cells(16), name: "Play", visible: true, locked: false, opacity: 1 },
    { id: "collision", kind: "tags", grid: 16, data: cells(16), props: {}, name: "Collision", visible: true, locked: false, opacity: 0.7 },
    { id: "objects", kind: "objects", items: [], name: "Objects", visible: true, locked: false, opacity: 1 },
    { id: "text", kind: "tiles", grid: 8, data: cells(8), name: "HUD and text", visible: false, locked: true, opacity: 1 },
  ];
}

export interface NewLevelOptions {
  id?: string;
  name: string;
  w?: number;
  h?: number;
  /** Paint a solid floor on the bottom two rows. */
  floor?: boolean;
  players?: number;
}

export function newLevel(opts: NewLevelOptions): Level {
  const w = snap(opts.w ?? 384 * 4, CELL);
  const h = snap(opts.h ?? 224, CELL);
  const level: Level = {
    id: opts.id ?? `level-${newId().slice(0, 8)}`,
    name: opts.name,
    size: { w, h },
    camera: { forwardOnly: true, backtrack: 48 },
    layers: defaultLayers(w, h),
    sections: [],
  };
  const grid = tagGrid(level);
  if (opts.floor !== false) {
    for (let r = grid.rows - 2; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) grid.set(c, r, TAG_NUMBER.solid);
    grid.commit();
  }
  const floorY = h - 2 * CELL;
  const objects = objectLayer(level);
  for (let p = 1; p <= (opts.players ?? 1); p++) objects.items.push({ name: `p${p}_start`, type: "player_start", x: 32 + (p - 1) * 24, y: floorY, player: p });
  objects.items.push({ name: "exit", type: "exit", x: w - 48, y: floorY });
  return level;
}

export interface NewProjectOptions {
  title: string;
  author?: string;
  layout?: BoardRef["layout"];
  players?: number;
  /** Levels to start with; one empty level when missing. */
  levels?: Level[];
}

export function newProject(opts: NewProjectOptions): Project {
  const now = new Date().toISOString();
  const layout = opts.layout ?? "slammast";
  const players = opts.players ?? 4;
  const levels = opts.levels ?? [newLevel({ id: "level-1", name: "Level 1", players })];
  const settings = defaultSettings(players, layout);
  settings.levels = levels.map((l) => l.id);
  settings.menus.attract.demoLevel = levels[0]?.id ?? "";
  return {
    format: PROJECT_FORMAT,
    id: newId(),
    title: opts.title.trim() || "Untitled",
    author: opts.author ?? "",
    createdAt: now,
    updatedAt: now,
    board: { id: "cps1", layout },
    settings,
    palettes: [],
    characters: [],
    tilesets: [],
    levels,
  };
}

/**
 * Checks a parsed project.json and brings it to the current format. Unknown
 * fields are kept. Throws an Error with a short reason when it is not a
 * project at all.
 */
export function migrateProject(raw: unknown): Project {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new InputError("project.not-project");
  const p = raw as Partial<Project> & Record<string, unknown>;
  if (typeof p.format !== "number" || !Number.isInteger(p.format) || p.format < 1) throw new InputError("project.not-project");
  if (p.format > PROJECT_FORMAT) throw new InputError("project.newer", { format: p.format, max: PROJECT_FORMAT });
  if (typeof p.id !== "string" || !p.id || p.id.length > 200) throw new InputError("project.not-project");
  if (!Array.isArray(p.levels)) throw new InputError("project.not-project");
  if (p.levels.length > MAX_LEVELS) throw new InputError("project.too-big");
  const layout = p.board?.layout === "captcomm" ? "captcomm" : "slammast";
  const base = defaultSettings(4, layout);
  const s = (p.settings ?? {}) as Partial<GameSettings>;
  const project: Project = {
    ...p,
    format: PROJECT_FORMAT,
    id: p.id,
    title: typeof p.title === "string" ? p.title : "Untitled",
    author: typeof p.author === "string" ? p.author : "",
    createdAt: typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString(),
    updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : new Date().toISOString(),
    board: { id: "cps1", layout },
    settings: {
      ...base,
      ...s,
      buttons: { ...base.buttons, ...(s.buttons ?? {}) },
      actionLabels: isRecord(s.actionLabels) ? { ...(s.actionLabels as GameSettings["actionLabels"]) } : {},
      runTapMs: clampRunTap(s.runTapMs),
      playerSlots: migrateSlots(s.playerSlots),
      credits: typeof s.credits === "string" ? s.credits : DEFAULT_CREDITS,
      dip: { ...base.dip, ...(s.dip ?? {}) },
      menus: migrateMenus(base.menus, s.menus),
      levels: Array.isArray(s.levels) ? s.levels : p.levels.map((l) => (l as Level).id),
    },
    palettes: (Array.isArray(p.palettes) ? p.palettes : []).filter(isPalette).map((x) => ({ ...x, colors: x.colors.filter((c) => typeof c === "string") })),
    characters: (Array.isArray(p.characters) ? (p.characters as unknown[]) : []).filter(isRecord).map(normalizeCharacter),
    tilesets: (Array.isArray(p.tilesets) ? (p.tilesets as unknown[]) : []).filter(isRecord).map(normalizeTileset),
    levels: p.levels.map(normalizeLevel),
  };
  if (!Array.isArray(project.settings.levels) || project.settings.levels.some((x) => typeof x !== "string")) project.settings.levels = project.levels.map((l) => l.id);
  if (!Number.isFinite(Number(project.settings.players))) project.settings.players = base.players;
  return project;
}

/** More levels than any game needs: a file with more is not a project of ours. */
const MAX_LEVELS = 64;
/** Level sizes beyond any board's map (a file asking for more would only fill memory). */
const MAX_LEVEL_W = 65536;
const MAX_LEVEL_H = 8192;

function isPalette(v: unknown): v is Palette {
  return isRecord(v) && typeof v.id === "string" && Array.isArray(v.colors);
}

const num = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);

function normalizeCharacter(raw: Record<string, unknown>): Character {
  const c = raw as unknown as Character;
  const frames = (Array.isArray(c.frames) ? c.frames : []).filter(isRecord).map((f) => {
    const w = Math.max(1, Math.round(num(f.w, 1)));
    const h = Math.max(1, Math.round(num(f.h, 1)));
    return {
      ...f,
      id: String(f.id ?? ""),
      x: Math.round(num(f.x, 0)),
      y: Math.round(num(f.y, 0)),
      w,
      h,
      px: Math.round(num(f.px, w >> 1)),
      py: Math.round(num(f.py, h - 1)),
      zones: Array.isArray(f.zones) ? f.zones.filter((z): z is string => typeof z === "string") : [],
      muzzle: isRecord(f.muzzle) ? (f.muzzle as Frame["muzzle"]) : null,
      hand: isRecord(f.hand) ? (f.hand as Frame["hand"]) : null,
    } as Frame;
  });
  const anims: Record<string, Animation> = {};
  if (isRecord(c.anims))
    for (const [k, a] of Object.entries(c.anims))
      if (isRecord(a)) anims[k] = { ...a, frames: Array.isArray(a.frames) ? a.frames.map(String) : [], fps: Math.min(60, Math.max(1, num(a.fps, 10))), loop: a.loop !== false };
  const role = (["hero", "enemy", "civilian", "boss"] as const).includes(c.role) ? c.role : "enemy";
  return {
    ...c,
    id: String(c.id ?? ""),
    name: typeof c.name === "string" ? c.name : String(c.id ?? ""),
    role,
    height: num(c.height, 44),
    sheet: typeof c.sheet === "string" && c.sheet.startsWith("sha256:") ? c.sheet : null,
    frames,
    anims,
    swapColors: Array.isArray(c.swapColors) ? c.swapColors.filter((x): x is string => typeof x === "string") : [],
  };
}

function normalizeTileset(raw: Record<string, unknown>): Tileset {
  const t = raw as unknown as Tileset;
  const tile = t.tile === 8 || t.tile === 32 ? t.tile : 16;
  const out: Tileset = { ...t, id: String(t.id ?? ""), tile, image: typeof t.image === "string" && t.image.startsWith("sha256:") ? t.image : null, palettes: Array.isArray(t.palettes) ? t.palettes.filter((x) => typeof x === "string") : [] };
  if (t.columns !== undefined) out.columns = Math.max(1, Math.round(num(t.columns, 1)));
  if (t.count !== undefined) out.count = Math.max(0, Math.round(num(t.count, 0)));
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function clampRunTap(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return RUN_TAP_MS;
  return Math.min(RUN_TAP_MAX, Math.max(RUN_TAP_MIN, Math.round(n)));
}

/** Four player slots: the saved ones, the defaults for the rest (format 1 had none). */
function migrateSlots(v: unknown): PlayerSlot[] {
  const saved = Array.isArray(v) ? v : [];
  return defaultPlayerSlots().map((def, i) => {
    const s = saved[i] as Partial<PlayerSlot> | undefined;
    if (!isRecord(s)) return def;
    return {
      ...s,
      character: typeof s.character === "string" ? s.character : def.character,
      variant: Number.isInteger(s.variant) && Number(s.variant) >= 0 && Number(s.variant) <= 3 ? Number(s.variant) : def.variant,
    };
  });
}

/** Every screen keeps what it had (blocks, unknown fields) and gets the new defaults it lacks. */
function migrateMenus(base: MenuSettings, raw: unknown): MenuSettings {
  const saved = isRecord(raw) ? raw : {};
  const out = { ...saved } as unknown as MenuSettings;
  for (const id of Object.keys(base) as (keyof MenuSettings)[]) {
    const def = base[id];
    const cur = isRecord(saved[id]) ? (saved[id] as MenuScreen) : {};
    out[id] = { ...def, ...cur, texts: isRecord(cur.texts) ? { ...(cur.texts as Record<string, string>) } : {} };
    if (!isRecord(out[id].background)) out[id].background = def.background;
  }
  return out;
}

function normalizeLevel(raw: Level): Level {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string") throw new InputError("project.not-project");
  const w = snap(Math.abs(Number(raw.size?.w)) || 384, CELL);
  const h = snap(Math.abs(Number(raw.size?.h)) || 224, CELL);
  if (w > MAX_LEVEL_W || h > MAX_LEVEL_H) throw new InputError("project.too-big");
  const layers = (Array.isArray(raw.layers) && raw.layers.length ? raw.layers : defaultLayers(w, h)).filter(isRecord).map((l) => normalizeLayer(l as unknown as Layer)).filter((l): l is Layer => !!l);
  // Every level needs a collision layer and an objects layer.
  if (!layers.some((l) => l.kind === "tags")) layers.push(defaultLayers(w, h)[3]!);
  if (!layers.some((l) => l.kind === "objects")) layers.push(defaultLayers(w, h)[4]!);
  return {
    ...raw,
    name: typeof raw.name === "string" ? raw.name : raw.id,
    size: { w, h },
    camera: { forwardOnly: raw.camera?.forwardOnly !== false, backtrack: Math.max(0, num(raw.camera?.backtrack, 48)) },
    layers: layers.map((l) => ({ visible: true, locked: false, opacity: 1, ...l, name: l.name ?? l.id })) as Layer[],
    sections: Array.isArray(raw.sections) ? raw.sections : [],
  };
}

/** A layer with the fields every reader expects; null for one that is not a layer at all. */
function normalizeLayer(l: Layer): Layer | null {
  if (typeof l.id !== "string") return null;
  if (l.kind === "objects") {
    const items = (Array.isArray(l.items) ? l.items : []).filter(isRecord).map((o) => ({ ...o, name: String(o.name ?? ""), type: String(o.type ?? "") as LevelObject["type"], x: Math.round(num(o.x, 0)), y: Math.round(num(o.y, 0)) }) as LevelObject);
    return { ...l, items };
  }
  if (l.kind === "tags") return { ...l, grid: 16, data: typeof l.data === "string" ? l.data : "" };
  if (l.kind === "tiles") {
    const grid = l.grid === 8 || l.grid === 32 ? l.grid : 16;
    return { ...l, grid, data: typeof l.data === "string" ? l.data : "", ...(typeof l.tileset === "string" ? {} : { tileset: undefined }) };
  }
  return null;
}

export function snap(v: number, grid: number): number {
  return Math.max(grid, Math.round(v / grid) * grid);
}

export function findLevel(project: Project, id: string | null | undefined): Level | undefined {
  return project.levels.find((l) => l.id === id) ?? project.levels[0];
}

export function tagLayer(level: Level): TagLayer {
  const l = level.layers.find((x): x is TagLayer => x.kind === "tags");
  if (!l) throw new Error("level without a collision layer");
  return l;
}

export function objectLayer(level: Level): ObjectLayer {
  const l = level.layers.find((x): x is ObjectLayer => x.kind === "objects");
  if (!l) throw new Error("level without an objects layer");
  return l;
}

export function tileLayers(level: Level): TileLayer[] {
  return level.layers.filter((x): x is TileLayer => x.kind === "tiles");
}

export function tagOf(n: number): Tag {
  return TAGS[n] ?? "air";
}

/** A decoded cell grid of a layer, with `commit()` to write it back. */
export interface CellGrid {
  cols: number;
  rows: number;
  cells: Uint16Array;
  get(c: number, r: number): number;
  set(c: number, r: number, v: number): void;
  commit(): void;
}

export function layerGrid(level: Level, layer: TileLayer | TagLayer): CellGrid {
  const cols = Math.ceil(level.size.w / layer.grid);
  const rows = Math.ceil(level.size.h / layer.grid);
  const cells = decodeCells(layer.data, cols * rows);
  return {
    cols,
    rows,
    cells,
    get: (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows ? 0 : cells[r * cols + c]!),
    set: (c, r, v) => {
      if (c >= 0 && r >= 0 && c < cols && r < rows) cells[r * cols + c] = v;
    },
    commit: () => {
      layer.data = encodeCells(cells);
    },
  };
}

export function tagGrid(level: Level): CellGrid {
  return layerGrid(level, tagLayer(level));
}

/** A name not used by any object of the level: `base`, `base_2`, `base_3`… */
export function uniqueName(level: Level, base: string): string {
  const used = new Set(objectLayer(level).items.map((o) => o.name));
  const clean = base.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "object";
  if (!used.has(clean)) return clean;
  for (let n = 2; ; n++) if (!used.has(`${clean}_${n}`)) return `${clean}_${n}`;
}

export function findObject(level: Level, name: string): LevelObject | undefined {
  return objectLayer(level).items.find((o) => o.name === name);
}

/** A deep copy (projects are plain JSON). */
export function cloneProject<T>(v: T): T {
  return typeof structuredClone === "function" ? structuredClone(v) : (JSON.parse(JSON.stringify(v)) as T);
}
