// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The menu screens as data: each screen's text fields (row, size, color,
// default), its background, music slot and credits line, and the checks
// that its text fits the board's text layer (48 x 28 characters of 8 x 8)
// inside the safe area and uses only the font's glyphs. Pure: the Menus tab,
// the play view and the validation read it.

import { TEXT_COLS, TEXT_ROWS, unsupportedChars } from "@go-link/cps1";
import { BUILTIN_HERO, DEFAULT_CREDITS, defaultMenus, type MenuBackground, type MenuScreen, type MenuSettings, type Project } from "../model";

export { TEXT_COLS, TEXT_ROWS };

export const MENU_SCREENS = ["title", "attract", "select", "hud", "continue", "gameOver", "highScores"] as const;
export type MenuScreenId = (typeof MENU_SCREENS)[number];

/** Music slot ids (sound is Phase 2: these are references only). */
export const MUSIC_SLOTS = ["none", "title", "select", "stage", "boss", "continue", "game-over", "high-scores"] as const;

/**
 * The safe area in characters: arcade monitors hide a little of each edge,
 * so text keeps two columns from the sides and two rows from the top and bottom.
 */
export const SAFE = { col0: 2, col1: TEXT_COLS - 2, row0: 2, row1: TEXT_ROWS - 2 } as const;

export type Ink = "accent" | "white" | "cyan";

export interface FieldSpec {
  id: string;
  /** Text row (0-27) of the field's top. */
  row: number;
  /** 2 = double size (each character takes 2 x 2 cells). */
  scale: 1 | 2;
  ink: Ink;
  /** The text a new game starts with (game text: the font is uppercase). */
  def: (p: Project) => string;
  /** At most this many characters (the editor's input limit). */
  max: number;
}

const field = (id: string, row: number, def: string | ((p: Project) => string), scale: 1 | 2 = 1, ink: Ink = "white"): FieldSpec => ({
  id,
  row,
  scale,
  ink,
  def: typeof def === "string" ? () => def : def,
  max: Math.floor(TEXT_COLS / scale),
});

/** Each screen's text fields, top to bottom. */
export const MENU_FIELDS: Record<MenuScreenId, FieldSpec[]> = {
  title: [field("title", 6, (p) => p.title.toUpperCase(), 2, "accent"), field("subtitle", 10, ""), field("prompt", 19, "PUSH START")],
  attract: [field("caption", 3, "DEMO PLAY", 1, "accent"), field("prompt", 21, "INSERT COIN")],
  select: [field("heading", 3, "PLAYER SELECT", 2, "accent"), field("prompt", 22, "PUSH START TO JOIN")],
  // the join prompt shares the top line with the other players: short when four play
  hud: [field("join", 0, (p) => (p.settings.players > 3 ? "START" : "PRESS START")), field("ammo", 1, "AMMO"), field("rescued", 24, "RESCUED"), field("cleared", 13, "MISSION CLEAR", 2, "accent")],
  continue: [field("heading", 8, "CONTINUE?", 2, "accent"), field("prompt", 17, "INSERT COIN")],
  gameOver: [field("heading", 11, "GAME OVER", 2, "accent"), field("line", 15, "NOBODY WAITS. TRY AGAIN.")],
  highScores: [field("heading", 3, "HIGH SCORES", 2, "accent"), field("footer", 22, "")],
};

/** The credits line's row. */
export const CREDITS_ROW = 25;

export function screenOf(project: Project, id: MenuScreenId): MenuScreen {
  return (project.settings.menus as MenuSettings)[id] ?? defaultMenus()[id];
}

/** A field's text: what the game saved, or the field's default. */
export function menuText(project: Project, screen: MenuScreenId, fieldId: string): string {
  const saved = screenOf(project, screen).texts?.[fieldId];
  if (typeof saved === "string") return saved;
  const spec = MENU_FIELDS[screen].find((f) => f.id === fieldId);
  return spec ? spec.def(project) : "";
}

export function creditsText(project: Project): string {
  return typeof project.settings.credits === "string" ? project.settings.credits : DEFAULT_CREDITS;
}

export function backgroundOf(project: Project, screen: MenuScreenId): MenuBackground {
  return screenOf(project, screen).background ?? defaultMenus()[screen].background!;
}

/** The level a "level" background shows: the chosen one, or the first. */
export function backgroundLevel(project: Project, bg: MenuBackground) {
  if (bg.kind !== "level") return undefined;
  return project.levels.find((l) => l.id === bg.level) ?? project.levels[0];
}

export interface TextLine {
  /** The field id, or "credits" / "slots" / "scores" for lines the screen makes itself. */
  field: string;
  text: string;
  row: number;
  /** Left column (centered lines are placed by `place`). */
  col: number;
  scale: 1 | 2;
  ink: Ink;
  /** The most columns the line may take (a HUD slot); the screen's width otherwise. */
  maxWidth?: number;
}

/** Centers a line on the screen (in whole characters). */
function place(text: string, row: number, scale: 1 | 2): { col: number; row: number } {
  const cols = text.length * scale;
  return { col: Math.floor((TEXT_COLS - cols) / 2), row };
}

