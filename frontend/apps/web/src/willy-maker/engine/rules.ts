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
  /**
   * The horizontal shooter (genres.md): each player flies a ship in 8
   * directions over a level the camera scrolls by itself; B1 shoots ahead
   * (held, every SHIP_FIRE frames), B2 drops a bomb; walls and enemies hurt.
   */
  ship: boolean;
  /** The vertical shooter: with ships, the camera climbs the level from its bottom and the ships fire up (genres.md). */
  vertical: boolean;
  /**
   * The top-down run and gun (genres.md): seen from above, players walk in 8
   * directions with no gravity, aim where they walk (B3 held keeps the aim)
   * and fire with B1 held; enemies come at them; the camera follows both ways.
   */
  topdown: boolean;
  /**
   * The maze (genres.md): players and enemies move cell to cell on the
   * grid, every empty cell starts with a dot and eating them all clears the
   * level; a power pickup turns the chasers into prey for a while.
   */
  maze: boolean;
  /** The maze's rounds (phase 3): every dot eaten starts the next, faster round, the last clears the level (1-9). */
  mazeRounds: number;
  /**
   * The puzzle (genres.md): each player has a well where trios of gems
   * fall; three or more of a color in a line clear, and enough cleared gems
   * clear the level. Nobody walks and there are no enemies.
   */
  puzzle: boolean;
  /** The puzzle's CPU rival (phase 2): while player 2 is not in, the CPU plays the second well. */
  puzzleCpu: boolean;
  /** The puzzle's CPU rival's level (phase 3): 1 easy, 2 normal, 3 hard. */
  puzzleCpuLevel: number;
  /**
   * The quiz (genres.md, quiz and party): the game's questions one after
   * another on the screen, answered with B1 B2 B3; nobody walks.
   */
  quiz: boolean;
  /**
   * Versus fighting (genres.md): players 1 and 2 face each other on one
   * screen, rounds of punches, kicks and blocks; the CPU fights in an empty
   * corner.
   */
  versus: boolean;
  /**
   * Sports (genres.md): arcade football seen from above, a team of the even
   * players against the odd ones, the CPU playing every empty place.
   */
  sports: boolean;
  /**
   * Racing (genres.md): cars seen from above lap a track, the CPU driving
   * every empty place.
   */
  racing: boolean;
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
  ship: false,
  vertical: false,
  topdown: false,
  maze: false,
  mazeRounds: 1,
  puzzle: false,
  puzzleCpu: false,
  puzzleCpuLevel: 2,
  quiz: false,
  versus: false,
  sports: false,
  racing: false,
};

/** A new platformer's rules (genres.md, T-22): no weapons, enemies stomped and hurting on touch, an exit open from the start. */
export const PLATFORMER_RULES: Partial<GameRules> = { weapons: false, stomp: true, touchHurts: true, enemiesShoot: false, enemiesChase: false, exitNeedsEnemies: false };

/** A new light gun game's rules (genres.md): crosshairs, targets that take one shot and shoot back, no exit to walk to (the level ends where the camera's route does). */
export const LIGHTGUN_RULES: Partial<GameRules> = { crosshair: true, weapons: false, stomp: false, touchHurts: false, enemiesShoot: true, enemiesChase: false, exitNeedsEnemies: false, enemyHp: 1, respawnOnHurt: false };

/** A new horizontal shooter's rules (genres.md): ships, enemies that fly in and take one shot, touching one hurts, the level ends where the camera's route does. */
export const SHIP_RULES: Partial<GameRules> = { ship: true, weapons: false, stomp: false, touchHurts: true, enemiesShoot: false, enemiesChase: false, exitNeedsEnemies: false, enemyHp: 1, respawnOnHurt: false };

/** A new vertical shooter's rules: the horizontal shooter's, climbing the level. */
export const VERTICAL_RULES: Partial<GameRules> = { ...SHIP_RULES, vertical: true };

