// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The pixel editor (Characters: a frame's ✎, an empty animation's "Draw
// frames", "Draw from scratch"): the frames of one animation at their size
// on the board, laid out like Scratch's costume editor. On the left the
// animation's frames (new, duplicate, delete, move up and down), then the
// tools; in the middle the canvas (a pixel grid, the 16 px zones counted
// from the feet, the feet point, and the frames before and after it faint:
// onion skin); on the right the colors, each zone's count of the 15 colors
// the board gives it, and the animation playing. Colors snap to the board's
// (the CPS-1 shows 4096). Undo covers drawing and the frame list alike. The
// drawing is sprites/pixels.ts.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowDown, ArrowUp, Circle, Copy, Eraser, FlipHorizontal2, FlipVertical2, Minus, PaintBucket, Pencil, Pipette, Plus, Redo2, Square, Trash2, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
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

/** A frame of the animation in the editor: an existing frame id, or null for one made here. */
export interface EditorFrame {
  id: string | null;
  pic: EditedFrame;
  /** Drawn on (or new) since the editor opened. */
  changed: boolean;
}

export interface PixelEditorProps {
  t: SpritesMessages["pixel"];
  /** The animation's name ("Standing"). */
  anim: string;
  fps: number;
  /** The animation's frames, in order, and the one to show first. */
  frames: { id: string; pic: EditedFrame }[];
  start: number;
  /** The size a new frame takes when the animation has none yet. */
  size: { w: number; h: number };
  /** The character's colors, offered first. */
  palette: readonly string[];
  /** The animation as the editor leaves it, in order (new frames have a null id). */
  onApply: (frames: EditorFrame[]) => void;
  onCancel: () => void;
}

const blankFrame = (w: number, h: number): EditedFrame => ({ ...blank(w, h), px: w >> 1, py: h - 1 });

