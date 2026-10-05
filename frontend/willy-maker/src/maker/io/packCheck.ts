// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Validation level 2 for the AI pack (docs/willy-maker/validation.md): a
// pure check over the files of a finished pack, read back from its zip.
// Every file PROMPT.md names is there, every map points at pictures that
// exist with the sizes it says, every PNG is in board colors with plain
// transparency, the pictures have the sizes of the project and the art
// spec, and every sheet.json frame lies inside its strip. A problem here is
// a Willy Maker bug, never the user's: the pack is not downloaded and the
// user gets a report to send.

import { migrateProject, type Project } from "../model";
import { decodePng, type RgbaImage } from "./png";

export interface PackProblem {
  /** The check: pack.files, pack.json, pack.maps, pack.png, pack.sizes, pack.sheets. */
  id: string;
  /** What was wrong, in English (it goes into a bug report). */
  detail: string;
}

/** Thrown by buildAiPack when its own pack fails the check. */
export class PackBuildError extends Error {
  constructor(public problems: PackProblem[]) {
    super(`the AI pack failed ${problems.length} build check(s)`);
    this.name = "PackBuildError";
  }
}

/** The text a user copies into a bug report. */
export function packReport(problems: PackProblem[], context: Record<string, string> = {}): string {
  const head = Object.entries(context).map(([k, v]) => `${k}: ${v}`);
  return ["Willy Maker AI pack build check failed", ...head, "", ...problems.map((p) => `- ${p.id}: ${p.detail}`)].join("\n");
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_") || "_";

/** a/b/../c -> a/c, relative to the folder of `from`. */
function resolve(from: string, rel: string): string {
  const parts = from.split("/").slice(0, -1);
  for (const seg of rel.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/** The pack paths PROMPT.md names (repository paths such as rom/… are not in the pack). */
export function promptPaths(prompt: string): string[] {
  const found = new Set<string>();
  const re = /(?<![\w/.-])((?:levels|characters|tilesets)\/[A-Za-z0-9_.\-/]*[A-Za-z0-9_/]|docs\/[A-Za-z0-9_-]+\.md(?![\w/]))/g;
  for (const m of prompt.matchAll(re)) found.add(m[1]!);
  return [...found];
}

function json(files: Map<string, Uint8Array>, name: string, problems: PackProblem[]): unknown {
  const bytes = files.get(name);
  if (!bytes) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    problems.push({ id: "pack.json", detail: `${name} is not valid JSON` });
    return undefined;
  }
}

type Tmj = {
  width?: number;
  height?: number;
  layers?: { type?: string; name?: string; image?: string; width?: number; height?: number; data?: number[] }[];
  tilesets?: { firstgid?: number; tilecount?: number; image?: string; imagewidth?: number; imageheight?: number; tilewidth?: number }[];
};

type Sheet = { anims?: Record<string, { file?: string; frames?: unknown[] }> };

/** Checks a pack's files; an empty list means it passed. */
export async function checkAiPack(files: Map<string, Uint8Array>): Promise<PackProblem[]> {
  const problems: PackProblem[] = [];
  const add = (id: string, detail: string) => problems.push({ id, detail });

  // the brief and what it names
  for (const name of ["PROMPT.md", "project.json", "review.json", "tilesets/collision.png"]) if (!files.has(name)) add("pack.files", `${name} is missing`);
  const prompt = new TextDecoder().decode(files.get("PROMPT.md") ?? new Uint8Array());
  for (const path of promptPaths(prompt)) {
    const ok = path.endsWith("/") ? [...files.keys()].some((f) => f.startsWith(path)) : files.has(path);
    if (!ok) add("pack.files", `PROMPT.md names ${path}, which is not in the pack`);
  }

  // the project, read back
  let project: Project | null = null;
  const raw = json(files, "project.json", problems);
  if (raw !== undefined)
    try {
      project = migrateProject(raw);
    } catch (e) {
      add("pack.json", `project.json is not a project: ${(e as Error).message}`);
    }
  json(files, "review.json", problems);

  // every PNG: readable, board colors, alpha 0 or 255
  const pngs = new Map<string, RgbaImage>();
  for (const [name, bytes] of files) {
    if (!name.endsWith(".png")) continue;
    let img: RgbaImage;
    try {
      img = await decodePng(bytes);
    } catch (e) {
      add("pack.png", `${name} cannot be read: ${(e as Error).message}`);
      continue;
    }
    pngs.set(name, img);
    let off = 0;
    let soft = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      const a = img.data[i + 3]!;
      if (a !== 0 && a !== 255) soft++;
      if (a >= 128 && (img.data[i]! % 17 || img.data[i + 1]! % 17 || img.data[i + 2]! % 17)) off++;
    }
    if (off) add("pack.png", `${name} has ${off} pixel(s) that are not board colors`);
    if (soft) add("pack.png", `${name} has ${soft} half-transparent pixel(s)`);
  }

  // maps: the pictures they point at, with the sizes they say
  for (const [name] of files) {
    if (!/^levels\/[^/]+\.tmj$/.test(name)) continue;
    const map = json(files, name, problems) as Tmj | undefined;
    if (!map || typeof map !== "object") continue;
    const cells = Number(map.width) * Number(map.height);
    let gidEnd = 1;
    for (const ts of map.tilesets ?? []) {
      gidEnd = Math.max(gidEnd, Number(ts.firstgid) + Number(ts.tilecount));
      if (!ts.image) {
        add("pack.maps", `${name}: a tileset has no picture`);
        continue;
      }
      const path = resolve(name, ts.image);
      const img = pngs.get(path);
      if (!files.has(path)) add("pack.maps", `${name} uses ${path}, which is not in the pack`);
      else if (img && (img.w !== ts.imagewidth || img.h !== ts.imageheight)) add("pack.maps", `${name} says ${path} is ${ts.imagewidth} × ${ts.imageheight}; it is ${img.w} × ${img.h}`);
    }
    for (const layer of map.layers ?? []) {
      if (layer.type === "imagelayer") {
        const path = resolve(name, String(layer.image ?? ""));
        if (!files.has(path)) add("pack.maps", `${name}: the ${layer.name} layer uses ${path}, which is not in the pack`);
      } else if (layer.type === "tilelayer") {
        if (!Array.isArray(layer.data) || layer.data.length !== cells) add("pack.maps", `${name}: the ${layer.name} layer has ${layer.data?.length ?? 0} cells, not ${cells}`);
        else if (layer.data.some((g) => (g & 0x1fffffff) >= gidEnd)) add("pack.maps", `${name}: the ${layer.name} layer uses a tile no tileset has`);
      }
    }
  }

  // sizes against the project and the art spec
  if (project) {
    for (const level of project.levels) {
      const dir = `levels/${safe(level.id)}`;
      if (!files.has(`${dir}.tmj`)) add("pack.files", `${dir}.tmj is missing`);
      for (const pic of ["far", "play", "text", "collision"]) {
        const img = pngs.get(`${dir}/${pic}.png`);
        if (img && (img.w !== level.size.w || img.h !== level.size.h)) add("pack.sizes", `${dir}/${pic}.png is ${img.w} × ${img.h}; the level is ${level.size.w} × ${level.size.h}`);
      }
      const farTiles = pngs.get(`${dir}/far-tiles.png`);
      if (farTiles && (farTiles.w % 32 || farTiles.h % 32)) add("pack.sizes", `${dir}/far-tiles.png (${farTiles.w} × ${farTiles.h}) is not cut into 32 px tiles`);
    }
    for (const ts of project.tilesets) {
      const img = pngs.get(`tilesets/${safe(ts.id)}.png`);
      if (img && (img.w % ts.tile || img.h % ts.tile)) add("pack.sizes", `tilesets/${safe(ts.id)}.png (${img.w} × ${img.h}) is not cut into ${ts.tile} px tiles`);
    }
    for (const ch of project.characters) if (!files.has(`characters/${safe(ch.id)}/sheet.json`)) add("pack.files", `characters/${safe(ch.id)}/sheet.json is missing`);
  }
  const collision = pngs.get("tilesets/collision.png");
  if (collision && (collision.h !== 16 || collision.w % 16)) add("pack.sizes", `tilesets/collision.png is ${collision.w} × ${collision.h}, not a row of 16 px tiles`);

  // sheets: every strip exists and holds its frames
  for (const [name] of files) {
    const m = /^characters\/([^/]+)\/sheet\.json$/.exec(name);
    if (!m) continue;
    const sheet = json(files, name, problems) as Sheet | undefined;
    for (const [anim, a] of Object.entries(sheet?.anims ?? {})) {
      if (!a?.file) continue;
      const path = `characters/${m[1]}/${a.file}`;
      const strip = pngs.get(path);
      if (!files.has(path)) {
        add("pack.sheets", `${name}: ${anim} uses ${path}, which is not in the pack`);
        continue;
      }
      if (!strip) continue;
      for (const f of (a.frames ?? []) as { id?: string; x?: number; y?: number; w?: number; h?: number; px?: number; py?: number }[]) {
        const [x, y, w, h] = [Number(f.x), Number(f.y), Number(f.w), Number(f.h)];
        if (!(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= strip.w && y + h <= strip.h)) add("pack.sheets", `${name}: frame ${f.id} of ${anim} (${x}, ${y}, ${w} × ${h}) is not inside ${path} (${strip.w} × ${strip.h})`);
      }
    }
  }
  return problems;
}
