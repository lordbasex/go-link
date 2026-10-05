// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The project .zip (docs/willy-maker/file-format.md): project.json, every
// picture in assets/ named by its SHA-256, a thumbnail per level and a
// README. Import checks the format, every hash and every size before
// anything is replaced.

import { InputError, migrateProject, newId, type Project } from "../model";
import { extensionOf, getAsset, hexOfRef, refOf, sniffType, type StoredAsset } from "./assets";
import { assetRefs } from "./storage";
import { readZip, writeZip, type ZipEntry } from "./zip";

const README = `This is a Willy Maker project (go-link Tools).
Open it in Willy Maker (maker.go-link.org): "Open .zip".

project.json   the game: board, settings, levels, characters
assets/        every picture, named by its SHA-256
thumbnails/    a small picture of each level
`;

export interface ExportOptions {
  /** PNG bytes of each level's thumbnail, by level id. */
  thumbnails?: Record<string, Uint8Array>;
}

/** A file name from the title: "The Lag Protocol" -> "the-lag-protocol.willy.zip". */
export function zipName(p: Project): string {
  const slug = p.title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "willy-maker-game"}.willy.zip`;
}

export async function exportProjectZip(p: Project, opts: ExportOptions = {}): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const entries: ZipEntry[] = [{ name: "project.json", data: enc.encode(JSON.stringify(p, null, 2)) }];
  for (const ref of assetRefs(p)) {
    const a = await getAsset(ref);
    const hex = hexOfRef(ref);
    if (a && hex) entries.push({ name: `assets/${hex}.${extensionOf(a.type)}`, data: a.bytes });
  }
  for (const [id, png] of Object.entries(opts.thumbnails ?? {})) entries.push({ name: `thumbnails/${id.replace(/[^A-Za-z0-9_-]/g, "_")}.png`, data: png });
  entries.push({ name: "README.txt", data: enc.encode(README) });
  return writeZip(entries);
}

export interface ImportedProject {
  project: Project;
  assets: StoredAsset[];
  /** Pictures project.json points at that the zip does not carry. */
  missing: string[];
}

/** Reads and checks a project .zip. Throws an InputError the UI translates. */
export async function importProjectZip(bytes: Uint8Array): Promise<ImportedProject> {
  const files = await readZip(bytes);
  const json = files.get("project.json");
  if (!json) throw new InputError("project.missing");
  let project: Project;
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new InputError("project.json");
  }
  try {
    project = migrateProject(raw);
  } catch (e) {
    throw e instanceof InputError ? e : new InputError("project.not-project");
  }
  const assets: StoredAsset[] = [];
  const have = new Set<string>();
  for (const [name, data] of files) {
    const m = /^assets\/([0-9a-f]{64})\.[a-z0-9]+$/.exec(name);
    if (!m) continue;
    const ref = refOf(data);
    if (ref !== `sha256:${m[1]}`) throw new InputError("project.hash", { name });
    assets.push({ ref, type: sniffType(data), bytes: data });
    have.add(ref);
  }
  const missing = [...assetRefs(project)].filter((r) => !have.has(r));
  return { project, assets, missing };
}

/** The same project under a new id ("keep both"). */
export function asCopy(p: Project, titleSuffix: string): Project {
  return { ...p, id: newId(), title: `${p.title} ${titleSuffix}`.trim(), updatedAt: new Date().toISOString() };
}
