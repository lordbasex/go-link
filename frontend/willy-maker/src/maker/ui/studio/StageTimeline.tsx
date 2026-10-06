// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The timeline under the canvas (the classic editor's minimap, in the new
// look): the whole level drawn small, a mark every 384 px screen with its
// number, the sections' starts, and a box on what the canvas shows. A click
// or a drag moves the view there; the arrows step a screen.

import { useEffect, useRef, useState } from "react";
import type { Level } from "../../model";
import { drawArt, type TileImage } from "../render";

const SCREEN_W = 384;
const H = 48;

export interface TimelineView {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function StageTimeline({ level, version, images, view, label, size, onGoTo }: { level: Level; version: number; images: Map<string, TileImage>; view: TimelineView | null; label: string; size: string; onGoTo: (x: number, y: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setW(Math.max(200, Math.round(el.getBoundingClientRect().width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // the level's art, stretched to the strip (its height kept in proportion, then squeezed to the strip's)
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext?.("2d");
    if (!cv || !ctx) return;
    // drawArt sets its own transform, so the level is drawn in proportion on a canvas of its own, then squeezed onto the strip
    const s = w / level.size.w;
    const full = document.createElement("canvas");
    full.width = w;
    full.height = Math.max(1, Math.round(level.size.h * s));
    const fctx = full.getContext("2d");
    if (!fctx) return;
    drawArt(fctx, level, { x: 0, y: 0, zoom: s, w, h: full.height }, 1, images);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(full, 0, 0, w, H);
  }, [level, version, images, w]);
  const s = w / level.size.w;
  const screens = Math.max(1, Math.ceil(level.size.w / SCREEN_W));
  const go = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onGoTo(((e.clientX - r.left) / r.width) * level.size.w, ((e.clientY - r.top) / r.height) * level.size.h);
  };
  const vx = view ? view.x + view.w / 2 : 0;
  const vy = view ? view.y + view.h / 2 : level.size.h / 2;
  return (
    <div className="studio-timeline">
      <div className="studio-timeline-head">
        <span>{label}</span>
        <span className="tabular">{size}</span>
      </div>
      <div
        className="studio-timeline-strip"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={level.size.w}
        aria-valuenow={Math.round(vx)}
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture?.(e.pointerId);
          } catch {
            // goes on without the capture
          }
          go(e);
        }}
        onPointerMove={(e) => e.buttons && go(e)}
        onKeyDown={(e) => {
          const step = e.key === "ArrowRight" ? SCREEN_W : e.key === "ArrowLeft" ? -SCREEN_W : 0;
          if (step) {
            e.preventDefault();
            onGoTo(Math.max(0, Math.min(level.size.w, vx + step)), vy);
          }
        }}
      >
        <canvas ref={ref} width={w} height={H} aria-hidden="true" />
        {Array.from({ length: screens }, (_, i) => (
          <span key={i} className="studio-timeline-screen" style={{ left: i * SCREEN_W * s }}>
            {i + 1}
          </span>
        ))}
        {level.sections.slice(1).map((sec) => (
          <span key={sec.x0} className="studio-timeline-section" style={{ left: sec.x0 * s }} title={sec.name} />
        ))}
        {view && <span className="studio-timeline-view" style={{ left: view.x * s, width: Math.max(4, view.w * s), top: (view.y / level.size.h) * H, height: Math.max(4, (view.h / level.size.h) * H) }} />}
      </div>
    </div>
  );
}
