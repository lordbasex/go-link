// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The image AI prompt helper (experiment 1's verdict, T-29): prompts for an
// image AI that give pictures Willy Maker turns into CPS-1 art with the
// least loss. Willy Maker fills in what the board needs (sizes at exactly
// 4x the board's pixels, its color limits, one picture per parallax layer,
// the level's sections) and the user describes the rest. The prompts are
// in English, which image AIs follow best; the interface is translated.
// Pure: choices and the project in, text out.

import type { CharacterRole, Level, Project } from "../model";
import { ANIMS, DEFAULT_HEIGHT } from "../sprites/presets";

/** Every board pixel is a 4 x 4 block in the picture, so the importer scales it back exactly. */
export const SCALE = 4;
export const SCREEN = { w: 384, h: 224 } as const;
/** A play layer stretch: 4 screens. */
export const STRETCH = 4 * SCREEN.w;

export type PromptKind = "background" | "character" | "object" | "effect" | "tiles";

export const SUBTYPES: Record<PromptKind, readonly string[]> = {
  background: ["far", "play", "panorama", "static", "boss"],
  character: ["hero", "enemy", "civilian", "boss"],
  object: ["vehicle", "animal", "nature", "weapon", "item", "street", "other"],
  effect: ["muzzle", "explosion", "smoke", "sparks", "impact", "dust"],
  tiles: ["set"],
};

/** The checkboxes of each kind: an id and the words it adds to the prompt. */
export const FLAGS: Record<PromptKind, readonly { id: string; words: string }[]> = {
  background: [
    { id: "sky", words: "a night or day sky band across the top" },
    { id: "skyline", words: "a layered city skyline with lit windows" },
    { id: "water", words: "water with reflections of the lights" },
    { id: "neon", words: "neon signs and glowing accents (made of solid pixel colors, no glow halos)" },
    { id: "rain", words: "rain as short pixel streaks" },
    { id: "fog", words: "low fog drawn as flat banded pixel layers" },
    { id: "moon", words: "a moon" },
    { id: "bridges", words: "bridges" },
    { id: "cranes", words: "harbour cranes" },
    { id: "floor", words: "a clearly walkable floor along the bottom, flat and readable" },
    { id: "platforms", words: "flat platforms at jumpable heights (at most 48 board pixels above each other)" },
    { id: "ladders", words: "ladders with clear rungs between floors" },
    { id: "crates", words: "stacked crates that can be stood on" },
    { id: "room", words: "open space above the floor to run and jump, no clutter in the walking lane" },
  ],
  character: [
    { id: "facingRight", words: "every frame facing right (the game mirrors it)" },
    { id: "shirt", words: "the shirt in one clear flat color zone, so it can be recolored for players 2 to 4" },
    { id: "weapon", words: "holding a weapon" },
    { id: "muzzle", words: "the gun's muzzle clearly at the same height in every shooting frame" },
  ],
  object: [
    { id: "side", words: "seen from the side, the same angle as a side-scrolling game" },
    { id: "shadow", words: "a small hard-edged shadow under it" },
    { id: "animated", words: "animated, its frames in one row" },
    { id: "breakable", words: "two states, whole and broken, in two rows" },
  ],
  effect: [
    { id: "animated", words: "animated, its frames in one row from start to end" },
    { id: "loop", words: "a loop: the last frame leads back to the first" },
  ],
  tiles: [
    { id: "floor", words: "floor tiles whose top edge is the walking surface" },
    { id: "platform", words: "a thin one-way platform tile" },
    { id: "ladder", words: "a ladder tile that repeats vertically" },
    { id: "crate", words: "a crate made of 2 x 2 tiles" },
    { id: "wall", words: "wall tiles that repeat in both directions" },
  ],
};

export interface PromptChoices {
  kind: PromptKind;
  sub: string;
  description: string;
  flags: string[];
  /** Character animations, by the Characters tab's names. */
  anims: string[];
  location: string;
  time: "" | "night" | "dusk" | "day" | "dawn";
  weather: string;
  style: string;
  palette: string;
  quality: "native" | "blocky";
  /** Character height on the screen, board px (the role's by default). */
  height: number;
  /** Object or effect size in 16 px cells, and its frames. */
  cellsW: number;
  cellsH: number;
  frames: number;
  /** For backgrounds: the level the sizes come from. */
  levelId: string;
}

