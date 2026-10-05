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
  SHIP_SPEED,
  SHIP_HALF_W,
  SHIP_HALF_H,
  SHIP_FIRE,
  FLY_SPEED,
  FLY_WAVE,
  FLY_MID,
  SHIP_HIT_X,
  SHIP_HIT_Y,
  MAX_POWER,
  POWER_REACH_X,
  POWER_REACH_Y,
  POWER_GAP,
  flyPathOf,
  DIVE_RANGE,
  GUNSHIP_HP,
  GUNSHIP_HOLD,
  GUNSHIP_BOB,
  GUNSHIP_FIRE,
  SHIP_SHOT_SPEED,
  SHIP_SHOT_X,
  SHIP_SHOT_Y,
  GUNSHIP_HIT_X,
  GUNSHIP_HIT_Y,
  BOMB_BOSS_HITS,
  TOP_SPEED,
  TOP_HALF_W,
  TOP_DEPTH,
  TOP_SHOT,
  TOP_MID,
  TOP_TOUCH_X,
  TOP_TOUCH_Y,
  GRENADES,
  GRENADE_SPEED,
  GRENADE_FUSE,
  GRENADE_HITS,
  GRENADE_X,
  GRENADE_Y,
  BOOM_FRAMES,
  TOP_SIGHT,
  TOP_EN_SHOT,
  TOP_EN_HIT_X,
  TOP_EN_HIT_Y,
  MAZE_SPEED,
  DOT_SCORE,
  POWER_SCORE,
  FRIGHT_FRAMES,
  MAZE_TOUCH,
  EAT_SCORE,
  HOME_FRAMES,
  AMBUSH_AHEAD,
  WANDER_NEAR,
  QUIZ_TIME,
  REVEAL_FRAMES,
  QUIZ_SCORE,
  CAR_DIRS,
  STEER,
  CAR_ACCEL,
  CAR_BRAKE,
  CAR_MAX,
  CPU_MAX,
  WAYPOINTS,
  GATE_X,
  GATE_Y,
  RACE_LAPS,
  PLACE_SCORE,
  RACE_AFTER,
  RACE_TIME,
  RACE_COUNT,
  GRID,
  MAX_WAYPOINTS,
  BUMP_X,
  BUMP_Y,
  FIELD_X0,
  FIELD_Y0,
  FIELD_Y1,
  GOAL_Y0,
  GOAL_Y1,
  ATH_SPEED,
  TOUCH_X,
  TOUCH_Y,
  DRIBBLE,
  BALL_KICK,
  BALL_STOP,
  REGRAB,
  GOAL_SCORE,
  KICKOFF_FRAMES,
  MATCH_TIME,
  CPU_SHOOT,
  PASS_SPEED,
  KEEPER_X,
  PRESS_X,
  MOTION_LEN,
  MOTION_WINDOW,
  DASH_WINDOW,
  FB_FRAMES,
  FB_AT,
  FB_SPEED,
  FB_DMG,
  FB_CHIP,
  FB_Y,
  DASH_FRAMES,
  DASH_FROM,
  DASH_TO,
  DASH_SPEED,
  DASH_DMG,
  VS_CPU_FAR,
  VS_CPU_THROW,
  VS_FLOOR,
  VS_START,
  VS_WALK,
  VS_WALK_BACK,
  VS_GAP,
  VS_EDGE,
  VS_JUMP_VY,
  VS_GRAVITY,
  VS_PUNCH_AT,
  VS_PUNCH_REACH,
  VS_PUNCH_DMG,
  VS_KICK_AT,
  VS_KICK_REACH,
  VS_KICK_DMG,
  VS_CHIP,
  VS_BLOCK_STUN,
  VS_BLOCK_PUSH,
  VS_HIT_STUN,
  VS_HIT_PUSH,
  VS_HP,
  VS_INTRO,
  VS_TIME,
  VS_PAUSE,
  VS_WINS,
  VS_ROUNDS,
  VS_ROUND_SCORE,
  VS_CPU_EVERY,
  QUIZ_BONUS,
  MASH_TIME,
  MASH_SCORE,
  TIMING_W,
  TIMING_STEP,
  TIMING_TIME,
  TIMING_SCORE,
  TIMING_LOSS,
  MEM_LEN,
  MEM_LETTER,
  MEM_INPUT,
  MEM_SCORE,
  MAZE_HASTE,
  chaseOf,
  WELL_X,
  WELL_Y,
  SOFT_DROP,
  MOVE_FIRST,
  MOVE_EVERY,
  GEM_SCORE,
  PUZZLE_GOAL,
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
import { cpuPad, emptyWell, fallFrames, garbageOf, lockTrio, markMatches, newWell, settleWell, shiftTrio, spawnTrio, turnTrio, wellFree, type Well } from "./puzzle";
import { kindOf, memorySeq, timingCell } from "./quiz";
import type { QuizQuestion } from "../model/types";

export const MAX_PLAYERS = 4;
/** How long the "defeat every enemy" message stays after a player leaves the closed exit. */
export const EXIT_CLOSED_FRAMES = 90;