/** The player names the select screen shows. */
export function slotNames(project: Project): string[] {
  const slots = project.settings.playerSlots ?? [];
  return Array.from({ length: project.settings.players }, (_, i) => {
    const s = slots[i];
    if (!s || !s.character) return "---";
    if (s.character === BUILTIN_HERO) return s.variant ? "RECRUIT" : "WILLY";
    return (project.characters.find((c) => c.id === s.character)?.name ?? "---").toUpperCase();
  });
}

const SAMPLE_SCORES = [
  ["1ST", "100000", "WIL"],
  ["2ND", "080000", "VER"],
  ["3RD", "060000", "G-9"],
  ["4TH", "040000", "JIT"],
  ["5TH", "020000", "LAG"],
];

/**
 * Every line a screen draws: its fields (empty ones skipped), the lines it
 * makes itself (player names, the score table, the countdown) and the
 * credits line. Text is folded to uppercase, as the board draws it.
 */
export function screenLines(project: Project, screen: MenuScreenId): TextLine[] {
  const out: TextLine[] = [];
  const add = (fieldId: string, text: string, row: number, scale: 1 | 2, ink: Ink, col?: number) => {
    const t = text.toUpperCase();
    if (!t) return;
    const at = place(t, row, scale);
    out.push({ field: fieldId, text: t, row, col: col ?? at.col, scale, ink });
  };
  for (const f of MENU_FIELDS[screen]) {
    if (screen === "hud" && (f.id === "join" || f.id === "ammo")) continue;
    add(f.id, menuText(project, screen, f.id), f.row, f.scale, f.ink);
  }
  if (screen === "hud") {
    // the HUD's top line per player, as play mode draws it
    const join = menuText(project, "hud", "join").toUpperCase();
    const ammo = menuText(project, "hud", "ammo").toUpperCase();
    const w = Math.floor(TEXT_COLS / Math.max(1, project.settings.players));
    for (let i = 0; i < project.settings.players; i++) {
      const col = i * w + 1;
      out.push({ field: "slots", text: `${i + 1}P`, row: 0, col, scale: 1, ink: "cyan" });
      if (i === 0) {
        out.push({ field: "slots", text: "000000", row: 0, col: col + 3, scale: 1, ink: "white" });
        if (ammo) out.push({ field: "ammo", text: `${ammo} 3`, row: 1, col: col + 3, scale: 1, ink: "white" });
      } else if (join) out.push({ field: "join", text: join, row: 0, col: col + 3, scale: 1, ink: "white", maxWidth: w - 4 });
    }
  }
  if (screen === "select") {
    const names = slotNames(project);
    names.forEach((n, i) => add("slots", `${i + 1}P ${n}`, 10 + i * 2, 1, "cyan"));
  }
  if (screen === "continue") add("slots", "9", 12, 2, "white");
  if (screen === "highScores") SAMPLE_SCORES.forEach((r, i) => add("scores", r.join("  "), 8 + i * 2, 1, i ? "white" : "cyan"));
  if (screenOf(project, screen).credits) add("credits", creditsText(project), CREDITS_ROW, 1, "white");
  return out;
}

export type FitProblem =
  | { kind: "overflow"; field: string; width: number }
  | { kind: "safe"; field: string }
  | { kind: "glyphs"; field: string; chars: string[] };

/** Whether a line fits the screen, stays in the safe area, and uses only the font's glyphs. */
export function lineProblems(line: TextLine): FitProblem[] {
  const out: FitProblem[] = [];
  const width = line.text.length * line.scale;
  const height = line.scale;
  if (width > (line.maxWidth ?? TEXT_COLS) || line.col + width > TEXT_COLS || line.row + height > TEXT_ROWS) out.push({ kind: "overflow", field: line.field, width });
  else if (line.col < SAFE.col0 || line.col + width > SAFE.col1 || line.row < SAFE.row0 || line.row + height > SAFE.row1) {
    // the HUD's top line sits in the board's own HUD rows on purpose
    if (line.field !== "slots" && line.field !== "join" && line.field !== "ammo") out.push({ kind: "safe", field: line.field });
  }
  const chars = unsupportedChars(line.text);
  if (chars.length) out.push({ kind: "glyphs", field: line.field, chars });
  return out;
}

/** A field text's problems before it is placed: too wide for the screen or its safe area, or glyphs the font lacks. */
export function textProblems(text: string, scale: 1 | 2): { overflow: boolean; safe: boolean; chars: string[] } {
  const width = text.length * scale;
  return { overflow: width > TEXT_COLS, safe: width > SAFE.col1 - SAFE.col0, chars: unsupportedChars(text) };
}

/** Every problem of a screen, once per field and kind. */
export function screenProblems(project: Project, screen: MenuScreenId): FitProblem[] {
  const seen = new Set<string>();
  const out: FitProblem[] = [];
  for (const line of screenLines(project, screen))
    for (const pr of lineProblems(line)) {
      const key = `${pr.kind}:${pr.field}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pr);
    }
  return out;
}
