// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { cloneProject, newLevel, newProject, objectLayer, tagGrid, TAG_NUMBER, type Character, type Project } from "../../model";
import { projectFromTemplate } from "../../templates";
import { CPS1, ENGINE_USE } from "../../board/cps1";
import { exportEn } from "../../i18n/export.en";
import { exportEs } from "../../i18n/export.es";
import { exportPt } from "../../i18n/export.pt";
import { applyFix, boardTitle, checkText, reviewProject, type Check } from ".";
import { checkOfIssue, EXTRA_RULES } from "./extra";

const base = () => newProject({ title: "Dead Air", players: 1 });
const errorsOf = (p: Project) => reviewProject(p).checks.filter((c) => c.severity === "error");
const has = (p: Project, msg: string) => reviewProject(p).checks.find((c) => c.msg === msg);

function hero(over: Partial<Character> = {}): Character {
  const frame = (id: string) => ({ id, x: 0, y: 0, w: 32, h: 44, px: 16, py: 43, zones: ["pal-a"], muzzle: null, hand: null });
  return {
    id: "willy",
    name: "Willy",
    role: "hero",
    height: 44,
    sheet: null,
    frames: [frame("idle_0"), frame("walk_0"), frame("jump_0")],
    anims: { idle: { frames: ["idle_0"], fps: 6, loop: true }, walk: { frames: ["walk_0"], fps: 12, loop: true }, jump: { frames: ["jump_0"], fps: 10, loop: false } },
    swapColors: [],
    ...over,
  };
}

describe("review: a new project", () => {
  it("passes with no errors, and lists what passed", () => {
    const r = reviewProject(base());
    expect(r.errors).toBe(0);
    expect(r.ready).toBe(true);
    const ok = r.checks.filter((c) => c.severity === "ok").map((c) => c.msg);
    expect(ok).toEqual(expect.arrayContaining(["level.start.ok", "level.reachable.ok", "gfx.board-colors.ok", "gfx.rom-space.ok", "game.controls.ok", "names.ok"]));
  });
  it("passes for both templates", () => {
    for (const id of ["buenos-aires", "empty"] as const) {
      const p = projectFromTemplate(id, { title: "Dead Air", layout: "slammast", players: 4 });
      expect(errorsOf(p).map((c) => c.msg)).toEqual([]);
    }
  });
  it("puts errors first, then warnings, then the passed checks", () => {
    const p = base();
    p.settings.buttons.b2 = "jump";
    p.palettes.push({ id: "pal-x", group: "sprite", colors: ["#123456"] });
    const sev = reviewProject(p).checks.map((c) => c.severity);
    const rank = { error: 0, warning: 1, info: 2, ok: 3 } as const;
    expect(sev.map((s) => rank[s])).toEqual([...sev.map((s) => rank[s])].sort());
  });
});

describe("review: levels", () => {
  it("needs a player 1 start and an exit", () => {
    const p = base();
    const items = objectLayer(p.levels[0]!).items;
    items.splice(0, items.length);
    const msgs = errorsOf(p).map((c) => c.msg);
    expect(msgs).toContain("level.start");
    expect(msgs).toContain("level.exit");
    expect(reviewProject(p).ready).toBe(false);
  });
  it("refuses two starts for one player and warns about missing extra starts", () => {
    const p = newProject({ title: "A", players: 2 });
    const items = objectLayer(p.levels[0]!).items;
    items.splice(items.findIndex((o) => o.name === "p2_start"), 1);
    expect(has(p, "level.start-extra")?.severity).toBe("warning");
    items.push({ name: "p1_again", type: "player_start", x: 80, y: 192, player: 1 });
    expect(has(p, "level.start-many")?.target).toMatchObject({ tab: "build", object: "p1_again" });
  });
  it("finds an exit nobody reaches, and points at it", () => {
    const p = base();
    const level = p.levels[0]!;
    const g = tagGrid(level);
    // a wall the whole height, in the middle
    for (let r = 0; r < g.rows; r++) g.set(40, r, TAG_NUMBER.solid);
    g.commit();
    const c = has(p, "level.reachable")!;
    expect(c.severity).toBe("error");
    expect(c.target).toMatchObject({ tab: "build", level: level.id, object: "exit" });
  });
  it("warns about a ledge out of reach", () => {
    const p = base();
    const g = tagGrid(p.levels[0]!);
    for (let c = 20; c < 26; c++) g.set(c, 3, TAG_NUMBER.solid);
    g.commit();
    expect(has(p, "level.ledge")?.severity).toBe("warning");
  });
  it("checks the level size against the board's map", () => {
    const p = base();
    p.levels[0]!.size = { w: 20000, h: 224 };
    expect(has(p, "level.width")?.params).toMatchObject({ maxW: CPS1.levels.maxW });
    p.levels[0]!.size = { w: 320, h: 224 };
    expect(has(p, "level.small")?.severity).toBe("error");
  });
  it("needs the required object properties", () => {
    const p = base();
    objectLayer(p.levels[0]!).items.push({ name: "trooper_1", type: "enemy", x: 200, y: 192 }, { name: "box", type: "pickup", x: 220, y: 192, item: "" });
    const fields = errorsOf(p).filter((c) => c.msg === "level.object-field").map((c) => c.params.field);
    expect(fields).toEqual(["kind", "item"]);
  });
});