export interface Shot {
  x: number;
  y: number;
  dir: number;
  /** The shooter's fan: px a frame up or down. */
  vy?: number;
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
  /** The shooter's weapon: 0 one shot, 1 two side by side, 2 a fan of three. */
  power: number;
  /** The top-down aim: -1, 0 or 1 each way (never both 0). */
  aimX: number;
  aimY: number;
  /** The maze: the way it moves and the way the stick last asked for (-1, 0 or 1 each way). */
  mdx: number;
  mdy: number;
  wdx: number;
  wdy: number;
  /** The top-down grenade in flight (x, y at its middle, frames flown), and its burst while it shows. */
  grenade: { x: number; y: number; dx: number; dy: number; t: number } | null;
  boom: { x: number; y: number; t: number } | null;
  /** The puzzle's well (players 1 and 2 only). */
  well: Well | null;
  /** The puzzle's CPU rival plays this well (player 2 while nobody took it). */
  cpu: boolean;
  /** The quiz: this question's answer (0-2, -1 none yet) and the frames that were left when it came. */
  answer: number;
  answerLeft: number;
  /** The quiz's minigames: presses (mash) or letters right (memory), and whether its turn is over (timing, memory). */
  count: number;
  done: boolean;
  /** Versus fighting: the last stick codes (1 down, 2 toward, 4 away, 8 up) and where the next goes. */
  motion: number[];
  motionI: number;
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
  /** The horizontal shooter: the feet y its wave flies around, and its path (0 wave, 1 straight, 2 dive, 3 the gunship boss). */
  baseY: number;
  path: number;
  /** The vertical shooter: the x its wave flies around. */
  baseX: number;
  /** The maze: the way it moves up or down (dir is across). */
  mdy: number;
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
  /** The quiz's questions (the project's quiz). */
  questions?: readonly QuizQuestion[];
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
  /** The maze: a dot per cell (1: there), how many are left, and the frames the chasers still flee. */
  dots: Uint8Array = new Uint8Array(0);
  dotsLeft = 0;
  frightT = 0;
  /** The maze's round, from 0 (phase 3). */
  round = 0;
  /** The quiz: its questions, the one on the screen, its phase (0 asked, 1 the answer shown) and the frames into it. */
  readonly questions: readonly QuizQuestion[];
  quizK = 0;
  quizPhase = 0;
  quizT = 0;
  /** Versus fighting: the round (from 1), its phase (0 the call, 1 the fight, 2 its end), frames into the phase, the fight's frames left, rounds won, the round's winner (-1 a draw) and the match's (-1 still on). */
  vsRound = 1;
  vsPhase = 0;
  vsT = 0;
  vsTime = VS_TIME;
  readonly vsWins = [0, 0];
  vsWinner = -1;
  vsMatch = -1;
  /** Sports: the ball (1/16 px, its speed, who has it, -1 nobody), each team's goals, the match's frames left, the kickoff's freeze, the last goal's team (-1 none yet). */
  ballX = 0;
  ballY = 0;
  ballVx = 0;
  ballVy = 0;
  ballOwner = -1;
  readonly goals = [0, 0];
  matchT = MATCH_TIME;
  kickT = KICKOFF_FRAMES;
  goalBy = -1;
  /** Racing: frames since the countdown began, cars finished, the frame the first did (-1 none), and whether the race is over. */
  raceT = 0;
  /** Racing: the track's waypoints (its checkpoints, or the wizard ring's). */
  readonly waypoints: readonly (readonly [number, number])[];
  finished = 0;
  firstAt = -1;
  raceOver = false;
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
  /** The puzzle: each port's last pad while the CPU plays its well (a press takes it over). */
  private readonly humanLast = [0, 0, 0, 0];

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
    this.questions = this.rules.quiz ? (opts.questions ?? []) : [];
    const checkpoints = level.objects.filter((o) => o.type === "checkpoint").slice(0, MAX_WAYPOINTS);
    this.waypoints = checkpoints.length ? checkpoints.map((o) => [o.x, o.y] as const) : WAYPOINTS;
    if (this.rules.depth) this.walkBand = walkBandOf(level.height, level.walk);
    this.backtrack = level.backtrack ?? BACKTRACK;
    this.fireEvery = difficultyOf(opts.difficulty).fireEvery;
    this.shotSpeed = difficultyOf(opts.difficulty).shotSpeed;
    for (let i = 0; i < this.maxPlayers; i++) this.players.push(newPlayer(i, this.lives, opts.heights?.[i] ? bodyFor(opts.heights[i]) : WILLY_BODY));
    this.loadObjects(level.objects);
    // the maze: a dot in every empty cell but the top and bottom rows (the HUD's), its chasers on cell middles
    if (this.rules.maze) {
      this.dots = new Uint8Array(this.cols * this.rows);
      this.fillDots();
      for (const e of this.enemies) {
        e.x = Math.floor(e.x / CELL) * CELL + 8;
        e.fy = Math.floor((e.fy - 1) / CELL) * CELL + CELL;
        e.min = e.x;
        e.max = e.fy;
        e.dir = 0;
      }
    }
    const n = Math.max(1, Math.min(this.maxPlayers, opts.players ?? 1));
    for (let i = 0; i < n; i++) this.join(i);
    // the puzzle's CPU rival takes the second well while player 2 is not in
    if (this.rules.puzzle && this.rules.puzzleCpu && this.players[1] && !this.players[1].active) {
      this.join(1);
      this.players[1].cpu = true;
    }
    // racing: the CPU drives every empty place on the grid
    if (this.rules.racing)
      for (let i = 0; i < this.athletes(); i++) {
        const p = this.players[i];
        if (!p || p.active) continue;
        this.join(i);
        p.cpu = true;
      }
    // sports: the CPU plays every empty place, and the ball waits in the middle
    if (this.rules.sports) {
      for (let i = 0; i < this.athletes(); i++) {
        const p = this.players[i];
        if (!p || p.active) continue;
        this.join(i);
        p.cpu = true;
      }
      this.kickoff();
    }
    // versus fighting: the CPU fights for an empty corner (players 1 and 2)
    if (this.rules.versus)
      for (let i = 0; i < 2; i++) {
        const p = this.players[i];
        if (!p || p.active) continue;
        this.join(i);
        p.cpu = true;
      }
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
            baseY: o.y,
            path: this.rules.ship ? flyPathOf(o.path) : this.rules.maze ? chaseOf(o.chase) : 0,
            baseX: o.x,
            mdy: 0,
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
              baseY: o.y,
              path: 0,
              baseX: o.x,
              mdy: 0,
            });
          // the horizontal shooter's boss
          else if (o.kind === "gunship" && this.rules.ship)
            this.enemies.push({
              name: o.name,
              kind: "gunship",
              x: o.x,
              fy: o.y,
              min: o.x,
              max: o.x,
              state: "walk",
              hp: num(o.hp, GUNSHIP_HP),
              dir: -1,
              flip: true,
              t: this.enemies.length * 11,
              fireWait: GUNSHIP_FIRE,
              maxHp: num(o.hp, GUNSHIP_HP),
              lane: 0,
              boss: true,
              appear: 0,
              stay: 0,
              shown: 0,
              baseY: o.y,
              path: 3,
              baseX: o.x,
              mdy: 0,
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
    // racing: a car on its place on the grid, facing left (cars: aimX the way it points, fuel its speed, cx its x in 1/16 px, count its laps, answer the next waypoint)
    if (this.rules.racing) {
      if (i >= this.athletes()) return;
      // the grid: the level's player starts, else the wizard ring's
      const start = this.level.objects.find((o) => o.type === "player_start" && num(o.player, 1) === i + 1);
      const [gx, gy] = start ? [start.x, start.y] : GRID[i]!;
      spawn(p, gx, gy);
      p.cx = gx * 16;
      p.aimX = 8;
      p.cy = 8;
      p.fuel = 0;
      p.count = 0;
      p.answer = 0;
      p.answerLeft = 0;
      p.done = false;
      this.events.push({ kind: "join", player: i });
      return;
    }
    // sports: an athlete at its place, facing the other team's goal
    if (this.rules.sports) {
      if (i >= this.athletes()) return;
      const home = this.home(i);
      spawn(p, home.x, home.fy);
      p.aimX = i % 2 ? -1 : 1;
      p.aimY = 0;
      p.flip = i % 2 === 1;
      this.events.push({ kind: "join", player: i });
      return;
    }
    // versus fighting: players 1 and 2 at their corners
    if (this.rules.versus) {
      if (i > 1) return;
      spawn(p, VS_START[i]!, VS_FLOOR);
      p.lives = VS_HP;
      p.invulnerable = 0;
      p.flip = i === 1;
      this.events.push({ kind: "join", player: i });
      return;
    }
    // the puzzle: a well for players 1 and 2
    if (this.rules.puzzle) {
      if (i >= WELL_X.length) return;
      p.active = true;
      p.well = newWell(i);
      spawnTrio(p.well);
      this.placeAtTrio(p);
      this.events.push({ kind: "join", player: i });
      return;
    }
    const start = this.startAt ?? this.level.objects.find((o) => o.type === "player_start" && num(o.player, 1) === i + 1);
    const lead = this.players.find((q) => q.active);
    let x: number;
    let fy: number;
    if (this.rules.crosshair || this.rules.ship || this.rules.quiz) {
      // the light gun, the shooter and the quiz: nobody walks; crosshairs start in the middle, ships at the left
      x = this.camX;
      fy = 0;
    } else if (this.rules.maze) {
      // the maze: at its start, on a cell's middle (feet at the cell's bottom)
      const sx = start ? start.x + (this.startAt ? i * 24 : 0) : this.camX + (SCREEN_W >> 1) + i * 32;
      const sy = start ? start.y : this.camY + (SCREEN_H >> 1);
      x = Math.floor(sx / CELL) * CELL + 8;
      fy = Math.floor((sy - 1) / CELL) * CELL + CELL;
    } else if (this.rules.topdown) {
      // the top-down run and gun: beside the player already in, at the start, or in the screen's middle
      x = lead ? lead.x + 24 : start ? start.x + (this.startAt ? i * 24 : 0) : this.camX + (SCREEN_W >> 1) + i * 24;
      fy = lead ? lead.y >> 4 : start ? start.y : this.camY + (SCREEN_H >> 1);
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
    if (this.rules.topdown) p.bombs = GRENADES;
    p.answer = -1;
    p.count = 0;
    p.done = false;
    if (this.rules.crosshair) {
      p.cx = (SCREEN_W >> 1) + (i * 48 - 72);
      p.cy = (SCREEN_H - CROSS_BOTTOM) >> 1;
      p.ammo = CLIP;
      p.bombs = BOMBS;
    } else if (this.rules.ship && this.rules.vertical) {
      p.cx = 96 + i * 64;
      p.cy = SCREEN_H - CROSS_BOTTOM - 30;
      p.bombs = BOMBS;
      p.power = 0;
    } else if (this.rules.ship) {
      p.cx = 48;
      p.cy = 40 + i * 36;
      p.bombs = BOMBS;
      p.power = 0;
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
    // the shooter's ship loses its power with a life
    p.power = 0;
    this.events.push({ kind: "hurt", player: p.index });
    if (p.lives <= 0) {
      p.active = false;
      return;
    }
    p.invulnerable = this.rules.hurtFrames;
    if (!fell && !this.rules.respawnOnHurt) return;
    // the maze: back at the start
    if (this.rules.maze) {
      const keep = p.invulnerable;
      const lives = p.lives;
      const score = p.score;
      p.active = false;
      this.join(p.index);
      p.lives = lives;
      p.score = score;
      p.invulnerable = keep;
      return;
    }
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
    if (this.rules.vertical) {
      // the vertical shooter: from the level's bottom up, a pixel every ROUTE_STEP frames
      this.camX = 0;
      // a lock holds the camera with the screen's top at the lock's top
      const vlock = this.activeLock();
      const minY = vlock ? Math.max(0, vlock.y) : 0;
      if (snap) this.camY = Math.max(0, this.level.height - SCREEN_H);
      else if (this.frame % ROUTE_STEP === 0 && this.camY > minY) this.camY--;
      return;
    }
    const lock = this.activeLock();
    let maxX = this.level.width - SCREEN_W;
    if (lock) maxX = Math.min(maxX, Math.max(lock.x, lock.x + lock.w - SCREEN_W));
    this.camY = Math.max(0, this.level.height - SCREEN_H);
    if (snap) this.camX = 0;
    else if (this.frame % ROUTE_STEP === 0 && this.camX < maxX) this.camX++;
    if (this.camX > this.camFar) this.camFar = this.camX;
  }

  /**
   * The horizontal shooter's player (the ship rule): the stick flies the
   * ship on the screen, B1 held fires ahead, B2 drops a bomb; a wall it
   * touches hurts it.
   */
  private fly(p: Player): void {
    p.t++;
    if (p.invulnerable) p.invulnerable--;
    const dx = p.pad & Input.Left ? -1 : p.pad & Input.Right ? 1 : 0;
    const dy = p.pad & Input.Up ? -1 : p.pad & Input.Down ? 1 : 0;
    // the vertical shooter's ship points up: its halves swap
    const up = this.rules.vertical;
    const hw = up ? SHIP_HALF_H : SHIP_HALF_W;
    const hh = up ? SHIP_HALF_W : SHIP_HALF_H;
    p.cx = Math.max(hw, Math.min(SCREEN_W - hw, p.cx + dx * SHIP_SPEED));
    p.cy = Math.max(hh + 16, Math.min(SCREEN_H - CROSS_BOTTOM - hh, p.cy + dy * SHIP_SPEED));
    const sx = this.camX + p.cx;
    const sy = this.camY + p.cy;
    if (this.isSolid(this.cellAt(sx + hw, sy)) || this.isSolid(this.cellAt(sx - hw, sy)) || this.isSolid(this.cellAt(sx, sy - hh)) || this.isSolid(this.cellAt(sx, sy + hh))) this.hurt(p);
    if (this.pressed(p, Input.B2) && p.bombs > 0) {
      p.bombs--;
      this.events.push({ kind: "explosion", x: this.camX + (SCREEN_W >> 1) });
      for (const e of this.enemies) if ((e.state === "walk" || e.state === "hit") && e.x >= this.camX && e.x <= this.camX + SCREEN_W) this.damage(e, e.boss ? Math.min(e.hp, BOMB_BOSS_HITS) : e.hp, p);
    }
    // a power pickup it flies over
    for (const k of this.pickups)
      if (k.live && k.item === "power" && Math.abs(k.x - sx) <= POWER_REACH_X && Math.abs(k.fy - 8 - sy) <= POWER_REACH_Y) {
        k.live = false;
        p.power = Math.min(MAX_POWER, p.power + 1);
        this.events.push({ kind: "pickup", item: k.item, player: p.index });
      }
    if (p.fireWait) p.fireWait--;
    if (p.pad & Input.B1 && !p.fireWait && p.shots.length < SHOTS_PER_PLAYER) {
      // the weapon's shots, each while there is room for one
      // from the nose; side by side and the fan's drift are across the way it flies (vy: a pixel a frame up or down, or left or right)
      const nx = up ? sx : sx + SHIP_HALF_W;
      const ny = up ? sy - SHIP_HALF_W : sy;
      const side = (d: number) => (up ? { x: nx + d, y: ny } : { x: nx, y: ny + d });
      const burst: Shot[] = p.power === 0 ? [{ dir: 1, ...side(0), vy: 0 }] : p.power === 1 ? [{ dir: 1, ...side(-POWER_GAP), vy: 0 }, { dir: 1, ...side(POWER_GAP), vy: 0 }] : [{ dir: 1, ...side(0), vy: -1 }, { dir: 1, ...side(0), vy: 0 }, { dir: 1, ...side(0), vy: 1 }];
      for (const b of burst) if (p.shots.length < SHOTS_PER_PLAYER) p.shots.push(b);
      p.fireWait = SHIP_FIRE;
      this.events.push({ kind: "shot", player: p.index });
    }
    p.shots = p.shots.filter((b) => {
      if (up) {
        b.y -= SHOT_SPEED;
        b.x += b.vy ?? 0;
      } else {
        b.x += SHOT_SPEED;
        b.y += b.vy ?? 0;
      }
      const e = this.enemyAt(b.x, b.y, 10) ?? this.gunshipAt(b.x, b.y);
      if (e) {
        this.damage(e, 1, p);
        if (e.boss) {
          this.lastHit = e;
          this.lastHitT = 120;
        }
        return false;
      }
      if (this.hitCell(Math.floor(b.x / CELL), Math.floor(b.y / CELL), 1, p)) return false;
      return this.cellAt(b.x, b.y) !== Tag.Solid && (up ? b.y >= this.camY - 32 : b.x <= this.camX + SCREEN_W + 32);
    });
  }

  /** The gunship hit by a point: its 64 x 32 body around its middle (FLY_MID px over its feet). */
  private gunshipAt(x: number, y: number): Enemy | undefined {
    return this.enemies.find((e) => e.path === 3 && this.alive(e) && Math.abs(e.x - x) <= 32 && Math.abs(e.fy - FLY_MID - y) <= 16);
  }

  /** The horizontal shooter's enemies: still until the screen reaches them, then they fly left on their path, hurting a ship they touch, and are gone past the screen's left; the gunship holds at the right, bobs and fires. */
  private updateFliers(): void {
    if (this.lastHitT) this.lastHitT--;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]!;
      e.t++;
      if (e.state === "hit") {
        if (e.t > 14) {
          e.state = "walk";
          e.t = 0;
        }
      } else if (e.state === "down") {
        if (e.t > 90) e.state = "off";
        continue;
      }
      if (e.state !== "walk" && e.state !== "hit") continue;
      const lead = this.players.find((q) => q.active);
      if (this.rules.vertical) {
        // the vertical shooter: from above the screen down, the wave and the dive across
        if (e.fy - FLY_MID + (e.path === 3 ? 32 : 16) < this.camY) continue;
        e.shown++;
        if (e.path === 3) {
          // the gunship: down until it holds near the screen's top, swaying across, firing down
          const hold = this.camY + GUNSHIP_HOLD + FLY_MID;
          if (e.fy < hold) e.fy += FLY_SPEED;
          else e.fy = hold;
          const ph = e.shown & 255;
          e.x = e.baseX + (((ph < 128 ? ph : 256 - ph) * 5) >> 3) - GUNSHIP_BOB;
          if (e.fireWait) e.fireWait--;
          else {
            if (this.enemyShots.length < 8) this.enemyShots.push({ x: e.x, y: e.fy - FLY_MID + 16, dir: 1 });
            e.fireWait = GUNSHIP_FIRE;
            this.events.push({ kind: "enemy_shot", x: e.x });
          }
          for (const p of this.players) {
            if (!p.active || p.invulnerable) continue;
            if (Math.abs(this.camX + p.cx - e.x) <= GUNSHIP_HIT_X && Math.abs(this.camY + p.cy - (e.fy - FLY_MID)) <= GUNSHIP_HIT_Y) this.hurt(p);
          }
          continue;
        }
        e.fy += FLY_SPEED;
        if (e.path === 1) e.x = e.baseX;
        else if (e.path === 2) {
          if (lead && Math.abs(this.camY + lead.cy - (e.fy - FLY_MID)) <= DIVE_RANGE) e.baseX += Math.sign(this.camX + lead.cx - e.baseX);
          e.x = e.baseX;
        } else {
          const ph = (e.shown + i * 32) & 127;
          e.x = e.baseX + ((ph < 64 ? ph : 128 - ph) >> 2) - FLY_WAVE;
        }
        if (e.fy - FLY_MID > this.camY + SCREEN_H + 32) {
          e.state = "off";
          continue;
        }
        for (const p of this.players) {
          if (!p.active || p.invulnerable) continue;
          if (Math.abs(this.camX + p.cx - e.x) <= SHIP_HIT_X && Math.abs(this.camY + p.cy - (e.fy - FLY_MID)) <= SHIP_HIT_Y) this.hurt(p);
        }
        continue;
      }
      if (e.x > this.camX + SCREEN_W + (e.path === 3 ? 48 : 16)) continue;
      e.shown++;
      e.flip = true;
      if (e.path === 3) {
        // the gunship: in until it holds near the screen's right, bobbing, firing left
        if (e.x > this.camX + SCREEN_W - GUNSHIP_HOLD) e.x -= FLY_SPEED;
        else e.x = this.camX + SCREEN_W - GUNSHIP_HOLD;
        const ph = e.shown & 255;
        e.fy = e.baseY + (((ph < 128 ? ph : 256 - ph) * 5) >> 3) - GUNSHIP_BOB;
        if (e.fireWait) e.fireWait--;
        else {
          if (this.enemyShots.length < 8) this.enemyShots.push({ x: e.x - 32, y: e.fy - FLY_MID, dir: -1 });
          e.fireWait = GUNSHIP_FIRE;
          this.events.push({ kind: "enemy_shot", x: e.x });
        }
      } else {
        e.x -= FLY_SPEED;
        if (e.path === 1) e.fy = e.baseY;
        else if (e.path === 2) {
          // a dive: toward the first ship's height once it is near
          if (lead && Math.abs(this.camX + lead.cx - e.x) <= DIVE_RANGE) e.baseY += Math.sign(this.camY + lead.cy + FLY_MID - e.baseY);
          e.fy = e.baseY;
        } else {
          const ph = (e.shown + i * 32) & 127;
          e.fy = e.baseY + ((ph < 64 ? ph : 128 - ph) >> 2) - FLY_WAVE;
        }
        if (e.x < this.camX - 32) {
          e.state = "off";
          continue;
        }
      }
      const hx = e.path === 3 ? GUNSHIP_HIT_X : SHIP_HIT_X;
      const hy = e.path === 3 ? GUNSHIP_HIT_Y : SHIP_HIT_Y;
      for (const p of this.players) {
        if (!p.active || p.invulnerable) continue;
        if (Math.abs(this.camX + p.cx - e.x) <= hx && Math.abs(this.camY + p.cy - (e.fy - FLY_MID)) <= hy) this.hurt(p);
      }
    }
    // the gunship's shots, against the ships
    this.enemyShots = this.enemyShots.filter((s) => {
      // down the screen in the vertical shooter (its ships are tall: the box turns too), else left
      if (this.rules.vertical) s.y += SHIP_SHOT_SPEED;
      else s.x += s.dir * SHIP_SHOT_SPEED;
      const bx = this.rules.vertical ? SHIP_SHOT_Y : SHIP_SHOT_X;
      const by = this.rules.vertical ? SHIP_SHOT_X : SHIP_SHOT_Y;
      for (const p of this.players)
        if (p.active && !p.invulnerable && Math.abs(this.camX + p.cx - s.x) <= bx && Math.abs(this.camY + p.cy - s.y) <= by) {
          this.hurt(p);
          return false;
        }
      if (this.isSolid(this.cellAt(s.x, s.y))) return false;
      return this.rules.vertical ? s.y <= this.camY + SCREEN_H + 32 : s.x >= this.camX - 32 && s.x <= this.camX + SCREEN_W + 32;
    });
  }

  /** A top-down body at (x, feet fy): its feet box touches a solid cell. */
  private topBlocked(x: number, fy: number): boolean {
    return this.isSolid(this.cellAt(x - TOP_HALF_W, fy - 1)) || this.isSolid(this.cellAt(x + TOP_HALF_W, fy - 1)) || this.isSolid(this.cellAt(x - TOP_HALF_W, fy - TOP_DEPTH)) || this.isSolid(this.cellAt(x + TOP_HALF_W, fy - TOP_DEPTH));
  }

  /**
   * The top-down run and gun's player (the topdown rule): it walks in 8
   * directions, aims where it walks unless B3 is held, and fires along its
   * aim while B1 is held.
   */
  private walkTop(p: Player): void {
    p.t++;
    if (p.invulnerable) p.invulnerable--;
    const dx = p.pad & Input.Left ? -1 : p.pad & Input.Right ? 1 : 0;
    const dy = p.pad & Input.Up ? -1 : p.pad & Input.Down ? 1 : 0;
    if ((dx || dy) && !(p.pad & Input.B3)) {
      p.aimX = dx;
      p.aimY = dy;
    }
    const fy = p.y >> 4;
    if (dx && !this.topBlocked(p.x + dx * TOP_SPEED, fy)) p.x += dx * TOP_SPEED;
    if (dy && !this.topBlocked(p.x, fy + dy * TOP_SPEED)) p.y = (fy + dy * TOP_SPEED) * 16;
    if (p.aimX) p.flip = p.aimX < 0;
    p.onGround = true;
    p.running = false;
    // a grenade: thrown along the aim, it bursts where it lands or at a wall
    if (p.boom && --p.boom.t <= 0) p.boom = null;
    if (this.pressed(p, Input.B2) && p.bombs > 0 && !p.grenade) {
      p.bombs--;
      p.grenade = { x: p.x, y: (p.y >> 4) - TOP_MID, dx: p.aimX, dy: p.aimY, t: 0 };
    }
    if (p.grenade) {
      const gr = p.grenade;
      gr.x += gr.dx * GRENADE_SPEED;
      gr.y += gr.dy * GRENADE_SPEED;
      gr.t++;
      if (gr.t >= GRENADE_FUSE || this.isSolid(this.cellAt(gr.x, gr.y))) {
        p.grenade = null;
        p.boom = { x: gr.x, y: gr.y, t: BOOM_FRAMES };
        this.events.push({ kind: "explosion", x: gr.x });
        for (const e of this.enemies) if ((e.state === "walk" || e.state === "hit") && Math.abs(e.x - gr.x) <= GRENADE_X && Math.abs(e.fy - TOP_MID - gr.y) <= GRENADE_Y) this.damage(e, GRENADE_HITS, p);
        for (const [cx, cy] of [[0, 0], [-16, 0], [16, 0], [0, -16], [0, 16]] as const) {
          const t = this.cellAt(gr.x + cx, gr.y + cy);
          if (t === Tag.Crate || t === Tag.Breakable) this.hitCell(Math.floor((gr.x + cx) / CELL), Math.floor((gr.y + cy) / CELL), GRENADE_HITS, p);
        }
      }
    }
    if (p.fireWait) p.fireWait--;
    const my = (p.y >> 4) - TOP_MID;
    if (p.pad & Input.B1 && !p.fireWait && p.shots.length < SHOTS_PER_PLAYER) {
      p.shots.push({ dir: p.aimX, vy: p.aimY, x: p.x + p.aimX * 12, y: my + p.aimY * 12 });
      p.fireWait = FIRE_EVERY;
      this.events.push({ kind: "shot", player: p.index });
    }
    p.shots = p.shots.filter((b) => {
      b.x += b.dir * TOP_SHOT;
      b.y += (b.vy ?? 0) * TOP_SHOT;
      const e = this.enemyAt(b.x, b.y, 8);
      if (e) {
        this.damage(e, 1, p);
        return false;
      }
      if (this.hitCell(Math.floor(b.x / CELL), Math.floor(b.y / CELL), 1, p)) return false;
      return this.cellAt(b.x, b.y) !== Tag.Solid && b.x >= this.camX - 32 && b.x <= this.camX + SCREEN_W + 32 && b.y >= this.camY - 32 && b.y <= this.camY + SCREEN_H + 32;
    });
  }

  /** The top-down run and gun's enemies: on the screen they step toward the nearest player every other frame, stopped by solid cells, and hurt one they touch. */
  private updateChasers(): void {
    for (const e of this.enemies) {
      e.t++;
      if (e.state === "hit") {
        if (e.t > 14) {
          e.state = "walk";
          e.t = 0;
        }
        continue;
      }
      if (e.state === "down") {
        if (e.t > 90) e.state = "off";
        continue;
      }
      if (e.state !== "walk") continue;
      if (e.x < this.camX - 16 || e.x > this.camX + SCREEN_W + 16 || e.fy < this.camY || e.fy > this.camY + SCREEN_H + 40) continue;
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
      const tfy = target.y >> 4;
      if (e.t & 1) {
        const sx = Math.sign(target.x - e.x);
        const sy = Math.sign(tfy - e.fy);
        if (sx && !this.topBlocked(e.x + sx, e.fy)) e.x += sx;
        if (sy && !this.topBlocked(e.x, e.fy + sy)) e.fy += sy;
      }
      e.flip = target.x < e.x;
      e.dir = e.flip ? -1 : 1;
      // it fires at a player in sight, in the closest of 8 directions
      if (this.rules.enemiesShoot && Math.abs(target.x - e.x) <= TOP_SIGHT && Math.abs(tfy - e.fy) <= TOP_SIGHT) {
        if (e.fireWait) e.fireWait--;
        else {
          const ax = Math.abs(target.x - e.x);
          const ay = Math.abs(tfy - e.fy);
          const sx = ax * 2 >= ay ? Math.sign(target.x - e.x) : 0;
          const sy = ay * 2 >= ax ? Math.sign(tfy - e.fy) : 0;
          if (this.enemyShots.length < 8) this.enemyShots.push({ x: e.x, y: e.fy - TOP_MID, dir: sx, vy: sy });
          e.fireWait = this.fireEvery;
          this.events.push({ kind: "enemy_shot", x: e.x });
        }
      }
      if (this.rules.touchHurts)
        for (const p of this.players)
          if (p.active && !p.invulnerable && Math.abs(p.x - e.x) <= TOP_TOUCH_X && Math.abs((p.y >> 4) - e.fy) <= TOP_TOUCH_Y) this.hurt(p);
    }
  }

  /** The top-down enemies' shots: along their direction, hurting a player they meet, ended by walls and the screen's edge. */
  private updateTopShots(): void {
    this.enemyShots = this.enemyShots.filter((s) => {
      s.x += s.dir * TOP_EN_SHOT;
      s.y += (s.vy ?? 0) * TOP_EN_SHOT;
      for (const p of this.players)
        if (p.active && !p.invulnerable && Math.abs(p.x - s.x) <= TOP_EN_HIT_X && Math.abs((p.y >> 4) - TOP_MID - s.y) <= TOP_EN_HIT_Y) {
          this.hurt(p);
          return false;
        }
      if (this.isSolid(this.cellAt(s.x, s.y))) return false;
      return s.x >= this.camX - 32 && s.x <= this.camX + SCREEN_W + 32 && s.y >= this.camY - 32 && s.y <= this.camY + SCREEN_H + 32;
    });
  }

  /** The top-down camera: on the players' middle both ways, a quarter of the way a frame, the players kept on the screen. */
  private updateTopCamera(snap: boolean): void {
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
    const tx = Math.max(0, Math.min(this.level.width - SCREEN_W, Math.trunc(sx / n) - (SCREEN_W >> 1)));
    const ty = Math.max(0, Math.min(this.level.height - SCREEN_H, Math.trunc(sy / n) - TOP_MID - (SCREEN_H >> 1) + 16));
    if (snap) {
      this.camX = tx;
      this.camY = ty;
    } else {
      this.camX += Math.trunc((tx - this.camX) / 4) + Math.sign(tx - this.camX);
      this.camY += Math.trunc((ty - this.camY) / 4) + Math.sign(ty - this.camY);
    }
    if (this.camX > this.camFar) this.camFar = this.camX;
  }

  /** The maze: cell (c, r) can be walked into (not solid). */
  /** The maze: a dot in every empty cell but the top and bottom rows (the HUD's). */
  private fillDots(): void {
    this.dotsLeft = 0;
    for (let r = 1; r < this.rows - 1; r++)
      for (let c = 0; c < this.cols; c++)
        if (this.cells[r * this.cols + c] === Tag.Air) {
          this.dots[r * this.cols + c] = 1;
          this.dotsLeft++;
        }
  }

  /** The maze's next round: the dots and power-ups back, chasers and players at their starts (lives and score kept). */
  private nextRound(): void {
    this.round++;
    this.fillDots();
    this.frightT = 0;
    for (const e of this.enemies) {
      e.state = "walk";
      e.x = e.min;
      e.fy = e.max;
      e.dir = 0;
      e.mdy = 0;
      e.t = 0;
    }
    for (const k of this.pickups) if (k.item === "power") k.live = true;
    for (const p of this.players) {
      if (!p.active || p.cpu) continue;
      const lives = p.lives;
      const score = p.score;
      p.active = false;
      this.join(p.index);
      p.lives = lives;
      p.score = score;
    }
  }

  private mazeOpen(c: number, r: number): boolean {
    // a row open at both sides is a tunnel: the left of the first column is the last one
    if (c < 0) c += this.cols;
    else if (c >= this.cols) c -= this.cols;
    return !this.isSolid(this.cell(c, r));
  }

  /** an x that left the maze through a tunnel comes in at the other side */
  private mazeWrap(x: number): number {
    const w = this.cols * CELL;
    return x < 0 ? x + w : x >= w ? x - w : x;
  }

  /**
   * The maze's player (the maze rule): it moves MAZE_SPEED px a frame,
   * turning the way the stick last asked for at a cell's middle (or back
   * at once), stopping at a wall, eating the dot of the cell it is in.
   */
  private walkMaze(p: Player): void {
    p.t++;
    if (p.invulnerable) p.invulnerable--;
    const dx = p.pad & Input.Left ? -1 : p.pad & Input.Right ? 1 : 0;
    const dy = dx ? 0 : p.pad & Input.Up ? -1 : p.pad & Input.Down ? 1 : 0;
    if (dx || dy) {
      p.wdx = dx;
      p.wdy = dy;
    }
    for (let step = 0; step < MAZE_SPEED; step++) {
      const fy = p.y >> 4;
      const c = Math.floor(p.x / CELL);
      const r = Math.floor((fy - 1) / CELL);
      if (p.wdx === -p.mdx && p.wdy === -p.mdy && (p.mdx || p.mdy)) {
        p.mdx = p.wdx;
        p.mdy = p.wdy;
      }
      if (p.x % CELL === 8 && fy % CELL === 0) {
        if ((p.wdx || p.wdy) && this.mazeOpen(c + p.wdx, r + p.wdy)) {
          p.mdx = p.wdx;
          p.mdy = p.wdy;
        } else if (!this.mazeOpen(c + p.mdx, r + p.mdy)) {
          p.mdx = 0;
          p.mdy = 0;
        }
      }
      p.x = this.mazeWrap(p.x + p.mdx);
      p.y = (fy + p.mdy) * 16;
    }
    if (p.mdx) p.flip = p.mdx < 0;
    p.onGround = true;
    p.running = p.mdx !== 0 || p.mdy !== 0;
    // the dot of the cell it is in, and a power pickup it reaches
    const i = Math.floor(((p.y >> 4) - 1) / CELL) * this.cols + Math.floor(p.x / CELL);
    if (this.dots[i]) {
      this.dots[i] = 0;
      this.dotsLeft--;
      p.score += DOT_SCORE;
      this.events.push({ kind: "pickup", item: "dot", player: p.index });
    }
    for (const k of this.pickups)
      if (k.live && k.item === "power" && Math.abs(k.x - p.x) <= 8 && Math.abs(k.fy - (p.y >> 4)) <= 8) {
        k.live = false;
        p.score += POWER_SCORE;
        this.frightT = FRIGHT_FRAMES;
        this.events.push({ kind: "pickup", item: k.item, player: p.index });
      }
  }

  /**
   * The maze's chasers: a pixel a frame (every other frame while they
   * flee), at a cell's middle the open way, not back, that brings them
   * nearest the nearest player (farthest while they flee; ties: up, left,
   * down, right); a fleeing one a player touches is eaten and goes home.
   */
  private updateMazeChasers(): void {
    if (this.frightT) this.frightT--;
    const ways = [[0, -1], [-1, 0], [0, 1], [1, 0]] as const;
    for (let n = 0; n < this.enemies.length; n++) {
      const e = this.enemies[n]!;
      e.t++;
      if (e.state === "down") {
        if (e.t >= HOME_FRAMES) {
          e.state = "walk";
          e.x = e.min;
          e.fy = e.max;
          e.dir = 0;
          e.mdy = 0;
          e.t = 0;
        }
        continue;
      }
      if (e.state !== "walk") continue;
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
      const flee = this.frightT > 0;
      // where it heads: the player, a spot ahead of it, or the corner when near (AMBUSH_AHEAD, WANDER_NEAR)
      let tx = target ? target.x : 0;
      let ty = target ? target.y >> 4 : 0;
      // its way of chasing: chosen in the Inspector (Chases), else by its order
      const kind = e.path ? e.path - 1 : n % 3;
      if (target && !flee && kind === 1) {
        const moving = target.mdx !== 0 || target.mdy !== 0;
        tx += (moving ? target.mdx : target.wdx) * AMBUSH_AHEAD;
        ty += (moving ? target.mdy : target.wdy) * AMBUSH_AHEAD;
      } else if (target && !flee && kind === 2 && best < WANDER_NEAR) {
        tx = 0;
        ty = this.rows * CELL;
      }
      // from the second round a pixel more every MAZE_HASTE frames, unless it flees
      const haste = MAZE_HASTE[Math.min(this.round, MAZE_HASTE.length - 1)]!;
      const steps = target && (!flee || this.frame & 1) ? (haste && !flee && (this.frame & (haste - 1)) === 0 ? 2 : 1) : 0;
      for (let s = 0; s < steps; s++) {
        if (e.x % CELL === 8 && e.fy % CELL === 0) {
          const c = Math.floor(e.x / CELL);
          const r = Math.floor((e.fy - 1) / CELL);
          let pick: readonly [number, number] | undefined;
          let score = flee ? -1 : Infinity;
          for (const w of ways) {
            if (w[0] === -e.dir && w[1] === -e.mdy && (e.dir || e.mdy)) continue;
            if (!this.mazeOpen(c + w[0], r + w[1])) continue;
            const d = Math.abs(tx - (e.x + w[0] * CELL)) + Math.abs(ty - (e.fy + w[1] * CELL));
            if (flee ? d > score : d < score) {
              score = d;
              pick = w;
            }
          }
          // a dead end: back the way it came
          if (!pick && (e.dir || e.mdy) && this.mazeOpen(c - e.dir, r - e.mdy)) pick = [-e.dir, -e.mdy];
          e.dir = pick ? pick[0] : 0;
          e.mdy = pick ? pick[1] : 0;
        }
        e.x = this.mazeWrap(e.x + e.dir);
        e.fy += e.mdy;
        if (e.dir) e.flip = e.dir < 0;
      }
      for (const p of this.players) {
        if (!p.active || Math.abs(p.x - e.x) > MAZE_TOUCH || Math.abs((p.y >> 4) - e.fy) > MAZE_TOUCH) continue;
        if (flee) {
          e.state = "down";
          e.t = 0;
          p.score += EAT_SCORE;
          this.events.push({ kind: "enemy_down", name: e.name, x: e.x });
          break;
        }
        if (!p.invulnerable && this.rules.touchHurts) this.hurt(p);
      }
    }
  }

  /** The puzzle: the player stands for its trio (x at its middle, feet under its bottom gem). */
  private placeAtTrio(p: Player): void {
    const w = p.well!;
    p.x = WELL_X[p.index]! + w.col * 16 + 8;
    p.y = (WELL_Y + (w.row + 1) * 16) * 16;
  }

  /**
   * The puzzle's well, a frame (puzzle.ts): the clear's flash, then the
   * trio's moves (left and right with a repeat, B1 turns it), its fall, and
   * when it lands the matches it makes, chain after chain, before the next.
   */
  private playWell(p: Player): void {
    const w = p.well!;
    p.t++;
    if (w.clearT) {
      if (--w.clearT === 0) {
        settleWell(w);
        this.resolveWell(p);
      }
      return;
    }
    const dx = p.pad & Input.Left ? -1 : p.pad & Input.Right ? 1 : 0;
    if (dx) {
      if (!(p.last & (dx < 0 ? Input.Left : Input.Right))) {
        shiftTrio(w, dx);
        w.moveT = MOVE_FIRST;
      } else if (--w.moveT <= 0) {
        shiftTrio(w, dx);
        w.moveT = MOVE_EVERY;
      }
    }
    if (this.pressed(p, Input.B1)) turnTrio(w);
    if (++w.fallT >= (p.pad & Input.Down ? SOFT_DROP : fallFrames(w))) {
      w.fallT = 0;
      if (wellFree(w, w.col, w.row + 1)) w.row++;
      else if (!lockTrio(w)) this.topOut(p);
      else {
        this.events.push({ kind: "land", player: p.index });
        this.resolveWell(p);
      }
    }
    this.placeAtTrio(p);
  }

  /** After a landing or a clear: score the matches, or bring the next trio. */
  private resolveWell(p: Player): void {
    const w = p.well!;
    const n = markMatches(w);
    if (n) {
      p.score += GEM_SCORE * n * w.chain;
      w.gems += n;
      // the rival well gets stones for the gems past three and every chain step
      const rival = this.players[1 - p.index];
      const send = garbageOf(n, w.chain);
      if (send > 0 && rival && rival.active && rival.well) rival.well.pending += send;
      this.events.push({ kind: "pickup", item: "gems", player: p.index });
      return;
    }
    if (!spawnTrio(w)) this.topOut(p);
    this.placeAtTrio(p);
  }

  /** A well topped out: a life, and an empty well to start again. */
  private topOut(p: Player): void {
    const w = p.well!;
    // the CPU has no lives: its well just starts again
    if (p.cpu) {
      emptyWell(w);
      spawnTrio(w);
      this.placeAtTrio(p);
      return;
    }
    p.lives--;
    this.events.push({ kind: "hurt", player: p.index });
    if (p.lives <= 0) {
      p.active = false;
      return;
    }
    emptyWell(w);
    spawnTrio(w);
    this.placeAtTrio(p);
  }

  /** The quiz: a player's first press of B1 B2 B3 while the question is asked is its answer. */
  private answerQuiz(p: Player): void {
    p.t++;
    if (this.quizPhase !== 0) return;
    const kind = kindOf(this.questions[this.quizK]);
    const k = this.pressed(p, Input.B1) ? 0 : this.pressed(p, Input.B2) ? 1 : this.pressed(p, Input.B3) ? 2 : -1;
    if (k < 0) return;
    if (kind === "mash") {
      if (k === 0) p.count++;
      return;
    }
    if (kind === "timing") {
      // the first B1 stops the marker where it is, for this player
      if (k !== 0 || p.done) return;
      p.answer = timingCell(this.quizT, TIMING_W, TIMING_STEP);
      p.done = true;
      this.events.push({ kind: "shot", player: p.index });
      return;
    }
    if (kind === "memory") {
      // once the letters were shown: each press the next letter, a wrong one ends the turn
      if (p.done || this.quizT < MEM_LEN * MEM_LETTER) return;
      if (k === memorySeq(this.quizK, MEM_LEN)[p.count]) p.count++;
      else p.done = true;
      if (p.count >= MEM_LEN) p.done = true;
      return;
    }
    if (p.answer >= 0) return;
    p.answer = k;
    p.answerLeft = QUIZ_TIME - this.quizT;
    this.events.push({ kind: "shot", player: p.index });
  }

  /** The points a player's turn at this item is worth. */
  private quizPoints(p: Player, q: QuizQuestion): number {
    const kind = kindOf(q);
    if (kind === "mash") return p.count * MASH_SCORE;
    if (kind === "timing") return p.done ? Math.max(0, TIMING_SCORE - (Math.abs(2 * p.answer - (TIMING_W - 1)) >> 1) * TIMING_LOSS) : 0;
    if (kind === "memory") return p.count * MEM_SCORE;
    return p.answer === q.right ? QUIZ_SCORE + Math.floor(p.answerLeft / 60) * QUIZ_BONUS : 0;
  }

  /**
   * The quiz, a frame: the question until its time is up or every player in
   * answered, then the right answer shown (and scored) for REVEAL_FRAMES,
   * then the next question.
   */
  private updateQuiz(): void {
    const q = this.questions[this.quizK];
    if (!q) return;
    this.quizT++;
    if (this.quizPhase === 0) {
      const ins = this.players.filter((p) => p.active);
      const kind = kindOf(q);
      const all = ins.length > 0 && ins.every((p) => (kind === "question" ? p.answer >= 0 : p.done));
      // each item's time, or sooner once every player in is through (a mash always runs its time)
      const over =
        kind === "mash" ? this.quizT >= MASH_TIME
        : kind === "timing" ? this.quizT >= TIMING_TIME || all
        : kind === "memory" ? this.quizT >= MEM_LEN * MEM_LETTER + MEM_INPUT || (this.quizT >= MEM_LEN * MEM_LETTER && all)
        : this.quizT >= QUIZ_TIME || all;
      if (!over) return;
      for (const p of ins) {
        const pts = this.quizPoints(p, q);
        if (!pts) continue;
        p.score += pts;
        this.events.push({ kind: "pickup", item: "right", player: p.index });
      }
      this.quizPhase = 1;
      this.quizT = 0;
      return;
    }
    if (this.quizT < REVEAL_FRAMES) return;
    this.quizK++;
    this.quizPhase = 0;
    this.quizT = 0;
    for (const p of this.players) {
      p.answer = -1;
      p.count = 0;
      p.done = false;
    }
  }

  // ------------------------------------------------------------- racing

  /** A car, a frame: it turns, speeds up, brakes or coasts, moves unless a solid cell stops it, and passes its waypoints, lap after lap. */
  private drive(p: Player): void {
    p.t++;
    p.onGround = true;
    if (this.raceT < RACE_COUNT || p.done) {
      p.fuel = 0;
      return;
    }
    const dx = p.pad & Input.Left ? -1 : p.pad & Input.Right ? 1 : 0;
    if (dx) {
      // a press turns at once, a hold every STEER frames
      if (!(p.last & (dx < 0 ? Input.Left : Input.Right)) || ++p.turnT >= STEER) {
        p.aimX = (p.aimX + dx + 16) & 15;
        p.turnT = 0;
      }
    } else p.turnT = 0;
    const max = p.cpu ? CPU_MAX : CAR_MAX;
    if (p.pad & Input.B1) p.fuel = Math.min(max, p.fuel + CAR_ACCEL);
    else if (p.pad & Input.B2) p.fuel = Math.max(0, p.fuel - CAR_BRAKE);
    else if (p.t & 1) p.fuel = Math.max(0, p.fuel - 1);
    const [ux, uy] = CAR_DIRS[p.aimX]!;
    const nx = p.cx + ((ux * p.fuel) >> 4);
    const ny = p.y + ((uy * p.fuel) >> 4);
    // touching another car where it was not touching one: a bump that halves its speed (cars already touching drive on, apart or through)
    const touch = (x: number, y: number) => this.players.some((q) => q !== p && q.active && Math.abs(x - q.x) < BUMP_X && Math.abs(y - (q.y >> 4)) < BUMP_Y);
    if (touch(nx >> 4, ny >> 4) && !touch(p.x, p.y >> 4)) p.fuel >>= 1;
    if (this.isSolid(this.cellAt(nx >> 4, ny >> 4))) p.fuel = 0;
    else {
      p.cx = nx;
      p.y = ny;
    }
    p.x = p.cx >> 4;
    p.running = p.fuel > 0;
    const [wx, wy] = this.waypoints[p.answer]!;
    if (Math.abs(p.x - wx) > GATE_X || Math.abs((p.y >> 4) - wy) > GATE_Y) return;
    p.answer++;
    if (p.answer < this.waypoints.length) return;
    p.answer = 0;
    p.count++;
    if (p.count < RACE_LAPS) return;
    p.done = true;
    p.answerLeft = ++this.finished;
    p.score += PLACE_SCORE[p.answerLeft - 1] ?? 0;
    if (this.firstAt < 0) this.firstAt = this.raceT;
    this.events.push({ kind: "rescue", name: "finish", player: p.index });
  }

  /** The race's clock: it ends once every player finished, RACE_AFTER frames after the first car did, or after RACE_TIME. */
  private updateRace(): void {
    this.raceT++;
    const players = this.players.filter((p) => p.active && !p.cpu);
    if (
      (players.length && players.every((p) => p.done)) ||
      (this.firstAt >= 0 && this.raceT - this.firstAt >= RACE_AFTER) ||
      this.raceT >= RACE_COUNT + RACE_TIME
    )
      this.raceOver = true;
  }

  /** The CPU car's pad: every 4 frames it picks the way nearest its next waypoint; it turns toward it and speeds up unless the turn is sharp. */
  private racingCpuPad(p: Player): number {
    if ((this.frame & 3) === (p.index & 3)) {
      const [wx, wy] = this.waypoints[p.answer]!;
      const vx = wx - p.x;
      const vy = wy - (p.y >> 4);
      let best = -Infinity;
      for (let i = 0; i < 16; i++) {
        const dot = CAR_DIRS[i]![0] * vx + CAR_DIRS[i]![1] * vy;
        if (dot > best) {
          best = dot;
          p.cy = i;
        }
      }
    }
    const diff = (p.cy - p.aimX + 16) & 15;
    const turn = diff === 0 ? 0 : diff < 8 ? Input.Right : Input.Left;
    const sharp = diff >= 3 && diff <= 13;
    return turn | (sharp ? 0 : Input.B1);
  }

  // ------------------------------------------------------------- sports

  /** Two athletes a team with four places, else one against one. */
  athletes(): number {
    return this.maxPlayers >= 4 ? 4 : 2;
  }

  /** An athlete's place: attackers (players 1 and 2) near the middle, defenders (3 and 4) near their goal. */
  private home(i: number): { x: number; fy: number } {
    const w = this.level.width;
    const mid = w >> 1;
    const b = i % 2;
    const x = i < 2 ? (b ? mid + 48 : mid - 48) : b ? w - FIELD_X0 - 80 : FIELD_X0 + 80;
    return { x, fy: (FIELD_Y0 + FIELD_Y1) >> 1 };
  }

  /** Everyone at their places, the ball still in the middle, KICKOFF_FRAMES before play. */
  private kickoff(): void {
    for (let i = 0; i < this.athletes(); i++) {
      const p = this.players[i]!;
      if (!p.active) continue;
      const home = this.home(i);
      p.x = home.x;
      p.y = home.fy * 16;
      p.aimX = i % 2 ? -1 : 1;
      p.aimY = 0;
      p.flip = i % 2 === 1;
      p.fireWait = 0;
      p.running = false;
    }
    this.ballX = (this.level.width >> 1) * 16;
    this.ballY = ((FIELD_Y0 + FIELD_Y1) >> 1) * 16;
    this.ballVx = this.ballVy = 0;
    this.ballOwner = -1;
    this.kickT = KICKOFF_FRAMES;
  }

  /** An athlete, a frame: it runs in 8 directions (facing the way it ran) and kicks the ball it has with B1. */
  private run(p: Player): void {
    p.t++;
    p.onGround = true;
    p.running = false;
    if (this.kickT) return;
    if (p.fireWait) p.fireWait--;
    const dx = p.pad & Input.Left ? -1 : p.pad & Input.Right ? 1 : 0;
    const dy = p.pad & Input.Up ? -1 : p.pad & Input.Down ? 1 : 0;
    if (dx || dy) {
      p.aimX = dx;
      p.aimY = dy;
      p.x = Math.max(FIELD_X0, Math.min(this.level.width - FIELD_X0, p.x + dx * ATH_SPEED));
      p.y = Math.max(FIELD_Y0, Math.min(FIELD_Y1, (p.y >> 4) + dy * ATH_SPEED)) * 16;
      p.running = true;
    }
    if (p.aimX) p.flip = p.aimX < 0;
    if (this.pressed(p, Input.B1) && this.ballOwner === p.index) {
      this.ballVx = p.aimX * BALL_KICK;
      this.ballVy = p.aimY * BALL_KICK;
      this.ballOwner = -1;
      p.fireWait = REGRAB;
      this.events.push({ kind: "kick", player: p.index });
    } else if (this.pressed(p, Input.B2) && this.ballOwner === p.index) {
      // a pass: to the nearest teammate, along the way nearest it
      const mate = this.mateOf(p);
      if (!mate) return;
      let best = -Infinity;
      let way = 0;
      for (let i = 0; i < 16; i++) {
        const dot = CAR_DIRS[i]![0] * (mate.x - p.x) + CAR_DIRS[i]![1] * ((mate.y >> 4) - (p.y >> 4));
        if (dot > best) {
          best = dot;
          way = i;
        }
      }
      this.ballVx = CAR_DIRS[way]![0] * PASS_SPEED;
      this.ballVy = CAR_DIRS[way]![1] * PASS_SPEED;
      this.ballOwner = -1;
      p.fireWait = REGRAB;
      this.events.push({ kind: "kick", player: p.index });
    }
  }

  /** The nearest active teammate, if any. */
  private mateOf(p: Player): Player | undefined {
    let mate: Player | undefined;
    let best = Infinity;
    for (let i = p.index % 2; i < this.athletes(); i += 2) {
      const q = this.players[i]!;
      if (q === p || !q.active) continue;
      const d = Math.abs(q.x - p.x) + Math.abs((q.y >> 4) - (p.y >> 4));
      if (d < best) {
        best = d;
        mate = q;
      }
    }
    return mate;
  }

  /** The ball, a frame: with its owner, or rolling, slowing, bouncing; into a goal; taken by a touch. */
  private updateBall(): void {
    if (this.kickT) {
      this.kickT--;
      return;
    }
    this.matchT--;
    const w = this.level.width;
    if (this.ballOwner >= 0) {
      const o = this.players[this.ballOwner]!;
      this.ballX = (o.x + o.aimX * DRIBBLE) * 16;
      this.ballY = o.y;
      this.ballVx = this.ballVy = 0;
    } else {
      this.ballX += this.ballVx;
      this.ballY += this.ballVy;
      this.ballVx -= this.ballVx >> 4;
      this.ballVy -= this.ballVy >> 4;
      if (Math.abs(this.ballVx) < BALL_STOP) this.ballVx = 0;
      if (Math.abs(this.ballVy) < BALL_STOP) this.ballVy = 0;
      if (this.ballY < FIELD_Y0 * 16 || this.ballY > FIELD_Y1 * 16) {
        this.ballY = this.ballY < FIELD_Y0 * 16 ? FIELD_Y0 * 16 : FIELD_Y1 * 16;
        this.ballVy = -this.ballVy;
      }
      const inMouth = this.ballY >= GOAL_Y0 * 16 && this.ballY <= GOAL_Y1 * 16;
      if (this.ballX < FIELD_X0 * 16 || this.ballX > (w - FIELD_X0) * 16) {
        if (inMouth) return this.goal(this.ballX < FIELD_X0 * 16 ? 1 : 0);
        this.ballX = this.ballX < FIELD_X0 * 16 ? FIELD_X0 * 16 : (w - FIELD_X0) * 16;
        this.ballVx = -this.ballVx;
      }
    }
    // a touch takes a loose ball, or steals it from the other team
    const bx = this.ballX >> 4;
    const by = this.ballY >> 4;
    for (let i = 0; i < this.athletes(); i++) {
      const p = this.players[i]!;
      if (!p.active || p.fireWait || i === this.ballOwner) continue;
      if (Math.abs(p.x - bx) > TOUCH_X || Math.abs((p.y >> 4) - by) > TOUCH_Y) continue;
      if (this.ballOwner >= 0 && this.ballOwner % 2 === i % 2) continue;
      if (this.ballOwner >= 0) this.players[this.ballOwner]!.fireWait = REGRAB;
      this.ballOwner = i;
      this.ballVx = this.ballVy = 0;
      break;
    }
  }

  /** A goal: the scoring team's players score, and play starts again from the middle. */
  private goal(team: number): void {
    this.goals[team]!++;
    this.goalBy = team;
    for (let i = 0; i < this.athletes(); i++) {
      const p = this.players[i]!;
      if (p.active && !p.cpu && i % 2 === team) p.score += GOAL_SCORE;
    }
    this.events.push({ kind: "rescue", name: "goal", player: team });
    this.kickoff();
  }

  /** The CPU athlete's pad: with the ball, run at the goal and shoot near it; the team's nearest to a loose ball goes for it; the others hold their places, level with the ball. */
  private sportsCpuPad(p: Player): number {
    const bx = this.ballX >> 4;
    const by = this.ballY >> 4;
    const team = p.index % 2;
    const goalX = team ? FIELD_X0 : this.level.width - FIELD_X0;
    const fy = p.y >> 4;
    let tx: number;
    let ty: number;
    const toward = team ? Input.Left : Input.Right;
    if (p.index >= 2 && this.ballOwner === p.index) {
      // the keeper clears it: forward, then kicks
      return this.frame & 1 ? Input.B1 : toward;
    }
    if (p.index >= 2) {
      // the keeper: on its goal line, level with the ball inside the mouth
      tx = team ? this.level.width - FIELD_X0 - KEEPER_X : FIELD_X0 + KEEPER_X;
      ty = Math.max(GOAL_Y0, Math.min(GOAL_Y1, by));
    } else if (this.ballOwner === p.index) {
      if (Math.abs(goalX - p.x) < CPU_SHOOT && (this.frame & 7) === 0) return Input.B1;
      // pressed by an opponent just ahead, with a teammate: a pass
      const ahead = (q: Player) => q.active && q.index % 2 !== team && Math.abs((q.y >> 4) - fy) < 16 && (team ? p.x - q.x : q.x - p.x) > 0 && Math.abs(q.x - p.x) < PRESS_X;
      if ((this.frame & 7) === 4 && this.mateOf(p) && this.players.slice(0, this.athletes()).some(ahead)) return Input.B2;
      tx = goalX;
      ty = (GOAL_Y0 + GOAL_Y1) >> 1;
    } else {
      let near = -1;
      let best = Infinity;
      for (let i = team; i < this.athletes(); i += 2) {
        const q = this.players[i]!;
        // a CPU keeper stays in goal: the others go for the ball
        if (!q.active || (i >= 2 && q.cpu)) continue;
        const d = Math.abs(q.x - bx) + Math.abs((q.y >> 4) - by);
        if (d < best) {
          best = d;
          near = i;
        }
      }
      if (near === p.index) {
        tx = bx;
        ty = by;
      } else {
        tx = this.home(p.index).x;
        ty = by;
      }
    }
    const dx = Math.abs(tx - p.x) > 2 ? Math.sign(tx - p.x) : 0;
    const dy = Math.abs(ty - fy) > 2 ? Math.sign(ty - fy) : 0;
    return (dx < 0 ? Input.Left : dx > 0 ? Input.Right : 0) | (dy < 0 ? Input.Up : dy > 0 ? Input.Down : 0);
  }

  // ------------------------------------------------------------- versus

  /** The other fighter. */
  private foe(p: Player): Player {
    return this.players[1 - p.index]!;
  }

  /**
   * A fighter, a frame (versus fighting): it falls and lands; stunned it
   * does nothing; an attack runs its frames and strikes once; on the ground
   * it faces its foe and punches (B1), kicks (B2), jumps (Up), crouches
   * (Down) or walks, never nearer than VS_GAP.
   */
  private fight(p: Player): void {
    const foe = this.foe(p);
    p.t++;
    if (!p.onGround) {
      p.vy += VS_GRAVITY;
      p.y += p.vy;
      if (p.y >= VS_FLOOR * 16) {
        p.y = VS_FLOOR * 16;
        p.vy = 0;
        p.onGround = true;
      }
    }
    p.running = false;
    if (this.vsPhase !== 1) {
      p.punchT = 0;
      p.crouching = false;
      p.shots.length = 0;
      return;
    }
    // the stick, as seen from this fighter (toward the foe is 2)
    const toward = foe.x < p.x ? Input.Left : Input.Right;
    const away = toward === Input.Right ? Input.Left : Input.Right;
    p.motion[p.motionI] = (p.pad & Input.Down ? 1 : 0) | (p.pad & toward ? 2 : 0) | (p.pad & away ? 4 : 0) | (p.pad & Input.Up ? 8 : 0);
    p.motionI = (p.motionI + 1) % MOTION_LEN;
    this.moveFireball(p, foe);
    if (p.invulnerable) {
      p.invulnerable--;
      return;
    }
    if (p.punchT) {
      p.punchT--;
      if (p.combo === 4) {
        // the fireball leaves the hands FB_AT frames in
        if (FB_FRAMES - p.punchT === FB_AT) p.shots.push({ x: p.x + (p.flip ? -16 : 16), y: (p.y >> 4) - FB_Y, dir: p.flip ? -1 : 1 });
        return;
      }
      if (p.combo === 5) {
        // the dash punch: forward fast, striking once in reach
        const t = DASH_FRAMES - p.punchT;
        if (t >= DASH_FROM && t <= DASH_TO) {
          const dir = p.flip ? -1 : 1;
          const nx = Math.max(VS_EDGE, Math.min(SCREEN_W - VS_EDGE, p.x + dir * DASH_SPEED));
          if (Math.abs(foe.x - nx) >= VS_GAP) p.x = nx;
          if (!p.struck && Math.abs(foe.x - p.x) <= VS_PUNCH_REACH) this.vsStrike(p, foe, VS_PUNCH_REACH, DASH_DMG, true);
        }
        return;
      }
      const len = p.combo === 3 ? COMBO_KICK_FRAMES : PUNCH_FRAMES;
      if (!p.struck && len - p.punchT === (p.combo === 3 ? VS_KICK_AT : VS_PUNCH_AT)) this.vsStrike(p, foe, p.combo === 3 ? VS_KICK_REACH : VS_PUNCH_REACH, p.combo === 3 ? VS_KICK_DMG : VS_PUNCH_DMG, p.combo === 3);
      return;
    }
    if (!p.onGround) return;
    p.flip = foe.x < p.x;
    p.crouching = (p.pad & Input.Down) !== 0;
    if (this.pressed(p, Input.B1) || this.pressed(p, Input.B2)) {
      const kick = this.pressed(p, Input.B2) && !this.pressed(p, Input.B1);
      // B1 after a stick motion: the fireball or the dash punch
      const special = kick ? 0 : this.motionHas([1, 3, 2], MOTION_WINDOW, p) && !p.shots.length ? 4 : this.motionHas([4, 2], DASH_WINDOW, p) ? 5 : 0;
      p.punchT = special === 4 ? FB_FRAMES : special === 5 ? DASH_FRAMES : kick ? COMBO_KICK_FRAMES : PUNCH_FRAMES;
      p.combo = special || (kick ? 3 : 1);
      p.struck = false;
      p.crouching = false;
      this.events.push({ kind: kick ? "kick" : "shot", player: p.index });
      return;
    }
    if (this.pressed(p, Input.Up)) {
      p.vy = VS_JUMP_VY;
      p.onGround = false;
      p.crouching = false;
      this.events.push({ kind: "jump", player: p.index });
      return;
    }
    if (p.crouching) return;
    const dx = p.pad & Input.Left ? -1 : p.pad & Input.Right ? 1 : 0;
    if (!dx) return;
    const closer = Math.sign(foe.x - p.x) === dx;
    const nx = Math.max(VS_EDGE, Math.min(SCREEN_W - VS_EDGE, p.x + dx * (closer ? VS_WALK : VS_WALK_BACK)));
    if (closer && Math.abs(foe.x - nx) < VS_GAP) return;
    p.x = nx;
    p.running = true;
  }

  /** Whether the stick went through these codes in order within the last `window` frames (each code: those bits held, toward and away never both). */
  private motionHas(seq: readonly number[], window: number, p: Player): boolean {
    let k = 0;
    for (let i = window - 1; i >= 0 && k < seq.length; i--) {
      const c = p.motion[(p.motionI - 1 - i + 2 * MOTION_LEN) % MOTION_LEN]!;
      if ((c & 7) === seq[k]) k++;
    }
    return k === seq.length;
  }

  /** A fighter's fireball, a frame: it flies, hits or is blocked by the foe (unless the foe jumped high over it), cancels the foe's, or leaves the screen. */
  private moveFireball(p: Player, foe: Player): void {
    const b = p.shots[0];
    if (!b) return;
    b.x += b.dir * FB_SPEED;
    const f = foe.shots[0];
    if (f && Math.abs(f.x - b.x) <= 8) {
      p.shots.length = 0;
      foe.shots.length = 0;
      return;
    }
    if (b.x < 0 || b.x > SCREEN_W) {
      p.shots.length = 0;
      return;
    }
    if (Math.abs(b.x - foe.x) > 12 || VS_FLOOR - (foe.y >> 4) > 24) return;
    p.shots.length = 0;
    this.vsHit(p, foe, b.dir, FB_DMG, FB_CHIP);
  }

  /** An attack's one strike: a hit, a block (the foe holding away on the ground), or nothing out of reach. */
  private vsStrike(p: Player, foe: Player, reach: number, dmg: number, low: boolean): void {
    p.struck = true;
    const dir = p.flip ? -1 : 1;
    const dx = foe.x - p.x;
    if (Math.sign(dx) !== dir || Math.abs(dx) > reach) return;
    // a punch goes over a crouching foe; nothing reaches one high in the air
    if (!low && foe.crouching && foe.onGround) return;
    if ((p.y >> 4) - (foe.y >> 4) > 40) return;
    this.vsHit(p, foe, dir, dmg, VS_CHIP);
  }

  /** A blow that reached the foe: blocked (holding away on the ground) or taken. */
  private vsHit(p: Player, foe: Player, dir: number, dmg: number, chip: number): void {
    const away = dir > 0 ? Input.Right : Input.Left;
    const push = (n: number) => (foe.x = Math.max(VS_EDGE, Math.min(SCREEN_W - VS_EDGE, foe.x + dir * n)));
    if (foe.onGround && !foe.punchT && !foe.invulnerable && foe.pad & away) {
      foe.lives -= chip;
      foe.invulnerable = VS_BLOCK_STUN;
      push(VS_BLOCK_PUSH);
      this.events.push({ kind: "land", player: foe.index });
      return;
    }
    foe.lives -= dmg;
    foe.invulnerable = VS_HIT_STUN;
    foe.punchT = 0;
    push(VS_HIT_PUSH);
    p.score += dmg * 10;
    this.events.push({ kind: "hurt", player: foe.index });
  }

  /** The CPU fighter's pad: block a near attack, close in, and attack every VS_CPU_EVERY frames when near. */
  private fightCpuPad(p: Player): number {
    const foe = this.foe(p);
    const d = Math.abs(foe.x - p.x);
    const toward = foe.x > p.x ? Input.Right : Input.Left;
    const away = toward === Input.Right ? Input.Left : Input.Right;
    // a fireball's motion, a step a frame (cy counts it down)
    if (p.cy > 0) {
      p.cy--;
      return p.cy === 2 ? Input.Down : p.cy === 1 ? Input.Down | toward : toward | Input.B1;
    }
    if ((foe.punchT && d < 48) || (foe.shots[0] && Math.abs(foe.shots[0].x - p.x) < 60)) return away;
    if (d > VS_CPU_FAR && !p.shots.length && !p.punchT && this.vsPhase === 1 && this.vsT % VS_CPU_THROW === VS_CPU_THROW / 3) {
      p.cy = 3;
      return this.fightCpuPad(p);
    }
    if (d > 40) return toward;
    if (this.frame % VS_CPU_EVERY === 0) return d > VS_PUNCH_REACH ? Input.B2 : Input.B1;
    return 0;
  }

  /** Both fighters back in their corners with full health, for a new round. */
  private newRound(): void {
    for (let i = 0; i < 2; i++) {
      const p = this.players[i]!;
      if (!p.active) continue;
      spawn(p, VS_START[i]!, VS_FLOOR);
      p.lives = VS_HP;
      p.invulnerable = 0;
      p.punchT = 0;
      p.flip = i === 1;
    }
    this.vsPhase = 0;
    this.vsT = 0;
    this.vsTime = VS_TIME;
    this.vsWinner = -1;
  }

  /** A match from its first round. */
  private newMatch(): void {
    this.vsWins[0] = this.vsWins[1] = 0;
    this.vsRound = 1;
    this.vsMatch = -1;
    this.newRound();
  }

  /** The round's flow: the call, the fight until a fighter is down or the time is up, its end, then the next round or the match's end. */
  private updateVersus(): void {
    const [a, b] = this.players as [Player, Player];
    this.vsT++;
    if (this.vsPhase === 0) {
      if (this.vsT >= VS_INTRO) {
        this.vsPhase = 1;
        this.vsT = 0;
      }
      return;
    }
    if (this.vsPhase === 1) {
      this.vsTime--;
      if (a.lives > 0 && b.lives > 0 && this.vsTime > 0) return;
      this.vsWinner = a.lives > b.lives ? 0 : b.lives > a.lives ? 1 : -1;
      if (this.vsWinner >= 0) {
        const w = this.players[this.vsWinner]!;
        this.vsWins[this.vsWinner]!++;
        w.score += VS_ROUND_SCORE + Math.max(0, w.lives) * 10;
      }
      this.vsPhase = 2;
      this.vsT = 0;
      return;
    }
    if (this.vsT < VS_PAUSE) return;
    if (this.vsWins[0]! >= VS_WINS || this.vsWins[1]! >= VS_WINS || this.vsRound >= VS_ROUNDS) {
      this.vsMatch = this.vsWins[1]! > this.vsWins[0]! ? 1 : 0;
      return;
    }
    this.vsRound++;
    this.newRound();
  }

  private updatePlayer(p: Player): void {
    if (this.rules.racing) return this.drive(p);
    if (this.rules.sports) return this.run(p);
    if (this.rules.versus) return this.fight(p);
    if (this.rules.quiz) return this.answerQuiz(p);
    if (this.rules.puzzle) return this.playWell(p);
    if (this.rules.maze) return this.walkMaze(p);
    if (this.rules.topdown) return this.walkTop(p);
    if (this.rules.crosshair) return this.aim(p);
    if (this.rules.ship) return this.fly(p);
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
    if (this.rules.racing) return this.updateRace();
    if (this.rules.sports) return this.updateBall();
    if (this.rules.versus) return this.updateVersus();
    if (this.rules.quiz) return this.updateQuiz();
    if (this.rules.puzzle) return;
    if (this.rules.maze) return this.updateMazeChasers();
    if (this.rules.topdown) {
      this.updateChasers();
      this.updateTopShots();
      return;
    }
    if (this.rules.crosshair) return this.updateTargets();
    if (this.rules.ship) return this.updateFliers();
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
      // the light gun's hostages are only not to be shot; the shooter has none to rescue
      if (this.rules.crosshair || this.rules.ship) continue;
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
      // the vertical shooter's locks are across the climb: the screen's top past the lock's middle, enemies inside its height
      if (this.rules.vertical) {
        if (this.camY > l.y + l.h / 2 || this.camY + SCREEN_H < l.y) return false;
      } else if (this.camX + SCREEN_W < l.x + l.w / 2 || this.camX > l.x + l.w) return false;
      const inside = this.enemies.some((e) => this.alive(e) && (this.rules.vertical ? e.fy >= l.y && e.fy <= l.y + l.h : e.x >= l.x && e.x <= l.x + l.w));
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
    // the maze and the puzzle: one screen, the camera still at its top left
    if (this.rules.maze || this.rules.puzzle || this.rules.quiz || this.rules.versus || this.rules.racing) {
      this.camX = 0;
      this.camY = 0;
      return;
    }
    // sports: the camera keeps the ball in the middle
    if (this.rules.sports) {
      this.camX = Math.max(0, Math.min(this.level.width - SCREEN_W, (this.ballX >> 4) - (SCREEN_W >> 1)));
      this.camY = 0;
      return;
    }
    if (this.rules.topdown) return this.updateTopCamera(snap);
    if (this.rules.crosshair || this.rules.ship) return this.updateRoute(snap);
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
      if (p.cpu) {
        // a player pressing Start takes the CPU's well, empty, with a credit's lives and no score
        if (pad & Input.Start && !(this.humanLast[p.index]! & Input.Start)) {
          // sports and racing: the player takes the athlete or the car where it is
          if (this.rules.sports || this.rules.racing) {
            p.cpu = false;
            p.score = 0;
            this.humanLast[p.index] = pad;
            p.last = pad;
            p.pad = pad;
            this.updatePlayer(p);
            continue;
          }
          p.cpu = false;
          p.active = false;
          p.score = 0;
          this.humanLast[p.index] = pad;
          this.join(p.index);
          // versus fighting: a new challenger starts the match over
          if (this.rules.versus) this.newMatch();
          p.last = pad;
          p.pad = pad;
          this.updatePlayer(p);
          continue;
        }
        this.humanLast[p.index] = pad;
        p.last = p.pad;
        p.pad = this.rules.racing ? this.racingCpuPad(p) : this.rules.sports ? this.sportsCpuPad(p) : this.rules.versus ? this.fightCpuPad(p) : cpuPad(p.well!);
        this.updatePlayer(p);
        continue;
      }
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
    if (this.rules.racing) {
      // racing: once the race is over, a player first clears the level
      if (this.raceOver) {
        const won = this.players.some((p) => p.active && !p.cpu && p.answerLeft === 1);
        this.outcome = won ? "cleared" : "over";
        this.events.push({ kind: won ? "cleared" : "over" });
        return;
      }
    } else if (this.rules.sports) {
      // sports: past the match's time, a win or a draw for a team with a player in clears the level
      if (this.matchT <= 0) {
        const [a, b] = this.goals as [number, number];
        const ok = this.players.slice(0, this.athletes()).some((p, i) => p.active && !p.cpu && (a === b || (a > b ? i % 2 === 0 : i % 2 === 1)));
        this.outcome = ok ? "cleared" : "over";
        this.events.push({ kind: ok ? "cleared" : "over" });
        return;
      }
    } else if (this.rules.versus) {
      // versus fighting: the match's winner clears the level, or the CPU's win ends the game
      if (this.vsMatch >= 0) {
        const human = !this.players[this.vsMatch]!.cpu;
        this.outcome = human ? "cleared" : "over";
        this.events.push({ kind: human ? "cleared" : "over" });
        return;
      }
    } else if (this.rules.quiz) {
      // the quiz: past the last question the level clears
      if (this.quizK >= this.questions.length && this.players.some((p) => p.active)) {
        this.outcome = "cleared";
        this.events.push({ kind: "cleared" });
        return;
      }
    } else if (this.rules.puzzle) {
      // the puzzle: a player with PUZZLE_GOAL gems cleared clears the level
      if (this.players.some((p) => p.active && !p.cpu && p.well && p.well.gems >= PUZZLE_GOAL)) {
        this.outcome = "cleared";
        this.events.push({ kind: "cleared" });
        return;
      }
    } else if (this.rules.maze) {
      // the maze: every dot eaten starts the next round, or clears the level after the last
      if (this.dotsLeft <= 0 && this.players.some((p) => p.active) && this.round + 1 < this.rules.mazeRounds) this.nextRound();
      else if (this.dotsLeft <= 0 && this.players.some((p) => p.active)) {
        this.outcome = "cleared";
        this.events.push({ kind: "cleared" });
        return;
      }
    } else if (this.rules.crosshair || this.rules.ship) {
      const end = (this.rules.vertical ? this.camY <= 0 : this.camX >= this.level.width - SCREEN_W) && !this.activeLock();
      if (end && this.players.some((p) => p.active)) {
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
    if (this.players.every((p) => !p.active || p.cpu)) {
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
    power: 0,
    aimX: 1,
    aimY: 0,
    mdx: 0,
    mdy: 0,
    wdx: 0,
    wdy: 0,
    grenade: null,
    boom: null,
    well: null,
    cpu: false,
    answer: -1,
    answerLeft: 0,
    count: 0,
    done: false,
    motion: new Array(MOTION_LEN).fill(0),
    motionI: 0,
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
  p.aimX = 1;
  p.aimY = 0;
  p.grenade = null;
  p.boom = null;
  p.mdx = p.mdy = p.wdx = p.wdy = 0;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
