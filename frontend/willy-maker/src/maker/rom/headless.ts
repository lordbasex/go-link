// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Create ROM without a browser (experiment 1, T-14): a project file
// (.willy.zip, the Export tab's Save project) in, the same ROM set the
// Export tab makes out, with its symbol map, the review and the notes, in
// English. rom/tools/willy-rom.mjs runs it from the command line; the
// pictures come from the project file's own assets instead of the browser's
// store, so the same project gives the same .zip in both.

import { importProjectZip } from "../io/projectZip";
import { checkText, reviewProject } from "../editor/validate";
import { EXTRA_RULES } from "../editor/validate/extra";
import { exportEn } from "../i18n/export.en";
import { createRom, type CreatedRom } from "./createRom";
import type { Engine } from "./pack";

export interface HeadlessRom extends CreatedRom {
  title: string;
  /** The review's errors and warnings, as sentences (errors first). */
  errors: string[];
  warnings: string[];
  /** What the engine leaves out of this game, as sentences. */
  notes: string[];
  /** Pictures project.json points at that the project file does not carry. */
  missing: string[];
}

/** Builds the ROM from a project file. With review errors it stops, unless `force`. */
export async function romFromProjectFile(bytes: Uint8Array, engine: Engine, opts: { force?: boolean } = {}): Promise<HeadlessRom> {
  const { project, assets, missing } = await importProjectZip(bytes);
  const byRef = new Map(assets.map((a) => [a.ref, a]));
  const review = reviewProject(project, { extra: EXTRA_RULES });
  const text = (c: (typeof review.checks)[number]) => c.texts?.en ?? checkText(exportEn, c);
  const errors = review.checks.filter((c) => c.severity === "error").map(text);
  const warnings = review.checks.filter((c) => c.severity === "warning").map(text);
  if (errors.length && !opts.force) throw new Error(`the review found ${errors.length} error${errors.length === 1 ? "" : "s"}:\n- ${errors.join("\n- ")}`);
  const rom = await createRom(project, () => {}, async () => engine, async (ref) => byRef.get(ref) ?? null);
  const notes = rom.pack.notes.map((n) => (exportEn.rom.notes[n.id] ?? (() => n.id))(n.params ?? {}));
  return { ...rom, title: project.title, errors, warnings, notes, missing };
}
