// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Validation level 1 (docs/willy-maker/validation.md): the live rules a
// project must keep before it is exported. Pure functions of the project
// and the board profile, fast enough to run on every change. Every rule
// gives one or more checks: an "ok" line when it passes, or an error,
// warning or info with the place to go and, when a change is safe to make
// automatically, a fix. Errors block the AI pack; warnings do not.
// Messages live in the module's i18n (i18n/export.*.ts), keyed by `msg`.

import { objectLayer, OBJECT_TYPES, tagGrid, TAG_NUMBER, type Level, type Project } from "../../model";
import { boardOf, ENGINE_USE, isBoardColor, layerPaletteCount, layoutOf, snapColor, type BoardProfile } from "../../board/cps1";
import { jumpRowsFor, leftBehind, reachability, routes } from "../reach";
import { rulesWith } from "../../engine/rules";
import { Game } from "../../engine/game";
import { levelFromProject } from "../../engine/level";
import { clampPivots, clearTilesOutOfRange, programChecks, spriteChecks, tileGridChecks } from "./art";
import { supportChecks } from "./support";
import type { ExportMessages } from "../../i18n/export.en";

export type Severity = "ok" | "info" | "warning" | "error";

/** Where "Go" takes the user. */
export type Target =
  | { tab: "build"; level: string; x?: number; y?: number; object?: string }
  | { tab: "characters"; character?: string }
  | { tab: "game" | "menus"; screen?: string; field?: string; player?: number };

/** The changes the review can make by itself (applyFix). */
export type FixId = "snap-colors" | "buttons" | "players" | "level-order" | "title" | "names" | "tile-range" | "pivots";

export type Params = Record<string, string | number>;

export interface Check {
  /** The rule (validation.md), e.g. "level.reachable". */
  id: string;
  severity: Severity;
  /** The message key in the export i18n. */
  msg: string;
  params: Params;
  /** Ready messages by language, for checks whose key the export i18n does not have (rules from other parts). */
  texts?: Partial<Record<"en" | "es" | "pt", string>>;
  target?: Target;
  fix?: FixId;
}

export interface Review {
  checks: Check[];
  errors: number;
  warnings: number;
  /** No errors: the AI pack can be made. */
  ready: boolean;
  /** The picture checks (pictures.ts) are still running: the list is not final yet. */
  checking?: boolean;
}

/** An extra rule from another part of the module (Game, Menus…), run with the others. */
export type Rule = (project: Project, board: BoardProfile) => Check[];

/** The actions every game has, each needing a button (or the 2-button combination). */
export const ACTIONS = ["jump", "fire", "special"] as const;

/** Animations each role needs (art-spec.md): play mode and the engine use them. */
export const REQUIRED_ANIMS: Record<string, string[]> = { hero: ["idle", "walk", "jump"], enemy: ["idle", "walk"], civilian: ["idle"], boss: ["idle"] };

/** Required object properties (art-spec.md section 4). */
const REQUIRED_PROPS: Record<string, string[]> = { player_start: ["player"], enemy: ["kind"], civilian: ["kind"], pickup: ["item"], boss: ["kind"] };

/** A reference name: letters, digits and underscores, up to 32. */
export const NAME_RE = /^[A-Za-z0-9_]{1,32}$/;

export const TITLE_MAX = 24;

const levelName = (l: Level, i: number) => l.name?.trim() || `${i + 1}`;

/** The characters of a title the board's font cannot draw. */
export function titleProblems(title: string, board: BoardProfile): { length: boolean; chars: string[] } {
  const t = title.trim();
  const chars = [...new Set([...t.toUpperCase()].filter((c) => !board.font.includes(c)))];
  return { length: t.length < 1 || t.length > TITLE_MAX, chars };
}

/** The title made of the font's characters: accents dropped, others removed, cut to 24. */
export function boardTitle(title: string, board: BoardProfile): string {
  const folded = title.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const kept = [...folded].filter((c) => board.font.includes(c.toUpperCase())).join("");
  return kept.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX).trim() || "GAME";
}