/** A new top-down run and gun's rules: enemies that chase, shoot and hurt by touch, two hits each, the exit after every enemy is down. */
export const TOPDOWN_RULES: Partial<GameRules> = { topdown: true, weapons: false, stomp: false, touchHurts: true, enemiesShoot: true, enemiesChase: true, exitNeedsEnemies: true, enemyHp: 2, respawnOnHurt: false };

/** A new maze game's rules: chasers that hurt by touch, the level cleared by its dots (no exit). */
export const MAZE_RULES: Partial<GameRules> = { maze: true, mazeRounds: 3, weapons: false, stomp: false, touchHurts: true, enemiesShoot: false, enemiesChase: true, exitNeedsEnemies: false, enemyHp: 1, respawnOnHurt: true };

/** A new puzzle game's rules: wells of falling gems, a CPU rival in the second well, no walking, no enemies, no exit. */
export const PUZZLE_RULES: Partial<GameRules> = { puzzle: true, puzzleCpu: true, weapons: false, stomp: false, touchHurts: false, enemiesShoot: false, enemiesChase: false, exitNeedsEnemies: false, respawnOnHurt: false };

/** A new quiz game's rules: questions on the screen, no walking, no enemies, no exit. */
export const QUIZ_RULES: Partial<GameRules> = { quiz: true, weapons: false, stomp: false, touchHurts: false, enemiesShoot: false, enemiesChase: false, exitNeedsEnemies: false, respawnOnHurt: false };

/** A new versus fighting game's rules: two fighters on one screen, no weapons, no exit. */
export const VERSUS_RULES: Partial<GameRules> = { versus: true, weapons: false, stomp: false, touchHurts: false, enemiesShoot: false, enemiesChase: false, exitNeedsEnemies: false, respawnOnHurt: false };

/** A new sports game's rules: football on a field two screens wide, no weapons, no enemies, no exit. */
export const SPORTS_RULES: Partial<GameRules> = { sports: true, weapons: false, stomp: false, touchHurts: false, enemiesShoot: false, enemiesChase: false, exitNeedsEnemies: false, respawnOnHurt: false };

/** A new racing game's rules: cars on a ring track, no weapons, no enemies, no exit. */
export const RACING_RULES: Partial<GameRules> = { racing: true, weapons: false, stomp: false, touchHurts: false, enemiesShoot: false, enemiesChase: false, exitNeedsEnemies: false, respawnOnHurt: false };

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
    ship: bool(r.ship, false),
    vertical: bool(r.vertical, false),
    topdown: bool(r.topdown, false),
    maze: bool(r.maze, false),
    mazeRounds: int(r.mazeRounds, 1, 9, 1),
    puzzle: bool(r.puzzle, false),
    puzzleCpu: bool(r.puzzleCpu, false),
    puzzleCpuLevel: int(r.puzzleCpuLevel, 1, 3, 2),
    quiz: bool(r.quiz, false),
    versus: bool(r.versus, false),
    sports: bool(r.sports, false),
    racing: bool(r.racing, false),
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

/**
 * The horizontal shooter (genres.md, phase 1): a ship moves SHIP_SPEED px a
 * frame on the screen (its centre kept SHIP_HALF_W and SHIP_HALF_H inside
 * it, above the HUD's last CROSS_BOTTOM px) and fires every SHIP_FIRE
 * frames while B1 is held; an enemy flies in from the right FLY_SPEED px a
 * frame on a wave of FLY_WAVE px either way, and hurts a ship within
 * SHIP_HIT_X and SHIP_HIT_Y of its middle (FLY_MID px over its feet).
 */
export const SHIP_SPEED = 2;
export const SHIP_HALF_W = 14;
export const SHIP_HALF_H = 6;
export const SHIP_FIRE = 8;
export const FLY_SPEED = 1;
export const FLY_WAVE = 8;
export const FLY_MID = 20;
export const SHIP_HIT_X = 18;
export const SHIP_HIT_Y = 18;
/**
 * The horizontal shooter's phase 2: a power pickup a ship flies over
 * (within POWER_REACH_X and POWER_REACH_Y of its middle, 8 px over its
 * feet) raises its weapon up to MAX_POWER: two shots side by side
 * (POWER_GAP px apart), then three in a fan (one up and one down a pixel a
 * frame); a ship that loses a life loses its power.
 */
