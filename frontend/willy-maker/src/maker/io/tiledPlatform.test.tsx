// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { expect, it } from "vitest";
import { objectLayer } from "../model";
import { projectFromTemplate } from "../templates";
import { levelFromTiled } from "./tiled";
import { levelToTiled } from "./tiledExport";

it("keeps a moving platform's width, track and speed through Tiled", () => {
  const p = projectFromTemplate("empty", { title: "T", layout: "slammast", players: 1, levelName: "L", screens: 2, height: 448 });
  objectLayer(p.levels[0]!).items.push({ name: "lift", type: "platform", x: 200, y: 320, w: 64, axis: "y", range: 80, speed: 2 });
  const back = levelFromTiled(JSON.stringify(levelToTiled(p.levels[0]!, p, { collisionTileset: "c.png" })), "map.tmj");
  expect(objectLayer(back).items.find((o) => o.name === "lift")).toMatchObject({ type: "platform", x: 200, y: 320, w: 64, axis: "y", range: 80, speed: 2 });
});