function gameChecks(p: Project, board: BoardProfile): Check[] {
  const out: Check[] = [];
  const layout = layoutOf(p);
  // levels and their order
  if (!p.levels.length) out.push({ id: "game.no-levels", severity: "error", msg: "game.no-levels", params: {}, target: { tab: "game" } });
  const ids = new Set(p.levels.map((l) => l.id));
  const order = Array.isArray(p.settings.levels) ? p.settings.levels : [];
  const unknown = order.filter((id) => !ids.has(id));
  const missing = p.levels.filter((l) => !order.includes(l.id));
  if (unknown.length || missing.length || new Set(order).size !== order.length)
    out.push({ id: "game.level-order", severity: "error", msg: "game.level-order", params: { n: unknown.length + missing.length }, target: { tab: "game" }, fix: "level-order" });
  // title
  const tp = titleProblems(p.title, board);
  if (tp.length) out.push({ id: "game.title", severity: "error", msg: "game.title-length", params: { max: TITLE_MAX }, target: { tab: "game" }, fix: "title" });
  else if (tp.chars.length) out.push({ id: "game.title", severity: "error", msg: "game.title-chars", params: { chars: tp.chars.join(" ") }, target: { tab: "game" }, fix: "title" });
  else out.push({ id: "game.title", severity: "ok", msg: "game.title.ok", params: { title: p.title.trim() } });
  // players and buttons
  const players = Number(p.settings.players);
  let controls = true;
  if (!Number.isInteger(players) || players < 1 || players > layout.players) {
    controls = false;
    out.push({ id: "game.players", severity: "error", msg: "game.players", params: { max: layout.players }, target: { tab: "game" }, fix: "players" });
  }
  const b = (p.settings.buttons ?? {}) as unknown as Record<string, unknown>;
  const slots = ["b1", "b2", "b3"].slice(0, layout.buttons);
  const assigned = new Map<string, string[]>();
  for (const s of slots) {
    const a = String(b[s] ?? "");
    if (a) assigned.set(a, [...(assigned.get(a) ?? []), s]);
  }
  for (const [a, where] of assigned)
    if (where.length > 1) {
      controls = false;
      out.push({ id: "game.buttons", severity: "error", msg: "game.buttons-shared", params: { action: a, a: where[0]!.slice(1), b: where[1]!.slice(1) }, target: { tab: "game" }, fix: "buttons" });
    }
  if (layout.buttons < 3 && b.b3 !== "b1+b2") {
    controls = false;
    out.push({ id: "game.buttons", severity: "error", msg: "game.buttons-combo", params: { buttons: layout.buttons }, target: { tab: "game" }, fix: "buttons" });
  }
  // with fewer buttons, the one action left uses the combination
  const free = ACTIONS.filter((a) => !assigned.has(a));
  const unbound = layout.buttons < 3 && b.b3 === "b1+b2" ? free.slice(1) : free;
  for (const a of unbound) {
    controls = false;
    out.push({ id: "game.buttons", severity: "error", msg: "game.buttons-missing", params: { action: a }, target: { tab: "game" }, fix: "buttons" });
  }
  if (controls) out.push({ id: "game.buttons", severity: "ok", msg: "game.controls.ok", params: { players, buttons: layout.buttons } });
  // characters: play mode and the ROM fall back to the built-in Willy
  if (!p.characters.some((c) => c.role === "hero")) out.push({ id: "game.hero", severity: "info", msg: "game.hero", params: {}, target: { tab: "characters" } });
  return out;
}