export const MAX_POWER = 2;
export const POWER_REACH_X = 14;
export const POWER_REACH_Y = 12;
export const POWER_GAP = 4;
/**
 * The horizontal shooter's phase 3: an enemy's path (0 a wave, 1 straight,
 * 2 a dive toward the first ship once it is within DIVE_RANGE px) and the
 * gunship boss (path 3): GUNSHIP_HP hits, it holds GUNSHIP_HOLD px from the
 * screen's right, bobs GUNSHIP_BOB px either way and fires a shot left
 * every GUNSHIP_FIRE frames (SHIP_SHOT_SPEED px a frame, hurting a ship
 * within SHIP_SHOT_X and SHIP_SHOT_Y); it hurts a ship within GUNSHIP_HIT_X
 * and GUNSHIP_HIT_Y of its middle.
 */
export const FLY_PATHS = ["wave", "straight", "dive"] as const;
export const DIVE_RANGE = 160;
export const GUNSHIP_HP = 30;
export const GUNSHIP_HOLD = 48;
export const GUNSHIP_BOB = 40;
export const GUNSHIP_FIRE = 50;
export const SHIP_SHOT_SPEED = 3;
export const SHIP_SHOT_X = 12;
export const SHIP_SHOT_Y = 6;
export const GUNSHIP_HIT_X = 36;
export const GUNSHIP_HIT_Y = 20;
/** A bomb's hits on a boss (every other enemy takes all of its hits). */
export const BOMB_BOSS_HITS = 5;
/** An enemy's path in the shooter (rom/pack.ts writes it in the row's a). */
export function flyPathOf(path: unknown): number {
  const i = FLY_PATHS.indexOf(path as (typeof FLY_PATHS)[number]);
  return i < 0 ? 0 : i;
}

/**
 * The top-down run and gun (genres.md, phase 1): a player walks TOP_SPEED
 * px a frame (its feet box TOP_HALF_W either side and TOP_DEPTH px up from
 * its feet stops at solid cells), fires every FIRE_EVERY frames while B1 is
 * held, its shots flying TOP_SHOT px a frame along the aim from its middle
 * (TOP_MID px over its feet); an enemy on the screen steps toward the
 * nearest player every other frame and hurts one within TOP_TOUCH_X and
 * TOP_TOUCH_Y of it.
 */
export const TOP_SPEED = 1;
export const TOP_HALF_W = 6;
export const TOP_DEPTH = 8;
export const TOP_SHOT = 5;
export const TOP_MID = 20;
export const TOP_TOUCH_X = 14;
export const TOP_TOUCH_Y = 10;

/**
 * The top-down run and gun's phase 2: B2 throws one of GRENADES grenades
 * along the aim, GRENADE_SPEED px a frame for GRENADE_FUSE frames; it bursts
 * where it lands (or at a wall), giving GRENADE_HITS to every enemy within
 * GRENADE_X and GRENADE_Y of it, and the burst shows BOOM_FRAMES frames. An
 * enemy within TOP_SIGHT px (both ways) of a player fires at it every
 * fireEvery frames (the difficulty's): a shot in the closest of 8 directions,
 * TOP_EN_SHOT px a frame each way, hurting a player within TOP_EN_HIT_X and
 * TOP_EN_HIT_Y of its middle.
 */
export const GRENADES = 3;
export const GRENADE_SPEED = 3;
export const GRENADE_FUSE = 30;
export const GRENADE_HITS = 2;
export const GRENADE_X = 32;
export const GRENADE_Y = 24;
export const BOOM_FRAMES = 12;
export const TOP_SIGHT = 160;
export const TOP_EN_SHOT = 3;
export const TOP_EN_HIT_X = 8;
export const TOP_EN_HIT_Y = 12;

