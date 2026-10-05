// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The quiz's lab game (rom/tools/lab/runs/quiz-answers.json): an empty
// screen, four questions (one long enough to wrap, one with accents the font
// drops), two players.

import { shapePuzzleLevel } from "../editor/puzzleLevel";
import { QUIZ_RULES } from "../engine/rules";
import type { Project } from "../model";
import { projectFromTemplate } from "../templates";

/** The minigames' lab game (rom/tools/lab/runs/quiz-games.json): one of each, a question, then two in turns (phase 3), with categories. */
export function quizGamesProject(): Project {
  const p = quizProject();
  p.title = "Quiz games";
  p.quiz = [
    { kind: "mash", q: "Mash B1 as fast as you can!", a: ["", "", ""], right: 0 },
    { kind: "timing", q: "", a: ["", "", ""], right: 0 },
    { kind: "memory", q: "Remember the letters, then press them", a: ["", "", ""], right: 0 },
    { q: "Was that fun?", a: ["Yes", "Very", "Both"], right: 2, category: "Feelings" },
    { q: "Your turn: which is a color?", a: ["Blue", "Seven", "Fast"], right: 0, turn: true, category: "Colors" },
    { q: "Your turn: which is a number?", a: ["Red", "Nine", "Slow"], right: 1, turn: true, category: "Numbers" },
  ];
  return p;
}

export function quizProject(): Project {
  const p = projectFromTemplate("empty", { title: "Quiz", layout: "slammast", players: 2, levelName: "Quiz", screens: 1, height: 224 });
  p.genre = "quiz-party";
  p.settings.rules = { ...p.settings.rules, ...QUIZ_RULES };
  shapePuzzleLevel(p.levels[0]!, true);
  p.quiz = [
    { q: "How many buttons answer a question?", a: ["One", "Two", "Three"], right: 2 },
    { q: "Which of these is a board this game runs on, made long ago for arcades and still played today by many people around the world?", a: ["CPS-1", "A toaster", "A bicycle"], right: 0 },
    { q: "¿Cuántos jugadores entran a la vez?", a: ["Uno", "Dos", "Cuatro"], right: 2 },
    { q: "What clears the level?", a: ["The last question", "A key", "An exit"], right: 0 },
  ];
  return p;
}
