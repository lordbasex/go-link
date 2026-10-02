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
import { promptEn } from "../i18n/prompt.en";

/** What each move is, in English, for the prompts. */
const MOVES: Record<string, string> = promptEn.animDesc;

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
  tiles: ["set", "free"],
};

/** The checkboxes of each kind: an id and the words it adds to the prompt. */
/** A background option belongs to the far layer (sky, distance) or to the play layer (what players walk on); others suit both. */
export type FlagLayer = "far" | "play";

export const FLAGS: Record<PromptKind, readonly { id: string; words: string; layer?: FlagLayer; sub?: readonly string[] }[]> = {
  background: [
    { id: "refs", words: "" },
    { id: "sky", layer: "far", words: "a night or day sky band across the top" },
    { id: "skyline", layer: "far", words: "a layered city skyline with lit windows" },
    { id: "water", layer: "far", words: "water with reflections of the lights" },
    { id: "neon", words: "neon signs and glowing accents (made of solid pixel colors, no glow halos)" },
    { id: "rain", words: "rain as short pixel streaks" },
    { id: "fog", words: "low fog drawn as flat banded pixel layers" },
    { id: "moon", layer: "far", words: "a moon" },
    { id: "bridges", words: "bridges" },
    { id: "cranes", words: "harbour cranes" },
    { id: "floor", layer: "play", words: "a clearly walkable floor along the bottom, flat and readable" },
    { id: "platforms", layer: "play", words: "flat platforms a short jump above each other" },
    { id: "ladders", layer: "play", words: "ladders with clear rungs between floors" },
    { id: "crates", layer: "play", words: "stacked crates that can be stood on" },
    { id: "room", layer: "play", words: "open space above the floor to run and jump, no clutter in the walking lane" },
  ],
  character: [
    { id: "refs", words: "" },
    { id: "facingRight", words: "every frame facing right (the game mirrors it)" },
    { id: "shirt", sub: ["hero"], words: "the shirt in one clear flat color zone, so it can be recolored for players 2 to 4" },
    { id: "weapon", words: "holding a weapon" },
    { id: "muzzle", words: "the gun's muzzle clearly at the same height in every shooting frame" },
  ],
  object: [
    { id: "refs", words: "" },
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
    { id: "floor", sub: ["set"], words: "floor tiles whose top edge is the walking surface" },
    { id: "platform", sub: ["set"], words: "a thin one-way platform tile" },
    { id: "ladder", sub: ["set"], words: "a ladder tile that repeats vertically" },
    { id: "crate", sub: ["set"], words: "a crate made of 2 x 2 tiles" },
    { id: "wall", sub: ["set"], words: "wall tiles that repeat in both directions" },
  ],
};

/** The common fields each kind uses: a character, an object or an effect knows nothing about the place behind it. */
export type CommonField = "location" | "time" | "weather" | "palette" | "style";
export const FIELDS: Record<PromptKind, readonly CommonField[]> = {
  background: ["location", "time", "weather", "palette", "style"],
  tiles: ["location", "palette", "style"],
  character: ["palette", "style"],
  object: ["palette", "style"],
  effect: ["palette", "style"],
};

/** Up to 16 own animations of a character sheet: "name:frames" (a name of letters, digits and _). */
export function parseCustomAnim(s: string): { name: string; frames: number } | null {
  const m = /^([a-z0-9_]{1,24}):(\d{1,2})$/.exec(s);
  return m ? { name: m[1]!, frames: Math.max(1, Math.min(16, Number(m[2]))) } : null;
}

export const MAX_REFS = 3;

export interface PromptChoices {
  kind: PromptKind;
  sub: string;
  description: string;
  flags: string[];
  /** Character animations, by the Characters tab's names. */
  anims: string[];
  /** Own animations, "name:frames"; a row each when ticked in `anims`. */
  customAnims: string[];
  /** Up to 3 reference pictures (asset refs) copied with the message, one at a time. */
  refImages: string[];
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
    customAnims: [],
    refImages: [],
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
  out.refImages = out.refImages.filter((r) => r.startsWith("sha256:")).slice(0, MAX_REFS);
  return out;
}