function levelChecks(p: Project, board: BoardProfile): Check[] {
  const out: Check[] = [];
  let startsOk = true;
  let reachOk = true;
  let trapOk = true;
  let cameraOk = true;
  let noReturnOk = true;
  let timers = 0;
  let timerOk = true;
  let sizeOk = true;
  let objectsOk = true;
  const players = Math.max(1, Math.min(4, Number(p.settings.players) || 1));
  const needsEnemies = rulesWith(p.settings.rules).exitNeedsEnemies;
  p.levels.forEach((level, i) => {
    const name = levelName(level, i);
    const go = (x?: number, y?: number, object?: string): Target => ({ tab: "build", level: level.id, x, y, object });
    // size
    const { w, h } = level.size;
    if (w > board.levels.maxW || h > board.levels.maxH) {
      sizeOk = false;
      out.push({ id: "level.width", severity: "error", msg: "level.width", params: { level: name, w, h, maxW: board.levels.maxW, maxH: board.levels.maxH }, target: go() });
    } else if (w < board.screen.w || h < board.screen.h) {
      sizeOk = false;
      out.push({ id: "level.width", severity: "error", msg: "level.small", params: { level: name, w, h, sw: board.screen.w, sh: board.screen.h }, target: go() });
    } else if (w % board.levels.cell || h % board.levels.cell) {
      sizeOk = false;
      out.push({ id: "level.width", severity: "error", msg: "level.grid", params: { level: name, cell: board.levels.cell }, target: go() });
    }
    let items: ReturnType<typeof objectLayer>["items"] = [];
    try {
      items = objectLayer(level).items;
    } catch {
      items = [];
    }
    // starts and the exit
    for (let pl = 1; pl <= players; pl++) {
      const starts = items.filter((o) => o.type === "player_start" && Number(o.player ?? 1) === pl);
      if (!starts.length) {
        if (pl === 1) {
          startsOk = false;
          out.push({ id: "level.start", severity: "error", msg: "level.start", params: { level: name, player: 1 }, target: go() });
        } else out.push({ id: "level.start", severity: "warning", msg: "level.start-extra", params: { level: name, player: pl }, target: go() });
      } else if (starts.length > 1) {
        startsOk = false;
        out.push({ id: "level.start", severity: "error", msg: "level.start-many", params: { level: name, player: pl, n: starts.length }, target: go(starts[1]!.x, starts[1]!.y, starts[1]!.name) });
      }
    }
    // where the engine really puts each start: on the first free floor under it (T-09)
    let game: Game | null = null;
    try {
      game = new Game(levelFromProject(level));
    } catch {
      game = null;
    }
    for (const st of game ? items.filter((o) => o.type === "player_start") : []) {
      const fy = game!.groundBelow(st.x, st.y - 16);
      if (fy - st.y > 32 || fy >= h - 16)
        out.push({ id: "level.start-floor", severity: "warning", msg: "level.start-floor", params: { level: name, player: Number(st.player ?? 1), d: Math.max(0, fy - st.y) }, target: go(st.x, st.y, st.name) });
    }
    const exits = items.filter((o) => o.type === "exit");
    if (!exits.length) {
      startsOk = false;
      out.push({ id: "level.exit", severity: "error", msg: "level.exit", params: { level: name }, target: go() });
    } else if (exits.length > 1) out.push({ id: "level.exit", severity: "warning", msg: "level.exit-many", params: { level: name, n: exits.length }, target: go(exits[1]!.x, exits[1]!.y, exits[1]!.name) });
    // objects and their properties
    for (const o of items) {
      if (!(OBJECT_TYPES as readonly string[]).includes(o.type)) {
        objectsOk = false;
        out.push({ id: "level.objects", severity: "error", msg: "level.object-type", params: { level: name, name: o.name, type: String(o.type) }, target: go(o.x, o.y, o.name) });
        continue;
      }
      for (const field of REQUIRED_PROPS[o.type] ?? []) {
        const v = o[field];
        const bad = v === undefined || v === null || v === "" || (field === "player" && !(Number(v) >= 1 && Number(v) <= 4));
        if (bad) {
          objectsOk = false;
          out.push({ id: "level.objects", severity: "error", msg: "level.object-field", params: { level: name, name: o.name, type: o.type, field }, target: go(o.x, o.y, o.name) });
        }
      }
    }
    // reachability, with the engine's moves
    if (!items.some((o) => o.type === "player_start")) return;
    let reach: ReturnType<typeof reachability>;
    try {
      reach = reachability(level, jumpRowsFor(rulesWith(p.settings.rules)));
    } catch {
      return;
    }
    const lostExit = reach.objects.find((o) => o.type === "exit");
    if (lostExit) {
      reachOk = false;
      out.push({ id: "level.reachable", severity: "error", msg: "level.reachable", params: { level: name, x: lostExit.x }, target: go(lostExit.x, lostExit.y, lostExit.name) });
    }
    if (reach.ledges.length) {
      reachOk = false;
      const l = reach.ledges[0]!;
      out.push({ id: "level.ledge", severity: "warning", msg: "level.ledge", params: { level: name, n: reach.ledges.length, x: l.x0, h: l.rise }, target: go((l.x0 + l.x1) / 2, l.y) });
    }
    // the routes: places with no way on, the forward-only camera, the timer
    if (!lostExit) {
      let r: ReturnType<typeof routes> | null = null;
      try {
        r = routes(level, reach);
      } catch {
        r = null;
      }
      if (r?.traps.length) {
        trapOk = false;
        const t = r.traps[0]!;
        out.push({ id: "level.trap", severity: "warning", msg: "level.trap", params: { level: name, x: t.x, n: r.traps.length }, target: go(t.x, t.y) });
      }
      if (r && r.cameraStop !== null) {
        cameraOk = false;
        out.push({ id: "level.camera", severity: "error", msg: "level.camera", params: { level: name, x: Math.round(r.cameraStop), back: Number(level.camera?.backtrack ?? 48) }, target: go(r.cameraStop, level.size.h / 2) });
      }
      // the point of no return: what players may leave behind the forward-only camera
      if (r && r.cameraStop === null) {
        const behind = leftBehind(
          level,
          reach,
          items.filter((o) => o.type === "civilian" || (needsEnemies && o.type === "enemy")),
        );
        for (const b of behind.filter((o) => o.type === "enemy")) {
          noReturnOk = false;
          out.push({ id: "level.noreturn", severity: "warning", msg: "level.noreturn", params: { level: name, name: b.name, x: Math.round(b.at) }, target: go(b.x, b.y, b.name) });
        }
        const civilians = behind.filter((o) => o.type === "civilian");
        if (civilians.length) {
          const c = civilians[0]!;
          out.push({ id: "level.noreturn", severity: "info", msg: "level.noreturn.civilian", params: { level: name, name: c.name, x: Math.round(c.at), n: civilians.length }, target: go(c.x, c.y, c.name) });
        }
      }
      const timer = Number(level.timer);
      if (Number.isFinite(timer) && timer > 0 && r?.walkFrames != null) {
        timers++;
        // the walk at walking speed, plus half again for fights and detours
        const needed = Math.ceil(((r.walkFrames / board.screen.fps) * 3) / 2);
        if (timer < needed) {
          timerOk = false;
          out.push({ id: "level.timer", severity: "info", msg: "level.timer", params: { level: name, timer, needed }, target: go() });
        }
      }
    }
    const lost = reach.objects.filter((o) => o.type !== "exit");
    if (lost.length) {
      reachOk = false;
      out.push({ id: "level.object-reach", severity: "warning", msg: "level.object-reach", params: { level: name, n: lost.length, name: lost[0]!.name }, target: go(lost[0]!.x, lost[0]!.y, lost[0]!.name) });
    }
  });
  if (p.levels.length) {
    if (startsOk) out.unshift({ id: "level.start", severity: "ok", msg: "level.start.ok", params: {} });
    if (reachOk) out.push({ id: "level.reachable", severity: "ok", msg: "level.reachable.ok", params: {} });
    if (trapOk) out.push({ id: "level.trap", severity: "ok", msg: "level.trap.ok", params: {} });
    if (cameraOk) out.push({ id: "level.camera", severity: "ok", msg: "level.camera.ok", params: {} });
    if (noReturnOk) out.push({ id: "level.noreturn", severity: "ok", msg: "level.noreturn.ok", params: {} });
    if (timers && timerOk) out.push({ id: "level.timer", severity: "ok", msg: "level.timer.ok", params: {} });
    if (sizeOk) out.push({ id: "level.width", severity: "ok", msg: "level.width.ok", params: { maxW: board.levels.maxW, maxH: board.levels.maxH } });
    if (objectsOk) out.push({ id: "level.objects", severity: "ok", msg: "level.objects.ok", params: {} });
  }
  return out;
}