describe("review: names", () => {
  it("finds repeated and invalid names, and the fix renames them", () => {
    const p = base();
    const items = objectLayer(p.levels[0]!).items;
    items.push({ name: "exit", type: "checkpoint", x: 100, y: 192 }, { name: "bad name!", type: "checkpoint", x: 120, y: 192 });
    const c = has(p, "names.objects")!;
    expect(c.params.n).toBe(2);
    expect(c.fix).toBe("names");
    expect(applyFix(p, "names")).toBe(true);
    expect(items.map((o) => o.name)).toEqual(["p1_start", "exit", "exit_2", "bad_name"]);
    expect(has(p, "names.objects")).toBeUndefined();
  });
  it("finds two characters with one id", () => {
    const p = base();
    p.characters.push(hero(), hero());
    expect(has(p, "names.characters")?.severity).toBe("error");
  });
});

describe("review: game settings", () => {
  it("finds a shared button and an action without one, and resets them", () => {
    const p = base();
    p.settings.buttons.b2 = "jump";
    const msgs = errorsOf(p).map((c) => c.msg);
    expect(msgs).toContain("game.buttons-shared");
    expect(msgs).toContain("game.buttons-missing");
    applyFix(p, "buttons");
    expect(p.settings.buttons).toMatchObject({ b1: "jump", b2: "fire", b3: "special" });
    expect(has(p, "game.controls.ok")).toBeDefined();
  });
  it("asks for the 1 + 2 combination on a 2-button layout", () => {
    const p = newProject({ title: "A", layout: "captcomm", players: 1 });
    expect(errorsOf(p)).toEqual([]);
    p.settings.buttons.b3 = "special";
    expect(has(p, "game.buttons-combo")?.severity).toBe("error");
  });
  it("checks the title against the board's font, and the fix makes it fit", () => {
    const p = base();
    p.title = "Zoë Über ★";
    expect(has(p, "game.title-chars")?.params.chars).toBe("Ë Ü ★");
    applyFix(p, "title");
    expect(p.title).toBe("Zoe Uber");
    expect(has(p, "game.title.ok")).toBeDefined();
    expect(boardTitle("x".repeat(40), CPS1)).toHaveLength(24);
  });
  it("repairs the play order", () => {
    const p = base();
    p.levels.push(newLevel({ id: "level-2", name: "Two" }));
    p.settings.levels = ["gone", "level-1"];
    expect(has(p, "game.level-order")?.fix).toBe("level-order");
    applyFix(p, "level-order");
    expect(p.settings.levels).toEqual(["level-1", "level-2"]);
  });
  it("notes that the built-in Willy is used without a hero", () => {
    expect(has(base(), "game.hero")?.severity).toBe("info");
  });
});

