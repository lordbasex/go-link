// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Willy Maker project, exactly as docs/willy-maker/file-format.md
// describes `project.json` (format 3). Plain data: it is saved as JSON,
// exported in a .zip and read by every part of the module (editor, sprite
// importer, play mode, exports).

import type { GameRules } from "../engine/rules";
import type { GenreId } from "./genres";
import type { GameSound } from "./sound";

/** The current project format; older ones are migrated on load. */
export const PROJECT_FORMAT = 3;

export type BoardId = "cps1";
export type LayoutId = "slammast" | "captcomm";

export interface BoardRef {
  id: BoardId;
  layout: LayoutId;
}

export type ButtonAction = "jump" | "fire" | "special";

export interface ButtonSettings {
  b1: ButtonAction;
  b2: ButtonAction;
  /** "b1+b2" on a 2-button layout. */
  b3: ButtonAction | "b1+b2";
  run: "double-tap";
}

export interface DipSettings {
  difficulty: "easy" | "normal" | "hard" | "lag";
  lives: number;
  freePlay: boolean;
  demoSound: boolean;
}

/** What a menu screen shows behind its text: a level's first screen darkened, or one color. */
export type MenuBackground = { kind: "level"; level: string } | { kind: "solid"; color: string };

/** A menu screen: its text lines, background, music slot, and text and sprite blocks. */
export interface MenuScreen {
  blocks?: MenuBlock[];
  /** The screen's text lines by field id (game/menus.ts lists each screen's fields). */
  texts?: Record<string, string>;
  background?: MenuBackground;
  /** A music slot id: the built-in tune the ROM plays on this screen (rom/sound.ts), "none" for silence. */
  music?: string;
  /** Shows the game's credits line at the bottom. */
  credits?: boolean;
  [key: string]: unknown;
}

export interface MenuBlock {
  kind: "text" | "sprite";
  x: number;
  y: number;
  text?: string;
  character?: string;
  anim?: string;
  palette?: string;
}

export interface MenuSettings {
  title: MenuScreen;
  attract: MenuScreen;
  select: MenuScreen;
  hud: MenuScreen;
  continue: MenuScreen;
  gameOver: MenuScreen;
  highScores: MenuScreen;
}

/** The actions the Game tab lists, each with an editable label. */
export const GAME_ACTIONS = ["jump", "fire", "special", "run", "climb", "start", "coin"] as const;
export type GameActionId = (typeof GAME_ACTIONS)[number];

/** The built-in hero (Willy), for players without a character of the project. */
export const BUILTIN_HERO = "builtin:willy";

/** One player's character: a project character id or BUILTIN_HERO, and its shirt. */
export interface PlayerSlot {
  character: string;
  /** 0 = the character's own colors; 1-3 = a recruit's shirt (its swapColors recolored). */
  variant: number;
}

export interface GameSettings {
  /** 1-4. */
  players: number;
  buttons: ButtonSettings;
  /** Labels of the actions; a missing or empty one shows the action's default name. */
  actionLabels?: Partial<Record<GameActionId, string>>;
  /** The double-tap window for running, in milliseconds (100-400; 250 by default). */
  runTapMs?: number;
  /** The character of players 1 to 4. */
  playerSlots?: PlayerSlot[];
  /** The credits line the menu screens show ("(C) 2026 GO-LINK" by default). */
  credits?: string;
  dip: DipSettings;
  /** The rules the Game tab's Rules card changes; the prototype's for missing ones. */
  rules?: Partial<GameRules>;
  menus: MenuSettings;
  /** Level ids in play order. */
  levels: string[];
  /** The image AI prompt helper's last choices per kind (prompts/imagePrompt.ts), kept to repeat or adjust a request. */
  imagePrompts?: Record<string, Record<string, unknown>>;
  /** The game's own effects and songs (model/sound.ts); the built-in ones otherwise. */
  sound?: GameSound;
}

export type PaletteGroup = "sprite" | "play" | "far" | "text";

export interface Palette {
  id: string;
  group: PaletteGroup;
  /** At most 15 `#RRGGBB` colors (each channel a multiple of 17); transparency is implicit. */
  colors: string[];
}

/** A picture stored by its SHA-256: `sha256:<hex>`. */
export type AssetRef = `sha256:${string}`;

