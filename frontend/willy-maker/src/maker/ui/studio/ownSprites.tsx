// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The game's own characters as the editor shows them: a player start whose
// player plays one, an enemy or civilian whose kind is one (as play mode and
// the ROM draw them) and a pickup with its own picture are drawn with the
// character's first standing frame, on the canvas, in the sprite picker and
// in Properties, instead of a plain box. The sheets are loaded once per
// change of the characters.

import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BUILTIN_HERO, type Project } from "../../model";
import { playerSlots } from "../../game/settings";
import { assetUrl } from "../../io/assets";
import { characterSheet, type FrameBox, type Sheet } from "../../play/sprites";

const SheetsContext = createContext<{ project: Project; sheets: ReadonlyMap<string, Sheet> } | null>(null);

/** What an object needs to say which character draws it. */
export interface DrawnThing {
  type: string;
  kind?: unknown;
  look?: unknown;
  player?: unknown;
}

/** The character that draws an object, or null for the engine's own. */
export function characterOf(p: Project, o: DrawnThing): string | null {
  if (o.type === "player_start") {
    const slot = playerSlots(p)[Math.max(0, Number(o.player ?? 1) - 1)];
    return slot && slot.character !== BUILTIN_HERO && p.characters.some((c) => c.id === slot.character) ? slot.character : null;
  }
  if ((o.type === "enemy" || o.type === "civilian") && typeof o.kind === "string") return p.characters.some((c) => c.id === o.kind && c.role === o.type) ? o.kind : null;
  if (o.type === "pickup" && typeof o.look === "string") return p.characters.some((c) => c.id === o.look) ? o.look : null;
  return null;
}

export function OwnSpritesProvider({ project, children }: { project: Project; children: ReactNode }) {
  const [sheets, setSheets] = useState<ReadonlyMap<string, Sheet>>(new Map());
  const key = project.characters.map((c) => `${c.id}:${c.sheet ?? ""}:${c.frames.length}`).join("|");
  useEffect(() => {
    let live = true;
    void Promise.all(project.characters.map(async (c) => [c.id, await characterSheet(c, assetUrl).catch(() => null)] as const)).then((pairs) => {
      if (live) setSheets(new Map(pairs.filter((x): x is [string, Sheet] => x[1] !== null)));
    });
    return () => {
      live = false;
    };
    // the sheets change only with the characters' pictures
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const value = useMemo(() => ({ project, sheets }), [project, sheets]);
  return <SheetsContext.Provider value={value}>{children}</SheetsContext.Provider>;
}

/** The sheet that draws an object, or null (no provider, the engine's own, or not loaded yet). */
export function useOwnSheet(o: DrawnThing | null): Sheet | null {
  const ctx = useContext(SheetsContext);
  if (!ctx || !o) return null;
  const id = characterOf(ctx.project, o);
  return id ? (ctx.sheets.get(id) ?? null) : null;
}

/** The first standing frame (or the first frame of any animation). */
export function standingFrame(sheet: Sheet): FrameBox | null {
  const id = sheet.anims.idle?.frames[0] ?? Object.values(sheet.anims).find((a) => a.frames.length)?.frames[0];
  return (id && sheet.frames[id]) || null;
}

/**
 * A character's standing frame. `board` draws it at its size on the level (zoom z) with its feet on the
 * bottom centre of the object's box; otherwise it fits its box.
 */
export function OwnSprite({ sheet, flip = false, board }: { sheet: Sheet; flip?: boolean; board?: { z: number; w: number; h: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const f = standingFrame(sheet);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !f) return;
    c.width = f.w;
    c.height = f.h;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, f.w, f.h);
    ctx.drawImage(sheet.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  }, [sheet, f]);
  if (!f) return null;
  const style: CSSProperties = board
    ? { position: "absolute", left: (board.w / 2 - (flip ? f.w - f.px : f.px)) * board.z, top: (board.h - (f.py + 1)) * board.z, width: f.w * board.z, height: f.h * board.z }
    : { width: "100%", height: "100%", objectFit: "contain", objectPosition: "center bottom" };
  return <canvas ref={ref} className="studio-own-sprite" aria-hidden="true" style={{ ...style, transform: flip ? "scaleX(-1)" : undefined }} />;
}