/**
 * The maze (genres.md, phase 1): a player moves MAZE_SPEED px a frame and
 * an enemy 1 (every other frame while it flees), turning only at a cell's
 * middle; a dot is worth DOT_SCORE, a power pickup POWER_SCORE and makes the
 * chasers flee for FRIGHT_FRAMES; a fleeing chaser a player touches (within
 * MAZE_TOUCH px) is eaten for EAT_SCORE and is back at its start after
 * HOME_FRAMES; any other touch hurts the player, who is back at its start.
 */
export const MAZE_SPEED = 2;
export const DOT_SCORE = 10;
export const POWER_SCORE = 50;
export const FRIGHT_FRAMES = 360;
export const MAZE_TOUCH = 10;
export const EAT_SCORE = 200;
export const HOME_FRAMES = 180;
/**
 * Phase 2: the chasers take turns by their order in the level: the first of
 * every three follows the nearest player, the second aims AMBUSH_AHEAD px
 * ahead of the way that player goes, the third follows only while farther
 * than WANDER_NEAR px and otherwise heads for the maze's bottom left corner.
 */
export const AMBUSH_AHEAD = 64;
export const WANDER_NEAR = 128;
/**
 * Phase 3: a chaser's Chases in the Inspector picks its way of chasing
 * (auto: by its order, as in phase 2), kept in its row as CHASE_KINDS'
 * index; from the second round the chasers move a pixel more every
 * MAZE_HASTE[round] frames (the last value for later rounds) unless they flee.
 */
export const CHASE_KINDS = ["auto", "follow", "ambush", "wander"] as const;
export const MAZE_HASTE = [0, 4, 2] as const;

export function chaseOf(chase: unknown): number {
  const i = CHASE_KINDS.indexOf(chase as (typeof CHASE_KINDS)[number]);
  return i < 0 ? 0 : i;
}

/**
 * The puzzle (genres.md, phase 1), the ROM's numbers too: a well of
 * WELL_COLS x WELL_ROWS cells of 16 px per player (players 1 and 2, the
 * wells' left edges at WELL_X, their tops at WELL_Y). A trio of gems in
 * GEM_COLORS colors falls a row every FALL_START frames, FALL_STEP fewer for
 * every LEVEL_GEMS gems the player cleared, down to FALL_MIN (SOFT_DROP while
 * Down is held); left and right move it at once, then every MOVE_EVERY frames
 * after MOVE_FIRST; B1 turns its colors (the bottom one to the top). Three or
 * more of a color in a row, a column or a diagonal clear after CLEAR_FRAMES,
 * worth GEM_SCORE each times the chain (1, 2, 3... as clears make new ones);
 * a trio that cannot come in tops the well out, costing a life and emptying
 * it. PUZZLE_GOAL gems cleared by a player clear the level.
 */
export const WELL_COLS = 6;
export const WELL_ROWS = 12;
export const WELL_X = [48, 240] as const;
export const WELL_Y = 16;
export const GEM_COLORS = 5;
export const FALL_START = 30;
export const FALL_STEP = 3;
export const FALL_MIN = 6;
export const LEVEL_GEMS = 15;
export const SOFT_DROP = 2;
export const MOVE_FIRST = 12;
export const MOVE_EVERY = 4;
export const CLEAR_FRAMES = 24;
export const GEM_SCORE = 10;
export const PUZZLE_GOAL = 60;
/** The gems' random sequence: a 32-bit LCG per well, seeded with PUZZLE_SEED + the player's index × 7919. */
export const PUZZLE_SEED = 0x2545f491;

/**
 * The puzzle, phase 2: every clear sends the rival well STONE gems, the
 * gems past three plus GARBAGE_CHAIN for every step of a chain past the
 * first; they fall onto its stacks, at most WELL_COLS at a time from the left
 * column, before its next trio comes in. Stones make no lines; a cleared gem
 * next to one (up, down, left, right) clears it too. The CPU rival thinks a
 * candidate a frame (column × turns, CPU_CANDIDATES of them), then presses
 * a button every CPU_STEP frames: turns, moves, then holds Down.
 */
export const STONE = 6;
export const GARBAGE_CHAIN = 3;
export const CPU_CANDIDATES = 18;
export const CPU_STEP = 4;