export type CharacterRole = "hero" | "enemy" | "civilian" | "boss";

export interface Frame {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The pivot (the center of the feet), from the frame's top left. */
  px: number;
  py: number;
  /** Palette ids per zone, top to bottom. */
  zones: string[];
  muzzle: { x: number; y: number } | null;
  hand: { x: number; y: number } | null;
}

export interface Animation {
  frames: string[];
  fps: number;
  loop: boolean;
}

export interface Character {
  id: string;
  name: string;
  role: CharacterRole;
  /** Height in pixels on the board's screen. */
  height: number;
  sheet: AssetRef | null;
  frames: Frame[];
  anims: Record<string, Animation>;
  /** The shirt colors: players 2-4 change only these. */
  swapColors: string[];
}

export interface Tileset {
  id: string;
  /** Tile size in pixels (8, 16 or 32). */
  tile: number;
  image: AssetRef | null;
  palettes: string[];
  /** Tiles across in the image (derived on load when missing). */
  columns?: number;
  /** Number of tiles in the image (derived on load when missing). */
  count?: number;
  /**
   * Each tile's palette, as an index into `palettes` (tile n at [n - 1]);
   * missing or shorter means palette 0. A picture imported as a background
   * (T-28) spreads its colors over up to 32 palettes, chosen per tile.
   */
  tilePalettes?: number[];
}

/** The collision tags, in their stored numbers (file-format.md). */
export const TAGS = ["air", "solid", "oneway", "ladder", "crate", "breakable", "hazard", "water"] as const;
export type Tag = (typeof TAGS)[number];
export const TAG_NUMBER: Record<Tag, number> = { air: 0, solid: 1, oneway: 2, ladder: 3, crate: 4, breakable: 5, hazard: 6, water: 7 };

/** Object types and their properties (art-spec.md section 4). */
export const OBJECT_TYPES = ["player_start", "enemy", "civilian", "crate", "pickup", "platform", "camera_lock", "checkpoint", "boss", "exit"] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export interface LevelObject {
  /** Unique in the level: the reference name. */
  name: string;
  type: ObjectType;
  x: number;
  y: number;
  /** A rectangle's size (camera_lock, boss arena); points have none. */
  w?: number;
  h?: number;
  /** The layer group it is listed in (Level.groups); the objects' base group when missing. */
  group?: string;
  /** The type's properties (player, kind, facing, patrol, size, hp, contents, item…). */
  [prop: string]: unknown;
}

/**
 * What a zone is (docs/willy-maker/file-format.md): each kind is one
 * collision tag, so the zones of a level are drawn into its collision layer.
 */
export const ZONE_KINDS = ["floor", "platform", "ladder", "crate", "breakable", "hazard", "water"] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];
export const ZONE_TAG: Record<ZoneKind, Tag> = { floor: "solid", platform: "oneway", ladder: "ladder", crate: "crate", breakable: "breakable", hazard: "hazard", water: "water" };

/**
 * A zone: a rectangle of the level (px, on the 16 px collision grid) that
 * says what that part of the picture is. Later zones in the list are on top.
 */
export interface Zone {
  id: string;
  kind: ZoneKind;
  /** The name the user typed; missing = the automatic one, the kind's name and `n`. */
  name?: string;
  /** The automatic name's number ("Floor 2"). */
  n: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The layer group it is listed in (Level.groups). */
  group: string;
  hidden?: boolean;
  locked?: boolean;
  /** Hits a breakable zone takes (the collision layer's per-cell `hp`); the engine's default when missing. */
  hp?: number;
}

/**
 * A group of the layers panel. The two base groups (objects, zones) always
 * exist and cannot be deleted; hiding a group hides its members from the
 * game too, locking it keeps them from being selected or edited.
 */
export interface LayerGroup {
  id: string;
  /** The name the user typed; missing = the automatic one (the base group's name, or "Group n"). */
  name?: string;
  n?: number;
  base?: "objects" | "zones";
  visible: boolean;
  locked: boolean;
  open: boolean;
}

interface LayerBase {
  id: string;
  name?: string;
  visible?: boolean;
  locked?: boolean;
  /** 0-1, editor only. */
  opacity?: number;
}

export interface TileLayer extends LayerBase {
  kind: "tiles";
  grid: 8 | 16 | 32;
  tileset?: string;
  /** Tile indices per cell, row order, run-length encoded ("rle:…"); 0 = empty. */
  data: string;
}

