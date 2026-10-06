// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// What a new game of each genre starts with (docs/willy-maker/genres.md):
// its rules, changeable later in the Rules card, and for some genres the
// first levels' shape (a track, a field, an arena, a well, a walkable
// band). Both new game wizards use it.

import { BEATEMUP_RULES, LIGHTGUN_RULES, MAZE_RULES, PUZZLE_RULES, QUIZ_RULES, RACING_RULES, SPORTS_RULES, VERSUS_RULES, PLATFORMER_RULES, SHIP_RULES, TOPDOWN_RULES, VERTICAL_RULES } from "../engine/rules";
import { defaultWalk, type GenreId, type Project, type QuizQuestion } from "../model";
import { shapeArenaLevel, shapeFieldLevel, shapePuzzleLevel, shapeTrackLevel } from "./puzzleLevel";

/** Gives a new project its genre; `quizSamples` are the quiz's first questions, in the editor's language. */
export function applyGenre(p: Project, genre: GenreId, quizSamples: readonly QuizQuestion[]): void {
  p.genre = genre;
  const rules = (r: object) => (p.settings.rules = { ...(p.settings.rules ?? {}), ...r });
  // a platformer: no weapons, stomping
  if (genre === "platformer") rules(PLATFORMER_RULES);
  // a light gun game: crosshairs, a camera that moves by itself and holds at camera locks
  if (genre === "light-gun") rules(LIGHTGUN_RULES);
  // a horizontal shooter: ships over a level the camera scrolls by itself
  if (genre === "horizontal-shooter") rules(SHIP_RULES);
  // a vertical shooter: the same ships, climbing the level from its bottom
  if (genre === "vertical-shooter") rules(VERTICAL_RULES);
  // a top-down run and gun: seen from above, walking and shooting in 8 directions
  if (genre === "top-down-shooter") rules(TOPDOWN_RULES);
  // a maze game: grid moves, dots in every empty cell, chasers
  if (genre === "maze") rules(MAZE_RULES);
  // a racing game: cars on a ring track seen from above
  if (genre === "racing") {
    rules(RACING_RULES);
    for (const level of p.levels) shapeTrackLevel(level);
  }
  // a sports game: football on a field with a goal at each end
  if (genre === "sports") {
    rules(SPORTS_RULES);
    for (const level of p.levels) shapeFieldLevel(level);
  }
  // a versus fighting game: two fighters on a one-screen floor
  if (genre === "versus-fighting") {
    rules(VERSUS_RULES);
    for (const level of p.levels) shapeArenaLevel(level);
  }
  // a quiz game: questions on the screen, a few samples to start from
  if (genre === "quiz-party") {
    rules(QUIZ_RULES);
    p.quiz = quizSamples.map((q) => ({ ...q, a: [...q.a] as [string, string, string] }));
    for (const level of p.levels) shapePuzzleLevel(level, true);
  }
  // a puzzle game: a well of falling gems per player, framed by the level's walls
  if (genre === "puzzle") {
    rules(PUZZLE_RULES);
    for (const level of p.levels) shapePuzzleLevel(level);
  }
  // a beat 'em up walks a street in depth: its rules, and a band over each level's floor
  if (genre === "beat-em-up") {
    rules(BEATEMUP_RULES);
    for (const level of p.levels) level.walk = defaultWalk(level);
  }
}
