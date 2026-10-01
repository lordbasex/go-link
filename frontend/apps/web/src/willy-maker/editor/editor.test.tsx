// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { CPS1, snapColor } from "../board/cps1";
import {
  decodeCells,
  encodeCells,
  layerGrid,
  migrateProject,
  newLevel,
  newProject,
  objectLayer,
  tagGrid,
  TAG_NUMBER,
  uniqueName,
  type TileLayer,
} from "../model";
import { buenosAiresLevel } from "../templates/buenosAires";
import { projectFromTemplate } from "../templates";
import { CITY } from "../templates/tiles";
import { applyAutoArt } from "./autoArt";
import { reachability } from "./reach";
import { cellsCommand, EditorStore } from "./store";
import { Stroke } from "./ops";

describe("cells", () => {
  it("round-trips run-length data", () => {
    const cells = new Uint16Array([0, 0, 0, 3, 3, 1, 0, 7, 7, 7, 7]);
    const s = encodeCells(cells);
    expect(s).toBe("rle:0*3,3*2,1,0,7*4");
    expect([...decodeCells(s, cells.length)]).toEqual([...cells]);
  });
  it("pads and trims to the cell count", () => {
    expect([...decodeCells("rle:5*2", 4)]).toEqual([5, 5, 0, 0]);
    expect([...decodeCells("rle:5*9", 3)]).toEqual([5, 5, 5]);
    expect([...decodeCells("junk", 2)]).toEqual([0, 0]);
  });
});

describe("model", () => {
  it("makes a level with a floor, starts and an exit", () => {
    const level = newLevel({ name: "Test", w: 384, h: 224, players: 2 });
    const g = tagGrid(level);
    expect(g.cols).toBe(24);
    expect(g.rows).toBe(14);
    expect(g.get(0, 13)).toBe(TAG_NUMBER.solid);
    expect(g.get(0, 11)).toBe(TAG_NUMBER.air);
    expect(objectLayer(level).items.map((o) => o.name)).toEqual(["p1_start", "p2_start", "exit"]);
  });
  it("gives a project the layout's buttons", () => {
    expect(newProject({ title: "A", layout: "slammast" }).settings.buttons.b3).toBe("special");
    expect(newProject({ title: "A", layout: "captcomm" }).settings.buttons.b3).toBe("b1+b2");
  });
  it("migrates and keeps unknown fields", () => {
    const p = newProject({ title: "Keep" }) as Record<string, unknown>;
    p.futureThing = { a: 1 };
    const back = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(back.futureThing).toEqual({ a: 1 });
    expect(back.levels).toHaveLength(1);
  });
  it("refuses what is not a project", () => {
    expect(() => migrateProject({})).toThrow();
    expect(() => migrateProject({ format: 99, id: "x", levels: [] })).toThrow(/newer/);
  });
  it("finds unique reference names", () => {
    const level = newLevel({ name: "T", players: 1 });
    expect(uniqueName(level, "exit")).toBe("exit_2");
    expect(uniqueName(level, "crate dock")).toBe("crate_dock");
  });
});

describe("board", () => {
  it("snaps colors to multiples of 17", () => {
    expect(snapColor("#3456AB")).toBe("#3355AA");
    expect(snapColor("#FFFFFF")).toBe("#FFFFFF");
  });
  it("measures the starter project within the CPS-1 limits", () => {
    const p = projectFromTemplate("buenos-aires", { title: "BA", layout: "slammast", players: 4 });
    const meters = CPS1.meters(p);
    const by = Object.fromEntries(meters.map((m) => [m.id, m]));
    expect(by.playPalettes!.used).toBe(1);
    expect(by.colors!.used).toBeLessThanOrEqual(15);
    expect(by.graphics!.used).toBe(31 * 128 + 12 * 512);
    expect(meters.every((m) => m.level !== "over")).toBe(true);
  });
  it("flags a palette with too many colors", () => {
    const p = newProject({ title: "x" });
    p.palettes.push({ id: "big", group: "sprite", colors: new Array(17).fill("#000000") });
    expect(CPS1.meters(p).find((m) => m.id === "colors")!.level).toBe("over");
  });
});