export interface Prompt {
  /** What it is for, in English (the interface translates the kind). */
  title: string;
  /** The shape to ask for ("16:9"): image AIs pick their own size, up to about 1536 px. */
  aspect: string;
  /** What Willy Maker turns it into, in board pixels (the importer scales and fits it). */
  board: { w: number; h: number };
  text: string;
}

export interface PromptResult {
  prompts: Prompt[];
  negative: string;
}

/** The common shapes image AIs offer, nearest to a width over a height. */
const ASPECTS: [string, number][] = [
  ["21:9", 21 / 9],
  ["2:1", 2],
  ["16:9", 16 / 9],
  ["3:2", 3 / 2],
  ["4:3", 4 / 3],
  ["1:1", 1],
  ["3:4", 3 / 4],
  ["2:3", 2 / 3],
  ["9:16", 9 / 16],
];
export function aspectOf(w: number, h: number): string {
  const r = w / Math.max(1, h);
  return ASPECTS.reduce((a, b) => (Math.abs(Math.log(b[1] / r)) < Math.abs(Math.log(a[1] / r)) ? b : a))[0];
}

const sentence = (s: string) => {
  const t = s.trim();
  return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : "";
};

/**
 * What the user wrote, the ticked options and the fields of the kind. The
 * board's own limits (size, 15 colors per tile, 12-bit color) never go into
 * a prompt: image AIs cannot count pixels or colors and only draw worse when
 * asked to; Willy Maker scales and fits the picture when it is brought in.
 */
/** Whether an option applies to the chosen kind and layer (the play layer leaves the sky to the far layer, and the far layer has no floors). */
export function flagApplies(kind: PromptKind, sub: string, f: { layer?: FlagLayer; sub?: readonly string[] }): boolean {
  // the shirt players 2 to 4 recolor is a hero's
  if (f.sub && !f.sub.includes(sub)) return false;
  if (kind !== "background" || !f.layer) return true;
  if (sub === "far") return f.layer === "far";
  if (sub === "play") return f.layer === "play";
  return true;
}

function body(c: PromptChoices): string[] {
  const words = FLAGS[c.kind].filter((f) => c.flags.includes(f.id) && f.words && flagApplies(c.kind, c.sub, f)).map((f) => f.words);
  const out: string[] = [];
  const uses = (f: CommonField) => FIELDS[c.kind].includes(f);
  if (c.description.trim()) out.push(sentence(c.kind === "character" ? `The character: ${c.description.trim()}` : c.description));
  if (uses("palette") && c.palette.trim()) out.push(sentence(`${c.kind === "background" || c.kind === "tiles" ? "Color mood" : "Colors"}: ${c.palette.trim()}`));
  if (uses("location") && c.location.trim()) out.push(sentence(`Place and time period: ${c.location.trim()}`));
  const time = uses("time") ? c.time : "";
  const weather = uses("weather") ? c.weather.trim() : "";
  if (time || weather) out.push(sentence(`Time of day and weather: ${[time, weather].filter(Boolean).join(", ")}`));
  if (words.length) out.push(sentence(`Make sure of this: ${words.join("; ")}`));
  return out;
}

/** The look: what makes 1990s arcade art good, in words an image AI follows. */
function look(c: PromptChoices): string[] {
  const out = [
    c.quality === "blocky"
      ? "Bold, chunky pixel art with big readable pixels and few colors."
      : "Detailed 16-bit arcade pixel art, like the hand-drawn sprites and backgrounds of 1990s arcade games: crisp pixels, dark outlines tinted by the color they surround, shading in a few flat tones with light from the top left, rich but limited colors.",
  ];
  if (FIELDS[c.kind].includes("style") && c.style.trim()) out.push(sentence(`Style: ${c.style.trim()}, used only as a style: no existing characters, logos, names or text from any game`));
  return out;
}