export interface TagLayer extends LayerBase {
  kind: "tags";
  grid: 16;
  /** Tag numbers per cell, row order, run-length encoded. */
  data: string;
  /** Per-cell properties keyed "col,row". */
  props?: Record<string, Record<string, unknown>>;
}

export interface ObjectLayer extends LayerBase {
  kind: "objects";
  items: LevelObject[];
}

export type Layer = TileLayer | TagLayer | ObjectLayer;

export interface Section {
  name: string;
  x0: number;
  x1: number;
}

export interface Level {
  id: string;
  name: string;
  size: { w: number; h: number };
  camera: { forwardOnly: boolean; backtrack: number };
  /** Bottom to top: far, mid, play, collision, objects, text. */
  layers: Layer[];
  sections: Section[];
  /** The time limit in seconds; 0 or missing = none (the ROM keeps it; play mode has no timer). */
  timer?: number;
  /**
   * Parallax bands of the play layer (T-26): rows (y0 to y1, px on the 16 px
   * grid) that scroll at `speed` % of the camera's speed, like far buildings
   * drawn over the sky; up to 4, with no collision or objects in them.
   */
  parallax?: ParallaxBand[];
  /**
   * The beat 'em up's walkable band (docs/willy-maker/genres.md): the range
   * of feet y (px) the players and enemies walk in, up and down being toward
   * and away from the screen. Only games with the `depth` rule use it.
   */
  walk?: WalkBand;
  /**
   * The level's zones and layer groups (format 4). When there are zones, the
   * collision layer is drawn from the visible ones (model/zones.ts).
   */
  zones?: Zone[];
  groups?: LayerGroup[];
  /**
   * The background's scenes (Insert background, Add scene): each picture
   * kept with where it goes, so it can be moved, scaled and lined up later;
   * the play layer's art is made from them, left to right
   * (ui/studio/scenes.ts). Missing on a level whose background was made
   * before scenes existed: its art is the play layer as it is.
   */
  scenes?: BackgroundScene[];
}

/** One picture of the background and where it goes. */
export interface BackgroundScene {
  id: string;
  /** The picture as the user gave it (an asset). */
  asset: string;
  /** Its file name. */
  name: string;
  /** Its left edge in the level (px). */
  x: number;
  /** Moved down (or up, negative) from standing on the level's bottom (px). */
  dy: number;
  /** Its height as a share of the level's height (1 = the whole height). */
  scale: number;
}

export interface WalkBand {
  y0: number;
  y1: number;
}

export interface ParallaxBand {
  y0: number;
  y1: number;
  speed: number;
}

/** A live rule's finding (validation.md, level 1). Messages are i18n keys with params. */
export interface ValidationIssue {
  /** The rule id, like "game.title" or "menus.overflow". */
  id: string;
  severity: "error" | "warning" | "info";
  /** The message key in the module's i18n, and its values. */
  key: string;
  params?: Record<string, string | number>;
  /** Where "Go to" opens. */
  target?: { tab: "build" | "characters" | "game" | "menus"; screen?: string; field?: string; player?: number; level?: string };
}

export interface Project {
  format: number;
  id: string;
  title: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  board: BoardRef;
  /** The game's genre (model/genres.ts); format 3. Only "platform-shooter" has an engine today. */
  genre: GenreId;
  settings: GameSettings;
  palettes: Palette[];
  characters: Character[];
  tilesets: Tileset[];
  levels: Level[];
  /** The quiz's questions (genres.md, quiz and party): asked in this order. */
  quiz?: QuizQuestion[];
  /** Fields from a newer format are kept as they are. */
  [unknown: string]: unknown;
}

/**
 * A quiz question: three answers, one per button (B1 B2 B3), `right` the
 * correct one's index; or a minigame (phase 2), `q` its instructions.
 */
export interface QuizQuestion {
  /** A question (the default), or a minigame: mash B1, stop the marker in the middle, repeat a sequence. */
  kind?: "question" | "mash" | "timing" | "memory";
  /** Phase 3: one player answers, in turn (the next player in each time); its category, shown above it. */
  turn?: boolean;
  category?: string;
  q: string;
  a: [string, string, string];
  right: number;
}
