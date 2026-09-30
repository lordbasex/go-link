// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// The skin editor's library: every skin the designer works on is one record
// in this browser's localStorage (nothing is sent anywhere). One key holds
// them all.
import type { Orient } from "./layout";
import { clone, type SkinJson } from "./model";

export const STORE_KEY = "go-link.skin-editor";

export type Guides = Record<Orient, { x: number[]; y: number[] }>;

export interface SkinRecord {
  skin: SkinJson;
  file: string;
  guides: Guides;
  updatedAt: number;
  /** Changed since its last export. */
  dirty?: boolean;
}

export interface Library {
  /** The record on screen; null while a built-in skin (read-only) is shown. */
  current: string | null;
  skins: Record<string, SkinRecord>;
}

export const emptyGuides = (): Guides => ({ portrait: { x: [], y: [] }, landscape: { x: [], y: [] } });

const isSkin = (v: unknown): v is SkinJson => !!v && typeof v === "object" && (v as SkinJson).format === 1 && typeof (v as SkinJson).id === "string";

function goodGuides(v: unknown): Guides {
  const g = v as Guides | undefined;
  const axis = (a: unknown) => ({
    x: Array.isArray((a as { x?: unknown })?.x) ? ((a as { x: unknown[] }).x.filter((n) => typeof n === "number") as number[]) : [],
    y: Array.isArray((a as { y?: unknown })?.y) ? ((a as { y: unknown[] }).y.filter((n) => typeof n === "number") as number[]) : [],
  });
  return { portrait: axis(g?.portrait), landscape: axis(g?.landscape) };
}

/** A new record id, unique in the library. */
export function newRecordId(lib: Library): string {
  for (;;) {
    const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    if (!lib.skins[id]) return id;
  }
}

/** Reads whatever the key holds: the library, or nothing usable (an empty library). */
export function parseLibrary(raw: string | null, now = Date.now()): Library {
  const lib: Library = { current: null, skins: {} };
  if (!raw) return lib;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return lib;
  }
  if (!v || typeof v !== "object") return lib;
  const o = v as { current?: unknown; skins?: unknown };
  if (o.skins && typeof o.skins === "object") {
    for (const [id, r] of Object.entries(o.skins as Record<string, Partial<SkinRecord>>)) {
      if (!r || !isSkin(r.skin)) continue;
      lib.skins[id] = {
        skin: r.skin,
        file: typeof r.file === "string" ? r.file : "",
        guides: goodGuides(r.guides),
        updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : now,
        dirty: !!r.dirty,
      };
    }
    lib.current = typeof o.current === "string" && lib.skins[o.current] ? o.current : null;
  }
  return lib;
}

export function readLibrary(): Library {
  try {
    return parseLibrary(window.localStorage.getItem(STORE_KEY));
  } catch {
    // private window or blocked storage: an empty library that is never kept
    return { current: null, skins: {} };
  }
}

/** Saves the library; false when the browser refuses (blocked or full). */
export function writeLibrary(lib: Library): boolean {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(lib));
    return true;
  } catch {
    return false;
  }
}

/** Records, the most recently changed first. */
export function sortedRecords(lib: Library): [string, SkinRecord][] {
  return Object.entries(lib.skins).sort((a, b) => b[1].updatedAt - a[1].updatedAt);
}

/** An id no record uses yet: base, base-2, base-3... */
export function freeSkinId(lib: Library, base: string): string {
  const used = new Set(Object.values(lib.skins).map((r) => r.skin.id));
  const clean = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "my-skin";
  if (!used.has(clean)) return clean;
  for (let n = 2; ; n++) if (!used.has(`${clean}-${n}`)) return `${clean}-${n}`;
}

/**
 * A copy of a skin with a free id and "(copy)" on each name, for a built-in
 * skin edited for the first time or a record duplicated.
 */
export function copyOf(lib: Library, skin: SkinJson, suffix: Record<string, string>, idBase: string): SkinJson {
  const c = clone(skin);
  c.id = freeSkinId(lib, idBase);
  const name: Record<string, string> = {};
  for (const [lang, text] of Object.entries(skin.name ?? {})) name[lang] = `${text} ${suffix[lang] ?? suffix.en ?? ""}`.trim();
  c.name = name;
  return c;
}

/** Adds a record and makes it current; returns its id. */
export function addRecord(lib: Library, rec: Omit<SkinRecord, "updatedAt">, now = Date.now()): string {
  const id = newRecordId(lib);
  lib.skins[id] = { ...rec, updatedAt: now };
  lib.current = id;
  return id;
}

/** Deletes a record; when it was current, the most recent other one (or none) takes its place. */
export function removeRecord(lib: Library, id: string): void {
  delete lib.skins[id];
  if (lib.current === id) lib.current = sortedRecords(lib)[0]?.[0] ?? null;
}
