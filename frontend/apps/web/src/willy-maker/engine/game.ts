// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The game rules: players, enemies, civilians, crates, pickups and the
// camera, stepped at a fixed 60 Hz. It is a port of the ROM prototype's
// update loop (rom/src/main.c) generalised to a project's level, so what
// is played in the editor is what the board will run. No DOM: the play
// view draws a `Game` and feeds it one input word per player per frame.

import type { LevelObject, LevelView } from "./level";
import {
  BACKTRACK,
  BAZOOKA_AMMO,
  BAZOOKA_FRAMES,
  BODY_H,
  BREAKABLE_HP,
  CELL,
  CLIMB_SPEED,
  CRATE_HP,
  DROP_FRAMES,
  difficultyOf,
  ENEMY_SIGHT,
  FIRE_EVERY,
  GRAVITY,
  HALF_W,
  Input,
  KNIFE_FRAMES,
  LIVES,
  MAX_FALL,
  PUSH_FRAMES,
  RUN_TAP_FRAMES,
  SCREEN_H,
  SCREEN_W,
  SHOTS_PER_PLAYER,
  SHOT_SPEED,
  STEP_UP,
  Tag,
  JET_FUEL,
  JET_LIFT,
  JET_MAX_UP,
  KICK_FRAMES,
  COMBO_KICK_FRAMES,
  COMBO_WINDOW,
  DEPTH_REACH,
  ENEMY_ATTACK_FRAMES,
  ENEMY_GAP,
  ENEMY_REACH,
  ENEMY_REST,
  ENEMY_STRIKE,
  FALL_FRAMES,
  FIGHT_KICK_REACH,
  PUNCH_FRAMES,
  PUNCH_REACH,
  STRIKE_AT,
  GRAB_DEPTH,
  GRAB_FRAMES,
  GRAB_REACH,
  PIPE_REACH,
  PIPE_USES,
  KNIFE_SPEED,
  KNIFE_BOX,
  KNIFE_HITS,
  BOSS_HP,
  BOSS_REST,
  CROSS_SPEED,
  CROSS_BOTTOM,
  CLIP,
  RELOAD_FRAMES,
  SHOT_FLASH,
  TARGET_HALF,
  TARGET_H,
  HOSTAGE_HALF,
  HOSTAGE_H,
  AIM_FRAMES,
  TARGET_REST,
  ROUTE_STEP,
  BOMBS,
  secondsToFrames,
  THROW_DIST,
  LAND_AFTER,
  LAND_FRAMES,
  THUMBS_FRAMES,
  TURN_FRAMES,
  cancelOpposites,
  rulesWith,
  COIN_SCORE,
  SPRING_VY,
  STOMP_VY,
  bodyFor,
  WILLY_BODY,
  type Body,
  type Difficulty,
  type GameRules,
} from "./rules";

export const MAX_PLAYERS = 4;
/** How long the "defeat every enemy" message stays after a player leaves the closed exit. */
export const EXIT_CLOSED_FRAMES = 90;

export interface Shot {
  x: number;
  y: number;
  dir: number;
}

export interface Rocket extends Shot {
  speed: number;
}

export interface Player {
  index: number;
  /** The body scaled to this player's hero (T-26). */
  body: Body;
  active: boolean;
  pad: number;
  last: number;
  x: number;
  /** Feet, in 1/16 px. */
  y: number;
  /** Vertical speed, 1/16 px per frame. */
  vy: number;
  flip: boolean;
  onGround: boolean;
  climbing: boolean;
  dropT: number;
  pushT: number;
  running: boolean;
  tapDir: number;
  tapTime: number;
  firing: boolean;
  fireWait: number;
  knifeT: number;
  bazookaT: number;
  special: "" | "bazooka" | "pipe" | "knife";
  ammo: number;
  t: number;
  score: number;
  lives: number;
  invulnerable: number;
  shots: Shot[];
  rocket: Rocket | null;
  /** The beat 'em up's thrown knife (phase 4): where it flies, along the lane it left from. */
  blade: { x: number; fy: number; dir: number } | null;
  /** The moves (docs/willy-maker/moves.md). */
  crouching: boolean;
  landT: number;
  turnT: number;
  kickT: number;
  kickHit: boolean;
  thumbsT: number;
  /** Frames standing on the ground with nothing pressed (a yawn after YAWN_AFTER). */
  idleT: number;
  airT: number;
  airJumps: number;
  fuel: number;
  jetting: boolean;
  /** The beat 'em up's hop (the depth rule): height over the floor, 1/16 px, 0 or less. */
  hop: number;
  /** The beat 'em up's fight: frames left of the punch, its place in the combo (1-3), frames left to chain the next, and whether it landed. */
  punchT: number;
  combo: number;
  comboT: number;
  struck: boolean;
  /** The enemy held (its index + 1, 0 for none) and frames held. */
  grabbed: number;
  grabT: number;
  /** The light gun's crosshair (screen px), its shot's flash and the reload's frames left. */
  cx: number;
  cy: number;
  shotT: number;
  reloadT: number;
  /** The light gun's bombs left (B3). */
  bombs: number;
}

export type EnemyState = "walk" | "hit" | "down" | "off" | "attack" | "fall" | "held" | "hidden";

export interface Enemy {
  name: string;
  kind: string;
  x: number;
  /** Feet, world px. */
  fy: number;
  min: number;
  max: number;
  state: EnemyState;
  hp: number;
  dir: number;
  flip: boolean;
  t: number;
  fireWait: number;
  /** The beat 'em up: its hits at the start, and its depth offset beside a player (-1, 0, 1: they spread out). */
  maxHp: number;
  lane: number;
  /** A boss (phase 4, kind brawler): tougher, never grabbed, quicker to strike again. */
  boss: boolean;
  /** The light gun: frames on the screen before it shows (hidden until then) and before it leaves (0: never), and frames it has been on it. */
  appear: number;
  stay: number;
  shown: number;
}

export interface Civilian {
  name: string;
  kind: string;
  x: number;
  fy: number;
  /** The crate it is locked in, until that crate breaks. */
  trappedIn: string;
  rescued: boolean;
  t: number;
}

export interface Crate {
  name: string;
  col: number;
  row: number;
  /** Size in cells (1 for 16 px, 2 for 32 px). */
  cells: number;
  hp: number;
  /** False: shots stop on it and it never breaks (it still breaks when nothing holds it up). */
  breakable: boolean;
  contents: string;
  broken: boolean;
}

export interface Pickup {
  name: string;
  item: string;
  x: number;
  fy: number;
  live: boolean;
  /** The game's own picture: a character id (its idle animation), or none for the engine's icon. */
  look?: string;
}

/**
 * A moving platform (the platformer, docs/willy-maker/genres.md): a ledge
 * `w` px wide whose top goes back and forth `range` px along x or y at
 * `speed` px a frame. Its place comes from the frame count alone, so the
 * ROM engine (platform_at in engine.c) puts it in exactly the same spot.
 * It holds the players like a one-way platform and carries them.
 */
export interface Platform {
  name: string;
  x0: number;
  y0: number;
  w: number;
  axis: "x" | "y";
  range: number;
  speed: number;
  /** The top left now (y = the top the feet stand on). */
  x: number;
  y: number;
  /** How far the top moved up or down this frame. */
  dy: number;
  /** A falling platform: it shakes once stood on, falls, and comes back later (it has no track). */
  falls: boolean;
  state: "rest" | "shake" | "fall" | "gone";
  /** Frames in its state, and its falling speed (1/16 px a frame) and top (1/16 px). */
  t: number;
  vy: number;
  y16: number;
}

/** A falling platform shakes this many frames once stood on, falls (gaining FALL_GRAVITY up to FALL_MAX, 1/16 px), and is back FALL_BACK frames after leaving the level. */
export const FALL_SHAKE = 30;
export const FALL_GRAVITY = 4;
export const FALL_MAX = 64;
export const FALL_BACK = 180;

/** A beat 'em up level's walkable band (feet y, px): its own, or the 64 px over the bottom 32 (the ROM's too). */
export function walkBandOf(height: number, walk?: { y0: number; y1: number }): { y0: number; y1: number } {
  const y1 = Math.max(16, Math.min(height, Math.round(walk?.y1 ?? height - 32)));
  return { y0: Math.max(0, Math.min(y1 - 16, Math.round(walk?.y0 ?? y1 - 64))), y1 };
}

/** A platform's limits (the ROM's too): width 32-128 px in 16s, range 0-512 px, speed 1-4 px a frame. */
export function platformOf(o: { name: string; x: number; y: number; w?: unknown; axis?: unknown; range?: unknown; speed?: unknown; falls?: unknown }): Platform {
  const w = Math.max(2, Math.min(8, Math.round(num(o.w, 48) / CELL))) * CELL;
  const falls = o.falls === true;
  const range = falls ? 0 : Math.max(0, Math.min(512, Math.round(num(o.range, 96))));
  const speed = Math.max(1, Math.min(4, Math.round(num(o.speed, 1))));
  const p: Platform = { name: o.name, x0: Math.round(o.x), y0: Math.round(o.y), w, axis: o.axis === "y" ? "y" : "x", range, speed, x: 0, y: 0, dy: 0, falls, state: "rest", t: 0, vy: 0, y16: 0 };
  placePlatform(p, 0);
  return p;
}

