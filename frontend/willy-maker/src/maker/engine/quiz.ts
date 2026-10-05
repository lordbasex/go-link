// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The quiz's screen (genres.md, quiz and party): a question's text as the
// board's 8 x 8 font can print it, and where its lines go on the 48 x 28
// text grid. The ROM packer (rom/pack.ts) writes these same lines, and play
// mode (play/renderer.ts) draws them, so both show the same screen.

import type { QuizQuestion } from "../model/types";

/** The question's lines start here, a row apart (QUESTION_STEP); the answers go at ANSWER_ROW + 3 × n. */
export const QUESTION_ROW = 4;
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
/** Phase 3: an item's category, above it, in cyan. */
export const CATEGORY_ROW = 2;
export const CATEGORY_COL = 4;

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
  /** The answer line's index (0-2), -1 for the question, -2 for the category. */
  answer: number;
}

/** An item's category line (after its other lines: the first line carries the item's kind and turn), if it has one. */
export function categoryLines(q: QuizQuestion): QuizLine[] {
  const text = quizText(q.category ?? "").slice(0, QUESTION_W);
  return text ? [{ row: CATEGORY_ROW, col: CATEGORY_COL, text, answer: -2 }] : [];
}

/** The lines of a question's screen: the question wrapped (at most QUESTION_LINES), then "A  ANSWER" lines; a minigame's, its instructions. */
export function quizLines(q: QuizQuestion): QuizLine[] {
  if (kindOf(q) !== "question") return [...miniLines(q), ...categoryLines(q)];
  const lines: QuizLine[] = wrap(quizText(q.q), QUESTION_W)
    .slice(0, QUESTION_LINES)
    .map((text, i) => ({ row: QUESTION_ROW + QUESTION_STEP * i, col: QUESTION_COL, text, answer: -1 }));
  for (let k = 0; k < 3; k++) lines.push({ row: ANSWER_ROW + 3 * k, col: ANSWER_COL, text: `${LETTERS[k]}  ${quizText(q.a[k] ?? "").slice(0, ANSWER_W)}`, answer: k });
  return [...lines, ...categoryLines(q)];
}

/** The minigames' kinds as the ROM numbers them (bits 2-3 of the first line's attributes). */
export const QUIZ_KINDS = ["question", "mash", "timing", "memory"] as const;
export type QuizKind = (typeof QUIZ_KINDS)[number];

export function kindOf(q: QuizQuestion | undefined): QuizKind {
  return q?.kind && QUIZ_KINDS.includes(q.kind) ? q.kind : "question";
}

/** Where the minigames draw: the timing bar's row and left column, the memory letter's cell. */
export const BAR_ROW = 14;
export const BAR_COL = 4;
export const MEM_ROW = 13;
export const MEM_COL = 23;

/** The timing marker's cell (0 to TIMING_W - 1) at frame t: across and back. */
export function timingCell(t: number, w: number, step: number): number {
  const i = Math.floor(t / step) % (2 * w);
  return i < w ? i : 2 * w - 1 - i;
}

/** The memory minigame's letters (0-2) for item n: a 32-bit LCG seeded (n + 1) × 7919. */
export function memorySeq(n: number, len: number): number[] {
  let s = (Math.imul(n + 1, 7919)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    out.push(((s >>> 16) & 0xffff) % 3);
  }
  return out;
}

/** A minigame's screen: its instructions wrapped from QUESTION_ROW, a row apart. */
export const MINI_TITLES: Record<Exclude<QuizKind, "question">, string> = { mash: "MASH B1!", timing: "STOP THE MARKER IN THE MIDDLE WITH B1", memory: "REMEMBER THE LETTERS, THEN PRESS THEM" };

export function miniLines(q: QuizQuestion): QuizLine[] {
  const kind = kindOf(q);
  return wrap(quizText(q.q) || MINI_TITLES[kind === "question" ? "mash" : kind], QUESTION_W)
    .slice(0, QUESTION_LINES)
    .map((text, i) => ({ row: QUESTION_ROW + QUESTION_STEP * i, col: QUESTION_COL, text, answer: -1 }));
}