/**
 * The quiz (genres.md, quiz and party, phase 1), the ROM's numbers too: a
 * question stays QUIZ_TIME frames or until every player in answered (the
 * first press of B1 B2 B3 counts), then the right answer shows for
 * REVEAL_FRAMES; a right answer is worth QUIZ_SCORE plus QUIZ_BONUS for
 * every whole second left. After the last question the level clears.
 */
export const QUIZ_TIME = 600;
export const REVEAL_FRAMES = 150;
export const QUIZ_SCORE = 100;
export const QUIZ_BONUS = 10;
/** The most questions a game holds (their screens are 0x40 + n in the ROM's texts). */
export const QUIZ_MAX = 60;

/**
 * The quiz's minigames (genres.md, quiz and party, phase 2), the ROM's
 * numbers too. Mash: B1 as many times as you can in MASH_TIME frames,
 * MASH_SCORE a press. Timing: a marker crosses TIMING_W cells and back, a
 * cell every TIMING_STEP frames, for TIMING_TIME frames; your first B1 stops
 * it for you, worth TIMING_SCORE less TIMING_LOSS for every cell from the
 * middle. Memory: MEM_LEN letters show MEM_LETTER frames each (lit for
 * MEM_LIT of them), then MEM_INPUT frames to press them back with B1 B2 B3,
 * MEM_SCORE a letter right in order (a wrong press ends your turn).
 */
export const MASH_TIME = 300;
export const MASH_SCORE = 10;
export const TIMING_W = 40;
export const TIMING_STEP = 3;
export const TIMING_TIME = 360;
export const TIMING_SCORE = 200;
export const TIMING_LOSS = 10;
export const MEM_LEN = 4;
export const MEM_LETTER = 40;
export const MEM_LIT = 30;
export const MEM_INPUT = 360;
export const MEM_SCORE = 50;

/**
 * Versus fighting (genres.md, phase 1), the ROM's numbers too. Fighters
 * stand on VS_FLOOR, start at VS_START, walk VS_WALK px a frame (VS_WALK_BACK backing off; never
 * nearer than VS_GAP, inside VS_EDGE of the screen's sides), jump straight
 * up (VS_JUMP_VY, VS_GRAVITY in 1/16 px) and crouch. B1 punches (PUNCH_FRAMES
 * long, hitting VS_PUNCH_AT frames in, VS_PUNCH_REACH px ahead for
 * VS_PUNCH_DMG; a crouching fighter ducks it), B2 kicks (COMBO_KICK_FRAMES,
 * VS_KICK_AT, VS_KICK_REACH, VS_KICK_DMG). Holding away from the attacker on
 * the ground blocks: VS_CHIP and VS_BLOCK_STUN frames; a hit stuns
 * VS_HIT_STUN frames, pushes VS_HIT_PUSH px and scores 10 a point of damage.
 * A round: VS_INTRO frames, then up to VS_TIME frames with VS_HP each; the
 * fighter with more left wins it (VS_ROUND_SCORE plus 10 a point left), then
 * VS_PAUSE frames; VS_WINS rounds win the match (at most VS_ROUNDS rounds).
 */
export const VS_FLOOR = 192;
export const VS_START = [112, 272] as const;
export const VS_WALK = 2;
/** Walking back (away from the foe, which is also blocking) is slower. */
export const VS_WALK_BACK = 1;
export const VS_GAP = 28;
export const VS_EDGE = 16;
export const VS_JUMP_VY = -88;
export const VS_GRAVITY = 5;
export const VS_PUNCH_AT = 4;
export const VS_PUNCH_REACH = 34;
export const VS_PUNCH_DMG = 6;
export const VS_KICK_AT = 7;
export const VS_KICK_REACH = 42;
export const VS_KICK_DMG = 10;
export const VS_CHIP = 1;
export const VS_BLOCK_STUN = 8;
export const VS_BLOCK_PUSH = 4;
export const VS_HIT_STUN = 16;
export const VS_HIT_PUSH = 8;
export const VS_HP = 100;
export const VS_INTRO = 90;
export const VS_TIME = 3600;
export const VS_PAUSE = 120;
export const VS_WINS = 2;
export const VS_ROUNDS = 5;
export const VS_ROUND_SCORE = 1000;
/** The CPU fighter: it presses an attack every VS_CPU_EVERY frames when near, and blocks a near attack. */
export const VS_CPU_EVERY = 20;
/** Versus fighting's HUD on the text layer: the health bars' cells and row, the round's call's row. */
export const VS_BAR = 20;
export const VS_BAR_ROW = 3;
export const VS_CALL_ROW = 10;

