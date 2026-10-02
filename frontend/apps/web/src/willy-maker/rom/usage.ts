// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// How much of the CPS-1 a game uses (experiment 1's verdict, T-27): the
// board's meters estimated live from the project (board/cps1.ts), and the
// same meters measured from a real Create ROM pack when asked, so a game
// can grow (levels, detail, heroes, sound) without going over.

import { CPS1, DATA_ROOM, type Meter, type MeterLevel } from "../board/cps1";
import type { Project } from "../model";
import { characterPictures, loadEngine, tilesetPictures } from "./createRom";
import { packGame, type Engine, type PackResult } from "./pack";

export interface BoardUsage {
  meters: (Meter & { measured: boolean })[];
  /** The most used meter, as a share of its limit (0-1, above 1 when over). */
  peak: { id: Meter["id"]; ratio: number; level: MeterLevel };
  /** When the meters were measured from a real pack (ms since 1970); missing for the live estimate. */
  measuredAt?: number;
}

function levelOf(used: number, max: number): MeterLevel {
  if (used > max) return "over";
  return used >= max * 0.85 ? "warn" : "ok";
}

function withPeak(meters: (Meter & { measured: boolean })[], measuredAt?: number): BoardUsage {
  // "colors" is per palette, not a share of the board: a full palette is fine
  const ranked = meters.filter((m) => m.id !== "colors" && m.max > 0);
  const top = ranked.reduce((a, b) => (b.used / b.max > a.used / a.max ? b : a), ranked[0]!);
  return { meters, peak: { id: top.id, ratio: top.used / top.max, level: top.level }, measuredAt };
}

/** The live estimate (no ROM is built). */
export function estimateUsage(project: Project): BoardUsage {
  return withPeak(CPS1.meters(project).map((m) => ({ ...m, measured: false })));
}

/** The meters a real pack measures exactly, over the estimate. */
export function usageFromPack(project: Project, engine: Engine, pack: PackResult): BoardUsage {
  const program = engine.manifest.program.size + pack.stats.dataBytes;
  const measured: Partial<Record<Meter["id"], number>> = {
    graphics: pack.stats.gfxBytes,
    spritePalettes: pack.stats.spritePalettes,
    program,
    sound: 0,
  };
  const meters = CPS1.meters(project).map((m) => {
    const used = measured[m.id];
    if (used === undefined) return { ...m, measured: false };
    // the game's data must fit its megabyte after the engine (wmdata.h)
    const level = m.id === "program" && pack.stats.dataBytes > DATA_ROOM ? "over" : levelOf(used, m.max);
    return { ...m, used, level, measured: true };
  });
  return withPeak(meters, Date.now());
}

/** Packs the game as Create ROM does (no zip, no power-on) and measures it. */
export async function measureUsage(project: Project, engineLoader: () => Promise<Engine> = () => loadEngine()): Promise<BoardUsage> {
  const engine = await engineLoader();
  const pictures = await tilesetPictures(project);
  const heroes = await characterPictures(project);
  const pack = packGame(project, engine, (id) => pictures.get(id) ?? null, (id) => heroes.get(id) ?? null);
  return usageFromPack(project, engine, pack);
}
