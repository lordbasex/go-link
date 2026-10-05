// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The "Buenos Aires" template: Mission 1's 8192 × 672 canvas with the five
// sections of docs/rom/art-spec.md, drawn with the prototype's street tiles
// and following its climbing rules (ledges up to 48 px by a jump, 32 px crates climbed
// by a jump, or by pushing with that rule, ladders for anything higher, a way down from every upper
// route). A starting point to edit, not the final mission.

import { CELL, layerGrid, newLevel, objectLayer, tagGrid, TAG_NUMBER, type Level, type LevelObject, type TileLayer } from "../model";
import { CITY, SKY } from "./tiles";

const W = 8192;
const H = 672;
/** The street's top row (y 624). */
const STREET = 39;

export const BUENOS_AIRES_SECTIONS = [
  { name: "Puerto Madero docks", x0: 0, x1: 1536 },
  { name: "The cranes", x0: 1536, x1: 3072 },
  { name: "The tower lobby", x0: 3072, x1: 4608 },
  { name: "The server floors", x0: 4608, x1: 6656 },
  { name: "The rooftop helipad", x0: 6656, x1: 8192 },
];

export function buenosAiresLevel(players = 4): Level {
  const level = newLevel({ id: "level-1", name: "Dead Air", w: W, h: H, floor: false, players: 0 });
  level.sections = BUENOS_AIRES_SECTIONS.map((s) => ({ ...s }));
  // the mission places its own exit on the helipad
  objectLayer(level).items.length = 0;
  const tags = tagGrid(level);
  const playLayer = level.layers.find((l): l is TileLayer => l.id === "play")!;
  const farLayer = level.layers.find((l): l is TileLayer => l.id === "far")!;
  playLayer.tileset = "ts-city";
  farLayer.tileset = "ts-sky";
  const play = layerGrid(level, playLayer);
  const far = layerGrid(level, farLayer);
  const objects = objectLayer(level).items;
  const { solid, oneway, ladder: LADDER, crate: CRATE, breakable, hazard } = TAG_NUMBER;

  const tag = (c0: number, r0: number, c1: number, r1: number, t: number) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) tags.set(c, r, t);
  };
  const tile = (c: number, r: number, n: number) => play.set(c, r, n);
  const obj = (o: LevelObject) => objects.push(o);
  const y = (row: number) => row * CELL;

  // the street, the whole way
  tag(0, STREET, 511, 41, solid);
  for (let c = 0; c < 512; c++) {
    tile(c, STREET, CITY.solid_top);
    tile(c, STREET + 1, c % 2 ? CITY.solid_paint : CITY.solid);
    tile(c, STREET + 2, CITY.solid);
  }

  const platform = (c0: number, c1: number, r: number) => {
    tag(c0, r, c1, r, oneway);
    for (let c = c0; c <= c1; c++) tile(c, r, c % 2 === 0 ? CITY.oneway_support : CITY.oneway);
  };
  const ladder = (c: number, r0: number, r1: number) => {
    tag(c, r0, c, r1, LADDER);
    for (let r = r0; r <= r1; r++) tile(c, r, CITY.ladder);
  };
  const block = (c0: number, r0: number, c1: number, r1: number) => {
    tag(c0, r0, c1, r1, solid);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) tile(c, r, CITY.block);
  };
  let crates = 0;
  const crate = (c: number, rTop: number, contents = "nothing", hp = 2) => {
    tag(c, rTop, c + 1, rTop + 1, CRATE);
    tile(c, rTop, CITY.crate_tl);
    tile(c + 1, rTop, CITY.crate_tr);
    tile(c, rTop + 1, CITY.crate_bl);
    tile(c + 1, rTop + 1, CITY.crate_br);
    obj({ name: `crate_${++crates}`, type: "crate", x: c * CELL, y: y(rTop), size: 32, hp, contents });
  };
  /** A building front: scenery from the roof down, the roof a one-way ledge. */
  const building = (c0: number, c1: number, roof: number) => {
    tag(c0, roof, c1, roof, oneway);
    for (let c = c0; c <= c1; c++) tile(c, roof, c === c0 ? CITY.roof_left : c === c1 ? CITY.roof_right : (c - c0) % 7 === 3 ? CITY.roof_neon : CITY.roof);
    for (let r = roof + 1; r < STREET; r++)
      for (let c = c0; c <= c1; c++) {
        let n: number = CITY.wall;
        if (c === c0) n = CITY.wall_left;
        else if (c === c1) n = CITY.wall_right;
        else if ((c + r) % 2 === 0) n = (c * 7 + r * 13) % 5 < 3 ? CITY.wall_window_warm : (c + r) % 4 === 0 ? CITY.wall_window_cyan : CITY.wall_window_dark;
        tile(c, r, n);
      }
  };
  const lamp = (c: number) => {
    tile(c, STREET - 3, CITY.lamp_head);
    tile(c, STREET - 2, CITY.lamp_post);
    tile(c, STREET - 1, CITY.lamp_base);
  };
  const enemy = (name: string, kind: string, c: number, row: number, patrol = 96, facing = "left") =>
    obj({ name, type: "enemy", x: c * CELL, y: y(row), kind, facing, patrol });
  const civilian = (name: string, kind: string, c: number, row: number) => obj({ name, type: "civilian", x: c * CELL, y: y(row), kind, trapped_in: "" });

  // 1. Puerto Madero docks: the tutorial
  for (let p = 1; p <= players; p++) obj({ name: `p${p}_start`, type: "player_start", x: 32 + p * 24, y: y(STREET), player: p });
  lamp(6);
  tile(18, STREET - 1, CITY.hydrant);
  tile(19, STREET - 1, CITY.bin);
  crate(14, STREET - 2);
  crate(22, STREET - 2);
  crate(24, STREET - 2);
  crate(24, STREET - 4);
  block(26, STREET - 4, 33, STREET - 1); // a container, 64 px tall
  platform(36, 43, STREET - 6); // 32 px above the container
  civilian("civ_docks_1", "woman", 40, STREET - 6);
  enemy("trooper_docks_1", "trooper", 30, STREET - 4, 64);
  lamp(46);
  enemy("trooper_docks_2", "trooper", 52, STREET, 96);
  crate(56, STREET - 2, "bazooka");
  for (let c = 62; c <= 65; c++) {
    tile(c, STREET - 2, CITY.fence_top);
    tile(c, STREET - 1, CITY.fence_bottom);
  }
  civilian("civ_docks_2", "child", 70, STREET);
  lamp(80);
  enemy("trooper_docks_3", "shield_trooper", 86, STREET, 64);
  obj({ name: "checkpoint_cranes", type: "checkpoint", x: 92 * CELL, y: y(STREET) });

  // 2. The cranes: an upper route along the crane arm, the dock below
  building(100, 115, STREET - 8);
  ladder(99, STREET - 8, STREET - 1);
  ladder(111, STREET - 14, STREET - 9);
  platform(112, 160, STREET - 14); // the crane arm, y 400, ending over the next roof
  enemy("spinner_cranes_1", "spinner", 130, STREET - 14, 128);
  civilian("civ_cranes_1", "elder", 145, STREET - 14);
  enemy("spinner_cranes_2", "spinner", 140, STREET, 96);
  building(156, 175, STREET - 10); // the arm drops onto this roof
  crate(170, STREET - 12, "health");
  lamp(180);
  obj({ name: "checkpoint_lobby", type: "checkpoint", x: 188 * CELL, y: y(STREET) });

  // 3. The tower lobby: glass to break, lasers to jump, the armored truck
  tag(200, STREET - 6, 201, STREET - 1, breakable);
  for (let r = STREET - 6; r < STREET; r++) {
    tile(200, r, CITY.breakable);
    tile(201, r, CITY.breakable);
  }
  level.layers.forEach((l) => {
    if (l.kind === "tags") {
      l.props = l.props ?? {};
      for (let r = STREET - 6; r < STREET; r++) for (const c of [200, 201, 282, 283]) l.props[`${c},${r}`] = { hp: 3 };
    }
  });
  tag(214, STREET - 1, 217, STREET - 1, hazard);
  for (let c = 214; c <= 217; c++) tile(c, STREET - 1, CITY.hazard);
  platform(222, 232, STREET - 3); // 48 px: a jump peaks at 61.9 px, so 64 px is out of reach
  civilian("civ_lobby_1", "baby", 228, STREET - 3);
  enemy("trooper_lobby_1", "trooper", 236, STREET, 64);
  obj({ name: "lock_lobby", type: "camera_lock", x: 240 * CELL, y: H - 224, w: 384, h: 224 });
  obj({ name: "boss_truck", type: "boss", x: 258 * CELL, y: y(STREET), kind: "armored_truck", w: 384, h: 224 });
  tag(282, STREET - 6, 283, STREET - 1, breakable);
  for (let r = STREET - 6; r < STREET; r++) {
    tile(282, r, CITY.breakable);
    tile(283, r, CITY.breakable);
  }

  // 4. The server floors: up a ladder, break the floor to drop down
  ladder(291, STREET - 9, STREET - 1);
  block(292, STREET - 9, 340, STREET - 8); // the upper floor, y 480
  tag(318, STREET - 9, 321, STREET - 8, breakable);
  for (let c = 318; c <= 321; c++) {
    tile(c, STREET - 9, CITY.breakable);
    tile(c, STREET - 8, CITY.breakable);
  }
  crate(300, STREET - 11, "civilian", 3);
  civilian("civ_servers_1", "woman", 300, STREET - 9);
  enemy("pinger_servers_1", "pinger", 330, STREET - 9, 96);
  crate(346, STREET - 2);
  crate(348, STREET - 2);
  crate(348, STREET - 4);
  block(350, STREET - 6, 400, STREET - 6); // the lower server floor, y 528
  tag(360, STREET - 1, 365, STREET - 1, hazard); // live cables under it
  for (let c = 360; c <= 365; c++) tile(c, STREET - 1, CITY.hazard);
  enemy("pinger_servers_2", "pinger", 375, STREET - 6, 128);
  crate(390, STREET - 8, "spread");
  obj({ name: "checkpoint_roof", type: "checkpoint", x: 410 * CELL, y: y(STREET) });

  // 5. The rooftop helipad: a tall ladder, the gunship, the page
  building(430, 470, STREET - 18); // roof at y 336
  ladder(429, STREET - 18, STREET - 1);
  platform(420, 428, STREET - 9); // a landing half way, and a way down
  obj({ name: "lock_helipad", type: "camera_lock", x: 430 * CELL, y: y(STREET - 18) - 208, w: 384, h: 224 });
  obj({ name: "boss_gunship", type: "boss", x: 460 * CELL, y: y(STREET - 18) - 48, kind: "gunship", w: 384, h: 224 });
  obj({ name: "page_helipad", type: "pickup", x: 466 * CELL, y: y(STREET - 18), item: "lattenza_page" });
  obj({ name: "exit", type: "exit", x: 505 * CELL, y: y(STREET) });
  lamp(480);
  lamp(500);

  // the far layer: a night sky and a seeded skyline
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed / 0x7fffffff);
  for (let c = 0; c < far.cols; c++) {
    const top = 12 + Math.floor(rnd() * 6);
    const kinds = [SKY.skyline_a, SKY.skyline_b, SKY.skyline_c];
    const kind = kinds[Math.floor(rnd() * 3)]!;
    for (let r = 0; r < far.rows; r++) {
      if (r < top) far.set(c, r, [SKY.sky_0, SKY.sky_1, SKY.sky_2, SKY.sky_3, SKY.sky_4, SKY.sky_5][Math.min(5, Math.floor((r / top) * 6))]!);
      else if (r === top) far.set(c, r, rnd() < 0.2 ? SKY.skyline_antenna : SKY.skyline_top);
      else far.set(c, r, r > 18 ? SKY.skyline_dark : kind);
    }
  }

  tags.commit();
  play.commit();
  far.commit();
  return level;
}
