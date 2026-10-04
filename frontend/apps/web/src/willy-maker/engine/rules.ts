// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The game's numbers, the same as the ROM prototype (rom/src/main.c), so a
// level plays the same in the browser and on the board. Positions are world
// pixels; vertical position and speed are in 1/16 px, like the 68000 code.

/** The screen (CPS-1). */
export const SCREEN_W = 384;
export const SCREEN_H = 224;
/** The collision grid. */
export const CELL = 16;
/** Fixed step: the board runs at 60 frames per second. */
export const FRAME_MS = 1000 / 60;

/** A player's collision height and half width at the feet. */
export const BODY_H = 40;
export const HALF_W = 5;
/** Gravity, jump and fall speed, in 1/16 px per frame (a jump peaks at 61.9 px: ledges up to 48 px are reachable). */
export const GRAVITY = 6;
export const JUMP_VY = -7 * 16;
export const MAX_FALL = 8 * 16;
/** Ladder speed: 1.5 px per frame. */
export const CLIMB_SPEED = 24;
/** The highest edge a push climbs (one 32 px crate), and how long the push takes (only when crates are climbed by pushing). */
export const STEP_UP = 32;
export const PUSH_FRAMES = 10;
/** A second press toward the same side within this many frames (250 ms) runs. */
export const RUN_TAP_FRAMES = 15;
/** How far the camera may go back from the farthest point reached. */
export const BACKTRACK = 48;
/** Down + jump drops through a ledge for this many frames. */
export const DROP_FRAMES = 12;

/** The moves (docs/willy-maker/moves.md): a crouched body's height and its crawl, the shown moves' lengths, the kick and the air rules. */
export const CROUCH_H = 24;
export const CROUCH_SHOT_Y = 12;
export const LAND_FRAMES = 8;
export const LAND_AFTER = 10;
export const TURN_FRAMES = 6;
export const KICK_FRAMES = 20;
export const KICK_REACH = 24;
export const THUMBS_FRAMES = 45;
export const YAWN_AFTER = 300;
export const DOUBLE_JUMP_VY = -96;
export const JET_LIFT = 10;
export const JET_MAX_UP = -32;
export const JET_FUEL = 90;

/** Weapons. */
export const SHOTS_PER_PLAYER = 6;
export const SHOT_SPEED = 6;
export const FIRE_EVERY = 7;
export const KNIFE_FRAMES = 16;
export const KNIFE_REACH = 18;
export const BAZOOKA_FRAMES = 24;
export const BAZOOKA_AMMO = 3;

/**
 * A player's body, scaled to the hero's height (experiment 1, T-26: heroes
 * taller than Willy's 44 px, toward Final Fight's scale). Willy is the
 * prototype's numbers exactly; a taller hero gets a taller and wider body,
 * a crouch, a reach and shots at its own heights, and a jump that rises in
 * proportion (the start speed grows with the square root of the scale).
 * The ROM engine gets the same numbers from the packer (wm_look).
 */
export interface Body {
  /** The hero's drawn height, px. */
  height: number;
  /** Standing and crouched body heights, half width at the feet (px). */
  h: number;
  crouchH: number;
  halfW: number;
  /** Jump and double-jump start speeds, 1/16 px per frame. */
  jumpVy: number;
  doubleVy: number;
  /** Knife and jump-kick reach (px), and the heights over the feet of the knife, a shot, a crouched shot and a rocket. */
  knifeReach: number;
  kickReach: number;
  knifeY: number;
  shotY: number;
  crouchShotY: number;
  rocketY: number;
}

export const HERO_HEIGHT = 44;

export function bodyFor(height = HERO_HEIGHT): Body {
  const hgt = Math.max(24, Math.min(192, Math.round(height) || HERO_HEIGHT));
  const s = hgt / HERO_HEIGHT;
  const r = (v: number) => Math.round(v * s);
  const q = Math.sqrt(s);
  return {
    height: hgt,
    h: r(BODY_H),
    crouchH: r(CROUCH_H),
    halfW: Math.max(3, r(HALF_W)),
    jumpVy: Math.round(JUMP_VY * q),
    doubleVy: Math.round(DOUBLE_JUMP_VY * q),
    knifeReach: r(KNIFE_REACH),
    kickReach: r(KICK_REACH),
    knifeY: r(20),
    shotY: r(27),
    crouchShotY: r(CROUCH_SHOT_Y),
    rocketY: r(30),
  };
}

