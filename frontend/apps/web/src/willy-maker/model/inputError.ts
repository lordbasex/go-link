// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A file the user gave that cannot be used: a code the UI translates
// (i18n core `inputErrors`), with its values. Readers throw it instead of
// a plain Error, so every bad input reaches the user as a sentence in
// their language and never as a crash or a half-imported project.

export const INPUT_ERRORS = [
  "zip.not-zip",
  "zip.broken",
  "zip.encrypted",
  "zip.too-big",
  "zip.too-many",
  "zip.method",
  "zip.damaged",
  "zip.no-streams",
  "project.missing",
  "project.json",
  "project.not-project",
  "project.newer",
  "project.hash",
  "project.too-big",
  "tiled.not-map",
  "tiled.grid",
  "tiled.too-big",
  "tiled.tmx-csv",
  "tiled.tmx-here",
  "image.not-image",
  "image.too-big",
  "image.too-small",
  "image.empty",
  "image.unreadable",
  "file.too-big",
] as const;

export type InputErrorCode = (typeof INPUT_ERRORS)[number];

export class InputError extends Error {
  constructor(
    public code: InputErrorCode,
    public params: Record<string, string | number> = {},
  ) {
    super(`${code}${Object.keys(params).length ? ` ${JSON.stringify(params)}` : ""}`);
    this.name = "InputError";
  }
}

/** The translated sentence of an error from reading a file ("unknown" for anything else). */
export function inputErrorText(texts: Record<InputErrorCode | "unknown", (p: Record<string, string | number>) => string>, e: unknown): string {
  if (e instanceof InputError) return texts[e.code](e.params);
  return texts.unknown({});
}
