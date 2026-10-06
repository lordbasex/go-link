// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The pixel editor (Characters: a frame's ✎, an empty animation's "Draw
// frames", "Draw from scratch"): the frames of one animation at their size
// on the board, laid out like Scratch's costume editor. On the left the
// animation's frames (new, duplicate, delete, move up and down), then the
// tools; in the middle the canvas (a pixel grid, the 16 px zones counted
// from the feet, the feet point, and the frames before and after it faint:
// onion skin); on the right the colors, each zone's count of the 15 colors
// the board gives it, and the animation playing. Colors snap to the board's
// (the CPS-1 shows 4096). Each frame is a stack of layers (body, clothes,
// weapon, outline…): the tools draw on the current one, the frame is the
// layers that show one over the other, and a layer marked as the shirt
// gives its colors to the ones recolored for players 2 to 4. A vector layer
// (like Scratch's vector costumes) holds shapes that can be selected, moved,
// resized, recolored and put in front or behind, shown as the board's pixels;
// Convert to bitmap keeps the pixels and drops the shapes. Undo covers
// drawing, the layers and the frame list alike. The drawing is
// sprites/pixels.ts.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowDown, ArrowUp, BringToFront, ChevronsDown, Circle, Copy, Eraser, Eye, EyeOff, FlipHorizontal2, FlipVertical2, Hexagon, ImageDown, Lock, LockOpen, Minus, MousePointer2, PaintBucket, Pencil, PenTool, Pipette, Plus, Redo2, SendToBack, Shirt, Square, Trash2, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { snapColor } from "../../board/cps1";
import type { SpritesMessages } from "../../i18n/sprites.en";
import { bandColors, blank, colorAt, colorsOf, composite, copy, ellipse, fill, flip, rect, stroke, type Color, type Pixels } from "../pixels";
import { fmt } from "../text";
import { boxOf, moveShape, rasterize, resizeShape, shapeAt, type Shape, type ShapeKind } from "../vector";

export type PixelTool = "pencil" | "eraser" | "fill" | "picker" | "line" | "rect" | "ellipse" | "select" | "polygon";
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
/** A vector layer's tools: select (move, resize), the shapes, and pick a color. */
const VECTOR_TOOLS: { id: PixelTool; key: string; icon: typeof Pencil }[] = [
  { id: "select", key: "v", icon: MousePointer2 },
  { id: "rect", key: "r", icon: Square },
  { id: "ellipse", key: "o", icon: Circle },
  { id: "line", key: "l", icon: Minus },
  { id: "polygon", key: "p", icon: Hexagon },
  { id: "picker", key: "i", icon: Pipette },
];
const MAX_UNDO = 100;

export interface EditedFrame extends Pixels {
  px: number;
  py: number;
}

/** One layer of a frame. */
export interface EditorLayer {
  name: string;
  pic: Pixels;
  visible: boolean;
  locked: boolean;
  /** Its colors are the shirt's: recolored for players 2 to 4. */
  shirt: boolean;
  /** A vector layer's shapes (its `pic` is them as pixels); none for a bitmap layer. */
  shapes?: Shape[];
}

/** A frame of the animation in the editor: an existing frame id, or null for one made here. */
export interface EditorFrame {
  id: string | null;
  /** What the frame looks like: its layers that show, one over the other. */
  pic: EditedFrame;
  /** Bottom first. */
  layers: EditorLayer[];
  /** Drawn on (or new) since the editor opened. */
  changed: boolean;
}

/** A frame as it comes in: its picture, and its layers when it has them. */
export interface FrameIn {
  id: string;
  pic: EditedFrame;
  layers?: EditorLayer[];
}

