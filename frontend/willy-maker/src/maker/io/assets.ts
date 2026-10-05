// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Pictures (sprite sheets, tilesets) live in IndexedDB keyed by their
// SHA-256, and projects point at them as "sha256:<hex>". When IndexedDB is
// blocked (private windows, previews), they stay in memory for this page
// and `persistent` says so. Every access is wrapped: storage problems never
// break the editor.

import { sha256 } from "@go-link/shared";
import type { AssetRef } from "../model";

const DB = "go-link-willy-maker";
const STORE = "assets";

export interface StoredAsset {
  ref: AssetRef;
  type: string;
  bytes: Uint8Array;
}

export function hexOf(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function refOf(bytes: Uint8Array): AssetRef {
  return `sha256:${hexOf(sha256(bytes))}`;
}

export function hexOfRef(ref: string): string | null {
  const m = /^sha256:([0-9a-f]{64})$/.exec(ref);
  return m ? m[1]! : null;
}

/** The media type of a picture from its first bytes. */
export function sniffType(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return "application/octet-stream";
}

export function extensionOf(type: string): string {
  return type === "image/jpeg" ? "jpg" : type === "image/gif" ? "gif" : type === "image/webp" ? "webp" : type === "image/png" ? "png" : "bin";
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, StoredAsset>();
const urls = new Map<string, string>();

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** A request in its own transaction; writes resolve only once committed (a full disk fails the commit, not the request). */
function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onerror = () => resolve(undefined);
      if (mode === "readonly") req.onsuccess = () => resolve(req.result);
      else {
        t.oncomplete = () => resolve(req.result);
        t.onabort = () => resolve(undefined);
        t.onerror = () => resolve(undefined);
      }
    } catch {
      resolve(undefined);
    }
  });
}

/** A picture could not be written (storage full or failing): it lives only in this page's memory. */
let writeFailed = false;

/** Whether pictures survive a reload (IndexedDB works). */
export async function assetsPersistent(): Promise<boolean> {
  return (await openDb()) !== null && !writeFailed;
}

/** Stores a picture; returns its reference. Storing the same bytes twice is free. */
export async function putAsset(bytes: Uint8Array, type = sniffType(bytes)): Promise<AssetRef> {
  const ref = refOf(bytes);
  const asset: StoredAsset = { ref, type, bytes };
  memory.set(ref, asset);
  const db = await openDb();
  if (db) {
    const stored = await tx(db, "readwrite", (s) => s.put({ type, bytes }, ref));
    if (stored === undefined) writeFailed = true;
  }
  return ref;
}

export async function getAsset(ref: string): Promise<StoredAsset | null> {
  const hit = memory.get(ref);
  if (hit) return hit;
  const db = await openDb();
  if (!db) return null;
  const row = await tx<{ type: string; bytes: Uint8Array } | undefined>(db, "readonly", (s) => s.get(ref));
  if (!row) return null;
  const asset: StoredAsset = { ref: ref as AssetRef, type: row.type, bytes: new Uint8Array(row.bytes) };
  memory.set(ref, asset);
  return asset;
}

export async function deleteAsset(ref: string): Promise<void> {
  memory.delete(ref);
  const url = urls.get(ref);
  if (url) {
    URL.revokeObjectURL(url);
    urls.delete(ref);
  }
  const db = await openDb();
  if (db) await tx(db, "readwrite", (s) => s.delete(ref));
}

export async function listAssets(): Promise<string[]> {
  const db = await openDb();
  if (!db) return [...memory.keys()];
  const keys = (await tx<IDBValidKey[]>(db, "readonly", (s) => s.getAllKeys())) ?? [];
  return [...new Set([...keys.map(String), ...memory.keys()])];
}

/** A blob: URL for a stored picture (cached per page), or null. */
export async function assetUrl(ref: string | null | undefined): Promise<string | null> {
  if (!ref) return null;
  const cached = urls.get(ref);
  if (cached) return cached;
  const asset = await getAsset(ref);
  if (!asset || typeof URL.createObjectURL !== "function") return null;
  const url = URL.createObjectURL(new Blob([asset.bytes as Uint8Array<ArrayBuffer>], { type: asset.type }));
  urls.set(ref, url);
  return url;
}

/** Test hook: forget the in-memory copies and the database handle. */
export function resetAssetCacheForTests(): void {
  memory.clear();
  urls.clear();
  dbPromise = null;
  writeFailed = false;
}