/**
 * Sports (genres.md, phase 1: football), the ROM's numbers too. The field
 * runs from FIELD_X0 to the level's width less FIELD_X0 and from FIELD_Y0 to
 * FIELD_Y1 (feet); the goals are its ends between GOAL_Y0 and GOAL_Y1. Players
 * 1 and 3 (team A) attack right, 2 and 4 (team B) left; with fewer than four
 * places it is one against one. Athletes run ATH_SPEED px a frame in 8
 * directions; touching a loose ball (within TOUCH_X, TOUCH_Y) takes it, and it
 * rolls DRIBBLE px ahead of its owner; an opponent's touch steals it; B1 kicks
 * it BALL_KICK (1/16 px a frame) the way the athlete faces, and the kicker
 * cannot take it back for REGRAB frames. A loose ball slows by 1/16 a frame
 * (stopping under BALL_STOP: below 16 the 1/16 rounds to nothing) and
 * bounces off the field's sides. A goal scores
 * GOAL_SCORE for each player of the scoring team and starts again from the
 * middle after KICKOFF_FRAMES; the match lasts MATCH_TIME frames of play, and
 * a win or a draw for a team with a player in clears the level.
 */
export const FIELD_X0 = 16;
export const FIELD_Y0 = 64;
export const FIELD_Y1 = 200;
export const GOAL_Y0 = 112;
export const GOAL_Y1 = 160;
export const ATH_SPEED = 2;
export const TOUCH_X = 12;
export const TOUCH_Y = 8;
export const DRIBBLE = 10;
export const BALL_KICK = 72;
export const BALL_STOP = 16;
export const REGRAB = 20;
export const GOAL_SCORE = 500;
export const KICKOFF_FRAMES = 60;
export const MATCH_TIME = 3600;
/** The CPU: it shoots once nearer than CPU_SHOOT px to the goal, pressing B1 on frames a multiple of 8. */
export const CPU_SHOOT = 120;
/** The score's row on the text layer, and the call's (KICK OFF, GOAL!). */
export const SPORTS_ROW = 3;
export const SPORTS_CALL_ROW = 10;

/**
 * Racing (genres.md, phase 1: seen from above), the ROM's numbers too. A
 * car points one of 16 ways (CAR_DIRS, 0 right, 4 down; 1/16 px a frame at
 * speed 16), turns a step every STEER frames Left or Right are held, speeds
 * up by CAR_ACCEL a frame with B1 up to CAR_MAX (CPU_MAX for the CPU),
 * brakes by CAR_BRAKE with B2 and coasts down a 1 every other frame; a solid
 * cell under its middle stops it where it was. The track's line is the
 * WAYPOINTS (the wizard's ring, clockwise from the start); a car reaches one
 * within GATE_X, GATE_Y px and heads for the next; the last ends a lap.
 * RACE_LAPS laps finish; the places score PLACE_SCORE; the race ends once
 * every player finished, RACE_AFTER frames after the first car did, or after
 * RACE_TIME frames; a player first clears the level. It starts after
 * RACE_COUNT frames (3, 2, 1, GO!). The CPU picks its way every 4 frames.
 */
