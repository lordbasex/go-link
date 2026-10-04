// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The quiz's screen (genres.md, quiz and party): a question's text as the
// board's 8 x 8 font can print it, and where its lines go on the 48 x 28
// text grid. The ROM packer (rom/pack.ts) writes these same lines, and play
// mode (play/renderer.ts) draws them, so both show the same screen.

import type { QuizQuestion } from "../model/types";

/** The question's lines start here, a row apart (QUESTION_STEP); the answers go at ANSWER_ROW + 3 × n. */
export const QUESTION_ROW = 3;
export const QUESTION_STEP = 2;
export const QUESTION_COL = 4;
export const QUESTION_W = 40;
export const QUESTION_LINES = 4;
export const ANSWER_ROW = 12;
export const ANSWER_COL = 6;
export const ANSWER_W = 36;
/** The seconds left, and a slot per player (1P-4P) that shows who answered. */
export const TIME_ROW = 22;
export const PLAYERS_ROW = 24;
export const PLAYER_COLS = [8, 18, 28, 38] as const;
export const LETTERS = ["A", "B", "C"] as const;

/** Text the font can print: upper case, accents dropped, anything else outside ' ' to '_' dropped. */
export function quizText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^\x20-\x5f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Words wrapped to `w` columns (a word longer than a line is cut). */
export function wrap(s: string, w: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(" ").filter(Boolean)) {
    const cut = word.slice(0, w);
    if (!line) line = cut;
    else if (line.length + 1 + cut.length <= w) line += " " + cut;
    else {
      out.push(line);
      line = cut;
    }
  }
  if (line) out.push(line);
  return out;
}

export interface QuizLine {
  row: number;
  col: number;
  text: string;
  /** The answer line's index (0-2), or -1 for the question. */
  answer: number;
}

/** The lines of a question's screen: the question wrapped (at most QUESTION_LINES), then "A  ANSWER" lines. */
export function quizLines(q: QuizQuestion): QuizLine[] {
  const lines: QuizLine[] = wrap(quizText(q.q), QUESTION_W)
    .slice(0, QUESTION_LINES)
    .map((text, i) => ({ row: QUESTION_ROW + QUESTION_STEP * i, col: QUESTION_COL, text, answer: -1 }));
  for (let k = 0; k < 3; k++) lines.push({ row: ANSWER_ROW + 3 * k, col: ANSWER_COL, text: `${LETTERS[k]}  ${quizText(q.a[k] ?? "").slice(0, ANSWER_W)}`, answer: k });
  return lines;
}