/** The example the helper starts from: the first level of Willy's own story. */
export const EXAMPLE: Pick<PromptChoices, "description" | "location" | "time" | "weather" | "style" | "palette" | "flags"> = {
  description:
    "Puerto Madero docks in Buenos Aires at night: the skyline of glass towers, the Puente de la Mujer footbridge, the river with neon reflections, a museum frigate, old red-brick dock warehouses, harbour cranes, and at the end a corporate tower with a helipad for the boss.",
  location: "Puerto Madero, Buenos Aires, Argentina, present day",
  time: "night",
  weather: "clear, a light haze over the river",
  style: "inspired by 1990s arcade beat 'em ups and run and gun games",
  palette: "deep blues and purples, warm window lights, magenta and cyan neon accents",
  flags: ["sky", "skyline", "water", "neon", "moon", "bridges", "cranes", "floor", "platforms", "room"],
};

export function defaultChoices(kind: PromptKind, project?: Project): PromptChoices {
  const role: CharacterRole = "hero";
  return {
    kind,
    sub: SUBTYPES[kind][0]!,
    description: kind === "background" ? EXAMPLE.description : "",
    flags: kind === "background" ? [...EXAMPLE.flags] : kind === "character" ? ["facingRight", "shirt"] : kind === "object" ? ["side"] : kind === "effect" ? ["animated"] : ["floor", "platform", "ladder", "crate", "wall"],
    anims: ANIMS[role].map((a) => a.name),
    location: kind === "background" ? EXAMPLE.location : "",
    time: kind === "background" ? EXAMPLE.time : "",
    weather: kind === "background" ? EXAMPLE.weather : "",
    style: EXAMPLE.style,
    palette: kind === "background" ? EXAMPLE.palette : "",
    quality: "native",
    height: DEFAULT_HEIGHT[role],
    cellsW: 2,
    cellsH: 2,
    frames: kind === "effect" ? 6 : 4,
    levelId: project?.settings.levels[0] ?? project?.levels[0]?.id ?? "",
  };
}

/** Saved choices over the defaults, keeping only fields of the right type (a project file is not trusted). */
export function mergeChoices(base: PromptChoices, saved: unknown): PromptChoices {
  if (!saved || typeof saved !== "object") return base;
  const out: PromptChoices = { ...base };
  const rec = saved as Record<string, unknown>;
  for (const k of Object.keys(base) as (keyof PromptChoices)[]) {
    const v = rec[k];
    const want = base[k];
    if (Array.isArray(want)) {
      if (Array.isArray(v)) (out as unknown as Record<string, unknown>)[k] = v.filter((x) => typeof x === "string").slice(0, 64);
    } else if (typeof v === typeof want && (typeof v !== "number" || Number.isFinite(v))) {
      (out as unknown as Record<string, unknown>)[k] = typeof v === "string" ? v.slice(0, 4000) : v;
    }
  }
  out.kind = base.kind;
  if (!["", "night", "dusk", "day", "dawn"].includes(out.time)) out.time = base.time;
  if (out.quality !== "native" && out.quality !== "blocky") out.quality = base.quality;
  return out;
}

export interface Prompt {
  /** What it is for, in English (the interface translates the kind). */
  title: string;
  /** The picture's size in pixels. */
  size: { w: number; h: number };
  text: string;
}

export interface PromptResult {
  prompts: Prompt[];
  negative: string;
}

const x4 = (n: number) => n * SCALE;
const sentence = (s: string) => {
  const t = s.trim();
  return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : "";
};

/** Where the user's words, the flags and the common fields go. */
function body(c: PromptChoices): string[] {
  const words = FLAGS[c.kind].filter((f) => c.flags.includes(f.id)).map((f) => f.words);
  const out: string[] = [];
  if (c.description.trim()) out.push(sentence(c.description));
  if (words.length) out.push(sentence(`Include ${words.join("; ")}`));
  if (c.location.trim()) out.push(sentence(`Place and time period: ${c.location.trim()}`));
  if (c.time || c.weather.trim()) out.push(sentence(`Time of day and weather: ${[c.time, c.weather.trim()].filter(Boolean).join(", ")}`));
  if (c.palette.trim()) out.push(sentence(`Color mood: ${c.palette.trim()}`));
  if (c.style.trim()) out.push(sentence(`Style reference: ${c.style.trim()}, used only as a style: no existing characters, logos, names or text from any game`));
  return out;
}

