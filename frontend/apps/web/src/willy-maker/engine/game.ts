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
  ENEMY_FIRE_EVERY,
  ENEMY_SHOT_SPEED,
  ENEMY_SIGHT,
  FIRE_EVERY,
  GRAVITY,
  HALF_W,
  Input,
  JUMP_VY,
  KNIFE_FRAMES,
  KNIFE_REACH,
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
  rulesWith,
  type GameRules,
} from "./rules";

export const MAX_PLAYERS = 4;

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
  special: "" | "bazooka";
  ammo: number;
  t: number;
  score: number;
  lives: number;
  invulnerable: number;
  shots: Shot[];
  rocket: Rocket | null;
}

export type EnemyState = "walk" | "hit" | "down" | "off";

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
  contents: string;
  broken: boolean;
}

export interface Pickup {
  name: string;
  item: string;
  x: number;
  fy: number;
  live: boolean;
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
  | { kind: "jump" | "shot" | "knife" | "rocket" | "land"; player: number }
  | { kind: "crate"; name: string }
  | { kind: "enemy_down"; name: string }
  | { kind: "rescue"; name: string; player: number }
  | { kind: "pickup"; item: string; player: number }
  | { kind: "hurt" | "join"; player: number }
  | { kind: "cleared" | "over" };

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
  enemyShots: Shot[] = [];
  cameraLocks: (Rect & { name: string; done: boolean })[] = [];
  exits: Rect[] = [];
  camX = 0;
  camY = 0;
  camFar = 0;
  frame = 0;
  rescued = 0;
  outcome: GameOutcome = "playing";
  events: GameEvent[] = [];
  private readonly maxPlayers: number;
  private readonly lives: number;
  private readonly startAt?: { x: number; y: number };
  private readonly runTap: number;
  readonly rules: GameRules;
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
    for (let i = 0; i < this.maxPlayers; i++) this.players.push(newPlayer(i, this.lives));
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
            fireWait: ENEMY_FIRE_EVERY,
          });
          break;
        }
        case "civilian":
          this.civilians.push({ name: o.name, kind: str(o.kind, "woman"), x: o.x, fy: o.y, trappedIn: str(o.trapped_in, ""), rescued: false, t: this.civilians.length * 17 });
          break;
        case "crate": {
          const cells = num(o.size, 32) >= 32 ? 2 : 1;
          const col = Math.floor(o.x / CELL);
          const row = Math.floor(o.y / CELL);
          this.crates.push({ name: o.name, col, row, cells, hp: num(o.hp, CRATE_HP), contents: str(o.contents, ""), broken: false });
          for (let r = row; r < row + cells; r++) for (let c = col; c < col + cells; c++) if (this.cell(c, r) === Tag.Air) this.setCell(c, r, Tag.Crate);
          break;
        }
        case "pickup":
          this.pickups.push({ name: o.name, item: str(o.item, "bazooka"), x: o.x, fy: o.y, live: true });
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
  support(x: number, fy: number, drop: boolean): number {
    if (fy % CELL !== 0) return 0;
    const r = fy / CELL;
    const c0 = Math.floor((x - HALF_W) / CELL);
    const c1 = Math.floor((x + HALF_W) / CELL);
    let best = 0;
    for (let c = c0; c <= c1; c++) {
      if (this.isSolid(this.cell(c, r))) return 2;
      if (!drop && this.isLedge(c, r)) best = 1;
    }
    return best;
  }

  private bodyBlocked(x: number, fy: number): boolean {
    for (let y = fy - 1; y > fy - BODY_H; y -= 8) if (this.isSolid(this.cellAt(x, y))) return true;
    return this.isSolid(this.cellAt(x, fy - BODY_H));
  }

  /** The first place feet can stand at x, searching down from y (px). */
  groundBelow(x: number, y: number): number {
    for (let fy = Math.max(CELL, Math.ceil(y / CELL) * CELL); fy < this.level.height; fy += CELL) {
      if (this.support(x, fy, false) && !this.bodyBlocked(x, fy)) return fy;
    }
    return this.level.height - CELL;
  }

  /** A hit on a crate or breakable wall at cell (c, r); true if something took it. */
  private hitCell(c: number, r: number, damage: number, by: Player | null): boolean {
    const t = this.cell(c, r);
    if (t === Tag.Crate) {
      const crate = this.crates.find((k) => !k.broken && c >= k.col && c < k.col + k.cells && r >= k.row && r < k.row + k.cells);
      if (crate) {
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
    this.events.push({ kind: "crate", name: crate.name });
    const x = (crate.col + crate.cells / 2) * CELL;
    // "nothing" leaves no pickup; a civilian inside a crate has no effect yet (editor/support.ts)
    if (crate.contents && crate.contents !== "nothing" && crate.contents !== "civilian") this.pickups.push({ name: `${crate.name}_contents`, item: crate.contents, x, fy: this.groundBelow(x, (crate.row + crate.cells) * CELL - CELL), live: true });
    for (const v of this.civilians) if (v.trappedIn === crate.name) v.trappedIn = "";
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
    if (start && !lead) {
      x = start.x + (this.startAt ? i * 24 : 0);
      fy = this.groundBelow(x, start.y - CELL);
    } else {
      x = lead ? lead.x : this.camX + 64;
      fy = this.groundBelow(x, this.camY);
    }
    spawn(p, x, fy);
    p.invulnerable = this.rules.hurtFrames;
    this.events.push({ kind: "join", player: i });
  }

  private hurt(p: Player, fell = false): void {
    if (!p.active || (p.invulnerable && !fell)) return;
    if (p.invulnerable) {
      // fell out while protected: back on the ground, no life lost
      const x = Math.max(this.camX + 64, Math.min(p.x, this.camX + SCREEN_W - 64));
      spawn(p, x, this.groundBelow(x, this.camY));
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
    const x = Math.max(this.camX + 64, Math.min(p.x, this.camX + SCREEN_W - 64));
    const keep = p.invulnerable;
    spawn(p, x, this.groundBelow(x, this.camY));
    p.invulnerable = keep;
  }

  private pressed(p: Player, bit: number): boolean {
    return (p.pad & bit) !== 0 && (p.last & bit) === 0;
  }

  private walk(p: Player, dir: number, speed: number): void {
    const fy = p.y >> 4;
    for (let n = 0; n < speed; n++) {
      const nx = p.x + dir;
      const front = nx + dir * HALF_W;
      if (!this.bodyBlocked(front, fy)) {
        p.x = nx;
        p.pushT = 0;
        continue;
      }
      // blocked: an edge up to STEP_UP high with room above is climbed after a push
      if (p.onGround) {
        let top = fy;
        while (fy - top < STEP_UP + CELL && this.isSolid(this.cellAt(front, top - 1))) top = Math.floor((top - 1) / CELL) * CELL;
        if (fy - top <= STEP_UP && !this.bodyBlocked(front, top) && !this.bodyBlocked(p.x, top)) {
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

  private updatePlayer(p: Player): void {
    p.t++;
    if (p.dropT) p.dropT--;
    if (p.invulnerable) p.invulnerable--;
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
        if (this.support(p.x, cellTop, true) === 2 && fy % CELL < 2) {
          p.y = cellTop * 16;
          p.climbing = false;
          p.onGround = true;
        } else if (this.cellAt(p.x, fy - 1) !== Tag.Ladder && this.cellAt(p.x, fy) !== Tag.Ladder) p.climbing = false; // off the bottom: fall
      }
      if (this.pressed(p, Input.B1)) {
        p.climbing = false;
        p.vy = JUMP_VY / 2;
      }
    } else {
      if (dir && !p.knifeT && !p.bazookaT) {
        p.flip = dir < 0;
        this.walk(p, dir, p.running ? 2 : 1);
      } else p.pushT = 0;
      fy = p.y >> 4;
      // down + jump drops through a ledge; jump otherwise
      if (p.onGround && this.pressed(p, Input.B1)) {
        if ((p.pad & Input.Down) && this.support(p.x, fy, false) === 1) {
          p.dropT = DROP_FRAMES;
          p.onGround = false;
          p.vy = 0;
          p.y += 16;
        } else {
          p.vy = JUMP_VY;
          p.onGround = false;
          this.events.push({ kind: "jump", player: p.index });
        }
      }
      // walking off an edge
      if (p.onGround && !this.support(p.x, fy, false)) {
        p.onGround = false;
        p.vy = 0;
      }
      if (!p.onGround) {
        const from = p.y >> 4;
        p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
        const to = (p.y + p.vy) >> 4;
        if (p.vy > 0) {
          for (let py = from + 1; py <= to; py++)
            if (this.support(p.x, py, p.dropT !== 0)) {
              p.y = py * 16;
              p.vy = 0;
              p.onGround = true;
              this.events.push({ kind: "land", player: p.index });
              break;
            }
          if (!p.onGround) p.y += p.vy;
        } else if (this.isSolid(this.cellAt(p.x, to - BODY_H))) p.vy = 0;
        // the head hits only solid cells: one-way platforms let it through
        else p.y += p.vy;
      }
    }
    fy = p.y >> 4;
    if (fy > this.level.height + 64) {
      this.hurt(p, true); // fell out
      return;
    }
    if (this.cellAt(p.x, fy - 1) === Tag.Hazard || this.cellAt(p.x, fy - BODY_H / 2) === Tag.Hazard) this.hurt(p);
    if (!p.active) return;

    // pickups
    for (const k of this.pickups) {
      const d = k.x - p.x;
      if (k.live && d > -14 && d < 14 && fy - k.fy > -8 && fy - k.fy < 8) {
        k.live = false;
        if (k.item === "bazooka") {
          p.special = "bazooka";
          p.ammo = BAZOOKA_AMMO;
        }
        this.events.push({ kind: "pickup", item: k.item, player: p.index });
      }
    }

    // special: the picked-up weapon while it has ammo
    if (p.bazookaT) p.bazookaT--;
    if (this.pressed(p, Input.B3) && p.special === "bazooka" && p.ammo > 0 && !p.rocket && p.onGround) {
      p.rocket = { dir: p.flip ? -1 : 1, x: p.x + (p.flip ? -30 : 10), y: fy - 30, speed: 2 };
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
      } else if (this.hitCell(Math.floor(tip / CELL), Math.floor((r.y + 8) / CELL), 9, p)) p.rocket = null;
      else if (t === Tag.Solid || r.x < this.camX - 48 || r.x > this.camX + SCREEN_W + 48) p.rocket = null;
    }

    // fire: the knife if an enemy stands right in front, else the machine gun
    if (p.knifeT) p.knifeT--;
    if (this.pressed(p, Input.B2) && p.onGround && !p.climbing) {
      const e = this.enemyAt(p.x + (p.flip ? -KNIFE_REACH : KNIFE_REACH), fy - 20, 16);
      if (e) {
        p.knifeT = KNIFE_FRAMES;
        this.damage(e, 2, p);
        this.events.push({ kind: "knife", player: p.index });
      }
    }
    p.firing = (p.pad & Input.B2) !== 0 && !p.knifeT && !p.bazookaT && !p.climbing;
    if (p.fireWait) p.fireWait--;
    if (p.firing && !p.fireWait && p.shots.length < SHOTS_PER_PLAYER) {
      p.shots.push({ dir: p.flip ? -1 : 1, x: p.x + (p.flip ? -20 : 20), y: fy - 27 });
      p.fireWait = FIRE_EVERY;
      this.events.push({ kind: "shot", player: p.index });
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
    return e.state === "walk" || e.state === "hit";
  }

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
      this.events.push({ kind: "enemy_down", name: e.name });
    } else e.state = "hit";
  }

  private updateEnemies(): void {
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
          if ((dx > 22 || dx < -22) && e.t & 1) e.x += e.dir;
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
            e.fireWait = ENEMY_FIRE_EVERY;
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
      // touching an enemy hurts
      if (this.rules.touchHurts && this.alive(e))
        for (const p of this.players) {
          const dx = p.x - e.x;
          const dy = (p.y >> 4) - e.fy;
          if (p.active && !p.invulnerable && dx > -14 && dx < 14 && dy > -24 && dy < 24) this.hurt(p);
        }
    }
    this.enemyShots = this.enemyShots.filter((s) => {
      s.x += s.dir * ENEMY_SHOT_SPEED;
      for (const p of this.players) {
        const fy = p.y >> 4;
        if (p.active && Math.abs(p.x - s.x) < 8 && s.y <= fy && s.y > fy - BODY_H) {
          this.hurt(p);
          return false;
        }
      }
      return !this.isSolid(this.cellAt(s.x, s.y)) && s.x >= this.camX - 32 && s.x <= this.camX + SCREEN_W + 32;
    });
  }

  private updateCivilians(): void {
    for (const v of this.civilians) {
      v.t++;
      if (v.rescued || v.trappedIn) continue;
      for (const p of this.players) {
        const dx = v.x - p.x;
        const dy = (p.y >> 4) - v.fy;
        if (p.active && p.onGround && dx > -20 && dx < 20 && dy > -8 && dy < 8) {
          v.rescued = true;
          v.t = 0;
          this.rescued++;
          p.score += this.rules.rescueScore;
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
   * a screen ahead of the players' middle, never goes back more than
   * BACKTRACK pixels from the farthest point reached, and players cannot
   * walk past the screen's sides (the leader waits for the others).
   */
  updateCamera(snap = false): void {
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
    if (tx < this.camFar - BACKTRACK) tx = this.camFar - BACKTRACK;
    let ty = Math.trunc(sy / n) - 150;
    const lock = this.activeLock();
    let maxX = this.level.width - SCREEN_W;
    if (lock) maxX = Math.min(maxX, Math.max(lock.x, lock.x + lock.w - SCREEN_W));
    tx = Math.max(0, Math.min(maxX, tx));
    ty = Math.max(0, Math.min(this.level.height - SCREEN_H, ty));
    if (snap) {
      this.camX = tx;
      this.camY = ty;
    } else {
      this.camX += Math.trunc((tx - this.camX) / 4) + Math.sign(tx - this.camX);
      this.camY += Math.trunc((ty - this.camY) / 6) + Math.sign(ty - this.camY);
    }
    if (this.camX > this.camFar) this.camFar = this.camX;
    for (const p of this.players)
      if (p.active) p.x = Math.max(this.camX + 12, Math.min(this.camX + SCREEN_W - 12, p.x));
  }

  // -------------------------------------------------------------- step

  /** One frame. `inputs[i]` is player i's `Input` bits; a button press from a player who is out joins them. */
  step(inputs: readonly number[]): void {
    this.events = [];
    if (this.outcome !== "playing") return;
    this.frame++;
    for (const p of this.players) {
      const pad = inputs[p.index] ?? 0;
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
    for (const p of this.players) {
      if (!p.active) continue;
      const fy = p.y >> 4;
      if (this.rules.exitNeedsEnemies && this.enemies.some((e) => this.alive(e))) break;
      if (this.exits.some((x) => p.x >= x.x && p.x <= x.x + x.w && fy >= x.y && fy <= x.y + x.h)) {
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
        state: !p.active ? "out" : p.climbing ? "climbing" : !p.onGround ? (p.vy < 0 ? "jumping" : "falling") : p.pushT ? "pushing" : p.knifeT ? "knife" : p.firing ? "firing" : p.running ? "running" : p.pad & (Input.Left | Input.Right) ? "walking" : "standing",
        lives: p.lives,
        score: p.score,
        ammo: p.ammo,
      })),
      enemiesLeft: this.enemies.filter((e) => this.alive(e)).length,
      civilians: { rescued: this.rescued, total: this.civilians.length },
    };
  }
}

export type PlayerState = "out" | "climbing" | "jumping" | "falling" | "pushing" | "knife" | "firing" | "running" | "walking" | "standing";

export interface GameSnapshot {
  frame: number;
  outcome: GameOutcome;
  camera: { x: number; y: number; far: number; locked: boolean };
  players: { index: number; active: boolean; x: number; y: number; state: PlayerState; lives: number; score: number; ammo: number }[];
  enemiesLeft: number;
  civilians: { rescued: number; total: number };
}

function newPlayer(index: number, lives: number): Player {
  return {
    index,
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
  };
}

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
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