export interface PixelEditorProps {
  t: SpritesMessages["pixel"];
  /** The animation's name ("Standing"). */
  anim: string;
  fps: number;
  /** The animation's frames, in order, and the one to show first. */
  frames: FrameIn[];
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
const layer = (name: string, pic: Pixels): EditorLayer => ({ name, pic, visible: true, locked: false, shirt: false });

/** The frame with its layers changed: its picture made again from them. */
function withLayers(f: EditorFrame, layers: EditorLayer[], changed = true): EditorFrame {
  const pic = composite(layers, f.pic.w, f.pic.h);
  return { ...f, layers, pic: { ...pic, px: f.pic.px, py: f.pic.py }, changed: f.changed || changed };
}

/** A blank frame with the same layers (names, shirt and visibility) as another, empty. */
function blankLike(f: EditorFrame): EditorFrame {
  const empty = blankFrame(f.pic.w, f.pic.h);
  return { id: null, pic: { ...empty, px: f.pic.px, py: f.pic.py }, layers: f.layers.map((l) => ({ ...l, pic: blank(f.pic.w, f.pic.h), locked: false })), changed: true };
}

export function PixelEditor({ t, anim, fps, frames: initial, start, size, palette, onApply, onCancel }: PixelEditorProps) {
  const [frames, setFrames] = useState<EditorFrame[]>(() =>
    initial.length
      ? initial.map((f) => ({ id: f.id, pic: { ...copy(f.pic), px: f.pic.px, py: f.pic.py }, layers: f.layers?.length ? f.layers : [layer(t.layerBase, copy(f.pic))], changed: false }))
      : [{ id: null, pic: blankFrame(size.w, size.h), layers: [layer(t.layerBase, blank(size.w, size.h))], changed: true }],
  );
  // the layer the tools draw on (by place, from the bottom)
  const [li, setLi] = useState(0);
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
  // a vector layer: the selected shape, a polygon being drawn, the outline and whether shapes get filled
  const [sel, setSel] = useState<number | null>(null);
  const [poly, setPoly] = useState<[number, number][] | null>(null);
  const [outline, setOutline] = useState("#000000");
  const [width, setWidth] = useState(1);
  const [fillOn, setFillOn] = useState(true);
  const frame = frames[cur]!;
  const pic = frame.pic;
  const lay = Math.min(li, frame.layers.length - 1);
  const layerNow = frame.layers[lay]!;
  // drawing on a hidden or locked layer would change nothing you can see, or something you protected
  const canDraw = layerNow.visible && !layerNow.locked;
  const shapes = layerNow.shapes;
  const isVector = shapes !== undefined;
  // the tool in use: a vector layer has its own set
  const active: PixelTool = isVector ? (VECTOR_TOOLS.some((x) => x.id === tool) ? tool : "select") : tool === "select" || tool === "polygon" ? "pencil" : tool;
  const fit = Math.max(2, Math.min(16, Math.floor(Math.min(520 / pic.w, 440 / pic.h))));
  const [zoom, setZoom] = useState(fit);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  // a stroke or shape being drawn: where it started, the picture before it and as it is now, the last point
  const drag = useRef<{ x0: number; y0: number; before: Pixels; now: Pixels; lx: number; ly: number; shape: boolean } | null>(null);
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
  /** The current layer's pixels changed (one undo step, from `before`). */
  const draw = (next: Pixels, before?: Pixels) => {
    if (next === (before ?? layerNow.pic)) return;
    const setLayer = (f: EditorFrame, p: Pixels) => withLayers(f, f.layers.map((l, k) => (k === lay ? { ...l, pic: p } : l)));
    const changed = frames.map((f, i) => (i === cur ? setLayer(f, next) : f));
    const was = before ? frames.map((f, i) => (i === cur ? withLayers(f, f.layers.map((l, k) => (k === lay ? { ...l, pic: before } : l)), false) : f)) : frames;
    push(changed, cur, { frames: was, cur });
  };
  /** The current frame's layers changed (added, removed, moved, merged, shown, locked, renamed). */
  const relayer = (layers: EditorLayer[], nextLi = lay) => {
    push(frames.map((f, i) => (i === cur ? withLayers(f, layers) : f)));
    setLi(Math.max(0, Math.min(nextLi, layers.length - 1)));
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
  const addFrame = () => push([...frames.slice(0, cur + 1), blankLike(frame), ...frames.slice(cur + 1)], cur + 1);
  const duplicate = () => push([...frames.slice(0, cur + 1), { ...frame, id: null, layers: frame.layers.map((l) => ({ ...l, pic: copy(l.pic) })), changed: true }, ...frames.slice(cur + 1)], cur + 1);

  // the layers of the current frame (the list shows the top one first)
  const L = frame.layers;
  const addLayer = () => relayer([...L.slice(0, lay + 1), layer(fmt(t.layerN, { n: L.length + 1 }), blank(pic.w, pic.h)), ...L.slice(lay + 1)], lay + 1);
  const duplicateLayer = () =>
    relayer([...L.slice(0, lay + 1), { ...layerNow, name: fmt(t.layerCopy, { name: layerNow.name }), pic: copy(layerNow.pic), locked: false, ...(layerNow.shapes ? { shapes: layerNow.shapes.map((x) => ({ ...x, points: x.points.map((q) => [...q] as [number, number]) })) } : {}) }, ...L.slice(lay + 1)], lay + 1);
  const deleteLayer = () => L.length > 1 && relayer(L.filter((_, k) => k !== lay), lay - 1);
  const moveLayer = (d: number) => {
    const to = lay + d;
    if (to < 0 || to >= L.length) return;
    const next = [...L];
    [next[lay], next[to]] = [next[to]!, next[lay]!];
    relayer(next, to);
  };
  /** The current layer onto the one under it, as one. */
  const mergeDown = () => {
    if (lay === 0) return;
    const under = L[lay - 1]!;
    const merged = composite([{ pic: under.pic, visible: true }, { pic: layerNow.pic, visible: layerNow.visible }], pic.w, pic.h);
    // merging makes pixels: a vector layer under it becomes a bitmap one
    relayer([...L.slice(0, lay - 1), { ...under, pic: merged, shapes: undefined }, ...L.slice(lay + 1)], lay - 1);
  };
  const setLayerProps = (k: number, patch: Partial<EditorLayer>) => relayer(L.map((l, j) => (j === k ? { ...l, ...patch } : l)), k);
  const remove = () => frames.length > 1 && push(frames.filter((_, i) => i !== cur), Math.max(0, cur - 1));
  const moveBy = (d: number) => {
    const to = cur + d;
    if (to < 0 || to >= frames.length) return;
    const next = [...frames];
    [next[cur], next[to]] = [next[to]!, next[cur]!];
    push(next, to);
  };

  const ink: Color = active === "eraser" ? null : color;
  const shape = (base: Pixels, x0: number, y0: number, x1: number, y1: number) =>
    active === "line" ? stroke(base, x0, y0, x1, y1, ink, brush) : active === "rect" ? rect(base, x0, y0, x1, y1, ink, filled) : ellipse(base, x0, y0, x1, y1, ink, filled);

  // ---- vector layers
  /** A layer with these shapes, its pixels made from them. */
  const vectorLayer = (l: EditorLayer, list: Shape[]): EditorLayer => ({ ...l, shapes: list, pic: rasterize(list, pic.w, pic.h) });
  /** The current layer's shapes changed: one undo step (from `before` when the change was shown while dragging). */
  const setShapes = (list: Shape[], nextSel: number | null = sel, before?: Shape[]) => {
    const set = (f: EditorFrame, l: Shape[], changed: boolean) => withLayers(f, f.layers.map((x, k) => (k === lay ? vectorLayer(x, l) : x)), changed);
    const was = before ? frames.map((f, i) => (i === cur ? set(f, before, false) : f)) : frames;
    push(frames.map((f, i) => (i === cur ? set(f, list, true) : f)), cur, { frames: was, cur });
    setSel(nextSel !== null && nextSel < list.length ? nextSel : null);
  };
  /** Shapes shown while dragging (no undo step yet). */
  const showShapes = (list: Shape[]) => setFrames((fs) => fs.map((f, i) => (i === cur ? withLayers(f, f.layers.map((x, k) => (k === lay ? vectorLayer(x, list) : x)), f.changed) : f)));
  const newShape = (kind: ShapeKind, points: [number, number][]): Shape => ({ kind, points, fill: kind === "line" ? null : fillOn ? color : null, stroke: kind === "line" ? color : width > 0 ? outline : null, width: kind === "line" ? Math.max(1, brush) : width });
  const addVectorLayer = () => relayer([...L.slice(0, lay + 1), vectorLayer(layer(fmt(t.vectorN, { n: L.length + 1 }), blank(pic.w, pic.h)), []), ...L.slice(lay + 1)], lay + 1);
  /** Scratch's Convert to bitmap: the layer keeps its pixels and drops its shapes. */
  const toBitmap = () => {
    setSel(null);
    relayer(L.map((l, k) => (k === lay ? { ...l, shapes: undefined } : l)));
  };
  const order = (d: 1 | -1) => {
    if (!shapes || sel === null) return;
    const to = sel + d;
    if (to < 0 || to >= shapes.length) return;
    const next = [...shapes];
    [next[sel], next[to]] = [next[to]!, next[sel]!];
    setShapes(next, to);
  };
  /** The selected shape takes a color or outline, with the Select tool (with a drawing tool, colors are for the next shape). */
  const recolor = (patch: Partial<Shape>) => {
    if (!shapes || sel === null || active !== "select") return;
    setShapes(shapes.map((x, k) => (k === sel ? { ...x, ...patch } : x)));
  };
  const finishPolygon = (pts: [number, number][]) => {
    setPoly(null);
    setPreview(null);
    if (shapes && pts.length >= 3) setShapes([...shapes, newShape("polygon", pts)], shapes.length);
  };
  const vdrag = useRef<{ mode: "new" | "move" | "resize"; x0: number; y0: number; before: Shape[]; now: Shape[] } | null>(null);
  const vectorDown = (x: number, y: number, e: PointerEvent<HTMLCanvasElement>) => {
    if (!shapes) return;
    if (active === "polygon") {
      const pts = poly ?? [];
      const first = pts[0];
      // a click on the first corner (or a double click) closes it
      if ((first && pts.length >= 3 && Math.abs(first[0] - x) <= 1 && Math.abs(first[1] - y) <= 1) || e.detail >= 2) finishPolygon(pts);
      else setPoly([...pts, [x, y]]);
      return;
    }
    if (active === "select") {
      const b = sel !== null && shapes[sel] ? boxOf(shapes[sel]!) : null;
      // the bottom right corner pixel of the selected one (marked on the canvas) resizes it
      if (b && x === b.x + b.w && y === b.y + b.h) {
        vdrag.current = { mode: "resize", x0: x, y0: y, before: shapes, now: shapes };
        return;
      }
      const hit = shapeAt(shapes, pic.w, pic.h, x, y);
      setSel(hit >= 0 ? hit : null);
      if (hit >= 0) vdrag.current = { mode: "move", x0: x, y0: y, before: shapes, now: shapes };
      return;
    }
    const kind = active as ShapeKind;
    const made = [...shapes, newShape(kind, [[x, y], [x, y]])];
    vdrag.current = { mode: "new", x0: x, y0: y, before: shapes, now: made };
    showShapes(made);
  };
  const vectorMove = (x: number, y: number) => {
    if (active === "polygon" && poly && shapes) {
      setPreview(rasterize([...shapes, newShape("polygon", [...poly, [x, y]])], pic.w, pic.h));
      return;
    }
    const d = vdrag.current;
    if (!d) return;
    if (d.mode === "new") d.now = d.before.concat({ ...d.now[d.now.length - 1]!, points: [[d.x0, d.y0], [x, y]] });
    else if (d.mode === "move" && sel !== null) d.now = d.before.map((s2, k) => (k === sel ? moveShape(s2, x - d.x0, y - d.y0) : s2));
    else if (d.mode === "resize" && sel !== null) d.now = d.before.map((s2, k) => (k === sel ? resizeShape(s2, x, y) : s2));
    showShapes(d.now);
  };
  const vectorUp = () => {
    const d = vdrag.current;
    if (!d) return;
    vdrag.current = null;
    if (d.now === d.before) return;
    setShapes(d.now, d.mode === "new" ? d.now.length - 1 : sel, d.before);
  };

  const at = (e: PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: Math.floor(((e.clientX - r.left) / r.width) * pic.w), y: Math.floor(((e.clientY - r.top) / r.height) * pic.h) };
  };
  // the drawing in progress lives in the drag (events can come faster than the screen redraws)
  const showNow = (p: Pixels) => setFrames((fs) => fs.map((f, i) => (i === cur ? withLayers(f, f.layers.map((l, k) => (k === lay ? { ...l, pic: p } : l)), f.changed) : f)));
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const { x, y } = at(e);
    // Alt picks the color under the pointer with any tool
    if (active === "picker" || e.altKey) {
      const c = colorAt(pic, x, y);
      if (c) setColor(c);
      return;
    }
    if (!canDraw) return;
    if (isVector) {
      vectorDown(x, y, e);
      return;
    }
    if (active === "fill") {
      draw(fill(layerNow.pic, x, y, color));
      return;
    }
    // keep the stroke when the pointer leaves the canvas (a pointer the browser does not know cannot be captured: draw anyway)
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // drawing goes on without the capture
    }
    const isShape = SHAPES.includes(active);
    const base = layerNow.pic;
    const now = isShape ? shape(base, x, y, x, y) : stroke(base, x, y, x, y, ink, brush);
    drag.current = { x0: x, y0: y, before: base, now, lx: x, ly: y, shape: isShape };
    if (isShape) setPreview(now);
    else showNow(now);
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = at(e);
    setCursor(x >= 0 && y >= 0 && x < pic.w && y < pic.h ? { x, y } : null);
    if (isVector) {
      vectorMove(x, y);
      return;
    }
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
    if (isVector) {
      vectorUp();
      return;
    }
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
    } else if (e.key === "Escape") {
      // Esc first drops a polygon being drawn, then a selection, then the editor
      if (poly) finishPolygon([]);
      else if (sel !== null) setSel(null);
      else onCancel();
    } else if (e.key === "Enter" && poly) finishPolygon(poly);
    else if ((e.key === "Delete" || e.key === "Backspace") && shapes && sel !== null) setShapes(shapes.filter((_, k) => k !== sel), null);
    else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(32, z + 1));
    else if (e.key === "-") setZoom((z) => Math.max(1, z - 1));
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") setCur((c) => Math.max(0, c - 1));
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") setCur((c) => Math.min(frames.length - 1, c + 1));
    else if (!mod) {
      const hit = (isVector ? VECTOR_TOOLS : TOOLS).find((x) => x.key === e.key.toLowerCase());
      if (hit) setTool(hit.id);
    }
  };

  // the canvas: the frames around it faint (onion skin), the picture (or the shape being drawn), the grid, the zones and the feet
  const shown = useMemo(() => (preview ? composite(L.map((l, k) => (k === lay ? { ...l, pic: preview } : l)), pic.w, pic.h) : pic), [preview, L, lay, pic]);
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
    // a vector layer's selected shape: its box and the corner that resizes it
    const chosen = sel !== null ? shapes?.[sel] : undefined;
    if (chosen) {
      const b = boxOf(chosen);
      ctx.strokeStyle = "rgba(40,120,255,1)";
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(b.x * zoom + 0.5, b.y * zoom + 0.5, (b.w + 1) * zoom - 1, (b.h + 1) * zoom - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(40,120,255,1)";
      ctx.fillRect((b.x + b.w) * zoom, (b.y + b.h) * zoom, zoom, zoom);
    }
  }, [shown, zoom, grid, onion, frames, cur, pic, sel, shapes]);

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
          <button type="button" className="wms-cap" aria-label={t.flipH} title={t.flipH} onClick={() => push(frames.map((f, i) => (i === cur ? withLayers(f, f.layers.map((l) => (l.shapes ? vectorLayer(l, l.shapes.map((x) => ({ ...x, points: x.points.map(([px, py]) => [pic.w - 1 - px, py] as [number, number]) }))) : { ...l, pic: flip(l.pic) }))) : f)))}>
            <FlipHorizontal2 size={16} />
          </button>
          <button type="button" className="wms-cap" aria-label={t.flipV} title={t.flipV} onClick={() => push(frames.map((f, i) => (i === cur ? withLayers(f, f.layers.map((l) => (l.shapes ? vectorLayer(l, l.shapes.map((x) => ({ ...x, points: x.points.map(([px, py]) => [px, pic.h - 1 - py] as [number, number]) }))) : { ...l, pic: flip(l.pic, true) }))) : f)))}>
            <FlipVertical2 size={16} />
          </button>
          <button type="button" className="wms-cap" aria-label={t.clear} title={t.clear} disabled={!canDraw} onClick={() => (isVector ? setShapes([], null) : draw(blank(pic.w, pic.h)))}>
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
            {(isVector ? VECTOR_TOOLS : TOOLS).map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`wms-cap wms-pe-tool${active === id ? " is-on" : ""}`}
                aria-pressed={active === id}
                aria-label={t[id]}
                title={t[id]}
                onClick={() => {
                  setTool(id);
                  setPoly(null);
                  setPreview(null);
                }}
              >
                <Icon size={18} />
              </button>
            ))}
            {isVector && sel !== null && (
              <span className="wms-pe-vops">
                <button type="button" className="wms-cap wms-pe-tool" aria-label={t.forward} title={t.forward} onClick={() => order(1)}>
                  <BringToFront size={16} />
                </button>
                <button type="button" className="wms-cap wms-pe-tool" aria-label={t.backward} title={t.backward} onClick={() => order(-1)}>
                  <SendToBack size={16} />
                </button>
                <button type="button" className="wms-cap wms-pe-tool" aria-label={t.duplicateShape} title={t.duplicateShape} onClick={() => shapes && sel !== null && setShapes([...shapes, moveShape(shapes[sel]!, 2, 2)], shapes.length)}>
                  <Copy size={16} />
                </button>
                <button type="button" className="wms-cap wms-pe-tool" aria-label={t.deleteShape} title={t.deleteShape} onClick={() => shapes && setShapes(shapes.filter((_, k) => k !== sel), null)}>
                  <Trash2 size={16} />
                </button>
              </span>
            )}
            {isVector && active === "polygon" && <p className="wms-note wms-pe-opt">{t.polygonHint}</p>}
            {!isVector && (active === "pencil" || active === "eraser" || active === "line") && (
              <label className="wms-pe-opt">
                <span>{t.size}</span>
                <input type="range" min={1} max={4} value={brush} aria-label={t.size} onChange={(e) => setBrush(Number(e.target.value))} />
              </label>
            )}
            {!isVector && (active === "rect" || active === "ellipse") && (
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
              style={{ width: pic.w * zoom, height: pic.h * zoom, cursor: active === "picker" ? "copy" : active === "select" ? "default" : "crosshair" }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onPointerLeave={() => setCursor(null)}
            />
          </div>

          <div className="wms-pe-side">
            <span className="wms-h">{t.layers}</span>
            <ol className="wms-pe-layers" aria-label={t.layers}>
              {L.map((l, k) => ({ l, k }))
                .reverse()
                .map(({ l, k }) => (
                  <li key={k} className={`wms-pe-layer${k === lay ? " is-on" : ""}`}>
                    <button type="button" className="wms-pe-icon" aria-label={`${l.visible ? t.hide : t.show}: ${l.name}`} title={l.visible ? t.hide : t.show} onClick={() => setLayerProps(k, { visible: !l.visible })}>
                      {l.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button type="button" className="wms-pe-icon" aria-label={`${l.locked ? t.unlock : t.lock}: ${l.name}`} title={l.locked ? t.unlock : t.lock} onClick={() => setLayerProps(k, { locked: !l.locked })}>
                      {l.locked ? <Lock size={14} /> : <LockOpen size={14} />}
                    </button>
                    <button type="button" className={`wms-pe-icon${l.shirt ? " is-on" : ""}`} aria-pressed={l.shirt} aria-label={`${t.shirt}: ${l.name}`} title={t.shirtHelp} onClick={() => setLayerProps(k, { shirt: !l.shirt })}>
                      <Shirt size={14} />
                    </button>
                    <input
                      className="wms-pe-layer-name"
                      aria-label={fmt(t.layerName, { n: k + 1 })}
                      value={l.name}
                      onFocus={() => (setLi(k), setSel(null), setPoly(null))}
                      onChange={(e) => setFrames((fs) => fs.map((f, i) => (i === cur ? { ...f, layers: f.layers.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) } : f)))}
                    />
                    <button type="button" className="wms-pe-pick" aria-label={fmt(t.drawOn, { name: l.name })} aria-pressed={k === lay} title={l.shapes ? t.vectorLayer : undefined} onClick={() => (setLi(k), setSel(null), setPoly(null))}>
                      <LayerThumb pic={l.pic} />
                      {l.shapes && <PenTool size={10} className="wms-pe-vbadge" aria-hidden="true" />}
                    </button>
                  </li>
                ))}
            </ol>
            <div className="wms-pe-layer-actions">
              <button type="button" className="wms-cap" aria-label={t.newLayer} title={t.newLayer} onClick={addLayer}>
                <Plus size={14} />
              </button>
              <button type="button" className="wms-cap" aria-label={t.newVector} title={t.newVector} onClick={addVectorLayer}>
                <PenTool size={14} />
              </button>
              <button type="button" className="wms-cap" aria-label={t.duplicateLayer} title={t.duplicateLayer} onClick={duplicateLayer}>
                <Copy size={14} />
              </button>
              <button type="button" className="wms-cap" aria-label={t.layerUp} title={t.layerUp} disabled={lay === L.length - 1} onClick={() => moveLayer(1)}>
                <ArrowUp size={14} />
              </button>
              <button type="button" className="wms-cap" aria-label={t.layerDown} title={t.layerDown} disabled={lay === 0} onClick={() => moveLayer(-1)}>
                <ArrowDown size={14} />
              </button>
              <button type="button" className="wms-cap" aria-label={t.mergeDown} title={t.mergeDown} disabled={lay === 0} onClick={mergeDown}>
                <ChevronsDown size={14} />
              </button>
              <button type="button" className="wms-cap" aria-label={t.deleteLayer} title={t.deleteLayer} disabled={L.length < 2} onClick={deleteLayer}>
                <Trash2 size={14} />
              </button>
            </div>
            {!canDraw && <p className="wms-note">{layerNow.locked ? t.lockedNote : t.hiddenNote}</p>}
            <label className="wms-pe-color">
              <span className="wms-h">{t.color}</span>
              <span className="wms-row">
                <span className="wms-pe-swatch is-big" style={{ background: tool === "eraser" ? "transparent" : color }} />
                <input
                  type="color"
                  aria-label={t.color}
                  value={color}
                  onChange={(e) => {
                    const c = snapColor(e.target.value).toLowerCase();
                    setColor(c);
                    if (isVector && sel !== null) recolor(shapes?.[sel]?.kind === "line" ? { stroke: c } : { fill: c });
                  }}
                />
                <span className="wms-mono wms-dim">{tool === "eraser" ? t.transparent : color}</span>
              </span>
            </label>
            {isVector && (
              <div className="wms-pe-vstyle">
                <label className="wms-check">
                  <input type="checkbox" checked={sel !== null && shapes?.[sel] ? shapes[sel]!.fill !== null : fillOn} onChange={(e) => (setFillOn(e.target.checked), recolor({ fill: e.target.checked ? color : null }))} /> {t.fillShape}
                </label>
                <label className="wms-row">
                  <span>{t.outline}</span>
                  <input type="color" aria-label={t.outline} value={outline} onChange={(e) => {
                    const c = snapColor(e.target.value).toLowerCase();
                    setOutline(c);
                    recolor({ stroke: c });
                  }} />
                </label>
                <label className="wms-pe-opt">
                  <span>{fmt(t.outlineWidth, { n: width })}</span>
                  <input type="range" min={0} max={4} value={width} aria-label={t.outlineWidthLabel} onChange={(e) => (setWidth(Number(e.target.value)), recolor({ width: Number(e.target.value), stroke: Number(e.target.value) ? outline : null }))} />
                </label>
              </div>
            )}
            <p className="wms-note">{t.boardNote}</p>
            <span className="wms-h">{t.palette}</span>
            <div className="wms-pe-palette">
              {colors.map((c) => (
                <button key={c} type="button" className={`wms-pe-swatch${c === color && tool !== "eraser" ? " is-on" : ""}`} style={{ background: c }} aria-label={c} title={c} onClick={() => {
                    setColor(c);
                    if (active === "eraser") setTool("pencil");
                    if (isVector && sel !== null) recolor(shapes?.[sel]?.kind === "line" ? { stroke: c } : { fill: c });
                  }} />
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
          {isVector && (
            <button type="button" className="wms-cap is-on" onClick={toBitmap}>
              <ImageDown size={16} /> {t.toBitmap}
            </button>
          )}
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

/** A layer's picture, small, in the layers list. */
function LayerThumb({ pic }: { pic: Pixels }) {
  return <FrameThumb pic={pic} />;
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
