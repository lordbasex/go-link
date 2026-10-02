// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Experiment 1's Game Spec v1 level ("Dead Air", section 1, the docks) built
// in code with the editor's own operations, the same steps a user takes in
// the browser: New game (empty, 2 players, 4 screens, 448 px), tags painted
// with their auto art, objects placed and edited, the Rules card and the
// texts. Tests use it to check Create ROM end to end; the recorded user
// session (docs/experiments/case-c) builds the same level by hand.

import { applyAutoArt } from "../editor/autoArt";
import { layerGrid, objectLayer, tagGrid, TAG_NUMBER, type LevelObject, type Project, type TileLayer } from "../model";
import { projectFromTemplate } from "../templates";
import { SKY } from "../templates/tiles";

/** The spec's numbers, shared with the tests and the clear script. */
export const SPEC = {
  w: 1536,
  h: 448,
  floorY: 416,
  ledge: { c0: 16, c1: 22, row: 22 }, // a one-way ledge 64 px up (feet 352)
  crates: [
    [10, 24],
    [12, 24],
    [12, 22],
  ] as [number, number][],
  ladder: { col: 30, r0: 16, r1: 25 }, // 160 px: the upper dock's floor is y 256
  dock: { c0: 31, c1: 63, row: 16 },
  enemies: [
    { name: "trooper_lower", x: 640, y: 416 },
    { name: "trooper_upper", x: 800, y: 256 },
    { name: "trooper_exit", x: 1360, y: 416 },
  ],
  civilians: [
    { name: "civ_ledge", kind: "woman", x: 320, y: 352 },
    { name: "civ_dock", kind: "child", x: 960, y: 256 },
  ],
  exit: { x: 1440, w: 64, y: 416 },
} as const;

export function specProject(): Project {
  const p = projectFromTemplate("empty", { title: "Willy Gorklingo", layout: "slammast", players: 2, levelName: "Dead Air", screens: 4, height: 448 });
  const level = p.levels[0]!;
  const tags = tagGrid(level);
  const playLayer = level.layers.find((l): l is TileLayer => l.id === "play")!;
  const play = layerGrid(level, playLayer);
  const paint = (c0: number, r0: number, c1: number, r1: number, tag: number) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) tags.set(c, r, tag);
    applyAutoArt(tags, play, c0, r0, c1, r1);
  };
  const items = objectLayer(level).items;
  for (const [c, r] of SPEC.crates) {
    paint(c, r, c + 1, r + 1, TAG_NUMBER.crate);
    items.push({ name: `crate_${items.filter((o) => o.type === "crate").length + 1}`, type: "crate", x: c * 16, y: r * 16, size: 32, hp: 3, contents: "nothing" });
  }
  paint(SPEC.ledge.c0, SPEC.ledge.row, SPEC.ledge.c1, SPEC.ledge.row, TAG_NUMBER.oneway);
  paint(SPEC.ladder.col, SPEC.ladder.r0, SPEC.ladder.col, SPEC.ladder.r1, TAG_NUMBER.ladder);
  paint(SPEC.dock.c0, SPEC.dock.row, SPEC.dock.c1, SPEC.dock.row, TAG_NUMBER.solid);
  tags.commit();
  play.commit();
  // the far layer: a night sky
  const farLayer = level.layers.find((l): l is TileLayer => l.id === "far")!;
  const far = layerGrid(level, farLayer);
  for (let r = 0; r < far.rows; r++) for (let c = 0; c < far.cols; c++) far.set(c, r, [SKY.sky_0, SKY.sky_1, SKY.sky_2, SKY.sky_3, SKY.sky_4, SKY.sky_5][Math.min(5, Math.floor((r / far.rows) * 6))]!);
  far.commit();
  for (const e of SPEC.enemies) items.push({ name: e.name, type: "enemy", x: e.x, y: e.y, kind: "trooper", facing: "left", patrol: 96, hp: 3 } as LevelObject);
  for (const v of SPEC.civilians) items.push({ name: v.name, type: "civilian", x: v.x, y: v.y, kind: v.kind, trapped_in: "" } as LevelObject);
  const exit = items.find((o) => o.type === "exit")!;
  Object.assign(exit, { x: SPEC.exit.x, y: SPEC.exit.y, w: SPEC.exit.w });
  // the rules and the texts of the spec
  p.settings.rules = { enemyHp: 3, enemyScore: 100, rescueScore: 500, touchHurts: true, enemiesChase: false, enemiesShoot: false, exitNeedsEnemies: true, respawnOnHurt: false, hurtFrames: 60 };
  p.settings.dip.lives = 3;
  p.settings.playerSlots = [
    { character: "builtin:willy", variant: 0 },
    { character: "builtin:willy", variant: 1 },
    { character: "builtin:willy", variant: 2 },
    { character: "builtin:willy", variant: 3 },
  ];
  p.settings.credits = "(C) 2026 GO-LINK";
  p.settings.menus.title.texts = { ...(p.settings.menus.title.texts ?? {}), title: "WILLY GORKLINGO", subtitle: "THE LAG PROTOCOL", prompt: "PUSH START" };
  p.settings.menus.title.credits = true;
  p.settings.menus.hud.texts = { ...(p.settings.menus.hud.texts ?? {}), cleared: "SECTION CLEAR" };
  return p;
}
