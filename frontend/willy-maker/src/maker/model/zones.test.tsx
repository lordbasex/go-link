// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { buenosAiresLevel } from "../templates/buenosAires";
import { decodeCells, encodeCells } from "./rle";
import { newLevel, tagLayer } from "./index";
import { applyZones, cleanGroups, cleanZones, nextZoneNumber, OBJECTS_GROUP, tagsFromZones, withZones, ZONES_GROUP, zonesFromTags } from "./zones";
import { TAG_NUMBER, type Level, type Zone } from "./types";

function empty(w = 96, h = 64): Level {
  return newLevel({ id: "l", name: "L", w, h });
}

function cellsOf(level: Level): Uint16Array {
  return decodeCells(tagLayer(level).data, (level.size.w / 16) * (level.size.h / 16));
}

const zone = (z: Partial<Zone>): Zone => ({ id: "z", kind: "floor", n: 1, x: 0, y: 0, w: 16, h: 16, group: ZONES_GROUP, ...z });

describe("zones", () => {
  it("cover the Buenos Aires template's collision cells and draw them back the same", () => {
    const level = buenosAiresLevel();
    const before = tagLayer(level);
    const zones = zonesFromTags(level);
    expect(zones.length).toBeGreaterThan(0);
    // A greedy cover keeps the count far below the number of non-air cells.
    const cells = cellsOf(level);
    expect(zones.length).toBeLessThan(cells.filter((v) => v !== 0).length / 4);
    const after = tagsFromZones({ ...level, zones, groups: cleanGroups(undefined) });
    expect(after.data).toBe(before.data);
    expect(after.props).toEqual(before.props ?? {});
  });

  it("give older levels their zones and both base groups", () => {
    const level = withZones(buenosAiresLevel());
    expect(level.groups!.map((g) => g.base)).toEqual(["objects", "zones"]);
    expect(level.zones!.every((z) => z.group === ZONES_GROUP)).toBe(true);
    const floors = level.zones!.filter((z) => z.kind === "floor").map((z) => z.n);
    expect(floors).toEqual(floors.map((_, i) => i + 1));
  });

  it("draw later zones over earlier ones, and leave hidden zones and groups out of the game", () => {
    const level = empty();
    level.groups = [...cleanGroups(undefined), { id: "g", visible: false, locked: false, open: true }];
    level.zones = [zone({ id: "a", w: 48 }), zone({ id: "b", kind: "hazard", x: 16 }), zone({ id: "c", kind: "ladder", x: 64, hidden: true }), zone({ id: "d", kind: "platform", y: 32, group: "g" })];
    applyZones(level);
    const cells = cellsOf(level);
    expect([...cells.slice(0, 6)]).toEqual([TAG_NUMBER.solid, TAG_NUMBER.hazard, TAG_NUMBER.solid, 0, 0, 0]);
    expect(cells.filter((v) => v === TAG_NUMBER.oneway).length).toBe(0);
  });

  it("keep a breakable zone's hits per cell", () => {
    const level = empty();
    level.groups = cleanGroups(undefined);
    level.zones = [zone({ kind: "breakable", x: 16, y: 16, w: 32, hp: 3 })];
    applyZones(level);
    expect(tagLayer(level).props).toEqual({ "1,1": { hp: 3 }, "2,1": { hp: 3 } });
    expect(zonesFromTags(level)).toEqual([expect.objectContaining({ kind: "breakable", x: 16, y: 16, w: 32, h: 16, hp: 3 })]);
  });

  it("split cells of one kind with different hits into separate zones", () => {
    const level = empty();
    const layer = tagLayer(level);
    const cells = new Uint16Array(6 * 4);
    cells[0] = cells[1] = TAG_NUMBER.breakable;
    layer.data = encodeCells(cells);
    layer.props = { "1,0": { hp: 5 } };
    expect(zonesFromTags(level).map((z) => [z.x, z.w, z.hp])).toEqual([
      [0, 16, undefined],
      [16, 16, 5],
    ]);
  });

  it("clean what a file holds: kinds, grid, bounds, ids and groups", () => {
    const level = empty(96, 64);
    level.groups = cleanGroups(undefined);
    const raw = [
      { id: "a", kind: "floor", x: 7, y: 70, w: 500, h: 3, group: "nope" },
      { id: "a", kind: "platform", x: 32, y: 0, w: 40, h: 16, n: 4, name: "  " },
      { id: "x", kind: "lava", x: 0, y: 0, w: 16, h: 16 },
      "junk",
    ];
    const zones = cleanZones(level, raw);
    expect(zones).toEqual([
      { id: "a", kind: "floor", n: 1, x: 0, y: 48, w: 96, h: 16, group: ZONES_GROUP },
      { id: "a-2", kind: "platform", n: 4, x: 32, y: 0, w: 48, h: 16, group: ZONES_GROUP },
    ]);
  });

  it("keep both base groups, once each, and drop broken groups", () => {
    const groups = cleanGroups([{ id: "g1", name: "Enemies", n: 1, visible: false }, { id: "g1" }, { id: "b", base: "zones", locked: true }, { id: "c", base: "zones" }, 4]);
    expect(groups).toEqual([
      { id: "g1", name: "Enemies", n: 1, visible: false, locked: false, open: true },
      { id: "b", base: "zones", visible: true, locked: true, open: true },
      { id: OBJECTS_GROUP, base: "objects", visible: true, locked: false, open: true },
    ]);
  });

  it("number new zones after the highest of their kind", () => {
    expect(nextZoneNumber([zone({ n: 2 }), zone({ n: 7, kind: "ladder" })], "floor")).toBe(3);
    expect(nextZoneNumber([], "hazard")).toBe(1);
  });
});
