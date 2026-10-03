// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { objectLayer, tagGrid, TAG_NUMBER } from "../model";
import { projectFromTemplate } from "../templates";
import { reachability } from "./reach";

describe("moving platforms in the reach search", () => {
  it("count their whole track as a ledge, so a level built around them is reachable", () => {
    const p = projectFromTemplate("empty", { title: "T", layout: "slammast", players: 1, levelName: "L", screens: 2, height: 448 });
    const level = p.levels[0]!;
    const g = tagGrid(level);
    // a high shelf no jump reaches from the floor
    for (let c = 30; c < 36; c++) g.set(c, 12, TAG_NUMBER.solid);
    g.commit();
    const objects = objectLayer(level).items;
    const shelf = { name: "civ", type: "civilian" as const, x: 520, y: 192, kind: "woman", trapped_in: "" };
    objects.push(shelf);
    expect(reachability(level).objects.map((o) => o.name)).toContain("civ");
    // a lift from the floor up to the shelf's height, beside it
    objects.push({ name: "lift", type: "platform", x: 440, y: 192, w: 48, axis: "y", range: 208, speed: 1 });
    expect(reachability(level).objects.map((o) => o.name)).not.toContain("civ");
  });
});