function quality(c: PromptChoices): string {
  return c.quality === "blocky"
    ? "Chunky pixel art with big readable blocks, every pixel drawn as an exact 4 x 4 square."
    : "Hand-drawn sprite art at native arcade resolution with high detail, as on a 1990s CPS-1 arcade board, every board pixel drawn as an exact 4 x 4 block of one color.";
}

function limits(kind: PromptKind, sub: string): string {
  const palette =
    kind === "background" ? (sub === "far" ? "about 32 colors in all" : "about 48 colors in all") : kind === "character" ? "15 to 30 colors in all" : "at most 15 colors";
  return sentence(
    `Color limits: 12-bit color (every channel a multiple of 17), ${palette}, at most 15 colors in any 16 x 16 board pixel tile (64 x 64 pixels in this picture), flat colors only: no gradients, no anti-aliasing, no semi-transparent pixels, hard edges, very little dithering`,
  );
}

function levelOf(project: Project | undefined, id: string): Level | undefined {
  return project?.levels.find((l) => l.id === id) ?? project?.levels[0];
}

/** The level's sections over a stretch, by name and x. */
function sectionsIn(level: Level | undefined, x0: number, x1: number): string {
  const s = (level?.sections ?? []).filter((x) => x.x1 > x0 && x.x0 < x1);
  return s.length ? ` It shows ${s.map((x) => `"${x.name}" (board x ${x.x0}-${x.x1})`).join(", ")}.` : "";
}