describe("store", () => {
  it("undoes and redoes level edits and cell commands", () => {
    const store = new EditorStore(newProject({ title: "U" }));
    const level = store.project.levels[0]!;
    store.editLevel("rename", level.id, (l) => (l.name = "Renamed"));
    expect(store.project.levels[0]!.name).toBe("Renamed");
    const before = tagGrid(store.project.levels[0]!).get(3, 3);
    store.run(cellsCommand("paint", level.id, [{ layerId: "collision", changes: [[3 * 96 + 3, before, TAG_NUMBER.ladder]] }]));
    expect(tagGrid(store.project.levels[0]!).get(3, 3)).toBe(TAG_NUMBER.ladder);
    expect(store.undo()).toBe(true);
    expect(tagGrid(store.project.levels[0]!).get(3, 3)).toBe(before);
    expect(store.undo()).toBe(true);
    expect(store.project.levels[0]!.name).toBe("Level 1");
    expect(store.undo()).toBe(false);
    store.redo();
    store.redo();
    expect(store.project.levels[0]!.name).toBe("Renamed");
    expect(tagGrid(store.project.levels[0]!).get(3, 3)).toBe(TAG_NUMBER.ladder);
  });
  it("cancels a stroke a pinch interrupted, leaving no undo step", () => {
    const store = new EditorStore(newProject({ title: "P" }));
    const level = store.project.levels[0]!;
    const before = [tagGrid(level).get(3, 3), tagGrid(level).get(4, 3)];
    const stroke = new Stroke(store, level.id, "collision", TAG_NUMBER.ladder, true, "paint");
    stroke.paint(3, 3, 4, 3);
    expect(tagGrid(store.project.levels[0]!).get(3, 3)).toBe(TAG_NUMBER.ladder);
    stroke.cancel();
    stroke.end();
    expect([tagGrid(store.project.levels[0]!).get(3, 3), tagGrid(store.project.levels[0]!).get(4, 3)]).toEqual(before);
    expect(store.canUndo).toBe(false);
  });
  it("tells listeners about changes", () => {
    const store = new EditorStore(newProject({ title: "L" }));
    let saved = 0;
    store.onChange(() => saved++);
    store.editProject("title", (p) => (p.title = "New"));
    store.editProject("same", (p) => (p.title = "New"));
    expect(saved).toBe(1);
  });
});

describe("auto art", () => {
  it("paints street, platforms, ladders and crate quarters", () => {
    const level = newLevel({ name: "A", w: 384, h: 224, floor: true });
    const tags = tagGrid(level);
    const play = layerGrid(level, level.layers.find((l): l is TileLayer => l.id === "play")!);
    tags.set(4, 6, TAG_NUMBER.oneway);
    tags.set(5, 6, TAG_NUMBER.oneway);
    tags.set(8, 8, TAG_NUMBER.ladder);
    for (const [c, r] of [[10, 10], [11, 10], [10, 11], [11, 11]] as const) tags.set(c, r, TAG_NUMBER.crate);
    applyAutoArt(tags, play, 0, 0, tags.cols - 1, tags.rows - 1);
    expect(play.get(0, 12)).toBe(CITY.solid_top);
    expect(play.get(4, 6)).toBe(CITY.oneway_support);
    expect(play.get(5, 6)).toBe(CITY.oneway);
    expect(play.get(8, 8)).toBe(CITY.ladder);
    expect([play.get(10, 10), play.get(11, 10), play.get(10, 11), play.get(11, 11)]).toEqual([CITY.crate_tl, CITY.crate_tr, CITY.crate_bl, CITY.crate_br]);
  });
  it("leaves hand-placed art alone", () => {
    const level = newLevel({ name: "A", w: 384, h: 224 });
    const tags = tagGrid(level);
    const play = layerGrid(level, level.layers.find((l): l is TileLayer => l.id === "play")!);
    play.set(2, 5, CITY.lamp_head);
    tags.set(2, 5, TAG_NUMBER.solid);
    applyAutoArt(tags, play, 2, 5, 2, 5);
    expect(play.get(2, 5)).toBe(CITY.lamp_head);
  });
});

describe("reachability", () => {
  const ledgeLevel = (rows: number) => {
    const level = newLevel({ name: "R", w: 384, h: 224, players: 1 });
    const g = tagGrid(level);
    // floor top is row 12; a ledge `rows` cells above the floor
    for (let c = 10; c <= 14; c++) g.set(c, 12 - rows, TAG_NUMBER.oneway);
    g.commit();
    return level;
  };
  it("reaches a ledge 64 px up with a jump", () => {
    expect(reachability(ledgeLevel(4)).ledges).toEqual([]);
  });
  it("warns about a ledge 96 px up", () => {
    const r = reachability(ledgeLevel(6));
    expect(r.ledges).toHaveLength(1);
    expect(r.ledges[0]!.rise).toBe(96);
    expect(r.ledges[0]!.x0).toBe(160);
  });
  it("reaches it with a ladder", () => {
    const level = ledgeLevel(6);
    const g = tagGrid(level);
    for (let r = 6; r <= 11; r++) g.set(9, r, TAG_NUMBER.ladder);
    g.commit();
    expect(reachability(level).ledges).toEqual([]);
  });
  it("reaches it with a crate stair", () => {
    const level = ledgeLevel(6);
    const g = tagGrid(level);
    for (const [c, r] of [[6, 10], [7, 10], [6, 11], [7, 11]] as const) g.set(c, r, TAG_NUMBER.crate);
    g.commit();
    expect(reachability(level).ledges).toEqual([]);
  });
  it("says when the exit cannot be reached", () => {
    const level = newLevel({ name: "R", w: 384, h: 224, players: 1 });
    const g = tagGrid(level);
    for (let r = 0; r < 12; r++) g.set(16, r, TAG_NUMBER.solid); // a wall to the ceiling
    g.commit();
    expect(reachability(level).objects.map((o) => o.name)).toEqual(["exit"]);
  });
  it("the Buenos Aires template can be played to the end", () => {
    const r = reachability(buenosAiresLevel(4));
    expect(r.objects).toEqual([]);
    expect(r.ledges).toEqual([]);
  });
});