export function PixelEditor({ t, anim, fps, frames: initial, start, size, palette, onApply, onCancel }: PixelEditorProps) {
  const [frames, setFrames] = useState<EditorFrame[]>(() =>
    initial.length ? initial.map((f) => ({ id: f.id, pic: { ...copy(f.pic), px: f.pic.px, py: f.pic.py }, changed: false })) : [{ id: null, pic: blankFrame(size.w, size.h), changed: true }],
  );
  const [cur, setCur] = useState(Math.max(0, Math.min(start, initial.length - 1)));
  // undo and redo hold the whole list (drawing and adding, deleting or moving frames alike)
  const [undo, setUndo] = useState<{ frames: EditorFrame[]; cur: number }[]>([]);
  const [redo, setRedo] = useState<{ frames: EditorFrame[]; cur: number }[]>([]);
  const [tool, setTool] = useState<PixelTool>("pencil");
  const [color, setColor] = useState<string>(() => (initial[0] ? colorsOf(initial[0].pic)[0] : undefined) ?? palette[0] ?? "#000000");
  const [brush, setBrush] = useState(1);
  const [filled, setFilled] = useState(false);
  const [grid, setGrid] = useState(true);
  const [onion, setOnion] = useState(true);
  const frame = frames[cur]!;
  const pic = frame.pic;
  const fit = Math.max(2, Math.min(16, Math.floor(Math.min(520 / pic.w, 440 / pic.h))));
  const [zoom, setZoom] = useState(fit);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  // a stroke or shape being drawn: where it started, the picture before it and as it is now, the last point
  const drag = useRef<{ x0: number; y0: number; before: EditedFrame; now: Pixels; lx: number; ly: number; shape: boolean } | null>(null);
  const [preview, setPreview] = useState<Pixels | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => root.current?.focus(), []);

  const snapshot = () => ({ frames, cur });
  const push = (nextFrames: EditorFrame[], nextCur = cur, before = snapshot()) => {
    setUndo((u) => [...u.slice(-MAX_UNDO + 1), before]);
    setRedo([]);
    setFrames(nextFrames);
    setCur(Math.max(0, Math.min(nextCur, nextFrames.length - 1)));
  };
  /** The current frame's picture changed (one undo step, from `before`). */
  const draw = (next: Pixels, before?: EditedFrame) => {
    if (next === (before ?? pic)) return;
    const changed = frames.map((f, i) => (i === cur ? { ...f, pic: { ...next, px: f.pic.px, py: f.pic.py }, changed: true } : f));
    const was = before ? frames.map((f, i) => (i === cur ? { ...f, pic: before } : f)) : frames;
    push(changed, cur, { frames: was, cur });
  };
  const doUndo = () => {
    const prev = undo[undo.length - 1];
    if (!prev) return;
    setUndo((u) => u.slice(0, -1));
    setRedo((r) => [...r, snapshot()]);
    setFrames(prev.frames);
    setCur(prev.cur);
  };
  const doRedo = () => {
    const next = redo[redo.length - 1];
    if (!next) return;
    setRedo((r) => r.slice(0, -1));
    setUndo((u) => [...u, snapshot()]);
    setFrames(next.frames);
    setCur(next.cur);
  };

  // the frame list
  const addFrame = () => push([...frames.slice(0, cur + 1), { id: null, pic: blankFrame(pic.w, pic.h), changed: true }, ...frames.slice(cur + 1)], cur + 1);
  const duplicate = () => push([...frames.slice(0, cur + 1), { id: null, pic: { ...copy(pic), px: pic.px, py: pic.py }, changed: true }, ...frames.slice(cur + 1)], cur + 1);
  const remove = () => frames.length > 1 && push(frames.filter((_, i) => i !== cur), Math.max(0, cur - 1));
  const moveBy = (d: number) => {
    const to = cur + d;
    if (to < 0 || to >= frames.length) return;
    const next = [...frames];
    [next[cur], next[to]] = [next[to]!, next[cur]!];
    push(next, to);
  };

  const ink: Color = tool === "eraser" ? null : color;
  const shape = (base: Pixels, x0: number, y0: number, x1: number, y1: number) =>
    tool === "line" ? stroke(base, x0, y0, x1, y1, ink, brush) : tool === "rect" ? rect(base, x0, y0, x1, y1, ink, filled) : ellipse(base, x0, y0, x1, y1, ink, filled);

  const at = (e: PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: Math.floor(((e.clientX - r.left) / r.width) * pic.w), y: Math.floor(((e.clientY - r.top) / r.height) * pic.h) };
  };
  // the drawing in progress lives in the drag (events can come faster than the screen redraws)
  const showNow = (p: Pixels) => setFrames((fs) => fs.map((f, i) => (i === cur ? { ...f, pic: { ...p, px: f.pic.px, py: f.pic.py } } : f)));
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
      draw(fill(pic, x, y, color));
      return;
    }
    // keep the stroke when the pointer leaves the canvas (a pointer the browser does not know cannot be captured: draw anyway)
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // drawing goes on without the capture
    }
    const isShape = SHAPES.includes(tool);
    const now = isShape ? shape(pic, x, y, x, y) : stroke(pic, x, y, x, y, ink, brush);
    drag.current = { x0: x, y0: y, before: pic, now, lx: x, ly: y, shape: isShape };
    if (isShape) setPreview(now);
    else showNow(now);
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = at(e);
    setCursor(x >= 0 && y >= 0 && x < pic.w && y < pic.h ? { x, y } : null);
    const d = drag.current;
    if (!d) return;
    if (d.shape) {
      d.now = shape(d.before, d.x0, d.y0, x, y);
      setPreview(d.now);
    } else if (x !== d.lx || y !== d.ly) {
      d.now = stroke(d.now, d.lx, d.ly, x, y, ink, brush);
      d.lx = x;
      d.ly = y;
      showNow(d.now);
    }
  };
  const up = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setPreview(null);
    draw(d.now, d.before);
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
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") setCur((c) => Math.max(0, c - 1));
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") setCur((c) => Math.min(frames.length - 1, c + 1));
    else if (!mod) {
      const hit = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (hit) setTool(hit.id);
    }
  };

  // the canvas: the frames around it faint (onion skin), the picture (or the shape being drawn), the grid, the zones and the feet
  const shown = preview ?? pic;
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    c.width = shown.w * zoom;
    c.height = shown.h * zoom;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    // another frame lined up on the feet
    const paint = (f: EditedFrame | Pixels, alpha: number, feet = f as EditedFrame) => {
      const small = toCanvas(f);
      ctx.globalAlpha = alpha;
      ctx.drawImage(small, (pic.px - feet.px) * zoom, (pic.py - feet.py) * zoom, f.w * zoom, f.h * zoom);
      ctx.globalAlpha = 1;
    };
    if (onion) {
      const before = frames[cur - 1];
      const after = frames[cur + 1];
      if (before) paint(before.pic, 0.3);
      if (after) paint(after.pic, 0.12);
    }
    paint(shown, 1, pic);
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
    for (let y = pic.py + 1 - 16; y > 0; y -= 16) ctx.moveTo(0, y * zoom + 0.5), ctx.lineTo(c.width, y * zoom + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    // the feet point
    const fx = (pic.px + 0.5) * zoom;
    const fy = (pic.py + 1) * zoom;
    ctx.strokeStyle = "rgba(236,48,19,1)";
    ctx.beginPath();
    ctx.moveTo(fx - zoom * 2, fy), ctx.lineTo(fx + zoom * 2, fy);
    ctx.moveTo(fx, fy - zoom * 2), ctx.lineTo(fx, fy + zoom);
    ctx.stroke();
  }, [shown, zoom, grid, onion, frames, cur, pic]);

  const colors = useMemo(() => [...new Set([...palette.map((c) => c.toLowerCase()), ...frames.flatMap((f) => colorsOf(f.pic))])], [palette, frames]);
  const bands = useMemo(() => bandColors(pic, pic.py), [pic]);
  const title = fmt(t.title, { name: anim });
  const frameName = (i: number) => fmt(t.frameOf, { n: i + 1, total: frames.length });

  return (
    <div className="wms-pe-back" role="presentation">
      <div ref={root} className="wms-pe" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={keys}>
        <div className="wms-pe-top">
          <strong className="wms-pe-title">{title}</strong>
          <span className="wms-dim wms-mono">
            {frameName(cur)} · {fmt(t.size2, { w: pic.w, h: pic.h })}
          </span>
          <span className="wms-spacer" />
          <button type="button" className="wms-cap" aria-label={t.undo} title={t.undo} disabled={!undo.length} onClick={doUndo}>
            <Undo2 size={16} />
          </button>
          <button type="button" className="wms-cap" aria-label={t.redo} title={t.redo} disabled={!redo.length} onClick={doRedo}>
            <Redo2 size={16} />
          </button>
          <button type="button" className="wms-cap" aria-label={t.flipH} title={t.flipH} onClick={() => draw(flip(pic))}>
            <FlipHorizontal2 size={16} />
          </button>
          <button type="button" className="wms-cap" aria-label={t.flipV} title={t.flipV} onClick={() => draw(flip(pic, true))}>
            <FlipVertical2 size={16} />
          </button>
          <button type="button" className="wms-cap" aria-label={t.clear} title={t.clear} onClick={() => draw(blank(pic.w, pic.h))}>
            <Trash2 size={16} />
          </button>
        </div>

        <div className="wms-pe-body">
          <div className="wms-pe-strip">
            <span className="wms-h">{t.frames}</span>
            <ol className="wms-pe-frames" aria-label={t.frames}>
              {frames.map((f, i) => (
                <li key={i}>
                  <button type="button" className={`wms-pe-frame${i === cur ? " is-on" : ""}`} aria-pressed={i === cur} aria-label={frameName(i)} onClick={() => setCur(i)}>
                    <FrameThumb pic={f.pic} />
                    <span className="wms-pe-frame-n">
                      {i + 1}
                      {f.changed ? " •" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="wms-pe-strip-actions">
              <button type="button" className="wms-cap" aria-label={t.newFrame} title={t.newFrame} onClick={addFrame}>
                <Plus size={16} />
              </button>
              <button type="button" className="wms-cap" aria-label={t.duplicate} title={t.duplicate} onClick={duplicate}>
                <Copy size={16} />
              </button>
              <button type="button" className="wms-cap" aria-label={t.moveUp} title={t.moveUp} disabled={cur === 0} onClick={() => moveBy(-1)}>
                <ArrowUp size={16} />
              </button>
              <button type="button" className="wms-cap" aria-label={t.moveDown} title={t.moveDown} disabled={cur === frames.length - 1} onClick={() => moveBy(1)}>
                <ArrowDown size={16} />
              </button>
              <button type="button" className="wms-cap" aria-label={t.deleteFrame} title={t.deleteFrame} disabled={frames.length < 2} onClick={remove}>
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="wms-pe-tools" role="toolbar" aria-label={t.tools} aria-orientation="vertical">
            {TOOLS.map(({ id, icon: Icon }) => (
              <button key={id} type="button" className={`wms-cap wms-pe-tool${tool === id ? " is-on" : ""}`} aria-pressed={tool === id} aria-label={t[id]} title={t[id]} onClick={() => setTool(id)}>
                <Icon size={18} />
              </button>
            ))}
            {(tool === "pencil" || tool === "eraser" || tool === "line") && (
              <label className="wms-pe-opt">
                <span>{t.size}</span>
                <input type="range" min={1} max={4} value={brush} aria-label={t.size} onChange={(e) => setBrush(Number(e.target.value))} />
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
              aria-label={frameName(cur)}
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
            <span className="wms-h">{t.preview}</span>
            <Preview frames={frames.map((f) => f.pic)} fps={fps} />
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
          <label className="wms-check" title={t.onionHelp}>
            <input type="checkbox" checked={onion} onChange={(e) => setOnion(e.target.checked)} /> {t.onion}
          </label>
          <span className="wms-mono wms-dim">{cursor ? fmt(t.cursor, cursor) : ""}</span>
          <span className="wms-spacer" />
          <span className="wms-note wms-pe-hint">{t.hint}</span>
          <button type="button" className="wms-cap" onClick={onCancel}>
            {t.cancel}
          </button>
          <button type="button" className="wms-cap is-on" onClick={() => onApply(frames)}>
            {t.apply}
          </button>
        </div>
      </div>
    </div>
  );
}

function toCanvas(p: Pixels): HTMLCanvasElement {
  const small = document.createElement("canvas");
  small.width = Math.max(1, p.w);
  small.height = Math.max(1, p.h);
  small.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(p.rgba), p.w, p.h), 0, 0);
  return small;
}

/** A frame in the strip, drawn small. */
function FrameThumb({ pic }: { pic: Pixels }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    c.width = pic.w;
    c.height = pic.h;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pic.rgba), pic.w, pic.h), 0, 0);
  }, [pic]);
  return <canvas ref={ref} className="wms-pe-thumb" aria-hidden="true" />;
}

/** The animation playing at its speed, every frame on the same feet. */
function Preview({ frames, fps }: { frames: EditedFrame[]; fps: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !frames.length) return;
    const pics = frames.map(toCanvas);
    const tall = Math.max(...frames.map((f) => f.py + 1));
    const wide = Math.max(...frames.map((f) => Math.max(f.px, f.w - f.px)));
    const scale = Math.max(1, Math.min(Math.floor((c.height - 8) / tall), Math.floor(c.width / 2 / wide)));
    const t0 = performance.now();
    let id = 0;
    const tick = (now: number) => {
      const i = Math.floor(((now - t0) / 1000) * Math.max(1, fps)) % frames.length;
      const f = frames[i]!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pics[i]!, Math.round(c.width / 2 - f.px * scale), Math.round(c.height - 4 - (f.py + 1) * scale), f.w * scale, f.h * scale);
      id = requestAnimationFrame(tick);
    };
    tick(t0);
    return () => cancelAnimationFrame(id);
  }, [frames, fps]);
  return <canvas ref={ref} className="wms-pe-preview" width={200} height={150} aria-hidden="true" />;
}