export function buildPrompts(c: PromptChoices, project?: Project): PromptResult {
  const common = [...body(c), quality(c), limits(c.kind, c.sub)];
  const prompts: Prompt[] = [];
  const level = levelOf(project, c.levelId);
  const lw = level?.size.w ?? STRETCH;
  const lh = level?.size.h ?? SCREEN.h;
  const view = "A 2D side-scrolling arcade game background, seen straight from the side with no camera tilt, the horizon level.";

  if (c.kind === "background") {
    if (c.sub === "far") {
      const w = Math.round(lw / 2 + SCREEN.w);
      prompts.push({
        title: "far layer (parallax)",
        size: { w: x4(w), h: x4(lh) },
        text: [view, `The far background layer only (sky, distant city), fully opaque, scrolling at half speed behind the play layer, ${x4(w)} x ${x4(lh)} pixels (${w} x ${lh} board pixels), its left and right edges able to meet seamlessly. No floors, platforms or foreground objects.`, ...common].join(" "),
      });
    } else if (c.sub === "play" || c.sub === "panorama") {
      const stretch = c.sub === "panorama" ? lw : STRETCH;
      const n = Math.max(1, Math.ceil(lw / stretch));
      for (let k = 0; k < n; k++) {
        const x0 = k * stretch;
        const w = Math.min(stretch, lw - x0);
        prompts.push({
          title: n > 1 ? `play layer, stretch ${k + 1} of ${n} (board x ${x0}-${x0 + w})` : "play layer",
          size: { w: x4(w), h: x4(lh) },
          text: [
            view,
            `The play layer${n > 1 ? `, stretch ${k + 1} of ${n} of one long level (board x ${x0} to ${x0 + w}), continuing the previous stretch seamlessly at its left edge` : ""}: what players walk on and stand in front of, ${x4(w)} x ${x4(lh)} pixels (${w} x ${lh} board pixels), on a plain flat #FF00FF magenta background wherever the far layer should show through (the sky and the distance).${sectionsIn(level, x0, x0 + w)}`,
            ...common,
          ].join(" "),
        });
      }
    } else if (c.sub === "boss") {
      prompts.push({
        title: "boss arena",
        size: { w: x4(SCREEN.w), h: x4(lh) },
        text: [view, `The boss arena at the end of the level: one screen, ${x4(SCREEN.w)} x ${x4(lh)} pixels (${SCREEN.w} x ${lh} board pixels), a wide clear floor with room to fight, dramatic but readable.`, ...common].join(" "),
      });
    } else {
      prompts.push({
        title: "one screen",
        size: { w: x4(SCREEN.w), h: x4(SCREEN.h) },
        text: [view, `A single static screen, ${x4(SCREEN.w)} x ${x4(SCREEN.h)} pixels (${SCREEN.w} x ${SCREEN.h} board pixels).`, ...common].join(" "),
      });
    }
  } else if (c.kind === "character") {
    const role = (SUBTYPES.character.includes(c.sub) ? c.sub : "hero") as CharacterRole;
    const presets = ANIMS[role].filter((a) => c.anims.includes(a.name));
    const anims = presets.length ? presets : ANIMS[role].slice(0, 1);
    const h = Math.max(16, Math.round(c.height || DEFAULT_HEIGHT[role]));
    const cellH = Math.ceil((h + 8) / 16) * 16;
    const cellW = Math.ceil((h * 1.5) / 16) * 16;
    const cols = Math.max(...anims.map((a) => a.frames));
    prompts.push({
      title: `${role} sprite sheet`,
      size: { w: x4(cellW * cols), h: x4(cellH * anims.length) },
      text: [
        `A sprite sheet of one ${role} character for a 2D side-scrolling arcade game, seen from the side.`,
        `The character is ${x4(h)} pixels tall (${h} board pixels), on a plain flat #FF00FF magenta background, in a grid of ${cols} columns by ${anims.length} rows of ${x4(cellW)} x ${x4(cellH)} pixel cells, one animation per row, the feet on the same line at the bottom of every cell, nothing crossing into the next cell.`,
        `Rows, top to bottom: ${anims.map((a, i) => `${i + 1}. ${a.name} (${a.frames} ${a.frames === 1 ? "frame" : "frames"}${a.loop ? ", a loop" : ""})`).join("; ")}.`,
        "The same character, proportions and colors in every frame.",
        ...common,
      ].join(" "),
    });
  } else if (c.kind === "object" || c.kind === "effect") {
    const w = Math.max(1, c.cellsW) * 16;
    const h = Math.max(1, c.cellsH) * 16;
    const animated = c.flags.includes("animated");
    const frames = animated ? Math.max(1, c.frames) : 1;
    const rows = c.kind === "object" && c.flags.includes("breakable") ? 2 : 1;
    const what = c.kind === "effect" ? `a ${c.sub === "muzzle" ? "muzzle flash" : c.sub === "dust" ? "landing dust" : c.sub} effect` : `a ${c.sub === "street" ? "piece of street furniture" : c.sub === "other" ? "game object" : c.sub}`;
    prompts.push({
      title: c.kind === "effect" ? `effect: ${c.sub}` : `object: ${c.sub}`,
      size: { w: x4(w * frames), h: x4(h * rows) },
      text: [
        `${what[0]!.toUpperCase()}${what.slice(1)} for a 2D side-scrolling arcade game.`,
        `Each frame is ${x4(w)} x ${x4(h)} pixels (${w} x ${h} board pixels, ${c.cellsW} x ${c.cellsH} tiles of 16)${frames > 1 ? `, ${frames} frames in one row` : ""}${rows > 1 ? ", the whole state in the first row and the broken one in the second" : ""}, on a plain flat #FF00FF magenta background.`,
        ...common,
      ].join(" "),
    });
  } else {
    prompts.push({
      title: "tile set",
      size: { w: x4(16 * 8), h: x4(16 * 4) },
      text: [
        "A tile set for a 2D side-scrolling arcade game level, seen from the side.",
        `A grid of 8 x 4 tiles, each exactly ${x4(16)} x ${x4(16)} pixels (16 x 16 board pixels), ${x4(16 * 8)} x ${x4(16 * 4)} pixels in all, every tile seamless with its neighbours, on a plain flat #FF00FF magenta background where a tile is empty.`,
        ...common,
      ].join(" "),
    });
  }

  const negative = [
    "gradients",
    "anti-aliasing",
    "blur",
    "soft shadows",
    "glow halos",
    "semi-transparent pixels",
    "noise or film grain",
    "heavy dithering",
    "photorealism",
    "3D render",
    "perspective or tilted camera",
    "text, letters or numbers",
    "logos or brand names",
    "watermark or signature",
    "user interface or HUD",
    "existing game characters",
    "mixed pixel sizes",
    ...(c.kind === "background" ? ["characters or people", "cut-off floor"] : []),
    ...(c.kind === "character" ? ["background scenery", "cropped limbs", "frames of different sizes", "different proportions between frames"] : []),
    ...(c.kind === "object" || c.kind === "effect" || c.kind === "tiles" ? ["scenery behind it", "frames of different sizes"] : []),
  ].join(", ");
  return { prompts, negative };
}