/** Willy's body: the prototype's numbers. */
export const WILLY_BODY: Body = bodyFor(HERO_HEIGHT);

/** Enemies. */
export const ENEMY_HP = 4;
export const ENEMY_SIGHT = 170;
export const ENEMY_FIRE_EVERY = 90;
export const ENEMY_SHOT_SPEED = 3;

/**
 * The DIP switch's difficulty (experiment 1, T-15): how often an enemy
 * fires (frames) and how fast its shot flies (px per frame). Normal is
 * the prototype's. The ROM reads it from the header's flags (bits 5-6).
 */
export type Difficulty = "easy" | "normal" | "hard" | "lag";
export const DIFFICULTY: Record<Difficulty, { fireEvery: number; shotSpeed: number; bits: number }> = {
  easy: { fireEvery: 150, shotSpeed: 2, bits: 1 },
  normal: { fireEvery: ENEMY_FIRE_EVERY, shotSpeed: ENEMY_SHOT_SPEED, bits: 0 },
  hard: { fireEvery: 60, shotSpeed: 4, bits: 2 },
  lag: { fireEvery: 40, shotSpeed: 5, bits: 3 },
};
export const difficultyOf = (d: unknown) => DIFFICULTY[(typeof d === "string" && d in DIFFICULTY ? d : "normal") as Difficulty];

/** Crates and breakable walls: hits before they break (a rocket counts 9, a knife 2). */
export const CRATE_HP = 3;
export const BREAKABLE_HP = 2;

/** Lives, and the time a respawned player cannot be hurt. */
export const LIVES = 3;
export const INVULNERABLE_FRAMES = 120;

/** Score. */
export const SCORE_CRATE = 100;
export const SCORE_ENEMY = 500;
export const SCORE_RESCUE = 1000;

/**
 * The rules a game can change (the Game tab's Rules card), read by play
 * mode and packed for the ROM engine (rom/engine/wmdata.h, `wm_rules` and
 * the header's flags). The defaults are the prototype's, except how crates
 * are climbed: by jumping, as in most platformers (experiment 1's verdict,
 * T-07).
 */
export interface GameRules {
  /** Hits an enemy takes when its object gives none. */
  enemyHp: number;
  enemyScore: number;
  rescueScore: number;
  crateScore: number;
  /** Touching an enemy hurts. */
  touchHurts: boolean;
  /** Enemies walk toward a player on their floor (else they keep their patrol). */
  enemiesChase: boolean;
  /** Enemies shoot at a player on their floor. */
  enemiesShoot: boolean;
  /** The exit clears the level only with every enemy down. */
  exitNeedsEnemies: boolean;
  /** A hurt player comes back near the camera's left side (else stays where they are). */
  respawnOnHurt: boolean;
  /** Frames a player blinks and cannot be hurt after a hit or a join. */
  hurtFrames: number;
  /** How a 32 px edge is climbed: by jumping, or by walking into it for a moment (the prototype's push). */
  crateClimb: "jump" | "push";
  /** Start on a port past the game's players: a "coming soon" line, or nothing. No credit is taken either way. */
  extraPorts: "soon" | "ignore";
  /** B1 again in the air jumps once more (docs/willy-maker/moves.md). */
  doubleJump: boolean;
  /** B1 held in the air while falling lifts the player for 90 frames of fuel. */
  jetpack: boolean;
  /** The guns, the knife, the kick and the bazooka (off: the platformer, T-22). */
  weapons: boolean;
  /** Landing on an enemy's head takes it down and bounces the player (the platformer). */
  stomp: boolean;
  /**
   * The beat 'em up (genres.md): players walk a band of the floor in depth
   * (up and down move away from and toward the screen), B2 hops, with no
   * platforms, ladders or gravity between floors; actors are drawn by depth.
   */
  depth: boolean;
  /**
   * The light gun (genres.md): each player aims a crosshair with the stick
   * and shoots where it points (B1, B2 reloads); nobody walks, the camera
   * moves along the level by itself and holds at camera locks.
   */
  crosshair: boolean;
}

/** The platformer's points per coin and the bounces of a spring and a stomp (1/16 px per frame), the ROM's numbers. */
export const COIN_SCORE = 100;
export const SPRING_VY = -180;
export const STOMP_VY = -80;

