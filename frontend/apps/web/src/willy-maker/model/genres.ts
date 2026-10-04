// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The game genres Willy Maker plans (docs/willy-maker/genres.md), in the
// roadmap's order: the ones that reuse most of today's engine first. The
// platform shooter and the platformer (T-22: the same engine with no
// weapons, stomping, coins and springs) and the beat 'em up (walking a street
// in depth, phase 1) can be made today; the others are
// listed as "coming soon". Names and descriptions live in the core i18n (`genres`).

export const GENRES = [
  "platform-shooter",
  "platformer",
  "beat-em-up",
  "light-gun",
  "horizontal-shooter",
  "vertical-shooter",
  "top-down-shooter",
  "maze",
  "versus-fighting",
  "puzzle",
  "quiz-party",
  "sports",
  "racing",
] as const;

export type GenreId = (typeof GENRES)[number];

/** Every project before format 3 is a platform shooter, the only genre with an engine. */
export const DEFAULT_GENRE: GenreId = "platform-shooter";

/** The genres the engine can play and build today. */
export const AVAILABLE_GENRES: ReadonlySet<GenreId> = new Set<GenreId>(["platform-shooter", "platformer", "beat-em-up", "light-gun", "horizontal-shooter", "vertical-shooter", "top-down-shooter"]);

export function isGenre(v: unknown): v is GenreId {
  return typeof v === "string" && (GENRES as readonly string[]).includes(v);
}

export function genreAvailable(id: GenreId): boolean {
  return AVAILABLE_GENRES.has(id);
}
