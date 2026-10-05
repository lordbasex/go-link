// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Projects are saved in localStorage: one key per project plus an index for
// the "My games" list. Pictures go to IndexedDB (assets.ts). Every access is
// wrapped: when storage is blocked or full, saving reports it and the editor
// keeps working on what is in memory.

import { migrateProject, objectLayer, type Project } from "../model";
import { deleteAsset } from "./assets";

const INDEX = "go-link.wm.index";
const PREFIX = "go-link.wm.p.";

export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt: string;
  levels: number;
  board: string;
  /** Characters and objects, for the list's subtitle. */
  characters: number;
  objects: number;
}

export type SaveResult = { ok: true; bytes: number } | { ok: false; reason: "blocked" | "full" };

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function summaryOf(p: Project): ProjectSummary {
  return {
    id: p.id,
    title: p.title,
    updatedAt: p.updatedAt,
    levels: p.levels.length,
    board: `${p.board.id}/${p.board.layout}`,
    characters: p.characters.length,
    objects: p.levels.reduce((n, l) => n + objectLayer(l).items.length, 0),
  };
}

export function listProjects(): ProjectSummary[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = JSON.parse(s.getItem(INDEX) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return (raw as ProjectSummary[]).filter((x) => x && typeof x.id === "string").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function writeIndex(s: Storage, list: ProjectSummary[]): void {
  s.setItem(INDEX, JSON.stringify(list));
}

export function loadProject(id: string): Project | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + id);
    return raw ? migrateProject(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveProject(p: Project): SaveResult {
  const s = storage();
  if (!s) return { ok: false, reason: "blocked" };
  try {
    const json = JSON.stringify(p);
    s.setItem(PREFIX + p.id, json);
    const list = listProjects().filter((x) => x.id !== p.id);
    list.unshift(summaryOf(p));
    writeIndex(s, list);
    return { ok: true, bytes: json.length };
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    return { ok: false, reason: name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" ? "full" : "blocked" };
  }
}

/** Every picture a project points at. */
export function assetRefs(p: Project): Set<string> {
  const refs = new Set<string>();
  for (const c of p.characters) {
    if (c.sheet) refs.add(c.sheet);
    // the character importer keeps the original sheet for editing again
    const source = (c as { source?: { sheet?: unknown } }).source;
    if (typeof source?.sheet === "string" && source.sheet.startsWith("sha256:")) refs.add(source.sheet);
  }
  for (const t of p.tilesets) if (t.image) refs.add(t.image);
  // the image AI prompt helper's reference pictures
  for (const c of Object.values(p.settings.imagePrompts ?? {})) {
    const imgs = (c as { refImages?: unknown }).refImages;
    if (Array.isArray(imgs)) for (const r of imgs) if (typeof r === "string" && r.startsWith("sha256:")) refs.add(r);
  }
  return refs;
}

/** Deletes a project and the pictures no other saved project uses. */
export async function deleteProject(id: string): Promise<void> {
  const s = storage();
  if (!s) return;
  const gone = loadProject(id);
  try {
    s.removeItem(PREFIX + id);
    writeIndex(
      s,
      listProjects().filter((x) => x.id !== id),
    );
  } catch {
    return;
  }
  if (!gone) return;
  const still = new Set<string>();
  for (const other of listProjects()) {
    const p = loadProject(other.id);
    if (p) for (const r of assetRefs(p)) still.add(r);
  }
  for (const r of assetRefs(gone)) if (!still.has(r)) await deleteAsset(r);
}

/**
 * Calls `save` a moment after the last change (autosave), and at once on
 * `flush()` (leaving the page, exporting).
 */
export function autosaver(save: () => void, delayMs = 700) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    touch() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        save();
      }, delayMs);
    },
    flush() {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      save();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    get pending() {
      return timer !== null;
    },
  };
}