export const DEFAULT_RULES: GameRules = {
  enemyHp: ENEMY_HP,
  enemyScore: SCORE_ENEMY,
  rescueScore: SCORE_RESCUE,
  crateScore: SCORE_CRATE,
  touchHurts: false,
  enemiesChase: true,
  enemiesShoot: true,
  exitNeedsEnemies: false,
  respawnOnHurt: true,
  hurtFrames: INVULNERABLE_FRAMES,
  crateClimb: "jump",
  extraPorts: "soon",
  doubleJump: false,
  jetpack: false,
  weapons: true,
  stomp: false,
  depth: false,
  crosshair: false,
};

/** A new platformer's rules (genres.md, T-22): no weapons, enemies stomped and hurting on touch, an exit open from the start. */
export const PLATFORMER_RULES: Partial<GameRules> = { weapons: false, stomp: true, touchHurts: true, enemiesShoot: false, enemiesChase: false, exitNeedsEnemies: false };

/** A new light gun game's rules (genres.md): crosshairs, targets that take one shot and shoot back, no exit to walk to (the level ends where the camera's route does). */
export const LIGHTGUN_RULES: Partial<GameRules> = { crosshair: true, weapons: false, stomp: false, touchHurts: false, enemiesShoot: true, enemiesChase: false, exitNeedsEnemies: false, enemyHp: 1, respawnOnHurt: false };

/** A new beat 'em up's rules (genres.md): walking in depth, no guns, enemies that come for the players and take six hits, a hit player blinking in place, an exit after every enemy is down. */
export const BEATEMUP_RULES: Partial<GameRules> = { depth: true, weapons: false, stomp: false, touchHurts: false, enemiesShoot: false, enemiesChase: true, exitNeedsEnemies: true, enemyHp: 6, respawnOnHurt: false };

/**
 * The beat 'em up's fight (genres.md, phase 2), the ROM's numbers too: B1
 * punches, again within COMBO_WINDOW frames chains up to a third hit, a kick
 * that knocks down; the hit lands STRIKE_AT frames in, on enemies in front
 * within the reach and DEPTH_REACH px of depth. Enemies stand ENEMY_GAP px
 * beside a player, wind up ENEMY_STRIKE frames, rest ENEMY_REST, and lie
 * FALL_FRAMES when knocked down.
 */
export const PUNCH_FRAMES = 14;
export const COMBO_KICK_FRAMES = 20;
export const STRIKE_AT = 6;
export const COMBO_WINDOW = 18;
export const PUNCH_REACH = 26;
export const FIGHT_KICK_REACH = 30;
export const DEPTH_REACH = 8;
export const ENEMY_GAP = 26;
export const ENEMY_STRIKE = 16;
export const ENEMY_ATTACK_FRAMES = 28;
export const ENEMY_REACH = 34;
export const ENEMY_REST = 50;
export const FALL_FRAMES = 60;
/**
 * The beat 'em up's phase 3: walking into an enemy within GRAB_REACH px in
 * front and GRAB_DEPTH px of depth grabs it; B1 knees it, B1 with the stick
 * away throws it THROW_DIST px behind (2 hits, knocked down); it slips away
 * after GRAB_FRAMES. A pipe adds PIPE_REACH px and a hit to punches for
 * PIPE_USES blows that land.
 */
export const GRAB_REACH = 18;
export const GRAB_DEPTH = 8;
export const GRAB_FRAMES = 90;
export const THROW_DIST = 40;
export const PIPE_USES = 12;
export const PIPE_REACH = 10;
/**
 * The beat 'em up's phase 4: a knife pickup is thrown with B1 along the
 * player's lane at KNIFE_SPEED px a frame; the first enemy it meets within
 * KNIFE_BOX px and DEPTH_REACH of depth takes KNIFE_HITS and falls. A boss
 * (kind brawler) starts with BOSS_HP hits, cannot be grabbed, rests
 * BOSS_REST frames between blows, and the HUD shows its health in
 * BOSS_HUD_STEP hits a mark.
 */
export const KNIFE_SPEED = 4;
export const KNIFE_BOX = 10;
export const KNIFE_HITS = 3;
export const BOSS_HP = 30;
export const BOSS_REST = 25;
export const BOSS_HUD_STEP = 3;

