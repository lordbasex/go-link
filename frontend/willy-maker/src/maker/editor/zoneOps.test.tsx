// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { cleanGroups, decodeCells, objectVisible, newProject, objectLayer, reconcileZones, tagLayer, TAG_NUMBER, type Level, type Project } from "../model";
import { projectFromTemplate } from "../templates";
import { partById } from "./parts";
import { EditorStore } from "./store";
import { addGroup, addZone, changeObjectPart, deleteGroup, groupItem, groupMembers, moveGroup, moveToGroup, patchGroup, patchItem, setGroupOpen, ungroup, clearBackground, duplicateItem, findObject, findZone, flipObject, LiveEdit, patchZone, placeObject, removeItem, targetGroup } from "./zoneOps";

function blank(): { store: EditorStore; level: () => Level } {
  const p: Project = newProject({ title: "Zones", players: 2 });
  const l = p.levels[0]!;
  objectLayer(l).items.length = 0;
  tagLayer(l).data = "rle:";
  l.groups = cleanGroups(undefined);
  l.zones = [];
  const store = new EditorStore(p);
  return { store, level: () => store.project.levels[0]! };
}

const cellAt = (l: Level, x: number, y: number) => decodeCells(tagLayer(l).data, (l.size.w / 16) * (l.size.h / 16))[(y / 16) * (l.size.w / 16) + x / 16];

describe("zone and object edits", () => {
  it("draw a zone into the collision layer, and undo takes both away", () => {
    const { store, level } = blank();
    const id = addZone(store, "level-1", { kind: "floor", x: 32, y: 192, w: 64, h: 32, group: "group-zones" }, "Draw zone");
    expect(findZone(level(), id)).toMatchObject({ kind: "floor", n: 1 });
    expect(cellAt(level(), 32, 192)).toBe(TAG_NUMBER.solid);
    expect(cellAt(level(), 96, 192)).toBe(0);
    store.undo();
    expect(level().zones).toEqual([]);
    expect(cellAt(level(), 32, 192)).toBe(0);
    store.redo();
    expect(cellAt(level(), 80, 208)).toBe(TAG_NUMBER.solid);
  });

  it("change a zone's kind with its next number, and keep hits only on breakables", () => {
    const { store, level } = blank();
    addZone(store, "level-1", { kind: "floor", x: 0, y: 0, w: 16, h: 16, group: "group-zones" }, "a");
    const b = addZone(store, "level-1", { kind: "breakable", x: 16, y: 0, w: 16, h: 16, group: "group-zones" }, "b");
    patchZone(store, "level-1", b, { hp: 4 }, "hp");
    expect(tagLayer(level()).props).toEqual({ "1,0": { hp: 4 } });
    patchZone(store, "level-1", b, { kind: "floor" }, "kind");
    expect(findZone(level(), b)).toMatchObject({ kind: "floor", n: 2 });
    expect(findZone(level(), b)!.hp).toBeUndefined();
    expect(tagLayer(level()).props).toBeUndefined();
  });

  it("duplicate two grid steps to the right, and delete", () => {
    const { store, level } = blank();
    const id = addZone(store, "level-1", { kind: "ladder", x: 64, y: 64, w: 16, h: 64, group: "group-zones" }, "a");
    const copy = duplicateItem(store, "level-1", { kind: "zone", id }, 16, "dup");
    expect(copy?.kind).toBe("zone");
    expect(findZone(level(), (copy as { id: string }).id)).toMatchObject({ kind: "ladder", x: 96, n: 2 });
    removeItem(store, "level-1", { kind: "zone", id }, "del");
    expect(level().zones).toHaveLength(1);
    expect(cellAt(level(), 64, 64)).toBe(0);
    expect(cellAt(level(), 96, 64)).toBe(TAG_NUMBER.ladder);
  });

  it("place, change, turn and delete objects; a crate brings its cells", () => {
    const { store, level } = blank();
    const trooper = placeObject(store, "level-1", partById("enemy:trooper") as never, 200, 192, "group-objects", "place");
    expect(findObject(level(), trooper)).toMatchObject({ type: "enemy", kind: "trooper", x: 200, y: 192 });
    expect(findObject(level(), trooper)!.group).toBeUndefined();
    changeObjectPart(store, "level-1", trooper, partById("enemy:spinner") as never, "sprite");
    expect(findObject(level(), trooper)).toMatchObject({ name: trooper, kind: "spinner", x: 200 });
    flipObject(store, "level-1", trooper, "flip");
    expect(findObject(level(), trooper)!.facing).toBe("right");
    const crate = placeObject(store, "level-1", partById("crate:object") as never, 40, 100, "group-objects", "place");
    expect(cellAt(level(), 32, 96)).toBe(TAG_NUMBER.crate);
    expect(cellAt(level(), 48, 112)).toBe(TAG_NUMBER.crate);
    // a crate moves with its cells
    const drag = new LiveEdit(store, "level-1", "move");
    drag.change((l) => void (findObject(l, crate)!.x = 128));
    drag.commit();
    expect(cellAt(level(), 32, 96)).toBe(0);
    expect(cellAt(level(), 128, 96)).toBe(TAG_NUMBER.crate);
    store.undo();
    expect(cellAt(level(), 32, 96)).toBe(TAG_NUMBER.crate);
    removeItem(store, "level-1", { kind: "object", id: crate }, "del");
    expect(cellAt(level(), 32, 96)).toBe(0);
  });

  it("keep one start per player and one exit", () => {
    const { store, level } = blank();
    placeObject(store, "level-1", partById("player_start:p1") as never, 32, 192, "group-objects", "a");
    placeObject(store, "level-1", partById("player_start:p1") as never, 96, 192, "group-objects", "b");
    expect(objectLayer(level()).items.filter((o) => o.type === "player_start")).toEqual([expect.objectContaining({ x: 96, player: 1 })]);
    expect(duplicateItem(store, "level-1", { kind: "object", id: objectLayer(level()).items[0]!.name }, 16, "dup")).toBeNull();
  });

  it("put new items into the active group when it takes them", () => {
    const { level } = blank();
    const l = level();
    l.groups!.unshift({ id: "g1", visible: true, locked: false, open: true, n: 1 });
    expect(targetGroup(l, "zones", "g1")).toBe("g1");
    expect(targetGroup(l, "zones", "group-objects")).toBe("group-zones");
    expect(targetGroup(l, "objects", null)).toBe("group-objects");
  });

  it("a cancelled drag leaves the level as it was", () => {
    const { store, level } = blank();
    const id = addZone(store, "level-1", { kind: "floor", x: 0, y: 0, w: 32, h: 16, group: "group-zones" }, "a");
    const drag = new LiveEdit(store, "level-1", "move");
    drag.change((l) => void (findZone(l, id)!.x = 64));
    expect(findZone(level(), id)!.x).toBe(64);
    drag.cancel();
    expect(findZone(level(), id)!.x).toBe(0);
    expect(cellAt(level(), 0, 0)).toBe(TAG_NUMBER.solid);
  });

  it("removes the background's picture as one step", () => {
    const p = projectFromTemplate("buenos-aires", { title: "BA", layout: "slammast", players: 1 });
    const store = new EditorStore(p);
    const play = () => store.project.levels[0]!.layers.find((x) => x.id === "play")!;
    const before = (play() as { data: string }).data;
    clearBackground(store, "level-1", "remove");
    expect((play() as { data: string }).data).toMatch(/^rle:0\*\d+$/);
    store.undo();
    expect((play() as { data: string }).data).toBe(before);
  });
});