function nameChecks(p: Project): Check[] {
  const out: Check[] = [];
  let ok = true;
  p.levels.forEach((level, i) => {
    let items: { name: string; x: number; y: number }[] = [];
    try {
      items = objectLayer(level).items;
    } catch {
      return;
    }
    const seen = new Set<string>();
    const bad = items.filter((o) => {
      const wrong = typeof o.name !== "string" || !NAME_RE.test(o.name) || seen.has(o.name);
      seen.add(o.name);
      return wrong;
    });
    if (bad.length) {
      ok = false;
      out.push({ id: "names.objects", severity: "error", msg: "names.objects", params: { level: levelName(level, i), n: bad.length, name: String(bad[0]!.name ?? "") }, target: { tab: "build", level: level.id, x: bad[0]!.x, y: bad[0]!.y, object: bad[0]!.name }, fix: "names" });
    }
  });
  const dup = (what: string, ids: string[], target: (id: string) => Target) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id) || !id) {
        ok = false;
        out.push({ id: "names.ids", severity: "error", msg: `names.${what}`, params: { id }, target: target(id) });
        return;
      }
      seen.add(id);
    }
  };
  dup("levels", p.levels.map((l) => l.id), (id) => ({ tab: "build", level: id }));
  dup("characters", p.characters.map((c) => c.id), (id) => ({ tab: "characters", character: id }));
  dup("palettes", p.palettes.map((x) => x.id), () => ({ tab: "characters" }));
  if (ok) out.push({ id: "names.objects", severity: "ok", msg: "names.ok", params: {} });
  return out;
}

