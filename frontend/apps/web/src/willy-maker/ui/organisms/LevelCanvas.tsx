// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The level canvas: zoom and pan, the pencil, eraser and fill strokes, object
// stamps, selecting and dragging objects. On touch screens one finger works
// with the current tool and two fingers pan and pinch-zoom. Drawing is in render.ts; the
// changes go through editor/ops.ts so every one can be undone.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useCore } from "../../i18n";
import { CELL, objectLayer, TAG_NUMBER, type Level, type LevelObject } from "../../model";
import type { Reach } from "../../editor/reach";
import { deleteObject, objectAt, placePart, Stroke, updateObject } from "../../editor/ops";
import type { Part } from "../../editor/parts";
import type { EditorStore } from "../../editor/store";
import { drawLevel, objectBox, paletteFrom, type TileImage, type View } from "../render";

export type Tool = "select" | "pencil" | "eraser" | "fill" | "hand";

export interface CanvasProps {
  store: EditorStore;
  level: Level;
  version: number;
  images: Map<string, TileImage>;
  tool: Tool;
  part: Part | null;
  activeLayerId: string;
  selected: string | null;
  onSelect: (name: string | null, cell?: { c: number; r: number } | null) => void;
  view: View;
  onView: (v: View) => void;
  showGrid: boolean;
  showScreen: boolean;
  autoArt: boolean;
  reach: Reach | null;
  onStatus: (text: string) => void;
  onTool: (tool: Tool) => void;
  objectLabel: (o: LevelObject) => string;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

export function clampView(v: View, level: Level): View {
  const margin = 64;
  const maxX = Math.max(-margin, level.size.w - v.w / v.zoom + margin);
  const maxY = Math.max(-margin, level.size.h - v.h / v.zoom + margin);
  return { ...v, x: Math.min(maxX, Math.max(-margin, v.x)), y: Math.min(maxY, Math.max(-margin, v.y)) };
}

type Drag =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { kind: "stroke"; stroke: Stroke; c: number; r: number; grid: number }
  | { kind: "fill"; c0: number; r0: number; c1: number; r1: number; grid: number }
  | { kind: "move"; name: string; ox: number; oy: number; sx: number; sy: number; moved: boolean }
  | { kind: "stamp"; x: number; y: number }
  | { kind: "pinch"; wx: number; wy: number; dist: number; zoom: number }
  | { kind: "idle" };

type Point = { x: number; y: number };

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function LevelCanvas(p: CanvasProps) {
  const t = useCore();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  // the touch points on the canvas (client px), for the pinch
  const touches = useRef(new Map<number, Point>());
  const space = useRef(false);
  const [hover, setHover] = useState<{ c: number; r: number; w: number; h: number } | null>(null);
  const [fillBox, setFillBox] = useState<{ c: number; r: number; w: number; h: number } | null>(null);
  const viewRef = useRef(p.view);
  viewRef.current = p.view;

  // size the canvas to its box
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      if (r.width && r.height) p.onView(clampView({ ...viewRef.current, w: Math.round(r.width), h: Math.round(r.height) }, p.level));
    });
    ro.observe(wrap);
    return () => ro.disconnect();
    // only the element matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // draw
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.("2d");
    if (!canvas || !ctx) return;
    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const w = Math.round(p.view.w * dpr);
    const h = Math.round(p.view.h * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    drawLevel(ctx, p.level, {
      view: p.view,
      dpr,
      palette: paletteFrom(canvas),
      images: p.images,
      showGrid: p.showGrid,
      showScreen: p.showScreen,
      reach: p.reach,
      selected: p.selected,
      hover: fillBox ?? hover,
      label: p.objectLabel,
      ledgeText: t.canvas.ledge,
    });
  }, [p.level, p.version, p.view, p.images, p.showGrid, p.showScreen, p.reach, p.selected, hover, fillBox, p.objectLabel, t]);

  const world = useCallback((e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: v.x + (e.clientX - r.left) / v.zoom, y: v.y + (e.clientY - r.top) / v.zoom };
  }, []);

  /** The layer the tool works on and its grid. */
  const target = (): { layerId: string; grid: number; value: number; autoArt: boolean } | null => {
    const part = p.part;
    const active = p.level.layers.find((l) => l.id === p.activeLayerId);
    const tileLayer = active?.kind === "tiles" ? active : p.level.layers.find((l) => l.id === "play" && l.kind === "tiles");
    if (p.tool === "eraser") {
      if (active?.kind === "tiles") return { layerId: active.id, grid: active.grid, value: 0, autoArt: false };
      return { layerId: "collision", grid: CELL, value: TAG_NUMBER.air, autoArt: p.autoArt };
    }
    if (part?.kind === "tag") return { layerId: "collision", grid: CELL, value: TAG_NUMBER[part.tag], autoArt: p.autoArt };
    if (part?.kind === "tile" && tileLayer?.kind === "tiles") return { layerId: tileLayer.id, grid: tileLayer.grid, value: part.tile, autoArt: false };
    return null;
  };

  const layerUsable = (layerId: string): boolean => {
    const layer = p.level.layers.find((l) => l.id === layerId || (layerId === "collision" && l.kind === "tags"));
    if (layer?.locked) {
      p.onStatus(t.canvas.locked);
      return false;
    }
    if (layer?.visible === false) {
      p.onStatus(t.canvas.hidden);
      return false;
    }
    return true;
  };

  const zoomAt = (factor: number, cx: number, cy: number) => {
    const v = viewRef.current;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(v.zoom * factor * 100) / 100));
    const wx = v.x + cx / v.zoom;
    const wy = v.y + cy / v.zoom;
    p.onView(clampView({ ...v, zoom, x: wx - cx / zoom, y: wy - cy / zoom }, p.level));
  };

  /** Undoes what the first finger started: a second finger means pan and zoom. */
  const abandon = () => {
    const d = drag.current;
    if (d?.kind === "stroke") d.stroke.cancel();
    else if (d?.kind === "fill") setFillBox(null);
    else if (d?.kind === "move") {
      const o = objectLayer(p.level).items.find((i) => i.name === d.name);
      if (o) {
        o.x = d.ox;
        o.y = d.oy;
        p.store.touch();
      }
    }
    drag.current = null;
  };

  const startPinch = () => {
    const [a, b] = [...touches.current.values()];
    if (!a || !b) return;
    const r = canvasRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    const m = midpoint(a, b);
    drag.current = { kind: "pinch", wx: v.x + (m.x - r.left) / v.zoom, wy: v.y + (m.y - r.top) / v.zoom, dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: v.zoom };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button === 2) return;
    canvasRef.current?.setPointerCapture?.(e.pointerId);
    if (e.pointerType === "touch") {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size >= 2) {
        abandon();
        setHover(null);
        startPinch();
        return;
      }
    }
    const pt = world(e);
    const v = viewRef.current;
    if (p.tool === "hand" || space.current || e.button === 1) {
      drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y };
      return;
    }
    if (p.tool === "select") {
      const hit = objectAt(p.level, pt.x, pt.y, objectBox);
      if (hit) {
        p.onSelect(hit.name);
        if (!layerUsable("objects")) return;
        drag.current = { kind: "move", name: hit.name, ox: hit.x, oy: hit.y, sx: pt.x, sy: pt.y, moved: false };
      } else p.onSelect(null, { c: Math.floor(pt.x / CELL), r: Math.floor(pt.y / CELL) });
      return;
    }
    // object stamps place on click (on a touch screen when the finger lifts,
    // so a second finger can still turn it into a pinch)
    if (p.tool === "pencil" && p.part && (p.part.kind === "object" || p.part.kind === "crate")) {
      if (!layerUsable("objects")) return;
      if (e.pointerType === "touch") {
        drag.current = { kind: "stamp", x: pt.x, y: pt.y };
        return;
      }
      const name = placePart(p.store, p.level.id, p.part, pt.x, pt.y, p.autoArt, t.objects[p.part.kind === "crate" ? "crate" : p.part.type]);
      if (name) p.onSelect(name);
      return;
    }
    // the eraser on the objects layer deletes what it touches
    if (p.tool === "eraser" && p.activeLayerId === "objects") {
      const hit = objectAt(p.level, pt.x, pt.y, objectBox);
      if (hit && layerUsable("objects")) {
        deleteObject(p.store, p.level.id, hit.name, t.inspector.delete);
        p.onSelect(null);
      }
      return;
    }
    const tg = target();
    if (!tg || !layerUsable(tg.layerId)) return;
    const c = Math.floor(pt.x / tg.grid);
    const r = Math.floor(pt.y / tg.grid);
    if (p.tool === "fill") {
      drag.current = { kind: "fill", c0: c, r0: r, c1: c, r1: r, grid: tg.grid };
      setFillBox({ c: c * (tg.grid / CELL), r: r * (tg.grid / CELL), w: tg.grid / CELL, h: tg.grid / CELL });
      return;
    }
    const label = p.tool === "eraser" ? t.tools.eraser.replace(/ \(.\)$/, "") : p.part?.kind === "tag" ? t.tags[p.part.tag] : t.parts.groups.tiles;
    const stroke = new Stroke(p.store, p.level.id, tg.layerId, tg.value, tg.autoArt, label);
    stroke.paint(c, r, c, r);
    drag.current = { kind: "stroke", stroke, c, r, grid: tg.grid };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch" && touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (d?.kind === "pinch") {
      const [a, b] = [...touches.current.values()];
      if (!a || !b) return;
      const r = canvasRef.current!.getBoundingClientRect();
      const m = midpoint(a, b);
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(d.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / d.dist) * 100) / 100));
      // the world point that was under the fingers stays under them
      p.onView(clampView({ ...viewRef.current, zoom, x: d.wx - (m.x - r.left) / zoom, y: d.wy - (m.y - r.top) / zoom }, p.level));
      return;
    }
    if (d?.kind === "idle") return;
    const pt = world(e);
    const tg = target();
    const grid = d && "grid" in d ? d.grid : (tg?.grid ?? CELL);
    const size = p.tool === "pencil" && p.part?.kind === "crate" ? 2 : grid / CELL;
    setHover(p.tool === "hand" || p.tool === "select" || e.pointerType === "touch" ? null : { c: Math.floor(pt.x / grid) * (grid / CELL), r: Math.floor(pt.y / grid) * (grid / CELL), w: size, h: size });
    if (!d) return;
    if (d.kind === "pan") {
      const v = viewRef.current;
      p.onView(clampView({ ...v, x: d.vx - (e.clientX - d.sx) / v.zoom, y: d.vy - (e.clientY - d.sy) / v.zoom }, p.level));
    } else if (d.kind === "stroke") {
      const c = Math.floor(pt.x / d.grid);
      const r = Math.floor(pt.y / d.grid);
      // every cell between the last one and this one
      const steps = Math.max(Math.abs(c - d.c), Math.abs(r - d.r));
      for (let k = 1; k <= steps; k++) {
        const cc = Math.round(d.c + ((c - d.c) * k) / steps);
        const rr = Math.round(d.r + ((r - d.r) * k) / steps);
        d.stroke.paint(cc, rr, cc, rr);
      }
      d.c = c;
      d.r = r;
    } else if (d.kind === "fill") {
      d.c1 = Math.floor(pt.x / d.grid);
      d.r1 = Math.floor(pt.y / d.grid);
      const k = d.grid / CELL;
      setFillBox({ c: Math.min(d.c0, d.c1) * k, r: Math.min(d.r0, d.r1) * k, w: (Math.abs(d.c1 - d.c0) + 1) * k, h: (Math.abs(d.r1 - d.r0) + 1) * k });
    } else if (d.kind === "move") {
      const o = objectLayer(p.level).items.find((i) => i.name === d.name);
      if (!o) return;
      const snap = o.type === "crate" || o.type === "camera_lock" ? CELL : 8;
      o.x = Math.round((d.ox + pt.x - d.sx) / snap) * snap;
      o.y = Math.round((d.oy + pt.y - d.sy) / snap) * snap;
      d.moved = d.moved || o.x !== d.ox || o.y !== d.oy;
      p.store.touch();
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") {
      touches.current.delete(e.pointerId);
      // after a pinch nothing happens until every finger is up
      if (drag.current?.kind === "pinch" || drag.current?.kind === "idle") {
        drag.current = touches.current.size ? { kind: "idle" } : null;
        return;
      }
    }
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "stamp" && e.type !== "pointercancel" && p.part && (p.part.kind === "object" || p.part.kind === "crate")) {
      const name = placePart(p.store, p.level.id, p.part, d.x, d.y, p.autoArt, t.objects[p.part.kind === "crate" ? "crate" : p.part.type]);
      if (name) p.onSelect(name);
    } else if (d.kind === "stroke") d.stroke.end();
    else if (d.kind === "fill") {
      setFillBox(null);
      const tg = target();
      if (!tg) return;
      const label = p.part?.kind === "tag" ? t.tags[p.part.tag] : p.tool === "eraser" ? t.tools.eraser : t.parts.groups.tiles;
      const stroke = new Stroke(p.store, p.level.id, tg.layerId, tg.value, tg.autoArt, label);
      stroke.paint(d.c0, d.r0, d.c1, d.r1);
      stroke.end();
    } else if (d.kind === "move" && d.moved) {
      const o = objectLayer(p.level).items.find((i) => i.name === d.name);
      if (!o) return;
      const to = { x: o.x, y: o.y };
      o.x = d.ox;
      o.y = d.oy;
      updateObject(p.store, p.level.id, d.name, to, t.objects[o.type]);
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
      return;
    }
    const v = viewRef.current;
    const dx = e.shiftKey ? e.deltaY : e.deltaX;
    const dy = e.shiftKey ? 0 : e.deltaY;
    p.onView(clampView({ ...v, x: v.x + dx / v.zoom, y: v.y + dy / v.zoom }, p.level));
  };

  // the browser must not scroll the page or zoom it while over the canvas
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    c.addEventListener("wheel", stop, { passive: false });
    return () => c.removeEventListener("wheel", stop);
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const v = viewRef.current;
    const step = 96 / v.zoom;
    if (e.key === " ") {
      space.current = true;
      e.preventDefault();
      return;
    }
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      p.onView(clampView({ ...v, x: v.x + m[0], y: v.y + m[1] }, p.level));
      return;
    }
    if (e.key === "+" || e.key === "=") zoomAt(1.25, v.w / 2, v.h / 2);
    else if (e.key === "-") zoomAt(1 / 1.25, v.w / 2, v.h / 2);
  };

  const pct = Math.round(p.view.zoom * 100);
  return (
    <div ref={wrapRef} className={`wm-canvas-wrap is-${p.tool}`} onKeyDown={onKeyDown} onKeyUp={(e) => e.key === " " && (space.current = false)}>
      <canvas
        ref={canvasRef}
        className="wm-canvas"
        style={{ width: p.view.w, height: p.view.h }}
        tabIndex={0}
        aria-label={t.canvas.label}
        role="application"
        data-view={`${p.view.x},${p.view.y},${p.view.zoom}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      {p.showScreen && <span className="wm-canvas-note wm-mono">▭ {t.canvas.screenFrame(pct)}</span>}
    </div>
  );
}
