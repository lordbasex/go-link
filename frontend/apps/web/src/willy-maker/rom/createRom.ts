// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Create ROM in the browser: fetches the prebuilt engine once (same origin,
// public/willy-maker/engine/), decodes the game's tileset pictures and its
// players' own heroes' pictures from the asset store, packs the game (pack.ts) and zips the set. The power-on test
// (validation level 3) runs on the result in the Export tab.

import { getAsset } from "../io/assets";
import { decodePng } from "../io/png";
import { writeZip } from "../io/zip";
import { BUILTIN_HERO, type AssetRef, type Project } from "../model";
import { playerSlots } from "../game/settings";
import { packGame, romSymbols, type Engine, type EngineManifest, type PackResult, type Picture } from "./pack";

export const ENGINE_URL = "/willy-maker/engine/";

/** The steps Create ROM reports while it works. */
export const CREATE_STEPS = ["engine", "pictures", "pack", "zip"] as const;
export type CreateStep = (typeof CREATE_STEPS)[number];

let cached: Promise<Engine> | null = null;

async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const d = new Uint8Array(await subtle.digest("SHA-256", bytes.slice().buffer));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The engine, fetched once per page; its SHA-256 must match its manifest. */
export function loadEngine(base = ENGINE_URL, fetcher: typeof fetch = fetch): Promise<Engine> {
  if (cached && base === ENGINE_URL) return cached;
  const p = (async () => {
    const [mRes, bRes] = await Promise.all([fetcher(`${base}engine.json`), fetcher(`${base}engine.bin`)]);
    if (!mRes.ok || !bRes.ok) throw new Error(`the engine did not load (${mRes.status}, ${bRes.status})`);
    const manifest = (await mRes.json()) as EngineManifest;
    const bin = new Uint8Array(await bRes.arrayBuffer());
    const hash = await sha256Hex(bin);
    if (hash && hash !== manifest.sha256) throw new Error("the engine file does not match its manifest");
    return { manifest, bin };
  })();
  if (base === ENGINE_URL) {
    cached = p;
    p.catch(() => (cached = null));
  }
  return p;
}

/** Reads a stored picture: the browser's asset store, or a project file's assets (rom/headless.ts). */
export type AssetLoader = (ref: AssetRef) => Promise<{ bytes: Uint8Array; type: string } | null>;

async function picture(ref: AssetRef, load: AssetLoader): Promise<Picture | null> {
  const asset = await load(ref);
  if (!asset) return null;
  try {
    const img = await decodePng(asset.bytes);
    return { w: img.w, h: img.h, rgba: img.data };
  } catch {
    // not a PNG: packed without it, and a note says so
    return null;
  }
}

/** The decoded pictures of the project's tilesets, by tileset id. */
export async function tilesetPictures(project: Project, load: AssetLoader = getAsset): Promise<Map<string, Picture>> {
  const out = new Map<string, Picture>();
  for (const ts of project.tilesets) {
    const pic = ts.image ? await picture(ts.image, load) : null;
    if (pic) out.set(ts.id, pic);
  }
  return out;
}

/** The decoded pictures of the heroes the players use (not Willy), by character id. */
export async function characterPictures(project: Project, load: AssetLoader = getAsset): Promise<Map<string, Picture>> {
  const out = new Map<string, Picture>();
  const used = new Set(playerSlots(project).map((s) => s.character).filter((id) => id !== BUILTIN_HERO));
  for (const ch of project.characters) {
    if (!used.has(ch.id) || !ch.sheet) continue;
    const pic = await picture(ch.sheet, load);
    if (pic) out.set(ch.id, pic);
  }
  return out;
}

export interface CreatedRom {
  name: string;
  zip: Uint8Array;
  symbols: string;
  pack: PackResult;
}

/** A fixed date for every file, so the same game gives the same .zip. */
const ZIP_DATE = new Date(2026, 0, 1, 0, 0, 0);

export async function zipSet(files: Map<string, Uint8Array>): Promise<Uint8Array> {
  const entries = [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, data]) => ({ name, data }));
  return writeZip(entries, { compress: true, date: ZIP_DATE });
}

export async function createRom(project: Project, onStep: (step: CreateStep) => void = () => {}, engineLoader: () => Promise<Engine> = () => loadEngine(), load: AssetLoader = getAsset): Promise<CreatedRom> {
  onStep("engine");
  const engine = await engineLoader();
  onStep("pictures");
  const pictures = await tilesetPictures(project, load);
  const heroes = await characterPictures(project, load);
  onStep("pack");
  const pack = packGame(project, engine, (id) => pictures.get(id) ?? null, (id) => heroes.get(id) ?? null);
  onStep("zip");
  const zip = await zipSet(pack.files);
  return { name: `${engine.manifest.set}.zip`, zip, symbols: romSymbols(engine), pack };
}