function graphicsChecks(p: Project, board: BoardProfile): Check[] {
  const out: Check[] = [];
  const meters = board.meters(p);
  const meter = (id: string) => meters.find((m) => m.id === id)!;
  // palettes per group
  const groups: [string, number][] = [
    ["sprite", board.palettes.sprite],
    ["play", board.palettes.play],
    ["far", board.palettes.far],
  ];
  for (const [g, max] of groups) {
    const n = g === "sprite" ? p.palettes.filter((x) => x.group === g).length : layerPaletteCount(p, g as "play" | "far");
    // the engine's own characters already take sprite palettes (board/cps1.ts ENGINE_USE)
    const total = g === "sprite" ? n + ENGINE_USE.spritePalettes : n;
    const target: Target = g === "sprite" ? { tab: "characters" } : { tab: "build", level: p.levels[0]?.id ?? "" };
    if (n > max) out.push({ id: "gfx.palettes", severity: "error", msg: "gfx.palettes", params: { group: g, n, max }, target });
    // over with the engine's: Create ROM draws the heroes that do not fit as Willy (a recruit's free slots may still hold them)
    else if (total > max) out.push({ id: "gfx.palettes", severity: "warning", msg: "gfx.palettes", params: { group: g, n: total, max }, target });
    else if (g === "sprite") out.push({ id: "gfx.palettes", severity: "ok", msg: "gfx.palettes.ok", params: { n: total, max } });
  }
  // colors per palette zone
  const owner = (pal: string): Target => {
    const ch = p.characters.find((c) => c.frames.some((f) => f.zones?.includes(pal)));
    return ch ? { tab: "characters", character: ch.id } : { tab: "characters" };
  };
  let zonesOk = true;
  for (const pal of p.palettes) {
    const n = new Set(pal.colors.map((c) => c.toUpperCase())).size;
    if (n > board.colors.perPalette) {
      zonesOk = false;
      out.push({ id: "gfx.colors-per-zone", severity: "error", msg: "gfx.colors-per-zone", params: { palette: pal.id, n, max: board.colors.perPalette }, target: owner(pal.id) });
    }
  }
  const known = new Set(p.palettes.map((x) => x.id));
  for (const ch of p.characters) {
    const lost = ch.frames.flatMap((f) => f.zones ?? []).find((z) => !known.has(z));
    if (lost) {
      zonesOk = false;
      out.push({ id: "gfx.colors-per-zone", severity: "error", msg: "gfx.zone-missing", params: { character: ch.name || ch.id, palette: lost }, target: { tab: "characters", character: ch.id } });
    }
  }
  if (zonesOk) out.push({ id: "gfx.colors-per-zone", severity: "ok", msg: "gfx.colors-per-zone.ok", params: { max: board.colors.perPalette } });
  // board colors
  const off = new Set<string>();
  for (const pal of p.palettes) for (const c of pal.colors) if (!isBoardColor(c)) off.add(c);
  for (const ch of p.characters) for (const c of ch.swapColors ?? []) if (!isBoardColor(c)) off.add(c);
  out.push(off.size ? { id: "gfx.board-colors", severity: "warning", msg: "gfx.board-colors", params: { n: off.size }, fix: "snap-colors" } : { id: "gfx.board-colors", severity: "ok", msg: "gfx.board-colors.ok", params: {} });
  // graphics ROM
  const g = meter("graphics");
  const mb = (v: number) => Math.round((v / 1048576) * 100) / 100;
  out.push({ id: "gfx.rom-space", severity: g.used > g.max ? "error" : "ok", msg: g.used > g.max ? "gfx.rom-space" : "gfx.rom-space.ok", params: { used: mb(g.used), max: mb(g.max) } });
  // sprites on one screen
  const s = meter("sprites");
  out.push({ id: "level.enemies-per-screen", severity: s.used > s.max ? "warning" : "ok", msg: s.used > s.max ? "level.sprites" : "level.sprites.ok", params: { n: s.used, max: s.max } });
  return out;
}