/** Attach the pictures that show the look ("refs" ticked). */
function refs(c: PromptChoices, what: string): string[] {
  return c.flags.includes("refs") || c.refImages.length ? [`Use the attached images as the reference for ${what}.`] : [];
}

function levelOf(project: Project | undefined, id: string): Level | undefined {
  return project?.levels.find((l) => l.id === id) ?? project?.levels[0];
}

/** The level's sections over a stretch, by name. */
function sectionsIn(level: Level | undefined, x0: number, x1: number): string {
  const s = (level?.sections ?? []).filter((x) => x.x1 > x0 && x.x0 < x1);
  return s.length ? ` This part of the level is ${s.map((x) => `"${x.name}"`).join(" and ")}.` : "";
}

function negativeFor(c: PromptChoices): string {
  return [
    "blur",
    "gradients",
    "soft glow",
    "anti-aliased soft edges",
    "photorealism",
    "3D render",
    "tilted camera",
    "text, labels, letters or numbers",
    "grid lines",
    "logos or brand names",
    "watermark or signature",
    "user interface or HUD",
    "existing game characters",
    ...(c.kind === "background" ? ["characters or people"] : []),
    ...(c.kind === "character" ? ["background scenery", "cropped limbs", "frames touching each other", "a different face or build between frames"] : []),
    ...(c.kind === "object" || c.kind === "effect" || c.kind === "tiles" ? ["scenery behind it", "frames touching each other"] : []),
  ].join(", ");
}

/** The animations a character sheet shows, in order: the chosen built-in ones, then the user's own. */
export function pickedAnims(c: PromptChoices, role: CharacterRole): { name: string; frames: number; loop: boolean }[] {
  const own = c.customAnims.map(parseCustomAnim).filter((a): a is { name: string; frames: number } => a !== null && !ANIMS[role].some((p) => p.name === a.name));
  return [...ANIMS[role].filter((a) => c.anims.includes(a.name)), ...own.filter((a) => c.anims.includes(a.name)).map((a) => ({ ...a, loop: false }))];
}

/** At most 6 animations or 32 frames per picture: more makes every frame small and plain. */
export function sheetsOf<T extends { frames: number }>(anims: T[], max = 6, maxFrames = 32): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let n = 0;
  for (const a of anims) {
    if (cur.length && (cur.length >= max || n + a.frames > maxFrames)) {
      out.push(cur);
      cur = [];
      n = 0;
    }
    cur.push(a);
    n += a.frames;
  }
  if (cur.length) out.push(cur);
  return out;
}

const BG = "a plain, flat magenta (#FF00FF) background";
const label = (name: string) => name.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());

