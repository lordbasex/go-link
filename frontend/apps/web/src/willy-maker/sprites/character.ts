// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The importer's draft and how it becomes a project character: the 1:1
// atlas is the character's `sheet`, its frames are the atlas rectangles,
// its zones are sprite palettes. The dropped sheet and the boxes drawn on
// it are kept in `source`, so the character can be opened and edited again.

import type { AssetRef, Character, CharacterRole, Frame, Palette, Project } from "../model";
import type { AtlasRect, DraftAnim, SourceFrame, Zone } from "./convert";

export type DetectMode = "figures" | "grid";

/** What the importer needs to reopen a character (stored in the project as `source`). */
export interface CharacterSource {
  sheet: AssetRef;
  /** The sheet's file name, for the screen. */
  file: string;
  mode: DetectMode;
  tolerance: number;
  grid: { w: number; h: number };
  /** The boxes in sheet pixels, pivots from their top left. */
  frames: SourceFrame[];
  /** Built-in animations the user deleted from the list. */
  hiddenAnims?: string[];
}

/** A character as the importer stores it: the model's, plus where it came from. */
export type ImportedCharacter = Character & { source?: CharacterSource };

export interface Draft {
  id: string | null;
  name: string;
  role: CharacterRole;
  height: number;
  file: string;
  sheet: AssetRef | null;
  mode: DetectMode;
  tolerance: number;
  grid: { w: number; h: number };
  frames: SourceFrame[];
  anims: Record<string, DraftAnim>;
  swapColors: string[];
  /** Built-in animations deleted from the list (shown again on request). */
  hidden: string[];
}

export function emptyDraft(): Draft {
  return { id: null, name: "", role: "hero", height: 44, file: "", sheet: null, mode: "figures", tolerance: 18, grid: { w: 48, h: 48 }, frames: [], anims: {}, swapColors: [], hidden: [] };
}

/** The draft of a saved character (null when it was not made by the importer). */
export function draftOf(ch: ImportedCharacter): Draft | null {
  const src = ch.source;
  if (!src) return null;
  // atlas frame ids are the source ids, so the animations carry over as they are
  return {
    id: ch.id,
    name: ch.name,
    role: ch.role,
    height: ch.height,
    file: src.file,
    sheet: src.sheet,
    mode: src.mode,
    tolerance: src.tolerance,
    grid: { ...src.grid },
    frames: src.frames.map((f) => ({ ...f })),
    anims: Object.fromEntries(Object.entries(ch.anims).map(([k, a]) => [k, { frames: [...a.frames], fps: a.fps, loop: a.loop }])),
    swapColors: [...ch.swapColors],
    hidden: Array.isArray(src.hiddenAnims) ? src.hiddenAnims.filter((x) => typeof x === "string") : [],
  };
}

export const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "character";

/** A character id not used by another character of the project. */
export function uniqueCharacterId(project: Project, name: string, self: string | null): string {
  const base = slug(name);
  const taken = new Set(project.characters.filter((c) => c.id !== self).map((c) => c.id));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export interface BuildInput {
  draft: Draft;
  /** The 1:1 atlas picture's reference. */
  atlas: AssetRef;
  rects: AtlasRect[];
  zones: Zone[];
}

/**
 * The project with this character saved: the character itself (replaced
 * when it existed), its zone palettes (its old ones dropped), and nothing
 * else touched.
 */
export function saveCharacter(project: Project, { draft, atlas, rects, zones }: BuildInput): { project: Project; character: ImportedCharacter } {
  const id = draft.id ?? uniqueCharacterId(project, draft.name, null);
  const palettes: Palette[] = zones.map((z) => ({ id: `pal-${id}-${z.kind === "row" ? `row${z.index + 1}` : z.kind}`, group: "sprite", colors: z.palette.slice(0, 15) }));
  const ids = palettes.map((p) => p.id);
  const frames: Frame[] = rects.map((r) => {
    const rows = Math.max(1, Math.ceil(r.h / 16));
    return { id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, px: r.px, py: r.py, zones: ids.slice(Math.max(0, ids.length - rows)), muzzle: null, hand: null };
  });
  const known = new Set(frames.map((f) => f.id));
  const anims = Object.fromEntries(
    Object.entries(draft.anims)
      .map(([name, a]) => [name, { frames: a.frames.filter((f) => known.has(f)), fps: a.fps, loop: a.loop }] as const)
      .filter(([, a]) => a.frames.length > 0),
  );
  const character: ImportedCharacter = {
    id,
    name: draft.name.trim() || id,
    role: draft.role,
    height: draft.height,
    sheet: atlas,
    frames,
    anims,
    swapColors: draft.swapColors.filter((c) => zones.some((z) => z.palette.includes(c))),
    source: draft.sheet
      ? { sheet: draft.sheet, file: draft.file, mode: draft.mode, tolerance: draft.tolerance, grid: { ...draft.grid }, frames: draft.frames.map((f) => ({ ...f })), ...(draft.hidden.length ? { hiddenAnims: [...draft.hidden] } : {}) }
      : undefined,
  };
  if (!character.source) delete character.source;
  const old = project.characters.find((c) => c.id === id);
  const oldPalettes = new Set(old ? old.frames.flatMap((f) => f.zones) : []);
  const otherUse = new Set(project.characters.filter((c) => c.id !== id).flatMap((c) => c.frames.flatMap((f) => f.zones)));
  const kept = project.palettes.filter((p) => !(oldPalettes.has(p.id) && !otherUse.has(p.id)) && !ids.includes(p.id));
  const characters = old ? project.characters.map((c) => (c.id === id ? character : c)) : [...project.characters, character];
  return { project: { ...project, characters, palettes: [...kept, ...palettes], updatedAt: new Date().toISOString() }, character };
}

/** The project without this character and the palettes only it used. */
export function removeCharacter(project: Project, id: string): Project {
  const gone = project.characters.find((c) => c.id === id);
  if (!gone) return project;
  const mine = new Set(gone.frames.flatMap((f) => f.zones));
  const otherUse = new Set(project.characters.filter((c) => c.id !== id).flatMap((c) => c.frames.flatMap((f) => f.zones)));
  return {
    ...project,
    characters: project.characters.filter((c) => c.id !== id),
    palettes: project.palettes.filter((p) => !mine.has(p.id) || otherUse.has(p.id)),
    updatedAt: new Date().toISOString(),
  };
}