/** Levels that have ladders (heroes then need a climb animation). */
function ladderLevel(p: Project): Level | undefined {
  return p.levels.find((l) => {
    try {
      return tagGrid(l).cells.includes(TAG_NUMBER.ladder);
    } catch {
      return false;
    }
  });
}

function animChecks(p: Project): Check[] {
  const out: Check[] = [];
  let ok = true;
  const ladders = ladderLevel(p);
  for (const ch of p.characters) {
    const who = ch.name || ch.id;
    const target: Target = { tab: "characters", character: ch.id };
    const has = (a: string) => (ch.anims?.[a]?.frames?.length ?? 0) > 0;
    for (const a of REQUIRED_ANIMS[ch.role] ?? ["idle"])
      if (!has(a)) {
        ok = false;
        out.push({ id: "anim.required", severity: "error", msg: "anim.required", params: { character: who, anim: a }, target });
      }
    if (ch.role === "hero" && ladders && !has("climb")) out.push({ id: "anim.required", severity: "warning", msg: "anim.climb", params: { character: who, level: ladders.name || ladders.id }, target });
    const frames = new Set(ch.frames.map((f) => f.id));
    for (const [name, anim] of Object.entries(ch.anims ?? {})) {
      const lost = (anim.frames ?? []).find((f) => !frames.has(f));
      if (lost) {
        ok = false;
        out.push({ id: "anim.frames", severity: "error", msg: "anim.frames", params: { character: who, anim: name, frame: lost }, target });
      }
    }
    if (ch.frames.length && !ch.sheet) out.push({ id: "anim.sheet", severity: "warning", msg: "anim.sheet", params: { character: who }, target });
  }
  if (ok && p.characters.length) out.push({ id: "anim.required", severity: "ok", msg: "anim.required.ok", params: { n: p.characters.length } });
  return out;
}

const RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2, ok: 3 };

/**
 * Reviews a project: every rule, errors first. `extra` adds rules from
 * other parts of the module (their checks join the same list).
 */