export function buildPrompts(c: PromptChoices, project?: Project): PromptResult {
  const prompts: Prompt[] = [];
  const level = levelOf(project, c.levelId);
  const lw = level?.size.w ?? STRETCH;
  const lh = level?.size.h ?? SCREEN.h;
  const view = "A background for a 2D side-scrolling arcade game, seen straight from the side, the horizon level.";

  if (c.kind === "background") {
    // one screen per picture: the shape image AIs draw best (about 16:9), joined by Willy Maker
    const screens = (w: number) => Math.max(1, Math.ceil(w / SCREEN.w));
    if (c.sub === "far") {
      const w = Math.round(lw / 2 + SCREEN.w);
      const n = screens(w);
      for (let k = 0; k < n; k++)
        prompts.push({
          title: n > 1 ? `far layer ${k + 1}/${n}` : "far layer",
          aspect: aspectOf(SCREEN.w, lh),
          board: { w: Math.min(SCREEN.w, w - k * SCREEN.w), h: lh },
          text: [
            view,
            `The far layer only: the sky and the distance behind the level, which scroll slowly behind it. No floors, platforms or objects in front.${n > 1 ? ` Picture ${k + 1} of ${n} of one wide panorama${k ? ": continue the previous picture seamlessly from its right edge" : ""}.` : ""}`,
            ...refs(c, "the place and its look"),
            ...body(c),
            ...look(c),
          ].join(" "),
        });
    } else if (c.sub === "play" || c.sub === "panorama") {
      const n = screens(lw);
      for (let k = 0; k < n; k++) {
        const x0 = k * SCREEN.w;
        prompts.push({
          title: n > 1 ? `play layer ${k + 1}/${n}` : "play layer",
          aspect: aspectOf(SCREEN.w, lh),
          board: { w: Math.min(SCREEN.w, lw - x0), h: lh },
          text: [
            view,
            `The play layer: the floors, platforms and buildings the players walk on and stand in front of, with the sky and the distance left as ${BG} so the far layer shows through; lamps and signs are solid, with no light beams, cones or glow drawn over that magenta.${n > 1 ? ` Picture ${k + 1} of ${n} of one long level${k ? ": continue the previous picture seamlessly from its right edge, the floor at the same height" : ""}.` : ""}${sectionsIn(level, x0, x0 + SCREEN.w)}`,
            ...refs(c, "the place and its look"),
            ...body(c),
            ...look(c),
          ].join(" "),
        });
      }
    } else {
      const boss = c.sub === "boss";
      prompts.push({
        title: boss ? "boss arena" : "one screen",
        aspect: aspectOf(SCREEN.w, boss ? lh : SCREEN.h),
        board: { w: SCREEN.w, h: boss ? lh : SCREEN.h },
        text: [view, boss ? "The boss arena at the end of the level: one screen with a wide, clear floor to fight on, dramatic but readable." : "A single screen.", ...refs(c, "the place and its look"), ...body(c), ...look(c)].join(" "),
      });
    }
  } else if (c.kind === "character") {
    const role = (SUBTYPES.character.includes(c.sub) ? c.sub : "hero") as CharacterRole;
    const who = role === "hero" ? "an original hero" : role === "boss" ? "an original boss" : `an original ${role}`;
    const h = Math.max(16, Math.round(c.height || DEFAULT_HEIGHT[role]));
    const picked = pickedAnims(c, role);
    const poses =
      "Make the poses expressive and exaggerated like classic arcade games: anticipation, impact and follow-through, a clear silhouette in every frame. Keep the same face, build, proportions and colors in every frame, with a slightly large head and hands so they read at a small size.";
    const layout = `Everything on ${BG}, the frames large with generous space between them so no two touch, the feet of a row on one line. No labels, text or grid lines.`;
    if (!picked.length) {
      prompts.push({
        title: `${role} reference`,
        aspect: "16:9",
        board: { w: h * 3, h },
        text: [
          `Create the character design sheet of ${who} for a 1990s-style 2D side-scrolling arcade game: the model every animation is drawn from later.`,
          ...refs(c, "the character's face, hair, build and clothes"),
          ...body(c),
          "Three large standing poses side by side: facing right, three-quarter front, and from behind.",
          poses,
          ...look(c),
          layout,
        ].join(" "),
      });
      return { prompts, negative: negativeFor(c) };
    }
    const sheets = sheetsOf(picked);
    sheets.forEach((rows, k) => {
      const cols = Math.max(...rows.map((a) => a.frames));
      prompts.push({
        title: sheets.length > 1 ? `${role} sprite sheet ${k + 1}/${sheets.length}` : `${role} sprite sheet`,
        aspect: aspectOf(cols * 1.2, rows.length),
        board: { w: Math.round(h * 1.5) * cols, h: (h + 8) * rows.length },
        text: [
          `Create a pixel art sprite sheet of ${who} for a 1990s-style 2D side-scrolling arcade game.`,
          ...(k ? ["The same character as in the sprite sheet you made before: same face, hair, build, clothes and colors."] : refs(c, "the character's face, hair, build and clothes")),
          ...body(c),
          `Show these animations, each in its own row from top to bottom, every frame facing right: ${rows.map((a, i) => `${i + 1}. ${label(a.name)}${MOVES[a.name] ? ` (${MOVES[a.name]!.replace(/\.$/, "")})` : ""}: ${a.frames} ${a.frames === 1 ? "frame" : "frames"}${a.loop ? ", looping" : ""}`).join("; ")}.`,
          poses,
          ...look(c),
          layout,
        ].join(" "),
      });
    });
  } else if (c.kind === "object" || c.kind === "effect") {
    const animated = c.flags.includes("animated");
    const frames = animated ? Math.max(1, c.frames) : 1;
    const rows = c.kind === "object" && c.flags.includes("breakable") ? 2 : 1;
    const thing = c.kind === "effect" ? `${c.sub === "muzzle" ? "muzzle flash" : c.sub === "dust" ? "landing dust" : c.sub} effect` : c.sub === "street" ? "piece of street furniture" : c.sub === "other" ? "game object" : c.sub;
    const what = `${/^[aeiou]/.test(thing) ? "an" : "a"} ${thing}`;
    prompts.push({
      title: c.kind === "effect" ? `effect: ${c.sub}` : `object: ${c.sub}`,
      aspect: aspectOf(c.cellsW * frames, c.cellsH * rows),
      board: { w: c.cellsW * 16 * frames, h: c.cellsH * 16 * rows },
      text: [
        `Create pixel art of ${what} for a 1990s-style 2D side-scrolling arcade game, drawn large.`,
        frames > 1 ? `${frames} frames in one row, from start to end.` : "",
        rows > 1 ? "Two rows: whole in the first, broken in the second." : "",
        ...refs(c, "its look"),
        ...body(c),
        ...look(c),
        `Everything on ${BG}, with space between frames. No labels or text.`,
      ]
        .filter(Boolean)
        .join(" "),
    });
  } else if (c.sub === "free") {
    // anything else the game needs, as the user describes it
    prompts.push({
      title: "free",
      aspect: "3:2",
      board: { w: SCREEN.w, h: SCREEN.h },
      text: [
        "Create pixel art for a 1990s-style 2D side-scrolling arcade game.",
        ...refs(c, "its look"),
        ...body(c),
        ...look(c),
        `Everything on ${BG}, each piece apart from the others. No labels or text unless the description asks for it.`,
      ].join(" "),
    });
  } else {
    prompts.push({
      title: "tile set",
      aspect: "2:1",
      board: { w: 16 * 8, h: 16 * 4 },
      text: [
        "Create a pixel art tile set for a 1990s-style 2D side-scrolling arcade game level, seen from the side: square tiles in a grid of 8 across and 4 down, each one seamless with its neighbours.",
        ...refs(c, "the place and its look"),
        ...body(c),
        ...look(c),
        `Empty spaces are ${BG}. No labels or grid lines.`,
      ].join(" "),
    });
  }

  return { prompts, negative: negativeFor(c) };
}

/**
 * One message per picture for a chat image AI (it makes one picture at a
 * time and has no separate negative prompt): the shape, the prompt and
 * what to avoid.
 */
export function chatMessages(r: PromptResult): string[] {
  return r.prompts.map((p) => [p.text, `Make it a ${p.aspect} image, as large as you can.`, `Avoid: ${r.negative}.`].join("\n\n"));
}

/**
 * The rows each picture of a character's prompt asks for, by animation name:
 * the saved choices when they are for this role, else every animation of
 * the role (Characters assigns a pasted sheet's rows with it).
 */
export function characterSheetPlan(saved: unknown, role: CharacterRole): { name: string; frames: number; loop: boolean }[][] {
  const c = mergeChoices(defaultChoices("character"), saved);
  const anims = c.sub === role ? pickedAnims(c, role) : ANIMS[role].map((a) => ({ name: a.name, frames: a.frames, loop: a.loop }));
  return sheetsOf(anims.length ? anims : ANIMS[role]);
}
