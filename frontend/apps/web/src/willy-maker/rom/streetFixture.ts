// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Game Spec v1's level as a beat 'em up street (genres.md, phase 1): the
// depth rule, a walkable band of feet y 352-416 over the floor and two more
// enemies in the band, who come for the players and fight (phase 2). Tests
// and the lab runs rom/tools/lab/runs/street-walk.json and street-fight.json use it.

import { BEATEMUP_RULES } from "../engine/rules";
import { layerGrid, objectLayer, tagGrid, TAG_NUMBER, type LevelObject, type Project, type TileLayer } from "../model";
import { specProject } from "./specFixture";

export function streetProject(): Project {
  const p = specProject();
  p.genre = "beat-em-up";
  p.settings.rules = { ...p.settings.rules, ...BEATEMUP_RULES };
  const level = p.levels[0]!;
  level.walk = { y0: 352, y1: 416 };
  const items = objectLayer(level).items;
  Object.assign(items.find((o) => o.type === "player_start" && o.player === 1)!, { x: 64, y: 400 });
  items.push({ name: "thug", type: "enemy", x: 110, y: 384, kind: "trooper", facing: "left", patrol: 0 } as LevelObject);
  items.push({ name: "brute", type: "enemy", x: 330, y: 360, kind: "trooper", facing: "left", patrol: 0 } as LevelObject);
  return p;
}

/**
 * The beat 'em up's phase 3 (rom/tools/lab/runs/street-wave.json): the same
 * street with a pipe to pick up, one enemy to grab and throw, and a camera
 * lock further on whose wave of two enemies holds the screen until they are down.
 */
export function waveProject(): Project {
  const p = specProject();
  p.genre = "beat-em-up";
  p.settings.rules = { ...p.settings.rules, ...BEATEMUP_RULES };
  const level = p.levels[0]!;
  level.walk = { y0: 352, y1: 416 };
  const items = objectLayer(level).items;
  // the spec's own enemies and crates are left out (the crates close the whole band): this street's are the test's
  for (let i = items.length - 1; i >= 0; i--) if (items[i]!.type === "enemy" || items[i]!.type === "crate") items.splice(i, 1);
  const tags = tagGrid(level);
  const play = layerGrid(level, level.layers.find((l): l is TileLayer => l.id === "play")!);
  for (let r = 0; r < tags.rows; r++)
    for (let c = 0; c < tags.cols; c++)
      if (tags.get(c, r) === TAG_NUMBER.crate) {
        tags.set(c, r, TAG_NUMBER.air);
        play.set(c, r, 0);
      }
  tags.commit();
  play.commit();
  Object.assign(items.find((o) => o.type === "player_start" && o.player === 1)!, { x: 40, y: 400 });
  items.push({ name: "pipe", type: "pickup", x: 70, y: 400, item: "pipe" });
  items.push({ name: "grabbed", type: "enemy", x: 130, y: 400, kind: "trooper", facing: "left", patrol: 0 } as LevelObject);
  items.push({ name: "wave_lock", type: "camera_lock", x: 600, y: 224, w: 384, h: 224 });
  items.push({ name: "wave_a", type: "enemy", x: 860, y: 370, kind: "trooper", facing: "left", patrol: 0 } as LevelObject);
  items.push({ name: "wave_b", type: "enemy", x: 900, y: 410, kind: "trooper", facing: "left", patrol: 0 } as LevelObject);
  return p;
}