describe("zones and the classic editor", () => {
  it("rebuild the zones when the collision layer was painted elsewhere, and keep them otherwise", () => {
    const { store, level } = blank();
    const id = addZone(store, "level-1", { kind: "floor", x: 0, y: 192, w: 128, h: 32, group: "group-zones" }, "a");
    patchZone(store, "level-1", id, { name: "Street" }, "name");
    const l = level();
    expect(reconcileZones(l)).toBe(false);
    expect(findZone(l, id)!.name).toBe("Street");
    // the classic editor paints a ladder cell
    const layer = tagLayer(l);
    const cells = decodeCells(layer.data, (l.size.w / 16) * (l.size.h / 16));
    cells[3 * (l.size.w / 16) + 5] = TAG_NUMBER.ladder;
    layer.data = `rle:${[...cells].join(",")}`;
    expect(reconcileZones(l)).toBe(true);
    expect(l.zones!.map((z) => z.kind).sort()).toEqual(["floor", "ladder"]);
  });

  it("leave a hidden zone alone (it is not in the game, so not in the cells)", () => {
    const { store, level } = blank();
    const id = addZone(store, "level-1", { kind: "hazard", x: 0, y: 0, w: 32, h: 32, group: "group-zones" }, "a");
    patchZone(store, "level-1", id, { hidden: true }, "hide");
    expect(cellAt(level(), 0, 0)).toBe(0);
    expect(reconcileZones(level())).toBe(false);
    expect(findZone(level(), id)).toBeTruthy();
  });
});

