// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The pixel editor (Characters, a frame's pencil button): one frame at its
// size on the board, laid out like Scratch's costume editor: the frame's
// name and undo, redo and flips on top, the tools on the left, the canvas
// in the middle (a pixel grid, the 16 px zones counted from the feet and the
// feet point) and the colors on the right, with each zone's count of the 15
// colors the board gives it. Colors snap to the board's (the CPS-1 shows
// 4096). The drawing is sprites/pixels.ts.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Circle, Eraser, FlipHorizontal2, FlipVertical2, Minus, PaintBucket, Pencil, Pipette, Redo2, Square, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { snapColor } from "../../board/cps1";
import type { SpritesMessages } from "../../i18n/sprites.en";
import { bandColors, blank, colorAt, colorsOf, copy, ellipse, fill, flip, rect, stroke, type Color, type Pixels } from "../pixels";
import { fmt } from "../text";

export type PixelTool = "pencil" | "eraser" | "fill" | "picker" | "line" | "rect" | "ellipse";
const TOOLS: { id: PixelTool; key: string; icon: typeof Pencil }[] = [
  { id: "pencil", key: "b", icon: Pencil },
  { id: "eraser", key: "e", icon: Eraser },
  { id: "fill", key: "g", icon: PaintBucket },
  { id: "picker", key: "i", icon: Pipette },
  { id: "line", key: "l", icon: Minus },
  { id: "rect", key: "r", icon: Square },
  { id: "ellipse", key: "o", icon: Circle },
];
const SHAPES: PixelTool[] = ["line", "rect", "ellipse"];
const MAX_UNDO = 100;

export interface EditedFrame extends Pixels {
  px: number;
  py: number;
}

export interface PixelEditorProps {
  t: SpritesMessages["pixel"];
  /** The frame's name ("Standing 2"). */
  name: string;
  frame: EditedFrame;
  /** The character's colors, offered first. */
  palette: readonly string[];
  onApply: (p: Pixels) => void;
  onCancel: () => void;
}