/** A game's rules: its saved ones over the defaults, numbers kept in range. */
export function rulesWith(saved: Partial<GameRules> | undefined): GameRules {
  const r = { ...DEFAULT_RULES, ...(saved ?? {}) };
  const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    enemyHp: int(r.enemyHp, 1, 99, DEFAULT_RULES.enemyHp),
    enemyScore: int(r.enemyScore, 0, 9900, DEFAULT_RULES.enemyScore),
    rescueScore: int(r.rescueScore, 0, 9900, DEFAULT_RULES.rescueScore),
    crateScore: int(r.crateScore, 0, 9900, DEFAULT_RULES.crateScore),
    touchHurts: bool(r.touchHurts, DEFAULT_RULES.touchHurts),
    enemiesChase: bool(r.enemiesChase, DEFAULT_RULES.enemiesChase),
    enemiesShoot: bool(r.enemiesShoot, DEFAULT_RULES.enemiesShoot),
    exitNeedsEnemies: bool(r.exitNeedsEnemies, DEFAULT_RULES.exitNeedsEnemies),
    respawnOnHurt: bool(r.respawnOnHurt, DEFAULT_RULES.respawnOnHurt),
    hurtFrames: int(r.hurtFrames, 0, 600, DEFAULT_RULES.hurtFrames),
    crateClimb: r.crateClimb === "push" ? "push" : "jump",
    extraPorts: r.extraPorts === "ignore" ? "ignore" : "soon",
    doubleJump: bool(r.doubleJump, false),
    jetpack: bool(r.jetpack, false),
    weapons: bool(r.weapons, true),
    stomp: bool(r.stomp, false),
    depth: bool(r.depth, false),
    crosshair: bool(r.crosshair, false),
  };
}

/**
 * The collision tags of a cell, as stored in a project's tag layer
 * (docs/willy-maker/file-format.md): 0 air, 1 solid, 2 one-way, 3 ladder,
 * 4 crate, 5 breakable, 6 hazard, 7 water.
 */
export const Tag = {
  Air: 0,
  Solid: 1,
  Oneway: 2,
  Ladder: 3,
  Crate: 4,
  Breakable: 5,
  Hazard: 6,
  Water: 7,
} as const;
export type TagValue = (typeof Tag)[keyof typeof Tag];

/** One player's controls this frame, as bits. */
export const Input = {
  Left: 1 << 0,
  Right: 1 << 1,
  Up: 1 << 2,
  Down: 1 << 3,
  B1: 1 << 4, // jump
  B2: 1 << 5, // fire (the knife when an enemy is right in front)
  B3: 1 << 6, // special: the picked-up weapon
  Start: 1 << 7,
} as const;

/** Opposite directions pressed together cancel out, as the mame2003-plus core delivers them (experiment 1, J-17). */
export function cancelOpposites(pad: number): number {
  let v = pad;
  if ((v & Input.Left) && (v & Input.Right)) v &= ~(Input.Left | Input.Right);
  if ((v & Input.Up) && (v & Input.Down)) v &= ~(Input.Up | Input.Down);
  return v;
}

/**
 * The light gun (genres.md, phase 1): a crosshair moves CROSS_SPEED px a
 * frame on the screen (above the HUD's last CROSS_BOTTOM px); B1 shoots
 * where it points, one of CLIP shots, and B2 reloads in RELOAD_FRAMES. A
 * target is hit within TARGET_HALF px of its x and TARGET_H px over its
 * feet; a hostage (a civilian) within HOSTAGE_HALF and HOSTAGE_H, which
 * hurts the player who shot. A target on the screen waits, aims for
 * AIM_FRAMES and shoots the first player in, then rests TARGET_REST; the
 * camera moves a pixel every ROUTE_STEP frames and holds at camera locks.
 */
export const CROSS_SPEED = 3;
export const CROSS_BOTTOM = 32;
export const CLIP = 6;
export const RELOAD_FRAMES = 40;
export const SHOT_FLASH = 6;
export const TARGET_HALF = 10;
export const TARGET_H = 40;
export const HOSTAGE_HALF = 8;
export const HOSTAGE_H = 36;
export const AIM_FRAMES = 60;
export const TARGET_REST = 120;
export const ROUTE_STEP = 2;
/**
 * The light gun's phase 2: a target may wait hidden until it has been on
 * the screen for its `appear` seconds, and leave (missed, no points) after
 * `stay` seconds there; B3 drops one of BOMBS bombs, which takes down
 * every target on the screen.
 */
export const BOMBS = 2;
/** Seconds of a target's appear and stay, in frames (play mode and rom/pack.ts alike). */
export function secondsToFrames(s: unknown): number {
  return typeof s === "number" && Number.isFinite(s) && s > 0 ? Math.min(32767, Math.round(s * 60)) : 0;
}
