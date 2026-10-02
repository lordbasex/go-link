// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Create ROM in the browser: fetches the prebuilt engine once (same origin,
// public/willy-maker/engine/), decodes the game's tileset pictures from the
// asset store, packs the game (pack.ts) and zips the set. The power-on test
// (validation level 3) runs on the result in the Export tab.

import { getAsset } from "../io/assets";
import { decodePng } from "../io/png";
import { writeZip } from "../io/zip";
import type { Project } from "../model";
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

/** The decoded pictures of the project's tilesets, by tileset id. */
export async function tilesetPictures(project: Project): Promise<Map<string, Picture>> {
  const out = new Map<string, Picture>();
  for (const ts of project.tilesets) {
    if (!ts.image) continue;
    const asset = await getAsset(ts.image);
    if (!asset) continue;
    try {
      const img = await decodePng(asset.bytes);
      out.set(ts.id, { w: img.w, h: img.h, rgba: img.data });
    } catch {
      // not a PNG: the layer is packed without art and a note says so
    }
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

export async function createRom(project: Project, onStep: (step: CreateStep) => void = () => {}, engineLoader: () => Promise<Engine> = () => loadEngine()): Promise<CreatedRom> {
  onStep("engine");
  const engine = await engineLoader();
  onStep("pictures");
  const pictures = await tilesetPictures(project);
  onStep("pack");
  const pack = packGame(project, engine, (id) => pictures.get(id) ?? null);
  onStep("zip");
  const zip = await zipSet(pack.files);
  return { name: `${engine.manifest.set}.zip`, zip, symbols: romSymbols(engine), pack };
}