export function reviewProject(p: Project, opts: { board?: BoardProfile; extra?: Rule[] } = {}): Review {
  const board = opts.board ?? boardOf(p);
  const checks = [...levelChecks(p, board), ...nameChecks(p), ...gameChecks(p, board), ...animChecks(p), ...graphicsChecks(p, board), ...safely(() => tileGridChecks(p, board)), ...safely(() => spriteChecks(p, board)), ...safely(() => programChecks(p, board)), ...safely(() => supportChecks(p))];
  for (const rule of opts.extra ?? []) {
    try {
      checks.push(...rule(p, board));
    } catch {
      // a broken extra rule never hides the others
    }
  }
  return finish(checks);
}

function safely(rule: () => Check[]): Check[] {
  try {
    return rule();
  } catch {
    return [];
  }
}

/** Sorts checks into a review: errors, warnings, info, then the passed ones, each in rule order. */
function finish(checks: Check[]): Review {
  const sorted = checks.map((c, i) => [c, i] as const).sort((a, b) => RANK[a[0].severity] - RANK[b[0].severity] || a[1] - b[1]).map(([c]) => c);
  const errors = sorted.filter((c) => c.severity === "error").length;
  const warnings = sorted.filter((c) => c.severity === "warning").length;
  return { checks: sorted, errors, warnings, ready: errors === 0 };
}

/**
 * Adds later checks (the picture checks) to a review. A rule that reports
 * again replaces its "ok" line from before.
 */
export function mergeReview(base: Review, more: Check[], checking = false): Review {
  const ids = new Set(more.map((c) => c.id));
  const kept = base.checks.filter((c) => !(c.severity === "ok" && ids.has(c.id) && more.some((m) => m.id === c.id && m.severity !== "ok")));
  const r = finish([...kept, ...more]);
  return checking ? { ...r, checking, ready: false } : r;
}

function defaultButtons(buttons: number): Record<string, string> {
  return { b1: "jump", b2: "fire", b3: buttons < 3 ? "b1+b2" : "special" };
}

/** Makes a fix's change on the project (inside an undoable edit). Returns false when it did nothing. */
export function applyFix(p: Project, fix: FixId, board: BoardProfile = boardOf(p)): boolean {
  const before = JSON.stringify(p);
  const layout = layoutOf(p);
  switch (fix) {
    case "snap-colors":
      for (const pal of p.palettes) pal.colors = pal.colors.map((c) => (isBoardColor(c) ? c : snapColor(c)));
      for (const ch of p.characters) if (Array.isArray(ch.swapColors)) ch.swapColors = ch.swapColors.map((c) => (isBoardColor(c) ? c : snapColor(c)));
      break;
    case "buttons":
      Object.assign(p.settings.buttons, defaultButtons(layout.buttons));
      break;
    case "players":
      p.settings.players = Math.min(layout.players, Math.max(1, Math.round(Number(p.settings.players) || 1)));
      break;
    case "level-order": {
      const ids = p.levels.map((l) => l.id);
      const kept = [...new Set((p.settings.levels ?? []).filter((id) => ids.includes(id)))];
      p.settings.levels = [...kept, ...ids.filter((id) => !kept.includes(id))];
      break;
    }
    case "title":
      p.title = boardTitle(p.title, board);
      break;
    case "tile-range":
      clearTilesOutOfRange(p);
      break;
    case "pivots":
      clampPivots(p);
      break;
    case "names":
      for (const level of p.levels) {
        let items;
        try {
          items = objectLayer(level).items;
        } catch {
          continue;
        }
        const used = new Set<string>();
        for (const o of items) {
          let base = String(o.name ?? "")
            .replace(/[^A-Za-z0-9_]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 28);
          if (!base) base = String(o.type || "object");
          let name = base;
          for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
          used.add(name);
          o.name = name;
        }
      }
      break;
  }
  return JSON.stringify(p) !== before;
}

/** The text of a check in one language's export messages. */
export function checkText(m: ExportMessages, c: Check): string {
  const fn = (m.checks as Record<string, ((p: Params) => string) | undefined>)[c.msg];
  if (!fn) return c.texts?.[m.lang] ?? c.texts?.en ?? c.msg;
  const action = c.params.action;
  return fn(typeof action === "string" && m.actions[action] ? { ...c.params, action: m.actions[action]! } : c.params);
}