describe("review: characters and graphics", () => {
  it("needs idle, walk and jump, and warns about climbing when a level has ladders", () => {
    const p = base();
    p.palettes.push({ id: "pal-a", group: "sprite", colors: ["#000000"] });
    p.characters.push(hero({ anims: { idle: { frames: ["idle_0"], fps: 6, loop: true } } }));
    expect(errorsOf(p).filter((c) => c.msg === "anim.required").map((c) => c.params.anim)).toEqual(["walk", "jump"]);
    p.characters[0] = hero();
    expect(has(p, "anim.climb")).toBeUndefined();
    const g = tagGrid(p.levels[0]!);
    g.set(5, 10, TAG_NUMBER.ladder);
    g.commit();
    expect(has(p, "anim.climb")).toMatchObject({ severity: "warning", target: { tab: "characters", character: "willy" } });
  });
  it("finds an animation frame that does not exist", () => {
    const p = base();
    p.palettes.push({ id: "pal-a", group: "sprite", colors: ["#000000"] });
    const ch = hero();
    ch.anims.walk!.frames.push("walk_9");
    p.characters.push(ch);
    expect(has(p, "anim.frames")?.params.frame).toBe("walk_9");
  });
  it("counts sprite palettes and colors per zone", () => {
    const p = base();
    for (let i = 0; i < 33; i++) p.palettes.push({ id: `pal-${i}`, group: "sprite", colors: ["#000000"] });
    expect(has(p, "gfx.palettes")?.params).toMatchObject({ n: 33, max: 32 });
    const q = base();
    q.palettes.push({ id: "pal-torso", group: "sprite", colors: Array.from({ length: 17 }, (_, i) => `#${(i * 17).toString(16).padStart(2, "0").repeat(3)}`.toUpperCase()) });
    expect(has(q, "gfx.colors-per-zone")?.params).toMatchObject({ palette: "pal-torso", n: 17, max: 15 });
    // the engine's own sprite palettes count too (T-27)
    expect(has(q, "gfx.palettes.ok")?.params).toMatchObject({ n: 1 + ENGINE_USE.spritePalettes, max: 32 });
    // with the engine's, 8 palettes of the game's own go over: a warning, not an error
    const r = newProject({ title: "x" });
    for (let i = 0; i < 8; i++) r.palettes.push({ id: `own-${i}`, group: "sprite", colors: ["#000000"] });
    expect(has(r, "gfx.palettes")).toMatchObject({ severity: "warning", params: { n: 8 + ENGINE_USE.spritePalettes, max: 32 } });
  });
  it("snaps colors that are not on the board", () => {
    const p = base();
    p.palettes.push({ id: "pal-x", group: "sprite", colors: ["#123456", "#FFCC99"] });
    const c = has(p, "gfx.board-colors")!;
    expect(c).toMatchObject({ severity: "warning", fix: "snap-colors", params: { n: 1 } });
    applyFix(p, "snap-colors");
    expect(p.palettes[0]!.colors).toEqual(["#113355", "#FFCC99"]);
    expect(has(p, "gfx.board-colors.ok")).toBeDefined();
  });
  it("compares the graphics with the 6 MB ROM", () => {
    const p = base();
    p.tilesets.push({ id: "huge", tile: 16, image: null, palettes: [], columns: 8, count: 60000 });
    expect(has(p, "gfx.rom-space")).toMatchObject({ severity: "error" });
  });
});

describe("review: messages", () => {
  it("has a message in every language for every check the rules can make", () => {
    const p = base();
    const keys = new Set(Object.keys(exportEn.checks));
    expect(Object.keys(exportEs.checks).sort()).toEqual([...keys].sort());
    expect(Object.keys(exportPt.checks).sort()).toEqual([...keys].sort());
    // a project that breaks most rules at once
    const q = cloneProject(p);
    q.title = "";
    q.settings.players = 9;
    q.settings.buttons.b2 = "jump";
    objectLayer(q.levels[0]!).items.push({ name: "e e", type: "enemy", x: 10, y: 10 });
    q.palettes.push({ id: "pal-x", group: "sprite", colors: ["#123456"] });
    for (const c of reviewProject(q).checks) {
      if (c.texts) continue;
      expect(keys.has(c.msg), c.msg).toBe(true);
      for (const m of [exportEn, exportEs, exportPt]) expect(checkText(m, c)).not.toMatch(/undefined|\{|\}/);
    }
  });
  it("translates action names", () => {
    const c: Check = { id: "game.buttons", severity: "error", msg: "game.buttons-missing", params: { action: "special" } };
    expect(checkText(exportEn, c)).toBe("Special has no button.");
    expect(checkText(exportEs, c)).toBe(exportEs.checks["game.buttons-missing"]({ action: exportEs.actions.special! }));
  });
  it("brings the Game and Menus issues in, in every language", () => {
    const c = checkOfIssue({ id: "game.menus", severity: "warning", key: "empty", params: { screen: "gameOver" }, target: { tab: "menus", screen: "gameOver", field: "heading" } });
    expect(c.target).toEqual({ tab: "menus", screen: "gameOver", field: "heading", player: undefined });
    for (const m of [exportEn, exportEs, exportPt]) expect(checkText(m, c)).toBe(c.texts![m.lang]);
    const p = base();
    p.settings.players = 9;
    const r = reviewProject(p, { extra: EXTRA_RULES });
    expect(r.checks.filter((x) => x.id === "game.players")).toHaveLength(1);
  });
  it("keeps going when an extra rule throws", () => {
    const r = reviewProject(base(), {
      extra: [
        () => {
          throw new Error("boom");
        },
      ],
    });
    expect(r.ready).toBe(true);
  });
});
