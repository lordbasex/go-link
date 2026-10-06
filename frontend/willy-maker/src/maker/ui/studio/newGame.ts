// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// What the new game wizard makes: a project with the chosen genre (its own
// rules, editor/genres.ts), board layout, title, author and players, and a
// first level of 480 × 272 from the example picture (with or without its
// zones), the user's picture (the level grows to its width) or nothing but
// a floor. Player 1's start stands on the floor with the chosen hero, the
// other players beside, and the exit at the level's right end.

import { applyGenre } from "../../editor/genres";
import { cleanGroups, defaultPlayerSlots, newLevel, newProject, objectLayer, applyZones, type GenreId, type LayoutId, type Level, type Project, type QuizQuestion } from "../../model";
import { exampleLevel, EXAMPLE_FILE, EXAMPLE_URL, type ExampleTexts } from "./example";
import { fitBackground, putBackground } from "./background";

const W = 480;
const H = 272;
/** The empty level's floor: its top, two cells over the bottom. */
const FLOOR_Y = H - 32;

export type NewBackground = { kind: "example"; autoZones: boolean } | { kind: "upload"; file: File } | { kind: "empty" };

export interface NewGameChoice {
  genre: GenreId;
  layout: LayoutId;
  title: string;
  author: string;
  players: number;
  background: NewBackground;
  /** Player 1's shirt: 0 Willy's own colors, 1-3 a recruit's. */
  heroVariant: number;
}

export interface NewGameTexts {
  untitled: string;
  levelName: string;
  groups: ExampleTexts;
  quizSamples: readonly QuizQuestion[];
}

/** The first level before its picture (pure). */
export function firstLevel(choice: NewGameChoice, t: NewGameTexts): Level {
  const bg = choice.background;
  let level: Level;
  let feet = FLOOR_Y;
  let x = 48;
  if (bg.kind === "example") {
    level = exampleLevel("level-1", t.levelName, t.groups);
    const items = objectLayer(level).items;
    if (bg.autoZones) {
      // the example's own start, on its first floor
      const start = items.find((o) => o.type === "player_start")!;
      x = start.x;
      feet = start.y;
    } else {
      // only the picture: the user marks everything, the hero waits at the left
      level.zones = [];
      level.groups = cleanGroups(undefined);
      objectLayer(level).items = items.filter((o) => o.type === "exit");
    }
  } else {
    level = newLevel({ id: "level-1", name: t.levelName, w: W, h: H, floor: false, players: 0 });
    level.groups = cleanGroups(undefined);
    // no picture: a floor across the level to stand on; a picture: the user marks its floor
    level.zones = bg.kind === "empty" ? [{ id: "zone-1", kind: "floor", n: 1, x: 0, y: FLOOR_Y, w: W, h: H - FLOOR_Y, group: "group-zones" }] : [];
  }
  const items = objectLayer(level).items.filter((o) => o.type !== "player_start");
  for (let p = 1; p <= choice.players; p++) items.push({ name: `p${p}_start`, type: "player_start", x: x + (p - 1) * 24, y: feet, player: p });
  if (!items.some((o) => o.type === "exit")) items.push({ name: "exit", type: "exit", x: level.size.w - 48, y: feet });
  objectLayer(level).items = items;
  applyZones(level);
  return level;
}

/** The whole project, its picture fitted and stored; throws when the picture cannot be read. */
export async function createGame(choice: NewGameChoice, t: NewGameTexts, fetchExample: (url: string) => Promise<Blob> = (url) => fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))): Promise<Project> {
  const level = firstLevel(choice, t);
  const p = newProject({ title: choice.title.trim() || t.untitled, author: choice.author.trim(), layout: choice.layout, players: choice.players, levels: [level] });
  const slots = defaultPlayerSlots();
  slots[0] = { ...slots[0]!, variant: choice.heroVariant };
  p.settings.playerSlots = slots;
  const bg = choice.background;
  if (bg.kind !== "empty") {
    const file = bg.kind === "upload" ? bg.file : new File([await fetchExample(EXAMPLE_URL)], EXAMPLE_FILE, { type: "image/png" });
    const fitted = await fitBackground(level, file, bg.kind === "upload");
    putBackground(p, fitted, file.name);
    // a wider picture made the level wider: the exit follows the end
    const exit = objectLayer(p.levels[0]!).items.find((o) => o.type === "exit");
    if (exit && bg.kind === "upload") exit.x = p.levels[0]!.size.w - 48;
  }
  applyGenre(p, choice.genre, t.quizSamples);
  return p;
}