export function PixelEditor({ t, name, frame, palette, onApply, onCancel }: PixelEditorProps) {
  const [pic, setPic] = useState<Pixels>(() => copy(frame));
  const [undo, setUndo] = useState<Pixels[]>([]);
  const [redo, setRedo] = useState<Pixels[]>([]);
  const [tool, setTool] = useState<PixelTool>("pencil");
  const [color, setColor] = useState<string>(() => colorsOf(frame)[0] ?? "#000000");
  const [size, setSize] = useState(1);
  const [filled, setFilled] = useState(false);
  const [grid, setGrid] = useState(true);
  const fit = Math.max(2, Math.min(16, Math.floor(Math.min(560 / frame.w, 460 / frame.h))));
  const [zoom, setZoom] = useState(fit);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  // a stroke or shape being drawn: where it started, the picture before it, the last point
  const drag = useRef<{ x0: number; y0: number; before: Pixels; lx: number; ly: number } | null>(null);
  const [preview, setPreview] = useState<Pixels | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => root.current?.focus(), []);

  const commit = (next: Pixels, before: Pixels = pic) => {
    if (next === before) return;
    setUndo((u) => [...u.slice(-MAX_UNDO + 1), before]);
    setRedo([]);
    setPic(next);
  };
  const doUndo = () => {
    const prev = undo[undo.length - 1];
    if (!prev) return;
    setUndo((u) => u.slice(0, -1));
    setRedo((r) => [...r, pic]);
    setPic(prev);
  };
  const doRedo = () => {
    const next = redo[redo.length - 1];
    if (!next) return;
    setRedo((r) => r.slice(0, -1));
    setUndo((u) => [...u, pic]);
    setPic(next);
  };

  const ink: Color = tool === "eraser" ? null : color;
  const shape = (base: Pixels, x0: number, y0: number, x1: number, y1: number) =>
    tool === "line" ? stroke(base, x0, y0, x1, y1, ink, size) : tool === "rect" ? rect(base, x0, y0, x1, y1, ink, filled) : ellipse(base, x0, y0, x1, y1, ink, filled);

  const at = (e: PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: Math.floor(((e.clientX - r.left) / r.width) * pic.w), y: Math.floor(((e.clientY - r.top) / r.height) * pic.h) };
  };
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const { x, y } = at(e);
    // Alt picks the color under the pointer with any tool
    if (tool === "picker" || e.altKey) {
      const c = colorAt(pic, x, y);
      if (c) setColor(c);
      return;
    }
    if (tool === "fill") {
      commit(fill(pic, x, y, color));
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x0: x, y0: y, before: pic, lx: x, ly: y };
    if (SHAPES.includes(tool)) setPreview(shape(pic, x, y, x, y));
    else setPic(stroke(pic, x, y, x, y, ink, size));
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = at(e);
    setCursor(x >= 0 && y >= 0 && x < pic.w && y < pic.h ? { x, y } : null);
    const d = drag.current;
    if (!d) return;
    if (SHAPES.includes(tool)) setPreview(shape(d.before, d.x0, d.y0, x, y));
    else if (x !== d.lx || y !== d.ly) {
      // from the last point to this one (read now: the update runs later)
      const { lx, ly } = d;
      setPic((p) => stroke(p, lx, ly, x, y, ink, size));
      d.lx = x;
      d.ly = y;
    }
  };
  const up = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (preview) {
      commit(preview, d.before);
      setPreview(null);
    } else commit(pic, d.before);
  };

  const keys = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      doRedo();
    } else if (e.key === "Escape") onCancel();
    else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(32, z + 1));
    else if (e.key === "-") setZoom((z) => Math.max(1, z - 1));
    else if (!mod) {
      const hit = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (hit) setTool(hit.id);
    }
  };

  // the canvas: the picture (or the shape being drawn), the grid, the zones and the feet
  const shown = preview ?? pic;
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    c.width = shown.w * zoom;
    c.height = shown.h * zoom;
    const small = document.createElement("canvas");
    small.width = shown.w;
    small.height = shown.h;
    small.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(shown.rgba), shown.w, shown.h), 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(small, 0, 0, c.width, c.height);
    if (grid && zoom >= 6) {
      ctx.strokeStyle = "rgba(128,128,128,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < shown.w; x++) ctx.moveTo(x * zoom + 0.5, 0), ctx.lineTo(x * zoom + 0.5, c.height);
      for (let y = 1; y < shown.h; y++) ctx.moveTo(0, y * zoom + 0.5), ctx.lineTo(c.width, y * zoom + 0.5);
      ctx.stroke();
    }
    // the zones: every 16 rows up from the feet
    ctx.strokeStyle = "rgba(236,48,19,0.8)";
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let y = frame.py + 1 - 16; y > 0; y -= 16) ctx.moveTo(0, y * zoom + 0.5), ctx.lineTo(c.width, y * zoom + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    // the feet point
    const fx = (frame.px + 0.5) * zoom;
    const fy = (frame.py + 1) * zoom;
    ctx.strokeStyle = "rgba(236,48,19,1)";
    ctx.beginPath();
    ctx.moveTo(fx - zoom * 2, fy), ctx.lineTo(fx + zoom * 2, fy);
    ctx.moveTo(fx, fy - zoom * 2), ctx.lineTo(fx, fy + zoom);
    ctx.stroke();
  }, [shown, zoom, grid, frame.px, frame.py]);

  const colors = useMemo(() => [...new Set([...palette.map((c) => c.toLowerCase()), ...colorsOf(pic)])], [palette, pic]);
  const bands = useMemo(() => bandColors(pic, frame.py), [pic, frame.py]);

  return (
    <div className="wms-pe-back" role="presentation">
      <div ref={root} className="wms-pe" role="dialog" aria-modal="true" aria-label={fmt(t.title, { name })} tabIndex={-1} onKeyDown={keys}>
        <div className="wms-pe-top">
          <strong className="wms-pe-title">{fmt(t.title, { name })}</strong>
          <span className="wms-dim wms-mono">{fmt(t.size2, { w: pic.w, h: pic.h })}</span>
          <span className="wms-spacer" />
          <button type="button" className="wms-cap" aria-label={t.undo} title={t.undo} disabled={!undo.length} onClick={doUndo}>
            <Undo2 size={16} />
          </button>
          <button type="button" className="wms-cap" aria-label={t.redo} title={t.redo} disabled={!redo.length} onClick={doRedo}>
            <Redo2 size={16} />
          </button>
          <button type="button" className="wms-cap" aria-label={t.flipH} title={t.flipH} onClick={() => commit(flip(pic))}>
            <FlipHorizontal2 size={16} />
          </button>
          <button type="button" className="wms-cap" aria-label={t.flipV} title={t.flipV} onClick={() => commit(flip(pic, true))}>
            <FlipVertical2 size={16} />
          </button>
          <button type="button" className="wms-cap" aria-label={t.clear} title={t.clear} onClick={() => commit(blank(pic.w, pic.h))}>
            <Trash2 size={16} />
          </button>
        </div>

        <div className="wms-pe-body">
          <div className="wms-pe-tools" role="toolbar" aria-label={t.tools} aria-orientation="vertical">
            {TOOLS.map(({ id, icon: Icon }) => (
              <button key={id} type="button" className={`wms-cap wms-pe-tool${tool === id ? " is-on" : ""}`} aria-pressed={tool === id} aria-label={t[id]} title={t[id]} onClick={() => setTool(id)}>
                <Icon size={18} />
              </button>
            ))}
            {(tool === "pencil" || tool === "eraser" || tool === "line") && (
              <label className="wms-pe-opt">
                <span>{t.size}</span>
                <input type="range" min={1} max={4} value={size} aria-label={t.size} onChange={(e) => setSize(Number(e.target.value))} />
              </label>
            )}
            {(tool === "rect" || tool === "ellipse") && (
              <label className="wms-pe-opt">
                <input type="checkbox" checked={filled} onChange={(e) => setFilled(e.target.checked)} /> {t.filled}
              </label>
            )}
          </div>

          <div className="wms-pe-stage">
            <canvas
              ref={canvas}
              className="wms-pe-canvas"
              role="img"
              aria-label={fmt(t.title, { name })}
              style={{ width: pic.w * zoom, height: pic.h * zoom, cursor: tool === "picker" ? "copy" : "crosshair" }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onPointerLeave={() => setCursor(null)}
            />
          </div>

          <div className="wms-pe-side">
            <label className="wms-pe-color">
              <span className="wms-h">{t.color}</span>
              <span className="wms-row">
                <span className="wms-pe-swatch is-big" style={{ background: tool === "eraser" ? "transparent" : color }} />
                <input type="color" aria-label={t.color} value={color} onChange={(e) => setColor(snapColor(e.target.value).toLowerCase())} />
                <span className="wms-mono wms-dim">{tool === "eraser" ? t.transparent : color}</span>
              </span>
            </label>
            <p className="wms-note">{t.boardNote}</p>
            <span className="wms-h">{t.palette}</span>
            <div className="wms-pe-palette">
              {colors.map((c) => (
                <button key={c} type="button" className={`wms-pe-swatch${c === color && tool !== "eraser" ? " is-on" : ""}`} style={{ background: c }} aria-label={c} title={c} onClick={() => (setColor(c), tool === "eraser" && setTool("pencil"))} />
              ))}
            </div>
            <span className="wms-h">{t.zones}</span>
            <ul className="wms-pe-zones">
              {bands.map((b, i) => (
                <li key={i} className={b.length > 15 ? "is-over" : undefined}>
                  {fmt(t.zone, { n: i + 1, used: b.length })}
                  {b.length > 15 && <span className="wms-note"> {t.zoneOver}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="wms-pe-foot">
          <button type="button" className="wms-cap" aria-label={t.zoomOut} title={t.zoomOut} onClick={() => setZoom((z) => Math.max(1, z - 1))}>
            <ZoomOut size={16} />
          </button>
          <button type="button" className="wms-cap" onClick={() => setZoom(fit)}>
            {t.fit}
          </button>
          <button type="button" className="wms-cap" aria-label={t.zoomIn} title={t.zoomIn} onClick={() => setZoom((z) => Math.min(32, z + 1))}>
            <ZoomIn size={16} />
          </button>
          <label className="wms-check">
            <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> {t.grid}
          </label>
          <span className="wms-mono wms-dim">{cursor ? fmt(t.cursor, cursor) : ""}</span>
          <span className="wms-spacer" />
          <span className="wms-note wms-pe-hint">{t.hint}</span>
          <button type="button" className="wms-cap" onClick={onCancel}>
            {t.cancel}
          </button>
          <button type="button" className="wms-cap is-on" onClick={() => onApply(pic)}>
            {t.apply}
          </button>
        </div>
      </div>
    </div>
  );
}