describe("layer groups", () => {
  it("add a group at the top, rename it and bring the automatic name back", () => {
    const { store, level } = blank();
    const id = addGroup(store, "level-1", "new");
    expect(level().groups![0]).toMatchObject({ id, n: 1, visible: true, locked: false, open: true });
    patchGroup(store, "level-1", id, { name: "Rooftops" }, "rename");
    expect(level().groups![0]!.name).toBe("Rooftops");
    patchGroup(store, "level-1", id, { name: "  " }, "rename");
    expect(level().groups![0]!.name).toBeUndefined();
    expect(addGroup(store, "level-1", "new")).not.toBe(id);
    expect(level().groups![0]!.n).toBe(2);
  });

  it("hide a group: its zones leave the collision layer and its objects leave the game", () => {
    const { store, level } = blank();
    const gid = addGroup(store, "level-1", "new");
    const zid = addZone(store, "level-1", { kind: "floor", x: 0, y: 0, w: 32, h: 16, group: gid }, "z");
    const enemy = placeObject(store, "level-1", partById("enemy:trooper") as never, 100, 100, gid, "place");
    expect(findObject(level(), enemy)!.group).toBe(gid);
    expect(cellAt(level(), 0, 0)).toBe(TAG_NUMBER.solid);
    patchGroup(store, "level-1", gid, { visible: false }, "hide");
    expect(cellAt(level(), 0, 0)).toBe(0);
    expect(objectVisible(level(), findObject(level(), enemy)!)).toBe(false);
    store.undo();
    expect(cellAt(level(), 0, 0)).toBe(TAG_NUMBER.solid);
    expect(findZone(level(), zid)).toBeTruthy();
  });

  it("move items between groups, ungroup back to the base groups, and delete a group with its content", () => {
    const { store, level } = blank();
    const zid = addZone(store, "level-1", { kind: "ladder", x: 0, y: 0, w: 16, h: 32, group: "group-zones" }, "z");
    const enemy = placeObject(store, "level-1", partById("enemy:trooper") as never, 100, 100, "group-objects", "place");
    const gid = groupItem(store, "level-1", { kind: "zone", id: zid }, "group");
    moveToGroup(store, "level-1", { kind: "object", id: enemy }, gid, "move");
    expect(groupMembers(level(), gid)).toEqual([
      { kind: "object", id: enemy },
      { kind: "zone", id: zid },
    ]);
    ungroup(store, "level-1", gid, "ungroup");
    expect(level().groups!.some((g) => g.id === gid)).toBe(false);
    expect(findZone(level(), zid)!.group).toBe("group-zones");
    expect(findObject(level(), enemy)!.group).toBeUndefined();
    const g2 = groupItem(store, "level-1", { kind: "zone", id: zid }, "group");
    deleteGroup(store, "level-1", g2, "delete");
    expect(findZone(level(), zid)).toBeUndefined();
    expect(cellAt(level(), 0, 0)).toBe(0);
    // base groups stay
    deleteGroup(store, "level-1", "group-zones", "delete");
    ungroup(store, "level-1", "group-objects", "ungroup");
    expect(level().groups!.map((g) => g.base)).toEqual(["objects", "zones"]);
  });

  it("reorder groups, and open or close one without an undo step", () => {
    const { store, level } = blank();
    const a = addGroup(store, "level-1", "a");
    moveGroup(store, "level-1", a, 1, "down");
    expect(level().groups!.map((g) => g.id)).toEqual(["group-objects", a, "group-zones"]);
    // the first group cannot go higher: no step
    moveGroup(store, "level-1", "group-objects", -1, "up");
    expect(level().groups![0]!.id).toBe("group-objects");
    setGroupOpen(store, "level-1", a, false);
    expect(level().groups![1]!.open).toBe(false);
    // undo takes back the last real step, the move down
    store.undo();
    expect(level().groups!.map((g) => g.id)).toEqual([a, "group-objects", "group-zones"]);
  });

  it("hide, lock and rename items; an object keeps its reference name and gets a label", () => {
    const { store, level } = blank();
    const zid = addZone(store, "level-1", { kind: "hazard", x: 0, y: 0, w: 16, h: 16, group: "group-zones" }, "z");
    const enemy = placeObject(store, "level-1", partById("enemy:trooper") as never, 100, 100, "group-objects", "place");
    patchItem(store, "level-1", { kind: "zone", id: zid }, { name: "Lava", locked: true }, "rename");
    expect(findZone(level(), zid)).toMatchObject({ name: "Lava", locked: true });
    patchItem(store, "level-1", { kind: "object", id: enemy }, { name: "Boss guard", hidden: true }, "rename");
    expect(findObject(level(), enemy)).toMatchObject({ name: enemy, label: "Boss guard", hidden: true });
    patchItem(store, "level-1", { kind: "object", id: enemy }, { name: "", hidden: false }, "rename");
    expect(findObject(level(), enemy)!.label).toBeUndefined();
    expect(findObject(level(), enemy)!.hidden).toBeUndefined();
  });
});
