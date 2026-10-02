// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Test with bots (experiment 1's verdict, T-08): players that play a level
// the way real people do, not the way its maker does, on play mode's engine
// (the ROM's rules), checking the game every frame. Experiment 1's jury found
// its worst bugs this way (a soft-lock behind the camera, a crate left
// hanging, players inside the floor) while every route bot and scripted run
// passed. Pure: no DOM; the Export tab runs it a bot at a time.

import { BODY_H, CELL, Game, Input, SCREEN_H, SCREEN_W, Tag, levelFromProject, rulesWith, type LevelView } from "../engine";
import type { Level, Project } from "../model";

export type BotId = "newcomer" | "masher" | "runPast" | "shooter" | "regret" | "fuzz";

export const BOTS: { id: BotId; players: number }[] = [
  { id: "newcomer", players: 1 },
  { id: "masher", players: 2 },
  { id: "runPast", players: 1 },
  { id: "shooter", players: 1 },
  { id: "regret", players: 1 },
  { id: "fuzz", players: 4 },
];

export type FindingKind = "stuck" | "clear_alive" | "in_solid" | "on_air" | "off_screen" | "out_of_level" | "crate_hanging";
export type Severity = "high" | "medium" | "low";

export const SEVERITY: Record<FindingKind, Severity> = {
  stuck: "high",
  clear_alive: "high",
  crate_hanging: "high",
  in_solid: "medium",
  on_air: "medium",
  out_of_level: "medium",
  off_screen: "low",
};

export interface Finding {
  kind: FindingKind;
  severity: Severity;
  bot: BotId;
  /** The player (0-3), or -1 for the level. */
  player: number;
  frame: number;
  x: number;
  y: number;
  /** For stuck: enemies the exit still needs. */
  enemiesLeft?: number;
}

export interface BotResult {
  bot: BotId;
  seed: number;
  frames: number;
  cleared: boolean;
  clearFrame: number | null;
  over: boolean;
  /** The farthest x player 1 reached. */
  maxX: number;
  livesLost: number;
  findings: Finding[];
  /** Every frame's input words (4 per frame), to replay or minimize a finding. */
  inputs: number[][];
}

export interface QaReport {
  level: string;
  bots: BotResult[];
  /** Deduplicated by kind and 16 px cell, most severe first. */
  findings: Finding[];
  ok: boolean;
}

/** A frame of a bot: the input words of the four ports. */
type Brain = (frame: number, game: Game) => number[];

/** A small seeded random generator (mulberry32), so a run is the same every time. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R = Input.Right;
const pulse = (f: number, every: number, length = 4) => f % every < length;

function brain(id: BotId, seed: number): Brain {
  switch (id) {
    // holds right, fires now and then, jumps now and then: a first-time player
    case "newcomer":
      return (f) => [R | (pulse(f, 30) ? Input.B2 : 0) | (pulse(f, 90, 6) ? Input.B1 : 0), 0, 0, 0];
    // two friends pressing everything: right, fire held, a jump every 20 frames
    case "masher":
      return (f) => {
        const p = R | Input.B2 | (pulse(f, 20, 4) ? Input.B1 : 0);
        return [p, f > 30 ? p : 0, 0, 0];
      };
    // runs to the end jumping, never fires
    case "runPast":
      return (f) => [R | (pulse(f, 25, 6) ? Input.B1 : 0), 0, 0, 0];
    // fires at everything from the start (crates too), then walks on firing
    case "shooter":
      return (f) => [(f < 300 ? 0 : R) | (pulse(f, 8, 4) ? Input.B2 : 0) | (f > 300 && pulse(f, 70, 6) ? Input.B1 : 0), 0, 0, 0];
    // passes every branch, then regrets it: walks back left and tries to climb
    case "regret":
      return (f) => {
        if (f < 1800) return [R | (pulse(f, 12, 4) ? Input.B2 : 0) | (pulse(f, 100, 6) ? Input.B1 : 0), 0, 0, 0];
        if (f < 2700) return [Input.Left | (pulse(f, 50, 6) ? Input.B1 : 0), 0, 0, 0];
        return [Input.Up | (pulse(f, 120, 60) ? Input.Left : 0) | (pulse(f, 45, 6) ? Input.B1 : 0), 0, 0, 0];
      };
    // four ports pressing random buttons, a new choice every 8-40 frames
    case "fuzz": {
      const rnd = seeded(seed);
      const held = [0, 0, 0, 0];
      const until = [0, 0, 0, 0];
      return (f) =>
        held.map((_, port) => {
          if (f >= until[port]!) {
            let v = 0;
            for (const bit of [Input.Left, Input.Right, Input.Up, Input.Down, Input.B1, Input.B2, Input.B3, Input.Start]) if (rnd() < (bit === Input.Right ? 0.55 : 0.18)) v |= bit;
            held[port] = v;
            until[port] = f + 8 + Math.floor(rnd() * 32);
          }
          return held[port]!;
        });
    }
  }
}

export interface RunOptions {
  frames?: number;
  seed?: number;
  /** Replays these input words instead of the bot (minimizing). */
  inputs?: number[][];
}

