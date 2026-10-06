// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A small picture of a level's art (the background's row and properties),
// drawn from the board's tiles like the canvas, cropped to fill its box.

import { useLayoutEffect, useRef } from "react";
import type { Level } from "../../model";
import { drawArt, type TileImage } from "../render";

export function LevelThumb({ level, images, w, h, version }: { level: Level; images: Map<string, TileImage>; w: number; h: number; version?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    // cover: the level's start (bottom left) fills the box
    const zoom = Math.max(w / level.size.w, h / level.size.h);
    drawArt(ctx, level, { x: 0, y: Math.max(0, level.size.h - h / zoom), zoom, w, h }, dpr, images);
  }, [level, images, w, h, version]);
  return <canvas ref={ref} className="studio-thumb" style={{ width: w, height: h }} aria-hidden="true" />;
}