/** Where a platform is at frame t: there and back, `range` px each way. */
export function placePlatform(p: Platform, t: number): void {
  const span = 2 * p.range;
  const s = span ? (t * p.speed) % span : 0;
  const off = s <= p.range ? s : span - s;
  p.x = p.axis === "x" ? p.x0 + off : p.x0;
  p.y = p.axis === "y" ? p.y0 + off : p.y0;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type GameOutcome = "playing" | "cleared" | "over";

/** A sound or moment the view may react to (one frame's worth). */
export type GameEvent =
  | { kind: "jump" | "shot" | "knife" | "kick" | "rocket" | "land"; player: number }
  | { kind: "crate"; name: string; x?: number }
  | { kind: "enemy_down" | "hit"; name: string; x?: number }
  | { kind: "explosion" | "enemy_shot"; x: number }
  | { kind: "hostage"; player: number }
  | { kind: "rescue"; name: string; player: number }
  | { kind: "pickup"; item: string; player: number }
  | { kind: "hurt" | "join"; player: number }
  | { kind: "cleared" | "over" | "exit_closed" };

export interface GameOptions {
  /** Players already in at the start (the rest join by pressing a button). */
  players?: number;
  /** The most players the game takes (the board layout's count). */
  maxPlayers?: number;
  /** Lives per player. */
  lives?: number;
  /** Start here instead of the player_start objects ("play from here"). */
  startAt?: { x: number; y: number };
  /** The double-tap window for running, in frames (RUN_TAP_FRAMES by default). */
  runTapFrames?: number;
  /** The game's rules (the Game tab's Rules card); the prototype's when missing. */
  rules?: Partial<GameRules>;
  /** The DIP switch's difficulty (normal when missing). */
  difficulty?: Difficulty;
  /** Each player's hero height in px (T-26: the body scales to it); 44, Willy's, when missing. */
  heights?: (number | undefined)[];
}

export class Game {
  readonly level: LevelView;
  readonly cols: number;
  readonly rows: number;
  /** The collision map: crates and breakable walls change it while playing. */
  readonly cells: Uint8Array;
  readonly players: Player[] = [];
  enemies: Enemy[] = [];
  civilians: Civilian[] = [];
  crates: Crate[] = [];
  pickups: Pickup[] = [];
  platforms: Platform[] = [];
  enemyShots: Shot[] = [];
  cameraLocks: (Rect & { name: string; done: boolean })[] = [];
  exits: Rect[] = [];
  camX = 0;
  camY = 0;
  camFar = 0;
  frame = 0;
  rescued = 0;
  /** The platformer's coins taken, and in the level. */
  coins = 0;
  coinTotal = 0;
  /** Frames left of the "defeat every enemy" message after the exit was reached too early. */
  exitClosed = 0;
  outcome: GameOutcome = "playing";
  events: GameEvent[] = [];
  private readonly maxPlayers: number;
  private readonly lives: number;
  private readonly startAt?: { x: number; y: number };
  private readonly runTap: number;
  readonly rules: GameRules;
  /** The beat 'em up's walkable band (feet y, px), with the depth rule only. */
  readonly walkBand?: { y0: number; y1: number };
  /** How far the camera may go back (the level's camera: its back margin, or a free camera's whole width). */
  readonly backtrack: number;
  /** The difficulty's enemy fire interval (frames) and shot speed (px per frame). */
  readonly fireEvery: number;
  readonly shotSpeed: number;
  private readonly cellHp = new Map<number, number>();

  constructor(level: LevelView, opts: GameOptions = {}) {
    this.level = level;
    this.cols = Math.ceil(level.width / CELL);
    this.rows = Math.ceil(level.height / CELL);
    this.cells = new Uint8Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = Number(level.tags[i] ?? 0) || 0;
    this.maxPlayers = Math.max(1, Math.min(MAX_PLAYERS, opts.maxPlayers ?? MAX_PLAYERS));
    this.lives = opts.lives ?? LIVES;
    this.startAt = opts.startAt;
    this.runTap = Math.max(1, Math.round(opts.runTapFrames ?? RUN_TAP_FRAMES));
    this.rules = rulesWith(opts.rules);
    if (this.rules.depth) this.walkBand = walkBandOf(level.height, level.walk);
    this.backtrack = level.backtrack ?? BACKTRACK;
    this.fireEvery = difficultyOf(opts.difficulty).fireEvery;
    this.shotSpeed = difficultyOf(opts.difficulty).shotSpeed;
    for (let i = 0; i < this.maxPlayers; i++) this.players.push(newPlayer(i, this.lives, opts.heights?.[i] ? bodyFor(opts.heights[i]) : WILLY_BODY));
    this.loadObjects(level.objects);
    const n = Math.max(1, Math.min(this.maxPlayers, opts.players ?? 1));
    for (let i = 0; i < n; i++) this.join(i);
    this.updateCamera(true);
  }

  // ------------------------------------------------------------- level

  /** The tag of cell (c, r): outside the sides and below the floor is solid, above the top is air. */
  cell(c: number, r: number): number {
    if (c < 0 || c >= this.cols || r >= this.rows) return Tag.Solid;
    if (r < 0) return Tag.Air;
    return this.cells[r * this.cols + c] ?? Tag.Air;
  }

  cellAt(x: number, y: number): number {
    return this.cell(Math.floor(x / CELL), Math.floor(y / CELL));
  }

  /** Changes one cell while playing (edit while playing); objects stay. */
  setCell(c: number, r: number, tag: number): void {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return;
    this.cells[r * this.cols + c] = tag;
    this.cellHp.delete(r * this.cols + c);
  }

  /** Adds an object while playing (a crate, an enemy, a civilian, a pickup). */
  addObject(o: LevelObject): void {
    this.loadObjects([o]);
  }

  private loadObjects(objects: LevelObject[]): void {
    for (const o of objects) {
      switch (o.type) {
        case "enemy": {
          const patrol = num(o.patrol, 6 * CELL);
          this.enemies.push({
            name: o.name,
            kind: str(o.kind, "glitch9"),
            x: o.x,
            fy: o.y,
            min: o.x - patrol / 2,
            max: o.x + patrol / 2,
            state: "walk",
            hp: num(o.hp, this.rules.enemyHp),
            dir: o.facing === "right" ? 1 : -1,
            flip: o.facing !== "right",
            t: this.enemies.length * 11,
            fireWait: this.fireEvery,
            maxHp: num(o.hp, this.rules.enemyHp),
            lane: (this.enemies.length % 3) - 1,
            boss: false,
            appear: this.rules.crosshair ? secondsToFrames(o.appear) : 0,
            stay: this.rules.crosshair ? secondsToFrames(o.stay) : 0,
            shown: 0,
          });
          if (this.enemies[this.enemies.length - 1]!.appear) this.enemies[this.enemies.length - 1]!.state = "hidden";
          break;
        }
        case "boss":
          // the beat 'em up's boss (phase 4); the other bosses have no effect yet (editor/support.ts)
          if (o.kind === "brawler")
            this.enemies.push({
              name: o.name,
              kind: "brawler",
              x: o.x,
              fy: o.y,
              min: o.x - 3 * CELL,
              max: o.x + 3 * CELL,
              state: "walk",
              hp: num(o.hp, BOSS_HP),
              dir: o.facing === "right" ? 1 : -1,
              flip: o.facing !== "right",
              t: this.enemies.length * 11,
              fireWait: this.fireEvery,
              maxHp: num(o.hp, BOSS_HP),
              lane: (this.enemies.length % 3) - 1,
              boss: true,
              appear: 0,
              stay: 0,
              shown: 0,
            });
          break;
        case "civilian":
          this.civilians.push({ name: o.name, kind: str(o.kind, "woman"), x: o.x, fy: o.y, trappedIn: str(o.trapped_in, ""), rescued: false, t: this.civilians.length * 17 });
          break;
        case "crate": {
          const cells = num(o.size, 32) >= 32 ? 2 : 1;
          const col = Math.floor(o.x / CELL);
          const row = Math.floor(o.y / CELL);
          this.crates.push({ name: o.name, col, row, cells, hp: num(o.hp, CRATE_HP), breakable: o.breakable !== false, contents: str(o.contents, ""), broken: false });
          for (let r = row; r < row + cells; r++) for (let c = col; c < col + cells; c++) if (this.cell(c, r) === Tag.Air) this.setCell(c, r, Tag.Crate);
          break;
        }
        case "pickup":
          this.pickups.push({ name: o.name, item: str(o.item, "bazooka"), x: o.x, fy: o.y, live: true, ...(typeof o.look === "string" && o.look ? { look: o.look } : {}) });
          if (o.item === "coin") this.coinTotal++;
          break;
        case "platform":
          if (this.platforms.length < MAX_PLATFORMS) {
            const pl = platformOf(o);
            placePlatform(pl, this.frame);
            this.platforms.push(pl);
          }
          break;
        case "camera_lock":
          this.cameraLocks.push({ name: o.name, x: o.x, y: o.y, w: num(o.w, SCREEN_W), h: num(o.h, SCREEN_H), done: false });
          break;
        case "exit":
          this.exits.push({ x: o.x, y: o.y, w: num(o.w, 2 * CELL), h: num(o.h, this.level.height) });
          break;
      }
    }
  }

  private isSolid(t: number): boolean {
    return t === Tag.Solid || t === Tag.Crate || t === Tag.Breakable;
  }

  /** The top of a one-way platform, or a ladder's top cell. */
  private isLedge(c: number, r: number): boolean {
    const t = this.cell(c, r);
    return t === Tag.Oneway || (t === Tag.Ladder && this.cell(c, r - 1) !== Tag.Ladder);
  }

  /** Can feet at y (px, on a cell top) stand at x? 2 = solid, 1 = ledge, 0 = no. */
  support(x: number, fy: number, drop: boolean, halfW = HALF_W): number {
    const on = !drop && this.platformUnder(x, fy, halfW) ? 1 : 0;
    return Math.max(this.cellSupport(x, fy, drop, halfW), on);
  }

  /** support() from the cells alone (no platform). */
  private cellSupport(x: number, fy: number, drop: boolean, halfW: number): number {
    if (fy % CELL !== 0) return 0;
    const r = fy / CELL;
    const c0 = Math.floor((x - halfW) / CELL);
    const c1 = Math.floor((x + halfW) / CELL);
    let best = 0;
    for (let c = c0; c <= c1; c++) {
      if (this.isSolid(this.cell(c, r))) return 2;
      if (!drop && this.isLedge(c, r)) best = 1;
    }
    return best;
  }

  /** The moving platform whose top is at fy under feet at x, if any. */
  platformUnder(x: number, fy: number, halfW = HALF_W): Platform | undefined {
    for (const pl of this.platforms) if (pl.state !== "gone" && fy === pl.y && x + halfW >= pl.x && x - halfW < pl.x + pl.w) return pl;
    return undefined;
  }

  /** A platform that rose to or past falling feet this frame (from: the feet before the fall), if any. */
  private platformRose(x: number, from: number, halfW: number): Platform | undefined {
    for (const pl of this.platforms) if (pl.state !== "gone" && pl.dy <= 0 && from >= pl.y && from <= pl.y - pl.dy && x + halfW >= pl.x && x - halfW < pl.x + pl.w) return pl;
    return undefined;
  }

  /** A falling platform's frame: at rest until stood on, then it shakes, falls out of the level and comes back. */
  private fallStep(pl: Platform, ridden: boolean): void {
    if (pl.state === "rest") {
      if (ridden) {
        pl.state = "shake";
        pl.t = 0;
      }
    } else if (pl.state === "shake") {
      if (++pl.t >= FALL_SHAKE) {
        pl.state = "fall";
        pl.vy = 0;
        pl.y16 = pl.y * 16;
      }
    } else if (pl.state === "fall") {
      pl.vy = Math.min(pl.vy + FALL_GRAVITY, FALL_MAX);
      pl.y16 += pl.vy;
      pl.y = pl.y16 >> 4;
      // it breaks on solid ground (its top's middle in a solid cell) or once out of the level
      if (this.isSolid(this.cellAt(pl.x + (pl.w >> 1), pl.y)) || pl.y > this.level.height + 16) {
        pl.state = "gone";
        pl.t = 0;
      }
    } else if (++pl.t >= FALL_BACK) {
      pl.state = "rest";
      pl.y = pl.y0;
    }
  }

  /** Moves the platforms to this frame's place, carrying whoever stands on them. */
  private movePlatforms(): void {
    for (const pl of this.platforms) {
      const was = { x: pl.x, y: pl.y };
      const riders = this.players.filter((p) => p.active && p.onGround && !p.climbing && this.platformUnder(p.x, p.y >> 4, p.body.halfW) === pl);
      if (pl.falls) this.fallStep(pl, riders.length > 0);
      else placePlatform(pl, this.frame);
      const dx = pl.x - was.x;
      // a falling platform coming back is not a move (it carries nobody and catches nobody)
      const dy = pl.falls && pl.state === "rest" ? 0 : pl.y - was.y;
      pl.dy = dy;
      for (const p of riders) {
        // sideways one pixel at a time, stopped by walls; up or down with the top
        const step = Math.sign(dx);
        for (let n = 0; n < Math.abs(dx); n++) {
          if (this.bodyBlocked(p.x + step + step * p.body.halfW, p.y >> 4, p.body.h)) break;
          p.x += step;
        }
        if (dy < 0 && this.bodyBlocked(p.x, (p.y >> 4) + dy, p.body.h)) continue;
        // going down, ground on the way stops the rider (the platform goes on alone)
        let ground = 0;
        for (let py = (p.y >> 4) + 1; py <= (p.y >> 4) + dy && !ground; py++) if (this.cellSupport(p.x, py, false, p.body.halfW)) ground = py;
        p.y = ground ? ground * 16 : p.y + dy * 16;
      }
    }
  }

  private bodyBlocked(x: number, fy: number, h = BODY_H): boolean {
    for (let y = fy - 1; y > fy - h; y -= 8) if (this.isSolid(this.cellAt(x, y))) return true;
    return this.isSolid(this.cellAt(x, fy - h));
  }

  /** The first place feet can stand at x, searching down from y (px). */
  groundBelow(x: number, y: number, b: Body = WILLY_BODY): number {
    for (let fy = Math.max(CELL, Math.ceil(y / CELL) * CELL); fy < this.level.height; fy += CELL) {
      if (this.support(x, fy, false, b.halfW) && !this.bodyBlocked(x, fy, b.h)) return fy;
    }
    return this.level.height - CELL;
  }

  /**
   * A place to put a player near x, on screen: x itself, then 24 and 48 px
   * to each side (`beside` starts 24 px to the left and tries x last), on
   * the first free floor from y down to maxY. Falls back to the old search.
   */
  placeNear(x: number, y: number, maxY: number, beside = false, b: Body = WILLY_BODY): { x: number; fy: number } {
    const lo = this.camX + 16;
    const hi = this.camX + SCREEN_W - 16;
    for (const d of beside ? BESIDE : AROUND) {
      const cx = x + d;
      if (cx < lo || cx > hi) continue;
      for (let fy = Math.max(CELL, Math.ceil(y / CELL) * CELL); fy <= maxY && fy < this.level.height; fy += CELL)
        if (this.support(cx, fy, false, b.halfW) && !this.bodyBlocked(cx, fy, b.h)) return { x: cx, fy };
    }
    const cx = Math.max(lo, Math.min(hi, x));
    return { x: cx, fy: this.groundBelow(cx, y, b) };
  }

  /** A hit on a crate or breakable wall at cell (c, r); true if something took it. */
  private hitCell(c: number, r: number, damage: number, by: Player | null): boolean {
    const t = this.cell(c, r);
    if (t === Tag.Crate) {
      const crate = this.crates.find((k) => !k.broken && c >= k.col && c < k.col + k.cells && r >= k.row && r < k.row + k.cells);
      if (crate) {
        if (!crate.breakable) return true;
        crate.hp -= damage;
        if (crate.hp <= 0) this.breakCrate(crate, by);
        return true;
      }
    }
    if (t === Tag.Crate || t === Tag.Breakable) {
      const i = r * this.cols + c;
      const hp = (this.cellHp.get(i) ?? this.cellStartHp(c, r, t)) - damage;
      if (hp <= 0) {
        this.cells[i] = Tag.Air;
        this.cellHp.delete(i);
        if (by) by.score += this.rules.crateScore;
      } else this.cellHp.set(i, hp);
      return true;
    }
    return false;
  }

  private cellStartHp(c: number, r: number, t: number): number {
    const hp = this.level.props?.[`${c},${r}`]?.hp;
    return typeof hp === "number" ? hp : t === Tag.Crate ? CRATE_HP : BREAKABLE_HP;
  }

  private breakCrate(crate: Crate, by: Player | null): void {
    crate.broken = true;
    for (let r = crate.row; r < crate.row + crate.cells; r++)
      for (let c = crate.col; c < crate.col + crate.cells; c++) if (this.cell(c, r) === Tag.Crate) this.cells[r * this.cols + c] = Tag.Air;
    if (by) by.score += this.rules.crateScore;
    this.events.push({ kind: "crate", name: crate.name, x: crate.col * CELL + crate.cells * 8 });
    const x = (crate.col + crate.cells / 2) * CELL;
    // "nothing" leaves no pickup; a civilian inside a crate has no effect yet (editor/support.ts)
    if (crate.contents && crate.contents !== "nothing" && crate.contents !== "civilian") this.pickups.push({ name: `${crate.name}_contents`, item: crate.contents, x, fy: this.walkBand ? this.inWalk((crate.row + crate.cells) * CELL) : this.groundBelow(x, (crate.row + crate.cells) * CELL - CELL), live: true });
    for (const v of this.civilians) if (v.trappedIn === crate.name) v.trappedIn = "";
    // crates resting on it with nothing else under them break too, so none is left
    // hanging in the air over the floor (experiment 1, J-03)
    for (const k of this.crates) {
      if (k.broken || k.row + k.cells !== crate.row || k.col >= crate.col + crate.cells || k.col + k.cells <= crate.col) continue;
      let held = false;
      for (let c = k.col; c < k.col + k.cells; c++) if (this.isSolid(this.cell(c, k.row + k.cells))) held = true;
      if (!held) this.breakCrate(k, by);
    }
  }

  // ----------------------------------------------------------- players

  /** Brings a player in (at their start, or next to the camera). */
  join(i: number): void {
    const p = this.players[i];
    if (!p || p.active || p.lives <= 0) return;
    const start = this.startAt ?? this.level.objects.find((o) => o.type === "player_start" && num(o.player, 1) === i + 1);
    const lead = this.players.find((q) => q.active);
    let x: number;
    let fy: number;
    if (this.rules.crosshair) {
      // the light gun: nobody walks; the crosshair starts in the middle, the players side by side
      x = this.camX;
      fy = 0;
    } else if (this.walkBand) {
      // the beat 'em up: at the start, beside the player already in, or near the camera, inside the band
      const lx = lead ? lead.x + (lead.x + 24 < this.camX + SCREEN_W - 12 ? 24 : -24) : start && !lead ? start.x + (this.startAt ? i * 24 : 0) : this.camX + 64 + i * 24;
      x = lx;
      fy = this.inWalk(lead ? lead.y >> 4 : start ? start.y : (this.walkBand.y0 + this.walkBand.y1) >> 1);
    } else if (start && !lead) {
      x = start.x + (this.startAt ? i * 24 : 0);
      fy = this.groundBelow(x, start.y - CELL, p.body);
    } else if (lead) {
      // beside the player already in, on a floor they can stand on (J-06)
      const leadFeet = lead.y >> 4;
      ({ x, fy } = this.placeNear(lead.x, leadFeet - 48, leadFeet + 64, true, p.body));
    } else {
      ({ x, fy } = this.placeNear(this.camX + 64 + i * 24, this.camY, this.camY + SCREEN_H, false, p.body));
    }
    spawn(p, x, fy);
    p.invulnerable = this.rules.hurtFrames;
    if (this.rules.crosshair) {
      p.cx = (SCREEN_W >> 1) + (i * 48 - 72);
      p.cy = (SCREEN_H - CROSS_BOTTOM) >> 1;
      p.ammo = CLIP;
      p.bombs = BOMBS;
    }
    this.events.push({ kind: "join", player: i });
  }

  private hurt(p: Player, fell = false): void {
    if (!p.active || (p.invulnerable && !fell)) return;
    if (p.invulnerable) {
      // fell out while protected: back on the ground, no life lost
      const at = this.walkBand ? { x: Math.max(this.camX + 64, Math.min(p.x, this.camX + SCREEN_W - 64)), fy: this.inWalk(p.y >> 4) } : this.placeNear(Math.max(this.camX + 64, Math.min(p.x, this.camX + SCREEN_W - 64)), this.camY, this.camY + SCREEN_H, false, p.body);
      spawn(p, at.x, at.fy);
      return;
    }
    p.lives--;
    this.events.push({ kind: "hurt", player: p.index });
    if (p.lives <= 0) {
      p.active = false;
      return;
    }
    p.invulnerable = this.rules.hurtFrames;
    if (!fell && !this.rules.respawnOnHurt) return;
    const at = this.walkBand ? { x: Math.max(this.camX + 64, Math.min(p.x, this.camX + SCREEN_W - 64)), fy: this.inWalk(p.y >> 4) } : this.placeNear(Math.max(this.camX + 64, Math.min(p.x, this.camX + SCREEN_W - 64)), this.camY, this.camY + SCREEN_H, false, p.body);
    const keep = p.invulnerable;
    spawn(p, at.x, at.fy);
    p.invulnerable = keep;
  }

  private pressed(p: Player, bit: number): boolean {
    return (p.pad & bit) !== 0 && (p.last & bit) === 0;
  }

  /**
   * The beat 'em up's moves (the depth rule): left and right as anywhere,
   * stopped by solid cells at the feet; up and down a pixel a frame inside
   * the walkable band; B2 hops and lands back at the same depth.
   */
  private moveInDepth(p: Player, dir: number): void {
    const walk = this.walkBand!;
    const fy = p.y >> 4;
    p.crouching = false;
    if (p.blade) this.flyBlade(p);
    if (p.grabbed) return this.holdEnemy(p, dir);
    // the fight (phase 2): a punch holds the player still until it ends
    if (p.punchT) {
      p.punchT--;
      const len = p.combo === 3 ? COMBO_KICK_FRAMES : PUNCH_FRAMES;
      if (!p.struck && p.punchT === len - STRIKE_AT) {
        p.struck = true;
        if (p.combo === 3) this.strike(p, FIGHT_KICK_REACH, 2, true);
        else this.strike(p, PUNCH_REACH, 1, false, p.special === "pipe");
      }
      if (!p.punchT) p.comboT = p.combo < 3 ? COMBO_WINDOW : 0;
      return;
    }
    if (p.comboT) p.comboT--;
    // a knife is thrown instead of a punch (phase 4)
    if (p.onGround && this.pressed(p, Input.B1) && p.special === "knife" && !p.blade) {
      p.blade = { x: p.x + (p.flip ? -12 : 12), fy, dir: p.flip ? -1 : 1 };
      p.special = "";
      p.ammo = 0;
      p.combo = 1;
      p.comboT = 0;
      p.punchT = PUNCH_FRAMES;
      p.struck = true;
      this.events.push({ kind: "knife", player: p.index });
      return;
    }
    if (p.onGround && this.pressed(p, Input.B1)) {
      p.combo = p.comboT ? p.combo + 1 : 1;
      p.comboT = 0;
      p.punchT = p.combo === 3 ? COMBO_KICK_FRAMES : PUNCH_FRAMES;
      p.struck = false;
      this.events.push({ kind: p.combo === 3 ? "kick" : "knife", player: p.index });
      return;
    }
    // a flying kick: B1 in the air knocks down what it meets
    if (!p.onGround && this.pressed(p, Input.B1) && !p.kickT) {
      p.kickT = KICK_FRAMES;
      p.kickHit = false;
      this.events.push({ kind: "kick", player: p.index });
    }
    if (p.kickT && !p.kickHit && this.strike(p, FIGHT_KICK_REACH, 2, true)) p.kickHit = true;
    // walking into an enemy grabs it (phase 3)
    if (dir && p.onGround)
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i]!;
        if ((e.state !== "walk" && e.state !== "attack") || e.boss) continue;
        const dx = (e.x - p.x) * dir;
        if (dx < 0 || dx > GRAB_REACH || Math.abs(e.fy - fy) > GRAB_DEPTH) continue;
        p.grabbed = i + 1;
        p.grabT = 0;
        p.flip = dir < 0;
        e.state = "held";
        e.t = 0;
        e.dir = -dir;
        e.flip = e.dir < 0;
        return;
      }
    if (dir) {
      if (p.onGround && p.flip !== dir < 0) p.turnT = TURN_FRAMES;
      p.flip = dir < 0;
      for (let n = 0; n < (p.running ? 2 : 1); n++) {
        if (this.isSolid(this.cellAt(p.x + dir + dir * p.body.halfW, fy - 1))) break;
        p.x += dir;
      }
    }
    const dz = p.pad & Input.Up ? -1 : p.pad & Input.Down ? 1 : 0;
    if (dz) {
      const nf = Math.max(walk.y0, Math.min(walk.y1, fy + dz));
      if (!this.isSolid(this.cellAt(p.x, nf - 1))) p.y = nf * 16;
    }
    if (p.onGround && this.pressed(p, Input.B2)) {
      p.vy = p.body.jumpVy;
      p.onGround = false;
      this.events.push({ kind: "jump", player: p.index });
    }
    if (!p.onGround) {
      p.airT++;
      p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
      p.hop += p.vy;
      if (p.hop >= 0) {
        p.hop = 0;
        p.vy = 0;
        p.onGround = true;
        if (p.airT >= LAND_AFTER) p.landT = LAND_FRAMES;
        p.airT = 0;
        this.events.push({ kind: "land", player: p.index });
      }
    }
  }

  /**
   * A beat 'em up blow: every enemy standing in front within `reach` px and
   * DEPTH_REACH px of depth takes `n` hits; a knocking blow throws it down
   * (FALL_FRAMES on the floor, 8 px back). Fallen enemies are not hit.
   */
  private strike(p: Player, reach: number, n: number, knock: boolean, pipe = false): boolean {
    const fy = p.y >> 4;
    const dir = p.flip ? -1 : 1;
    if (pipe) {
      reach += PIPE_REACH;
      n += 1;
    }
    let hit = false;
    for (const e of this.enemies) {
      if (e.state !== "walk" && e.state !== "hit" && e.state !== "attack" && e.state !== "held") continue;
      const dx = (e.x - p.x) * dir;
      if (dx < 0 || dx > reach || Math.abs(e.fy - fy) > DEPTH_REACH) continue;
      this.damage(e, n, p);
      this.lastHit = e;
      this.lastHitT = 120;
      if (knock && e.state === "hit") {
        e.state = "fall";
        e.t = 0;
        e.x += dir * 8;
      }
      hit = true;
    }
    // a blow that meets no enemy breaks the crate in front (phase 4)
    if (!hit) {
      const cx = p.x + dir * (p.body.halfW + 4);
      const t = this.cellAt(cx, fy - 1);
      if ((t === Tag.Crate || t === Tag.Breakable) && this.hitCell(Math.floor(cx / CELL), Math.floor((fy - 1) / CELL), n, p)) hit = true;
    }
    // a pipe wears out with the blows that land
    if (pipe && hit && --p.ammo <= 0) {
      p.special = "";
      p.ammo = 0;
    }
    return hit;
  }

  /** The thrown knife flies on: the first enemy in its lane takes KNIFE_HITS and falls; a wall or the screen's edge ends it. */
  private flyBlade(p: Player): void {
    const b = p.blade!;
    b.x += b.dir * KNIFE_SPEED;
    for (const e of this.enemies) {
      if (e.state !== "walk" && e.state !== "hit" && e.state !== "attack") continue;
      if (Math.abs(e.x - b.x) > KNIFE_BOX || Math.abs(e.fy - b.fy) > DEPTH_REACH) continue;
      this.damage(e, KNIFE_HITS, p);
      this.lastHit = e;
      this.lastHitT = 120;
      if (e.state === "hit") {
        e.state = "fall";
        e.t = 0;
        e.x += b.dir * 8;
      }
      p.blade = null;
      return;
    }
    const t = this.cellAt(b.x, b.fy - 1);
    if (t === Tag.Crate || t === Tag.Breakable) this.hitCell(Math.floor(b.x / CELL), Math.floor((b.fy - 1) / CELL), 1, p);
    if (this.isSolid(t) || b.x < this.camX - 16 || b.x > this.camX + SCREEN_W + 16) p.blade = null;
  }

  /**
   * Holding an enemy (phase 3): it stays in front; B1 knees it, B1 with the
   * stick away throws it behind, and it slips away after GRAB_FRAMES.
   */
  private holdEnemy(p: Player, dir: number): void {
    const e = this.enemies[p.grabbed - 1];
    if (!e || e.state !== "held") {
      p.grabbed = 0;
      return;
    }
    p.grabT++;
    const face = p.flip ? -1 : 1;
    e.x = p.x + face * 16;
    e.fy = p.y >> 4;
    if (this.pressed(p, Input.B1)) {
      this.lastHit = e;
      this.lastHitT = 120;
      if (dir === -face) {
        e.x = Math.max(0, Math.min(this.level.width, p.x - face * THROW_DIST));
        this.damage(e, 2, p);
        if ((e.state as EnemyState) === "hit") {
          e.state = "fall";
          e.t = 0;
        }
        p.grabbed = 0;
        p.flip = !p.flip;
        this.events.push({ kind: "kick", player: p.index });
        return;
      }
      this.damage(e, 1, p);
      if ((e.state as EnemyState) === "hit") e.state = "held";
      else p.grabbed = 0;
      return;
    }
    if (p.grabT > GRAB_FRAMES) {
      e.state = "walk";
      e.t = 0;
      e.fireWait = e.boss ? BOSS_REST : ENEMY_REST;
      p.grabbed = 0;
    }
  }

  /** A feet y inside the walkable band. */
  private inWalk(fy: number): number {
    return this.walkBand ? Math.max(this.walkBand.y0, Math.min(this.walkBand.y1, fy)) : fy;
  }

  private walk(p: Player, dir: number, speed: number): void {
    const fy = p.y >> 4;
    for (let n = 0; n < speed; n++) {
      const nx = p.x + dir;
      const front = nx + dir * p.body.halfW;
      if (!this.bodyBlocked(front, fy, p.body.h)) {
        p.x = nx;
        p.pushT = 0;
        continue;
      }
      // blocked: with the push rule, an edge up to STEP_UP high with room above is
      // climbed after a push; with the jump rule (the default) it must be jumped
      if (p.onGround && this.rules.crateClimb === "push") {
        let top = fy;
        while (fy - top < STEP_UP + CELL && this.isSolid(this.cellAt(front, top - 1))) top = Math.floor((top - 1) / CELL) * CELL;
        if (fy - top <= STEP_UP && !this.bodyBlocked(front, top, p.body.h) && !this.bodyBlocked(p.x, top, p.body.h)) {
          if (++p.pushT >= PUSH_FRAMES) {
            p.y = top * 16;
            p.x = nx;
            p.pushT = 0;
          }
        }
      }
      return;
    }
  }

  /**
   * The light gun's player (the crosshair rule): the stick moves the
   * crosshair on the screen, B1 shoots where it points, B2 reloads.
   */
  private aim(p: Player): void {
    p.t++;
    if (p.invulnerable) p.invulnerable--;
    if (p.shotT) p.shotT--;
    const dx = p.pad & Input.Left ? -1 : p.pad & Input.Right ? 1 : 0;
    const dy = p.pad & Input.Up ? -1 : p.pad & Input.Down ? 1 : 0;
    p.cx = Math.max(0, Math.min(SCREEN_W - 1, p.cx + dx * CROSS_SPEED));
    p.cy = Math.max(0, Math.min(SCREEN_H - CROSS_BOTTOM - 1, p.cy + dy * CROSS_SPEED));
    if (p.reloadT) {
      if (--p.reloadT === 0) p.ammo = CLIP;
      return;
    }
    if (this.pressed(p, Input.B2) && p.ammo < CLIP) {
      p.reloadT = RELOAD_FRAMES;
      return;
    }
    // a bomb: every target on the screen goes down
    if (this.pressed(p, Input.B3) && p.bombs > 0) {
      p.bombs--;
      this.events.push({ kind: "explosion", x: this.camX + (SCREEN_W >> 1) });
      for (const e of this.enemies)
        if ((e.state === "walk" || e.state === "hit" || e.state === "attack") && e.x >= this.camX && e.x <= this.camX + SCREEN_W) this.damage(e, e.hp, p);
      return;
    }
    if (this.pressed(p, Input.B1) && p.ammo > 0) {
      p.ammo--;
      p.shotT = SHOT_FLASH;
      this.events.push({ kind: "shot", player: p.index });
      this.shootAt(p, this.camX + p.cx, this.camY + p.cy);
    }
  }

  /** A shot at a world point: the first target there, else a hostage (which hurts the shooter), else a crate or breakable cell. */
  private shootAt(p: Player, wx: number, wy: number): void {
    for (const e of this.enemies) {
      if (e.state !== "walk" && e.state !== "hit" && e.state !== "attack") continue;
      if (Math.abs(wx - e.x) > TARGET_HALF || wy < e.fy - TARGET_H || wy >= e.fy) continue;
      this.damage(e, 1, p);
      this.lastHit = e;
      this.lastHitT = 120;
      return;
    }
    for (const v of this.civilians) {
      if (v.rescued || Math.abs(wx - v.x) > HOSTAGE_HALF || wy < v.fy - HOSTAGE_H || wy >= v.fy) continue;
      this.events.push({ kind: "hostage", player: p.index });
      this.hurt(p);
      return;
    }
    const t = this.cellAt(wx, wy);
    if (t === Tag.Crate || t === Tag.Breakable) this.hitCell(Math.floor(wx / CELL), Math.floor(wy / CELL), 1, p);
  }

  /** The light gun's targets: they wait off the screen, aim, shoot the first player in and rest; a shot interrupts the aim. */
  private updateTargets(): void {
    if (this.lastHitT) this.lastHitT--;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]!;
      e.t++;
      const onScreen = e.x >= this.camX && e.x <= this.camX + SCREEN_W;
      if (e.state === "hidden") {
        // it shows once it has been on the screen for its appear frames
        if (onScreen && ++e.shown >= e.appear) {
          e.state = "walk";
          e.t = 0;
          e.shown = 0;
        }
        continue;
      }
      // a target with a stay leaves when its time on the screen is up (missed)
      if (e.stay && onScreen && (e.state === "walk" || e.state === "attack") && ++e.shown >= e.stay) {
        e.state = "off";
        continue;
      }
      if (e.state === "walk") {
        if (!onScreen) continue;
        e.flip = e.x > this.camX + (SCREEN_W >> 1);
        if (e.fireWait) e.fireWait--;
        else if (this.rules.enemiesShoot) {
          e.state = "attack";
          e.t = 0;
        }
      } else if (e.state === "attack") {
        if (e.t >= AIM_FRAMES) {
          const target = this.players.find((q) => q.active && !q.invulnerable);
          if (target) {
            this.events.push({ kind: "enemy_shot", x: e.x });
            this.hurt(target);
          }
          e.state = "walk";
          e.t = 0;
          e.fireWait = TARGET_REST;
        }
      } else if (e.state === "hit") {
        if (e.t > 14) {
          e.state = "walk";
          e.t = 0;
          e.fireWait = TARGET_REST;
        }
      } else if (e.state === "down" && e.t > 90) e.state = "off";
    }
  }

  /** The light gun's camera: along the level a pixel every ROUTE_STEP frames, holding at a camera lock until its targets are down. */
  private updateRoute(snap: boolean): void {
    const lock = this.activeLock();
    let maxX = this.level.width - SCREEN_W;
    if (lock) maxX = Math.min(maxX, Math.max(lock.x, lock.x + lock.w - SCREEN_W));
    this.camY = Math.max(0, this.level.height - SCREEN_H);
    if (snap) this.camX = 0;
    else if (this.frame % ROUTE_STEP === 0 && this.camX < maxX) this.camX++;
    if (this.camX > this.camFar) this.camFar = this.camX;
  }

  private updatePlayer(p: Player): void {
    if (this.rules.crosshair) return this.aim(p);
    p.t++;
    if (p.dropT) p.dropT--;
    if (p.invulnerable) p.invulnerable--;
    if (p.landT) p.landT--;
    if (p.turnT) p.turnT--;
    if (p.thumbsT) p.thumbsT--;
    if (p.kickT) p.kickT--;
    p.idleT = p.pad === 0 && p.onGround && !p.climbing ? p.idleT + 1 : 0;
    const jetWas = p.jetting;
    p.jetting = false;
    let dir = 0;
    if (p.pad & Input.Left) dir = -1;
    else if (p.pad & Input.Right) dir = 1;
    // double tap: a second press toward the same side within the run window runs
    if (this.pressed(p, Input.Left) || this.pressed(p, Input.Right)) {
      if (dir === p.tapDir && this.frame - p.tapTime <= this.runTap) p.running = true;
      p.tapDir = dir;
      p.tapTime = this.frame;
    }
    if (!dir) p.running = false;
    let fy = p.y >> 4;

    if (this.walkBand) this.moveInDepth(p, dir);
    else {
      // ladders: up in front of one, or down standing on its top (6 px of grace)
      if (!p.climbing && !p.knifeT) {
        for (let k = -6; k <= 6; k += 6) {
          const lx = p.x + k;
          if (((p.pad & Input.Up) && this.cellAt(lx, fy - 8) === Tag.Ladder) || ((p.pad & Input.Down) && !(p.pad & Input.B1) && p.onGround && this.cellAt(lx, fy) === Tag.Ladder)) {
            p.climbing = true;
            p.onGround = false;
            p.vy = 0;
            p.x = Math.floor(lx / CELL) * CELL + 8;
            break;
          }
        }
      }
      if (p.climbing) {
        if (p.pad & Input.Up) {
          p.y -= CLIMB_SPEED;
          fy = p.y >> 4;
          if (this.cellAt(p.x, fy - 1) !== Tag.Ladder) {
            // over the top: stand on the ladder's top cell
            p.y = (Math.floor((fy - 1) / CELL) + 1) * CELL * 16;
            p.climbing = false;
            p.onGround = true;
          }
        } else if (p.pad & Input.Down) {
          p.y += CLIMB_SPEED;
          fy = p.y >> 4;
          const cellTop = Math.floor(fy / CELL) * CELL;
          if (this.support(p.x, cellTop, true, p.body.halfW) === 2 && fy % CELL < 2) {
            p.y = cellTop * 16;
            p.climbing = false;
            p.onGround = true;
          }
        }
        // off the ladder's column or off its bottom: the climb ends and the player falls (L-06, J-04)
        if (p.climbing && this.cellAt(p.x, fy - 1) !== Tag.Ladder && this.cellAt(p.x, fy) !== Tag.Ladder) p.climbing = false;
        if (this.pressed(p, Input.B1)) {
          p.climbing = false;
          p.vy = p.body.jumpVy / 2;
        }
      } else {
        // crouch on Down (B1 with it drops through a ledge); stand up only where 40 px fit
        if (p.onGround && (p.pad & Input.Down) && !(p.pad & Input.B1)) p.crouching = true;
        else if (p.crouching && (!p.onGround || !this.bodyBlocked(p.x, fy, p.body.h))) p.crouching = false;
        if (p.crouching) {
          p.running = false;
          p.pushT = 0;
          if (dir) {
            if (p.flip !== dir < 0) p.turnT = TURN_FRAMES;
            p.flip = dir < 0;
            // crawl: 1 px every 2 frames, under anything 24 px tall
            const nx = p.x + dir;
            if (p.t & 1 && !this.bodyBlocked(nx + dir * p.body.halfW, fy, p.body.crouchH)) p.x = nx;
          }
        } else if (dir && !p.knifeT && !p.bazookaT) {
          if (p.onGround && p.flip !== dir < 0) p.turnT = TURN_FRAMES;
          p.flip = dir < 0;
          this.walk(p, dir, p.running ? 2 : 1);
        } else p.pushT = 0;
        fy = p.y >> 4;
        // down + jump drops through a ledge; jump otherwise
        if (p.onGround && this.pressed(p, Input.B1)) {
          if ((p.pad & Input.Down) && this.support(p.x, fy, false, p.body.halfW) === 1) {
            p.dropT = DROP_FRAMES;
            p.onGround = false;
            p.vy = 0;
            p.y += 16;
          } else {
            p.crouching = false;
            p.vy = p.body.jumpVy;
            p.onGround = false;
            this.events.push({ kind: "jump", player: p.index });
          }
        } else if (!p.onGround && this.pressed(p, Input.B1) && this.rules.doubleJump && !p.airJumps) {
          p.vy = p.body.doubleVy;
          p.airJumps = 1;
          this.events.push({ kind: "jump", player: p.index });
        }
        // jump kick: Down + B2 in the air
        if (!p.onGround && (p.pad & Input.Down) && this.pressed(p, Input.B2) && !p.kickT && this.rules.weapons) {
          p.kickT = KICK_FRAMES;
          p.kickHit = false;
          this.events.push({ kind: "kick", player: p.index });
        }
        // walking off an edge
        if (p.onGround && !this.support(p.x, fy, false, p.body.halfW)) {
          p.onGround = false;
          p.vy = 0;
        }
        if (!p.onGround) {
          const from = p.y >> 4;
          const was = p.vy;
          p.airT++;
          p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
          // the jet pack, after gravity
          // it starts while falling (or after the double jump) and goes on while B1 is held
          if (this.rules.jetpack && (p.pad & Input.B1) && p.fuel > 0 && (jetWas || was >= 0 || p.airJumps > 0)) {
            // it lifts up to JET_MAX_UP and never slows a faster rise (the double jump's)
            if (p.vy > JET_MAX_UP) p.vy = Math.max(p.vy - JET_LIFT, JET_MAX_UP);
            p.fuel--;
            p.jetting = true;
          }
          const to = (p.y + p.vy) >> 4;
          if (p.vy > 0) {
            // a platform going up can meet the feet from below: it is found at its own top
            const rose = p.dropT === 0 ? this.platformRose(p.x, from, p.body.halfW) : undefined;
            for (let py = rose ? rose.y : from + 1; py <= Math.max(to, rose ? rose.y : to); py++)
              if (this.support(p.x, py, p.dropT !== 0, p.body.halfW)) {
                p.y = py * 16;
                p.vy = 0;
                p.onGround = true;
                if (p.airT >= LAND_AFTER) p.landT = LAND_FRAMES;
                p.airT = 0;
                p.airJumps = 0;
                p.fuel = JET_FUEL;
                this.events.push({ kind: "land", player: p.index });
                break;
              }
            if (!p.onGround) p.y += p.vy;
          } else if (this.isSolid(this.cellAt(p.x, to - p.body.h))) p.vy = 0;
          // the head hits only solid cells: one-way platforms let it through
          else p.y += p.vy;
        }
      }
    }
    fy = p.y >> 4;
    if (fy > this.level.height + 64) {
      this.hurt(p, true); // fell out
      return;
    }
    if (this.cellAt(p.x, fy - 1) === Tag.Hazard || this.cellAt(p.x, fy - (p.body.h >> 1)) === Tag.Hazard) this.hurt(p);
    if (!p.active) return;

    // pickups
    for (const k of this.pickups) {
      const d = k.x - p.x;
      if (k.item === "spring") {
        // a spring: standing on it throws the player up (the platformer, T-22)
        if (k.live && d > -12 && d < 12 && p.onGround && fy === k.fy) {
          p.vy = SPRING_VY;
          p.onGround = false;
          p.airJumps = 0;
          this.events.push({ kind: "jump", player: p.index });
        }
        continue;
      }
      if (k.live && d > -14 && d < 14 && fy - k.fy > -8 && fy - k.fy < 8) {
        k.live = false;
        if (k.item === "coin") {
          this.coins++;
          p.score += COIN_SCORE;
        }
        if (k.item === "bazooka") {
          p.special = "bazooka";
          p.ammo = BAZOOKA_AMMO;
        }
        if (k.item === "pipe") {
          p.special = "pipe";
          p.ammo = PIPE_USES;
        }
        if (k.item === "knife") {
          p.special = "knife";
          p.ammo = 1;
        }
        this.events.push({ kind: "pickup", item: k.item, player: p.index });
      }
    }

    // special: the picked-up weapon while it has ammo
    if (p.bazookaT) p.bazookaT--;
    if (this.pressed(p, Input.B3) && p.special === "bazooka" && p.ammo > 0 && !p.rocket && p.onGround && this.rules.weapons) {
      p.rocket = { dir: p.flip ? -1 : 1, x: p.x + (p.flip ? -30 : 10), y: fy - p.body.rocketY, speed: 2 };
      p.bazookaT = BAZOOKA_FRAMES;
      this.events.push({ kind: "rocket", player: p.index });
      if (--p.ammo === 0) p.special = "";
    }
    if (p.rocket) {
      const r = p.rocket;
      if (r.speed < 8) r.speed++;
      r.x += r.dir * r.speed;
      const tip = r.x + 16 + r.dir * 14;
      const e = this.enemyAt(tip, r.y + 8, 16);
      const t = this.cellAt(tip, r.y + 8);
      if (e) {
        this.damage(e, 9, p);
        p.rocket = null;
        this.events.push({ kind: "explosion", x: tip });
      } else if (this.hitCell(Math.floor(tip / CELL), Math.floor((r.y + 8) / CELL), 9, p)) {
        p.rocket = null;
        this.events.push({ kind: "explosion", x: tip });
      }
      else if (t === Tag.Solid || r.x < this.camX - 48 || r.x > this.camX + SCREEN_W + 48) p.rocket = null;
    }

    // fire: the knife if an enemy stands right in front, else the machine gun
    if (p.knifeT) p.knifeT--;
    if (this.pressed(p, Input.B2) && p.onGround && !p.climbing && this.rules.weapons) {
      const e = this.enemyAt(p.x + (p.flip ? -p.body.knifeReach : p.body.knifeReach), fy - p.body.knifeY, 16);
      if (e) {
        p.knifeT = KNIFE_FRAMES;
        this.damage(e, 2, p);
        this.events.push({ kind: "knife", player: p.index });
      }
    }
    p.firing = this.rules.weapons && (p.pad & Input.B2) !== 0 && !p.knifeT && !p.bazookaT && !p.climbing && !p.kickT;
    if (p.fireWait) p.fireWait--;
    if (p.firing && !p.fireWait && p.shots.length < SHOTS_PER_PLAYER) {
      p.shots.push({ dir: p.flip ? -1 : 1, x: p.x + (p.flip ? -20 : 20), y: fy - (p.crouching ? p.body.crouchShotY : p.body.shotY) });
      p.fireWait = FIRE_EVERY;
      this.events.push({ kind: "shot", player: p.index });
    }
    // the kick's first enemy in front, body to body, takes 2 hits once
    if (p.kickT && !p.kickHit) {
      const e = this.enemies.find((q) => {
        const dx = (q.x - p.x) * (p.flip ? -1 : 1);
        return this.alive(q) && dx >= 0 && dx <= p.body.kickReach && q.fy - 40 < fy && q.fy > fy - p.body.h;
      });
      if (e) {
        p.kickHit = true;
        this.damage(e, 2, p);
      }
    }
    p.shots = p.shots.filter((b) => {
      b.x += b.dir * SHOT_SPEED;
      const e = this.enemyAt(b.x, b.y, 8);
      if (e) {
        this.damage(e, 1, p);
        return false;
      }
      if (this.hitCell(Math.floor(b.x / CELL), Math.floor(b.y / CELL), 1, p)) return false;
      return this.cellAt(b.x, b.y) !== Tag.Solid && b.x >= this.camX - 32 && b.x <= this.camX + SCREEN_W + 32;
    });
  }

  // ------------------------------------------------------------ actors

  private alive(e: Enemy): boolean {
    return e.state === "walk" || e.state === "hit" || e.state === "attack" || e.state === "fall" || e.state === "held" || e.state === "hidden";
  }

  /** The enemy last hit and frames left to show its health (the beat 'em up's bar). */
  lastHit: Enemy | null = null;
  lastHitT = 0;

  /** The enemy hit by a point (x, y), if any. */
  enemyAt(x: number, y: number, reach: number): Enemy | undefined {
    return this.enemies.find((e) => {
      const dx = e.x - x;
      return this.alive(e) && dx > -reach && dx < reach && y <= e.fy && y > e.fy - 40;
    });
  }

  private damage(e: Enemy, n: number, by: Player): void {
    if (!this.alive(e)) return;
    e.hp -= n;
    e.t = 0;
    if (e.hp <= 0) {
      e.state = "down";
      by.score += this.rules.enemyScore;
      this.events.push({ kind: "enemy_down", name: e.name, x: e.x });
    } else {
      e.state = "hit";
      this.events.push({ kind: "hit", name: e.name, x: e.x });
    }
  }

  private updateEnemies(): void {
    if (this.rules.crosshair) return this.updateTargets();
    if (this.walkBand) return this.updateEnemiesInDepth();
    for (const e of this.enemies) {
      e.t++;
      if (e.state === "walk") {
        // chase a player on the same floor, else patrol
        let target: Player | undefined;
        let best = ENEMY_SIGHT;
        if (this.rules.enemiesChase || this.rules.enemiesShoot) for (const p of this.players) {
          const dx = Math.abs(p.x - e.x);
          const dy = (p.y >> 4) - e.fy;
          if (p.active && dy > -16 && dy < 16 && dx < best) {
            best = dx;
            target = p;
          }
        }
        if (target && this.rules.enemiesChase) {
          const dx = target.x - e.x;
          e.dir = dx > 0 ? 1 : -1;
          // with touch damage it walks into the player (it used to stop 22 px away, out of the 14 px reach, J-09)
          const gap = this.rules.touchHurts ? 8 : 22;
          if ((dx > gap || dx < -gap) && e.t & 1) e.x += e.dir;
        } else if (e.t & 1) {
          e.x += e.dir;
          if (e.x <= e.min || e.x >= e.max) e.dir = -e.dir;
        }
        if (target && this.rules.enemiesShoot) {
          const dx = target.x - e.x;
          if (!this.rules.enemiesChase) e.dir = dx > 0 ? 1 : -1;
          if (e.fireWait) e.fireWait--;
          else if (dx > 40 || dx < -40) {
            this.enemyShots.push({ x: e.x + e.dir * 16, y: e.fy - 26, dir: e.dir });
            e.fireWait = this.fireEvery;
          }
        }
        e.x = Math.max(e.min, Math.min(e.max, e.x));
        e.flip = e.dir < 0; // sheets face right
      } else if (e.state === "hit") {
        if (e.t > 14) {
          e.state = "walk";
          e.t = 0;
        }
      } else if (e.state === "down" && e.t > 90) e.state = "off";
      // stomping: landing on an enemy's head takes it down and bounces (the platformer, T-22)
      if (this.rules.stomp && this.alive(e))
        for (const p of this.players) {
          const dx = p.x - e.x;
          const fy = p.y >> 4;
          if (p.active && p.vy > 0 && dx > -16 && dx < 16 && fy >= e.fy - 44 && fy <= e.fy - 28) {
            this.damage(e, 99, p);
            p.vy = STOMP_VY;
            break;
          }
        }
      // touching an enemy hurts
      if (this.rules.touchHurts && this.alive(e))
        for (const p of this.players) {
          const dx = p.x - e.x;
          const dy = (p.y >> 4) - e.fy;
          if (p.active && !p.invulnerable && dx > -14 && dx < 14 && dy > -24 && dy < 24) this.hurt(p);
        }
    }
    this.enemyShots = this.enemyShots.filter((s) => {
      s.x += s.dir * this.shotSpeed;
      for (const p of this.players) {
        const fy = p.y >> 4;
        if (p.active && Math.abs(p.x - s.x) < 8 && s.y <= fy && s.y > fy - (p.crouching ? p.body.crouchH : p.body.h)) {
          this.hurt(p);
          return false;
        }
      }
      return !this.isSolid(this.cellAt(s.x, s.y)) && s.x >= this.camX - 32 && s.x <= this.camX + SCREEN_W + 32;
    });
  }

  /**
   * The beat 'em up's enemies (phase 2): each walks to stand ENEMY_GAP px
   * beside the nearest player, on its own side and its lane's depth (they
   * spread out), winds up and hits a player in reach, rests, and gets up
   * after a knock-down.
   */
  private updateEnemiesInDepth(): void {
    if (this.lastHitT) this.lastHitT--;
    for (const e of this.enemies) {
      e.t++;
      // an enemy off the screen waits: the camera's next stretch (a lock: a wave) wakes it
      if (e.state === "walk" && (e.x < this.camX - 16 || e.x > this.camX + SCREEN_W + 16)) continue;
      if (e.state === "walk") {
        let target: Player | undefined;
        let best = Infinity;
        for (const p of this.players) {
          if (!p.active) continue;
          const d = Math.abs(p.x - e.x) + Math.abs((p.y >> 4) - e.fy);
          if (d < best) {
            best = d;
            target = p;
          }
        }
        if (!target) continue;
        const pf = target.y >> 4;
        const side = e.x < target.x ? -1 : 1;
        const tx = target.x + side * ENEMY_GAP;
        const tz = this.inWalk(pf + e.lane * 6);
        // solid cells stop it (phase 3)
        // it closes in to ENEMY_GAP but never backs away from a player walking up to it
        if (e.t & 1) {
          const nx = Math.abs(target.x - e.x) > ENEMY_GAP ? e.x + Math.sign(tx - e.x) : e.x;
          if (!this.isSolid(this.cellAt(nx, e.fy - 1))) e.x = nx;
        } else {
          const nf = e.fy + Math.sign(tz - e.fy);
          if (!this.isSolid(this.cellAt(e.x, nf - 1))) e.fy = nf;
        }
        e.dir = target.x >= e.x ? 1 : -1;
        e.flip = e.dir < 0;
        if (e.fireWait) e.fireWait--;
        else if (Math.abs(target.x - e.x) <= ENEMY_GAP + 6 && Math.abs(pf - e.fy) <= 6) {
          e.state = "attack";
          e.t = 0;
        }
      } else if (e.state === "attack") {
        if (e.t === ENEMY_STRIKE)
          for (const p of this.players) {
            const dx = (p.x - e.x) * e.dir;
            if (p.active && !p.invulnerable && p.hop > -16 * 16 && dx >= 0 && dx <= ENEMY_REACH && Math.abs((p.y >> 4) - e.fy) <= DEPTH_REACH) this.hurt(p);
          }
        if (e.t >= ENEMY_ATTACK_FRAMES) {
          e.state = "walk";
          e.t = 0;
          e.fireWait = e.boss ? BOSS_REST : ENEMY_REST;
        }
      } else if (e.state === "hit") {
        if (e.t > 14) {
          e.state = "walk";
          e.t = 0;
          e.fireWait = e.boss ? BOSS_REST : ENEMY_REST;
        }
      } else if (e.state === "fall") {
        if (e.t > FALL_FRAMES) {
          e.state = "walk";
          e.t = 0;
          e.fireWait = e.boss ? BOSS_REST : ENEMY_REST;
        }
      } else if (e.state === "down" && e.t > 90) e.state = "off";
    }
  }

  private updateCivilians(): void {
    for (const v of this.civilians) {
      v.t++;
      // the light gun's hostages are only not to be shot
      if (this.rules.crosshair) continue;
      if (v.rescued || v.trappedIn) continue;
      for (const p of this.players) {
        const dx = v.x - p.x;
        const dy = (p.y >> 4) - v.fy;
        if (p.active && p.onGround && dx > -20 && dx < 20 && dy > -8 && dy < 8) {
          v.rescued = true;
          v.t = 0;
          this.rescued++;
          p.score += this.rules.rescueScore;
          p.thumbsT = THUMBS_FRAMES;
          this.events.push({ kind: "rescue", name: v.name, player: p.index });
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------ camera

  /** The camera lock holding the camera now: one with enemies still standing inside. */
  activeLock(): (Rect & { name: string }) | undefined {
    return this.cameraLocks.find((l) => {
      if (l.done) return false;
      if (this.camX + SCREEN_W < l.x + l.w / 2 || this.camX > l.x + l.w) return false;
      const inside = this.enemies.some((e) => this.alive(e) && e.x >= l.x && e.x <= l.x + l.w);
      if (!inside) l.done = true;
      return inside;
    });
  }

  /**
   * Keeps every player in view and only moves forward: it aims a third of
   * a screen ahead of the players' middle, never goes back more than the
   * level's backtrack from the farthest point reached, and players cannot
   * walk past the screen's sides (the leader waits for the others).
   */
  updateCamera(snap = false): void {
    if (this.rules.crosshair) return this.updateRoute(snap);
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const p of this.players)
      if (p.active) {
        sx += p.x;
        sy += p.y >> 4;
        n++;
      }
    if (!n) return;
    let tx = Math.trunc(sx / n) - Math.trunc(SCREEN_W / 3);
    if (tx < this.camFar - this.backtrack) tx = this.camFar - this.backtrack;
    let ty = Math.trunc(sy / n) - 150;
    const fit = this.cameraFit();
    if (fit.loY <= fit.hiY) ty = Math.min(fit.hiY, Math.max(fit.loY, ty));
    const lock = this.activeLock();
    let maxX = this.level.width - SCREEN_W;
    if (lock) maxX = Math.min(maxX, Math.max(lock.x, lock.x + lock.w - SCREEN_W));
    tx = Math.max(0, Math.min(maxX, tx));
    ty = Math.max(0, Math.min(this.level.height - SCREEN_H, ty));
    if (snap) {
      this.camX = tx;
      this.camY = ty;
    } else {
      const before = this.camX;
      this.camX += Math.trunc((tx - this.camX) / 4) + Math.sign(tx - this.camX);
      this.camY += Math.trunc((ty - this.camY) / 6) + Math.sign(ty - this.camY);
      // it never moves past the player furthest behind, so it does not push anyone
      // into a wall or a crate (J-05): the one in front waits at the right side
      if (this.camX > before) this.camX = Math.max(before, Math.min(this.camX, fit.hiX));
      else if (this.camX < before) this.camX = Math.min(before, Math.max(this.camX, fit.loX));
    }
    if (fit.loY <= fit.hiY) this.camY = Math.max(0, Math.min(this.level.height - SCREEN_H, Math.min(fit.hiY, Math.max(fit.loY, this.camY))));
    if (this.camX > this.camFar) this.camFar = this.camX;
    for (const p of this.players)
      if (p.active) p.x = Math.max(this.camX + 12, Math.min(this.camX + SCREEN_W - 12, p.x));
  }

  /**
   * The camera positions that keep every active player in the picture:
   * x from the one in front (loX) to the one behind (hiX, which wins when
   * they are too far apart), y with every head and every pair of feet on
   * screen (loY > hiY when they do not fit, then y follows their middle).
   */
  private cameraFit(): { loX: number; hiX: number; loY: number; hiY: number } {
    let minX = Infinity;
    let maxX = -Infinity;
    let top = Infinity;
    let feet = -Infinity;
    for (const p of this.players)
      if (p.active) {
        const fy = p.y >> 4;
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        top = Math.min(top, fy - p.body.h);
        feet = Math.max(feet, fy);
      }
    const hiX = minX - 12;
    return { loX: Math.min(hiX, maxX - SCREEN_W + 12), hiX, loY: feet + VIEW_BOTTOM - SCREEN_H, hiY: top - VIEW_TOP };
  }

  // -------------------------------------------------------------- step

  /** One frame. `inputs[i]` is player i's `Input` bits; a button press from a player who is out joins them. */
  step(inputs: readonly number[]): void {
    this.events = [];
    if (this.outcome !== "playing") {
      // the players keep their victory going on the clear screen
      if (this.outcome === "cleared") for (const p of this.players) if (p.active) p.t++;
      return;
    }
    this.frame++;
    this.movePlatforms();
    for (const p of this.players) {
      const pad = cancelOpposites(inputs[p.index] ?? 0);
      if (!p.active) {
        if (pad & (Input.Start | Input.B1 | Input.B2 | Input.B3) && !(p.last & (Input.Start | Input.B1 | Input.B2 | Input.B3))) this.join(p.index);
        p.last = pad;
        p.pad = pad;
        if (!p.active) continue;
      }
      p.last = p.pad;
      p.pad = pad;
      this.updatePlayer(p);
    }
    this.updateEnemies();
    this.updateCivilians();
    this.updateCamera();
    if (this.exitClosed) this.exitClosed--;
    // the light gun: the level ends where the camera's route does, with no lock holding it
    if (this.rules.crosshair) {
      if (this.camX >= this.level.width - SCREEN_W && !this.activeLock() && this.players.some((p) => p.active)) {
        this.outcome = "cleared";
        this.events.push({ kind: "cleared" });
        return;
      }
    } else {
      const closed = this.rules.exitNeedsEnemies && this.enemies.some((e) => this.alive(e));
      for (const p of this.players) {
        if (!p.active) continue;
        const fy = p.y >> 4;
        if (!this.exits.some((x) => p.x >= x.x && p.x <= x.x + x.w && fy >= x.y && fy <= x.y + x.h)) continue;
        if (closed) {
          // tell the players why the exit does not open (experiment 1, J-11)
          if (!this.exitClosed) this.events.push({ kind: "exit_closed" });
          this.exitClosed = EXIT_CLOSED_FRAMES;
          continue;
        }
        this.outcome = "cleared";
        this.events.push({ kind: "cleared" });
        return;
      }
    }
    if (this.players.every((p) => !p.active)) {
      // nobody left playing (in a go-link room a new credit would start again)
      this.outcome = "over";
      this.events.push({ kind: "over" });
    }
  }

  /** A plain summary for the status panel and the tests. */
  snapshot(): GameSnapshot {
    return {
      frame: this.frame,
      outcome: this.outcome,
      camera: { x: this.camX, y: this.camY, far: this.camFar, locked: !!this.activeLock() },
      players: this.players.map((p) => ({
        index: p.index,
        active: p.active,
        x: p.x,
        y: p.y >> 4,
        state: !p.active ? "out" : p.climbing ? "climbing" : !p.onGround ? (p.vy < 0 ? "jumping" : "falling") : p.crouching ? (p.pad & (Input.Left | Input.Right) ? "crawling" : "crouching") : p.pushT ? "pushing" : p.knifeT ? "knife" : p.firing ? "firing" : p.running ? "running" : p.pad & (Input.Left | Input.Right) ? "walking" : "standing",
        lives: p.lives,
        score: p.score,
        ammo: p.ammo,
      })),
      enemiesLeft: this.enemies.filter((e) => this.alive(e)).length,
      exitClosed: this.exitClosed > 0,
      civilians: { rescued: this.rescued, total: this.civilians.length },
    };
  }
}

export type PlayerState = "out" | "climbing" | "jumping" | "falling" | "crouching" | "crawling" | "pushing" | "knife" | "firing" | "running" | "walking" | "standing";

export interface GameSnapshot {
  frame: number;
  outcome: GameOutcome;
  camera: { x: number; y: number; far: number; locked: boolean };
  players: { index: number; active: boolean; x: number; y: number; state: PlayerState; lives: number; score: number; ammo: number }[];
  enemiesLeft: number;
  /** A player is at the exit while it still needs enemies down (the message shows). */
  exitClosed: boolean;
  civilians: { rescued: number; total: number };
}

function newPlayer(index: number, lives: number, body: Body): Player {
  return {
    index,
    body,
    active: false,
    pad: 0,
    last: 0,
    x: 0,
    y: 0,
    vy: 0,
    flip: false,
    onGround: true,
    climbing: false,
    dropT: 0,
    pushT: 0,
    running: false,
    tapDir: 0,
    tapTime: -100,
    firing: false,
    fireWait: 0,
    knifeT: 0,
    bazookaT: 0,
    special: "",
    ammo: 0,
    t: 0,
    score: 0,
    lives,
    invulnerable: 0,
    shots: [],
    rocket: null,
    blade: null,
    crouching: false,
    landT: 0,
    turnT: 0,
    kickT: 0,
    kickHit: false,
    thumbsT: 0,
    idleT: 0,
    airT: 0,
    airJumps: 0,
    fuel: JET_FUEL,
    jetting: false,
    hop: 0,
    punchT: 0,
    combo: 0,
    comboT: 0,
    struck: false,
    grabbed: 0,
    grabT: 0,
    cx: 0,
    cy: 0,
    shotT: 0,
    reloadT: 0,
    bombs: 0,
  };
}

/** Room kept above the highest head and below the lowest feet (px). */
/** The most moving platforms in a level (the ROM engine keeps as many). */
export const MAX_PLATFORMS = 16;
const VIEW_TOP = 24;
const VIEW_BOTTOM = 8;

/** Where placeNear looks, in order. */
const AROUND = [0, 24, -24, 48, -48];
const BESIDE = [-24, 24, -48, 48, 0];

function spawn(p: Player, x: number, fy: number): void {
  p.active = true;
  p.x = x;
  p.y = fy * 16;
  p.vy = 0;
  p.flip = false;
  p.onGround = true;
  p.climbing = false;
  p.dropT = p.pushT = 0;
  p.running = false;
  p.tapDir = 0;
  p.special = "";
  p.ammo = p.knifeT = p.bazookaT = p.fireWait = 0;
  p.t = 0;
  p.shots = [];
  p.rocket = null;
  p.blade = null;
  p.crouching = false;
  p.landT = p.turnT = p.kickT = p.thumbsT = p.idleT = p.airT = p.airJumps = 0;
  p.kickHit = p.jetting = false;
  p.fuel = JET_FUEL;
  p.hop = 0;
  p.punchT = p.combo = p.comboT = 0;
  p.struck = false;
  p.grabbed = p.grabT = 0;
  p.shotT = p.reloadT = 0;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