export const CAR_DIRS: readonly (readonly [number, number])[] = [[16, 0], [15, 6], [11, 11], [6, 15], [0, 16], [-6, 15], [-11, 11], [-15, 6], [-16, 0], [-15, -6], [-11, -11], [-6, -15], [0, -16], [6, -15], [11, -11], [15, -6]];
export const STEER = 4;
export const CAR_ACCEL = 1;
export const CAR_BRAKE = 2;
export const CAR_MAX = 40;
export const CPU_MAX = 36;
export const WAYPOINTS: readonly (readonly [number, number])[] = [[56, 184], [56, 72], [328, 72], [328, 184], [192, 184]];
export const GATE_X = 48;
export const GATE_Y = 40;
export const RACE_LAPS = 3;
export const PLACE_SCORE = [3000, 2000, 1000, 500] as const;
export const RACE_AFTER = 600;
export const RACE_TIME = 7200;
export const RACE_COUNT = 180;
/** The starting grid (car middles), all facing left (way 8). */
export const GRID: readonly (readonly [number, number])[] = [[208, 172], [208, 196], [240, 172], [240, 196]];
/** The call's row (3, 2, 1, GO!, FINISH). */
export const RACE_CALL_ROW = 10;

/**
 * Versus fighting, phase 2: special moves read from the stick. A fighter
 * keeps its last MOTION_LEN stick codes (1 down, 2 toward the foe, 4 away,
 * 8 up, added). Down, down-toward, toward within MOTION_WINDOW frames, then B1,
 * throws a fireball (FB_FRAMES long, thrown FB_AT frames in, FB_SPEED px a
 * frame, FB_DMG, FB_CHIP blocked; one at a time; two meeting cancel out; one
 * jumped high over misses). Away then toward within DASH_WINDOW frames, then
 * B1, is a dash punch (DASH_FRAMES long, moving DASH_SPEED px a frame from
 * DASH_FROM to DASH_TO frames in, striking once in reach for DASH_DMG, low
 * enough to hit a crouching foe).
 */
export const MOTION_LEN = 16;
export const MOTION_WINDOW = 15;
export const DASH_WINDOW = 10;
export const FB_FRAMES = 30;
export const FB_AT = 10;
export const FB_SPEED = 3;
export const FB_DMG = 12;
export const FB_CHIP = 3;
export const FB_Y = 40;
export const DASH_FRAMES = 18;
export const DASH_FROM = 2;
export const DASH_TO = 12;
export const DASH_SPEED = 4;
export const DASH_DMG = 14;
/** The CPU throws a fireball when farther than VS_CPU_FAR px, every VS_CPU_THROW frames of the fight (a third of the way in). */
export const VS_CPU_FAR = 120;
export const VS_CPU_THROW = 90;

/**
 * Racing, phase 2: a track's waypoints are its level's checkpoints in their
 * order (at most MAX_WAYPOINTS; none: WAYPOINTS), and the grid its player
 * starts (none: GRID). A car whose move brings it within BUMP_X, BUMP_Y px
 * of another, when it was touching none, loses half its speed (cars already
 * touching drive on, apart or through).
 */
export const MAX_WAYPOINTS = 8;
export const BUMP_X = 12;
export const BUMP_Y = 10;

/**
 * Sports, phase 2: B2 passes the ball to the nearest teammate, along the one
 * of the 16 ways (CAR_DIRS) nearest it, PASS_SPEED times the way (1/16 px a
 * frame). A CPU defender (players 3 and 4) keeps goal: it stays KEEPER_X px
 * off its goal line, level with the ball inside the goal's mouth, and clears
 * a ball it holds forward. A CPU with the ball passes when an opponent is
 * within PRESS_X px ahead of it.
 */
export const PASS_SPEED = 4;
export const KEEPER_X = 24;
export const PRESS_X = 32;

/**
 * The puzzle, phase 3: the CPU rival's level. CPU_STEPS[level - 1] frames
 * between its presses; at level 1 it weighs only how low a trio lands, not
 * the lines it makes.
 */
export const CPU_STEPS = [8, 4, 2] as const;

/**
 * The top-down run and gun, phase 3: a **Jeep** pickup a player walks into
 * becomes its ride: it goes JEEP_SPEED times as fast and takes JEEP_HP hits
 * for the player (each a blink of hurtFrames) before it is gone.
 */
export const JEEP_SPEED = 2;
export const JEEP_HP = 5;