/** The game a bot plays: the project's rules, players and lives. */
function newGame(project: Project, view: LevelView, players: number): Game {
  const s = project.settings;
  return new Game(view, {
    players: Math.max(1, Math.min(players, s.players)),
    maxPlayers: s.players,
    lives: s.dip?.lives,
    rules: s.rules,
  });
}

/** Plays one bot on a level and checks the game every frame. */
export function runBot(project: Project, level: Level, bot: BotId, opts: RunOptions = {}): BotResult {
  const frames = opts.frames ?? 3600;
  const seed = opts.seed ?? 1;
  const view = levelFromProject(level);
  const spec = BOTS.find((b) => b.id === bot)!;
  const game = newGame(project, view, spec.players);
  const rules = rulesWith(project.settings.rules);
  const think = brain(bot, seed);
  const inputs: number[][] = [];
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const add = (f: Finding) => {
    const key = `${f.kind}:${f.player}:${Math.floor(f.x / CELL)}:${Math.floor(f.y / CELL)}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(f);
  };
  const lives0 = game.players.map((p) => p.lives);
  let maxX = game.players[0]!.x;
  let progressAt = 0;
  let progress = "";
  let cleared = false;
  let clearFrame: number | null = null;
  let stuckSaid = false;
  const directed = bot !== "fuzz";

  for (let f = 0; f < frames; f++) {
    const pads = opts.inputs ? (opts.inputs[f] ?? [0, 0, 0, 0]) : think(f, game);
    inputs.push(pads);
    game.step(pads);
    const frame = f + 1;
    if (game.outcome === "cleared") {
      cleared = true;
      clearFrame = frame;
      const left = game.enemies.filter((e) => e.state === "walk" || e.state === "hit").length;
      if (rules.exitNeedsEnemies && left) add({ kind: "clear_alive", severity: SEVERITY.clear_alive, bot, player: -1, frame, x: game.players[0]!.x, y: game.players[0]!.y >> 4, enemiesLeft: left });
      break;
    }
    if (game.outcome === "over") break;

    for (const p of game.players) {
      if (!p.active) continue;
      const fy = p.y >> 4;
      const base = { bot, player: p.index, frame, x: p.x, y: fy };
      if (p.x < 0 || p.x > view.width || fy > view.height + 32) add({ ...base, kind: "out_of_level", severity: SEVERITY.out_of_level });
      // the body or the feet inside something solid (a ladder's grip is fine)
      let inside = false;
      for (let y = fy - 2; y > fy - BODY_H + 4 && !inside; y -= 8) {
        const t = game.cellAt(p.x, y);
        if (t === Tag.Solid || t === Tag.Crate || t === Tag.Breakable) inside = true;
      }
      if (inside && !p.climbing) add({ ...base, kind: "in_solid", severity: SEVERITY.in_solid });
      if (p.onGround && !p.climbing && fy % CELL === 0 && !game.support(p.x, fy, false)) add({ ...base, kind: "on_air", severity: SEVERITY.on_air });
      if (fy - BODY_H > game.camY + SCREEN_H || fy < game.camY || p.x < game.camX || p.x > game.camX + SCREEN_W) add({ ...base, kind: "off_screen", severity: SEVERITY.off_screen });
    }
    // a crate with nothing under it (J-03)
    for (const k of game.crates) {
      if (k.broken) continue;
      let held = false;
      for (let c = k.col; c < k.col + k.cells; c++) {
        const t = game.cell(c, k.row + k.cells);
        if (t === Tag.Solid || t === Tag.Crate || t === Tag.Breakable || t === Tag.Oneway) held = true;
      }
      if (!held) add({ kind: "crate_hanging", severity: SEVERITY.crate_hanging, bot, player: -1, frame, x: (k.col + k.cells / 2) * CELL, y: (k.row + k.cells) * CELL });
    }

    // stuck: a directed bot makes no progress (ground, score, enemies, rescues) for 30 s
    const p1 = game.players[0]!;
    if (p1.active && p1.x > maxX) maxX = p1.x;
    const snap = game.snapshot();
    const now = `${Math.floor(maxX / CELL)}:${snap.players.reduce((n, p) => n + p.score, 0)}:${snap.enemiesLeft}:${snap.civilians.rescued}`;
    if (now !== progress) {
      progress = now;
      progressAt = frame;
    } else if (directed && !stuckSaid && frame - progressAt >= 1800 && game.players.some((p) => p.active)) {
      stuckSaid = true;
      const at = game.players.find((p) => p.active)!;
      add({ kind: "stuck", severity: SEVERITY.stuck, bot, player: at.index, frame, x: at.x, y: at.y >> 4, enemiesLeft: rules.exitNeedsEnemies ? snap.enemiesLeft : undefined });
    }
  }
  return {
    bot,
    seed,
    frames: inputs.length,
    cleared,
    clearFrame,
    over: game.outcome === "over",
    maxX,
    livesLost: game.players.reduce((n, p, i) => n + Math.max(0, lives0[i]! - p.lives), 0),
    findings,
    inputs,
  };
}

const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Every bot on a level (the fuzz with a few seeds); `onBot` reports each one as it ends. */
export function runQa(project: Project, level: Level, opts: { frames?: number; fuzzSeeds?: number[]; onBot?: (r: BotResult) => void } = {}): QaReport {
  const bots: BotResult[] = [];
  for (const b of BOTS) {
    const seeds = b.id === "fuzz" ? (opts.fuzzSeeds ?? [1, 2, 3]) : [1];
    for (const seed of seeds) {
      const r = runBot(project, level, b.id, { frames: opts.frames, seed });
      bots.push(r);
      opts.onBot?.(r);
    }
  }
  return report(level, bots);
}

export function report(level: Level, bots: BotResult[]): QaReport {
  const all = new Map<string, Finding>();
  for (const r of bots)
    for (const f of r.findings) {
      const key = `${f.kind}:${Math.floor(f.x / CELL)}:${Math.floor(f.y / CELL)}`;
      if (!all.has(key)) all.set(key, f);
    }
  const findings = [...all.values()].sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.frame - b.frame);
  return { level: level.name, bots, findings, ok: !findings.some((f) => f.severity === "high") };
}

/**
 * The shortest inputs that still give a finding of the same kind (ddmin over
 * runs of equal input words): what a person can read and replay.
 */
export function minimize(project: Project, level: Level, bot: BotResult, finding: Finding, budget = 400): number[][] {
  const upTo = bot.inputs.slice(0, finding.frame);
  type Run = { from: number; to: number; pads: number[] };
  const runs: Run[] = [];
  upTo.forEach((pads, f) => {
    const last = runs[runs.length - 1];
    if (last && last.to === f && last.pads.every((v, i) => v === pads[i])) last.to = f + 1;
    else runs.push({ from: f, to: f + 1, pads });
  });
  const expand = (keep: Run[]): number[][] => {
    const out: number[][] = Array.from({ length: finding.frame + 600 }, () => [0, 0, 0, 0]);
    for (const r of keep) for (let f = r.from; f < r.to; f++) out[f] = r.pads;
    return out;
  };
  let tests = 0;
  const fails = (keep: Run[]) => {
    tests++;
    const r = runBot(project, level, bot.bot, { inputs: expand(keep), frames: finding.frame + 600 });
    return r.findings.some((f) => f.kind === finding.kind);
  };
  let cur = runs;
  let n = 2;
  while (cur.length >= 2 && tests < budget) {
    const size = Math.ceil(cur.length / n);
    let reduced = false;
    for (let i = 0; i < cur.length && tests < budget; i += size) {
      const rest = cur.slice(0, i).concat(cur.slice(i + size));
      if (rest.length && fails(rest)) {
        cur = rest;
        n = Math.max(n - 1, 2);
        reduced = true;
        break;
      }
    }
    if (!reduced) {
      if (n >= cur.length) break;
      n = Math.min(cur.length, n * 2);
    }
  }
  const out = expand(cur);
  // trim the quiet tail after the last press
  let end = out.length;
  while (end > finding.frame && out[end - 1]!.every((v) => !v)) end--;
  return out.slice(0, Math.max(end, finding.frame));
}

const NAMES: [number, string][] = [
  [Input.Left, "left"],
  [Input.Right, "right"],
  [Input.Up, "up"],
  [Input.Down, "down"],
  [Input.B1, "b1"],
  [Input.B2, "b2"],
  [Input.B3, "b3"],
  [Input.Start, "start"],
];

/**
 * Input words as experiment 1's harness script (docs/experiments/harness.md):
 * a coin and Start first, play from frame `offset`, then the steps, so the
 * same moves can be tried on the ROM (`run.mjs`, `device romtest --input`).
 * Play mode starts at once and the ROM after its title, so a ROM may need a
 * different offset.
 */
export function harnessScript(inputs: number[][], name: string, offset = 156): { name: string; frames: number; steps: { from: number; to: number; port: number; buttons: string[] }[] } {
  const steps: { from: number; to: number; port: number; buttons: string[] }[] = [
    { from: 120, to: 125, port: 1, buttons: ["coin"] },
    { from: 150, to: 155, port: 1, buttons: ["start"] },
  ];
  for (let port = 0; port < 4; port++) {
    let from = -1;
    let cur = 0;
    const flush = (to: number) => {
      if (from >= 0 && cur) steps.push({ from: offset + from, to: offset + to, port: port + 1, buttons: NAMES.filter(([b]) => cur & b).map(([, n]) => n) });
    };
    inputs.forEach((pads, f) => {
      const v = pads[port] ?? 0;
      if (v !== cur) {
        flush(f);
        cur = v;
        from = f;
      }
    });
    flush(inputs.length);
  }
  steps.sort((a, b) => a.from - b.from || a.port - b.port);
  return { name, frames: offset + inputs.length + 60, steps };
}
