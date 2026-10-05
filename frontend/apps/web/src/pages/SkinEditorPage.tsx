// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { t, useLang } from "../i18n";
import { en } from "../i18n/en";
import { es } from "../i18n/es";
import { pt } from "../i18n/pt";
import { Select } from "../components/ui/Select";
import { LockIcon } from "../components/Icons";
import { BUILTIN_SKINS, smokeSkin } from "../skins/builtin";
import {
  deviceOf,
  DEVICE_IDS,
  R,
  bottom,
  check,
  compute,
  midX,
  midY,
  placementOf,
  playArea,
  right,
  type ControlName,
  type DeviceId,
  type Issue,
  type LayoutJson,
  type Orient,
  type Rect,
} from "../skins/layout";
import {
  LABELS,
  MARKS,
  PALETTE_KEYS,
  SHAPES,
  clone,
  complete,
  design,
  fileName,
  hex,
  menuStyle,
  palette,
  round,
  serialize,
  validate,
  type DecorJson,
  type EditSkin,
  type FormatIssue,
  type SkinJson,
} from "../skins/model";
import { SkinPhone } from "../skins/SkinPhone";
import { SkinEditorWelcome, welcomeNeeded } from "../skins/Welcome";
import {
  addRecord,
  copyOf,
  emptyGuides,
  readLibrary,
  removeRecord,
  sortedRecords,
  writeLibrary,
  type Guides,
  type Library,
} from "../skins/store";

/** A copied skin gets "(copy)" in each of its names' own language. */
const COPY_SUFFIX = { en: en.skinEditor.copySuffix, es: es.skinEditor.copySuffix, pt: pt.skinEditor.copySuffix };

// The skin editor (/tools/skin-editor) for the player apps' skins
// (docs/skins). It draws a skin exactly as the apps do (skins/layout.ts
// is their placement math) and lets a designer move and resize every part
// with rulers, guides and snapping, then exports the skin JSON (format in
// docs/skins/README.md). Nothing leaves the browser.

const PART_KEYS = ["header", "menu", "screen", "label", "dpad", "buttons", "coin", "starts"] as const;
type PartKey = (typeof PART_KEYS)[number];
const PART_COLORS: Record<PartKey, string> = {
  header: "#8c95a8",
  menu: "#d9b8ff",
  screen: "#4fc3d9",
  label: "#8c95a8",
  dpad: "#e9ecf2",
  buttons: "#f2a33a",
  coin: "#e9ecf2",
  starts: "#e9ecf2",
};
type Sel = { t: "part"; k: PartKey } | { t: "decor"; i: number };
type Tool = "select" | "hand" | "rect" | "grill";
type View = "design" | "split" | "code";
const LINE_H = 19;

interface State {
  /** Every saved skin (this browser only) and which one is on screen. */
  lib: Library;
  /** The record being edited; null while a built-in skin is shown (read-only). */
  recordId: string | null;
  /** The browser refused the last save (blocked or full storage). */
  saveFailed: boolean;
  libOpen: boolean;
  /** The record whose delete waits for a second click. */
  confirmDelete: string | null;
  skin: EditSkin;
  file: string;
  dirty: boolean;
  orient: Orient;
  device: DeviceId;
  sel: Sel | null;
  zoom: number;
  panX: number;
  panY: number;
  tool: Tool;
  snap: boolean;
  grid: boolean;
  showBoxes: boolean;
  showGuides: boolean;
  guides: Guides;
  buttons: number;
  starts: number;
  aspect: number;
  held: boolean;
  picture: string | null;
  pictures: Record<string, string>;
  snapLines: { axis: "x" | "y"; v: number }[];
  view: View;
  codeTyping: boolean;
  codeText: string;
  codeStatus: { ok: boolean; text: string } | null;
  toast: string | null;
  pointer: string;
}

type Drag =
  | { kind: "pan"; sx: number; sy: number; px: number; py: number }
  | { kind: "new"; shape: "rect" | "grill"; x0: number; y0: number; x1?: number; y1?: number }
  | { kind: "guide"; axis: "x" | "y"; i: number; out?: boolean }
  | { kind: "move" | "resize"; hx: number; hy: number; rect: Rect; vx: number; vy: number; changed: boolean };

const baseSkin = () => smokeSkin() ?? BUILTIN_SKINS[0]!;

function initialState(): State {
  const lib = readLibrary();
  const fresh: State = {
    lib,
    recordId: null,
    saveFailed: false,
    libOpen: false,
    confirmDelete: null,
    skin: complete(baseSkin(), baseSkin()),
    file: `skin-${baseSkin().id}.json`,
    dirty: false,
    orient: "portrait",
    device: "iphone17",
    sel: null,
    zoom: 1,
    panX: 40,
    panY: 40,
    tool: "select",
    snap: true,
    grid: false,
    showBoxes: true,
    showGuides: true,
    guides: { portrait: { x: [], y: [] }, landscape: { x: [], y: [] } },
    buttons: 6,
    starts: 2,
    aspect: 4 / 3,
    held: false,
    picture: null,
    pictures: {},
    snapLines: [],
    view: "design",
    codeTyping: false,
    codeText: "",
    codeStatus: null,
    toast: null,
    pointer: "",
  };
  // Reopen the skin that was on screen last time.
  const rec = lib.current ? lib.skins[lib.current] : undefined;
  if (rec && lib.current) {
    fresh.recordId = lib.current;
    fresh.skin = complete(rec.skin, baseSkin());
    fresh.file = rec.file || fileName(rec.skin);
    fresh.guides = rec.guides;
    fresh.dirty = !!rec.dirty;
  }
  return fresh;
}

/** The toolbar's icons, drawn like the rest of the site's (24 × 24 strokes). */
const ICON_PATHS: Record<string, string> = {
  select: "M6 3l12 7.5-5.2 1.3-2.3 5.2z",
  hand: "M8 13V5.5a1.5 1.5 0 0 1 3 0V11 M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5 M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.8-2.4L3.6 14a1.5 1.5 0 0 1 2.4-1.8L8 14.5",
  plate: "M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
  grill: "M7 7h.01 M12 7h.01 M17 7h.01 M7 12h.01 M12 12h.01 M17 12h.01 M7 17h.01 M12 17h.01 M17 17h.01",
  snap: "M5 3h5v8a2 2 0 0 0 4 0V3h5v8a7 7 0 0 1-14 0z M5 7h5 M14 7h5",
  grid: "M4 9h16 M4 15h16 M9 4v16 M15 4v16",
  boxes: "M4 4h3 M10 4h4 M17 4h3v3 M20 10v4 M20 17v3h-3 M14 20h-4 M7 20H4v-3 M4 14v-4 M4 7V4",
  guides: "M3 8h18 M15 3v18",
  undo: "M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "M15 14l5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  minus: "M5 12h14",
  copy: "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  trash: "M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3",
  plus: "M12 5v14 M5 12h14",
};

function Icon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "grill" ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

/** Keeps the value of a text field typed into a path of the skin ("shell.center", "style.menu.fill"...). */
function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== "object") o[k] = {};
    o = o[k] as Record<string, unknown>;
  }
  o[keys[keys.length - 1]!] = value;
}

function controlName(n: ControlName): string {
  const c = t.skinEditor.controlNames;
  switch (n.kind) {
    case "dpad": return c.dpad;
    case "coin": return c.coin;
    case "button": return c.button(n.n);
    case "start": return c.start(n.n);
  }
}

/** A check's problem in the viewer's language. */
function issueText(i: Issue | FormatIssue): string {
  const m = t.skinEditor.issues;
  const where = "where" in i && i.where ? `${t.skinEditor.where(t.skinEditor.orientNames[i.where.orient], deviceOf(i.where.device).name)}: ` : "";
  switch (i.kind) {
    case "noLayout": return m.noLayout(t.skinEditor.orientNames[i.orient]);
    case "offScreen": return where + m.offScreen(controlName(i.name));
    case "onPicture": return where + m.onPicture(controlName(i.name));
    case "tooSmall": return where + m.tooSmall(controlName(i.name), i.size);
    case "overlap": return where + m.overlap(controlName(i.name), controlName(i.other));
    case "menuOnPicture": return where + m.menuOnPicture;
    case "pictureSmaller": return where + m.pictureSmaller(i.percent);
    case "badId": return m.badId;
    case "builtinId": return m.builtinId(i.id);
    case "noName": return m.noName;
    case "badColor": return m.badColor(i.key);
  }
}

/** One JSON line as colored tokens, with a swatch before every color. */
function CodeLine({ line }: { line: string }) {
  const out: ReactNode[] = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    if (m[1] && m[2]) {
      out.push(<span key={k++} className="tk-key">{m[1]}</span>, m[2]);
    } else if (m[1]) {
      const color = /^"#[0-9a-fA-F]{6}"$/.test(m[1]) ? m[1].slice(1, -1) : null;
      if (color) out.push(<span key={k++} className="tk-sw" style={{ background: color }} />);
      out.push(<span key={k++} className="tk-str">{m[1]}</span>);
    } else if (m[3]) out.push(<span key={k++} className="tk-num">{m[3]}</span>);
    else out.push(<span key={k++} className="tk-bool">{m[4]}</span>);
    last = re.lastIndex;
  }
  if (last < line.length) out.push(line.slice(last));
  return <>{out.length ? out : " "}</>;
}

/** The selection's lines in the JSON (its box, its plate, or the plastic), as [first, last]. */
function selectedLines(lines: string[], sel: Sel | null, orient: Orient): [number, number] | null {
  const find = (from: number, pattern: string, indent: number) => {
    for (let i = from; i < lines.length; i++) if (lines[i]!.startsWith(" ".repeat(indent) + pattern)) return i;
    return -1;
  };
  const block = (i: number): [number, number] | null => {
    if (i < 0) return null;
    if (!/[{[]\s*$/.test(lines[i]!)) return [i, i];
    const ind = lines[i]!.length - lines[i]!.trimStart().length;
    for (let j = i + 1; j < lines.length; j++) if (lines[j]!.length - lines[j]!.trimStart().length === ind && /^\s*[}\]]/.test(lines[j]!)) return [i, j];
    return [i, i];
  };
  if (!sel) return block(find(0, '"shell"', 2));
  if (sel.t === "part") {
    const lay = find(0, '"layout"', 2);
    const o = lay < 0 ? -1 : find(lay, `"${orient}"`, 4);
    return o < 0 ? null : block(find(o, `"${sel.k}"`, 6));
  }
  const dec = find(0, '"decor"', 2);
  const o = dec < 0 ? -1 : find(dec, `"${orient}"`, 4);
  if (o < 0) return null;
  let n = -1;
  for (let i = o + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith("      {")) n++;
    if (n === sel.i) return block(i);
    if (/^ {4}\]/.test(lines[i]!)) break;
  }
  return null;
}

export function SkinEditorPage() {
  const st = useRef<State>(null as unknown as State);
  if (!st.current) st.current = initialState();
  const [, force] = useReducer((x: number) => x + 1, 0);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const drag = useRef<Drag | null>(null);
  const spaceDown = useRef(false);
  const viewport = useRef<HTMLDivElement>(null);
  const rulerX = useRef<HTMLCanvasElement>(null);
  const rulerY = useRef<HTMLCanvasElement>(null);
  const codeArea = useRef<HTMLTextAreaElement>(null);
  const codeHl = useRef<HTMLPreElement>(null);
  const openInput = useRef<HTMLInputElement>(null);
  const pictureInput = useRef<HTMLInputElement>(null);
  const bgInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef(0);
  // The last autosaved state (null before the first render's save).
  const lastSaved = useRef<string | null>(null);
  const codeTimer = useRef(0);
  const scrollToSel = useRef(true);
  // Re-render on a language change from the header.
  const lang = useLang();
  const S = st.current;
  const e = t.skinEditor;
  // The welcome opens by itself on the first visit, and from the Guide button.
  const [welcome, setWelcome] = useState(welcomeNeeded);
  const navigate = useNavigate();

  // ------------------------------------------------------------ geometry

  const dev = () => deviceOf(st.current.device)[st.current.orient];
  const landscape = () => st.current.orient === "landscape";
  const layoutOf = (): LayoutJson => st.current.skin.layout[st.current.orient];
  const frame = () => {
    const d = dev();
    const area = playArea(d.w, d.h, d.ins, landscape());
    const p = layoutOf();
    return { d, area, sx: area.w / p.canvas.w, sy: area.h / p.canvas.h };
  };
  const partRect = (k: PartKey): Rect | null => {
    const f = frame();
    const b = layoutOf()[k] as { x: number; y: number; w: number; h: number } | undefined;
    if (!b) return null;
    return R(f.area.x + b.x * f.sx, f.area.y + b.y * f.sy, (b.w || 0) * f.sx, (b.h || 0) * f.sy);
  };
  const decorRect = (i: number): Rect => {
    const d = dev();
    const r = st.current.skin.decor[st.current.orient][i]!;
    return R(r.x * d.w, r.y * d.h, r.w * d.w, r.h * d.h);
  };
  const toView = (x: number, y: number): [number, number] => [st.current.panX + x * st.current.zoom, st.current.panY + y * st.current.zoom];
  const fromView = (x: number, y: number): [number, number] => [(x - st.current.panX) / st.current.zoom, (y - st.current.panY) / st.current.zoom];
  const selRect = (): Rect | null => {
    const s = st.current.sel;
    if (!s) return null;
    return s.t === "part" ? partRect(s.k) : decorRect(s.i);
  };
  const selBox = (): { x: number; y: number; w: number; h: number } | null => {
    const s = st.current.sel;
    if (!s) return null;
    return s.t === "part" ? ((layoutOf()[s.k] as { x: number; y: number; w: number; h: number } | undefined) ?? null) : st.current.skin.decor[st.current.orient][s.i]!;
  };

  const fit = useCallback(() => {
    const vp = viewport.current;
    const s = st.current;
    if (!vp || !vp.clientWidth) return;
    const d = deviceOf(s.device)[s.orient];
    const z = Math.min((vp.clientWidth - 80) / d.w, (vp.clientHeight - 80) / d.h);
    s.zoom = Math.max(0.2, Math.min(3, Math.floor(z * 20) / 20));
    s.panX = Math.round((vp.clientWidth - d.w * s.zoom) / 2);
    s.panY = Math.round((vp.clientHeight - d.h * s.zoom) / 2);
  }, []);

  // ------------------------------------------------------------- history

  const change = () => {
    // A built-in skin is only a starting point: the first change goes to a
    // copy of it, a new record.
    if (!st.current.recordId) fork();
    undoStack.current.push(JSON.stringify(st.current.skin));
    if (undoStack.current.length > 200) undoStack.current.shift();
    redoStack.current = [];
    st.current.dirty = true;
  };
  const doUndo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(JSON.stringify(st.current.skin));
    st.current.skin = JSON.parse(prev) as EditSkin;
    st.current.dirty = true;
    force();
  };
  const doRedo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(JSON.stringify(st.current.skin));
    st.current.skin = JSON.parse(next) as EditSkin;
    st.current.dirty = true;
    force();
  };

  const toast = (text: string) => {
    st.current.toast = text;
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      st.current.toast = null;
      force();
    }, 3500);
    force();
  };

  /** Shows a skin: a record's (recordId) or a built-in one (null, read-only until changed). */
  const load = (skin: SkinJson, file: string | undefined, recordId: string | null, guides?: Guides, dirty = false) => {
    const s = st.current;
    s.recordId = recordId;
    s.lib.current = recordId;
    s.skin = complete(skin, baseSkin());
    s.file = file || fileName(skin);
    s.guides = guides ? clone(guides) : emptyGuides();
    s.sel = null;
    s.dirty = dirty;
    s.confirmDelete = null;
    s.codeTyping = false;
    s.codeStatus = null;
    undoStack.current = [];
    redoStack.current = [];
    fit();
    force();
  };

  /** Starts a record from a skin: New, Open, a built-in's first change, Duplicate. */
  const newRecord = (skin: SkinJson, file: string, guides: Guides) => {
    const s = st.current;
    const id = addRecord(s.lib, { skin: clone(skin), file, guides: clone(guides), dirty: true });
    lastSaved.current = "";
    return id;
  };

  /** The built-in skin on screen becomes the designer's own copy. */
  const fork = () => {
    const s = st.current;
    const copy = copyOf(s.lib, s.skin, COPY_SUFFIX, `my-${s.skin.id}`);
    s.skin.id = copy.id;
    s.skin.name = copy.name;
    s.file = fileName(s.skin);
    s.recordId = newRecord(s.skin, s.file, s.guides);
    toast(e.toasts.forked(copy.name[lang] ?? copy.id));
  };

  // Autosave: the skin on screen into its own record (this browser only;
  // storage may be blocked, then the editor still works and forgets).
  useEffect(() => {
    const s = st.current;
    const snapshot = JSON.stringify([s.recordId, s.skin, s.file, s.guides, s.dirty]);
    if (snapshot === lastSaved.current) return;
    const first = lastSaved.current === null;
    lastSaved.current = snapshot;
    const rec = s.recordId ? s.lib.skins[s.recordId] : undefined;
    if (rec && !first) {
      rec.skin = clone(s.skin);
      rec.file = s.file;
      rec.guides = clone(s.guides);
      rec.dirty = s.dirty;
      rec.updatedAt = Date.now();
    }
    s.lib.current = s.recordId;
    const ok = writeLibrary(s.lib);
    if (ok !== !s.saveFailed) {
      s.saveFailed = !ok;
      force();
    }
  });

  // The My skins list closes on a click outside it.
  useEffect(() => {
    if (!S.libOpen) return;
    const onDown = (ev: PointerEvent) => {
      if ((ev.target as Element | null)?.closest?.(".se-lib-anchor")) return;
      st.current.libOpen = false;
      st.current.confirmDelete = null;
      force();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [S.libOpen]);

  const openRecord = (id: string) => {
    const r = st.current.lib.skins[id];
    if (!r) return;
    st.current.libOpen = false;
    load(r.skin, r.file, id, r.guides, !!r.dirty);
  };

  const duplicateRecord = (id: string) => {
    const s = st.current;
    const r = s.lib.skins[id];
    if (!r) return;
    const copy = copyOf(s.lib, r.skin, COPY_SUFFIX, r.skin.id);
    const nid = newRecord(copy, fileName(copy), r.guides);
    load(copy, fileName(copy), nid, r.guides, true);
    s.libOpen = true;
    toast(e.toasts.duplicated(copy.name[lang] ?? copy.id));
  };

  const deleteRecord = (id: string) => {
    const s = st.current;
    const r = s.lib.skins[id];
    if (!r) return;
    const name = r.skin.name?.[lang] ?? r.skin.id;
    const wasCurrent = s.recordId === id;
    removeRecord(s.lib, id);
    s.confirmDelete = null;
    if (wasCurrent) {
      const next = s.lib.current ? s.lib.skins[s.lib.current] : undefined;
      if (next && s.lib.current) load(next.skin, next.file, s.lib.current, next.guides, !!next.dirty);
      else load(baseSkin(), undefined, null);
    }
    s.libOpen = true;
    lastSaved.current = "";
    toast(e.toasts.deleted(name));
  };

  // ---------------------------------------------------------------- snap

  const snapTargets = () => {
    const f = frame();
    const s = st.current;
    const xs: number[] = [];
    const ys: number[] = [];
    const addR = (r: Rect) => {
      xs.push(r.x, midX(r), right(r));
      ys.push(r.y, midY(r), bottom(r));
    };
    addR(f.area);
    xs.push(0, f.d.w / 2, f.d.w);
    ys.push(0, f.d.h / 2, f.d.h);
    s.guides[s.orient].x.forEach((v) => xs.push(f.area.x + v * f.sx));
    s.guides[s.orient].y.forEach((v) => ys.push(f.area.y + v * f.sy));
    for (const k of PART_KEYS) {
      if (s.sel?.t === "part" && s.sel.k === k) continue;
      const r = partRect(k);
      if (r) addR(r);
    }
    s.skin.decor[s.orient].forEach((_, i) => {
      if (!(s.sel?.t === "decor" && s.sel.i === i)) addR(decorRect(i));
    });
    return { xs, ys };
  };
  const snapAxis = (edges: number[], targets: number[]) => {
    const limit = 6 / st.current.zoom;
    let best: { d: number; v: number } | null = null;
    for (const ed of edges) {
      for (const tg of targets) {
        const d = tg - ed;
        if (Math.abs(d) <= limit && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, v: tg };
      }
    }
    return best;
  };

  /** A rectangle in device points back into the selection's own units (grid on). */
  const applyRect = (r: Rect) => {
    const s = st.current;
    const cur = selBox();
    if (!cur || !s.sel) return;
    if (s.sel.t === "part") {
      const f = frame();
      let b = { x: (r.x - f.area.x) / f.sx, y: (r.y - f.area.y) / f.sy, w: r.w / f.sx, h: r.h / f.sy };
      b = s.grid
        ? { x: Math.round(b.x / 8) * 8, y: Math.round(b.y / 8) * 8, w: Math.round(b.w / 8) * 8 || 8, h: Math.round(b.h / 8) * 8 || 8 }
        : { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
      Object.assign(cur, { x: b.x, y: b.y, w: Math.max(b.w, 0), h: Math.max(b.h, 0) });
    } else {
      const d = dev();
      const q = (v: number) => Math.round(v * 10000) / 10000;
      Object.assign(cur, {
        x: q(Math.min(Math.max(r.x / d.w, 0), 1)),
        y: q(Math.min(Math.max(r.y / d.h, 0), 1)),
        w: q(Math.min(r.w / d.w, 1)),
        h: q(Math.min(r.h / d.h, 1)),
      });
    }
  };

  // --------------------------------------------------------- interaction

  const pointer = (ev: { clientX: number; clientY: number }): [number, number] => {
    const r = viewport.current!.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  };

  const onDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    const [vx, vy] = pointer(ev);
    const target = ev.target as Element;
    const data = (target as HTMLElement | SVGElement).dataset ?? {};
    if (s.tool === "hand" || spaceDown.current || ev.button === 1) {
      drag.current = { kind: "pan", sx: vx, sy: vy, px: s.panX, py: s.panY };
      return;
    }
    if (s.tool === "rect" || s.tool === "grill") {
      const [x, y] = fromView(vx, vy);
      drag.current = { kind: "new", shape: s.tool, x0: x, y0: y };
      return;
    }
    if (data.guide) {
      drag.current = { kind: "guide", axis: data.guide as "x" | "y", i: Number(data.i) };
      return;
    }
    if (data.h) {
      const [hx, hy] = data.h.split(",").map(Number) as [number, number];
      const rect = selRect();
      if (rect) drag.current = { kind: "resize", hx, hy, rect, vx, vy, changed: false };
      return;
    }
    if (data.part || data.decor) {
      s.sel = data.part ? { t: "part", k: data.part as PartKey } : { t: "decor", i: Number(data.decor) };
      const rect = selRect();
      if (rect) drag.current = { kind: "move", hx: 0, hy: 0, rect, vx, vy, changed: false };
      scrollToSel.current = true;
      force();
      return;
    }
    s.sel = null;
    scrollToSel.current = true;
    force();
  };

  const onMove = useCallback((ev: PointerEvent) => {
    const s = st.current;
    if (!viewport.current) return;
    const [vx, vy] = pointer(ev);
    const [dx, dy] = fromView(vx, vy);
    const f = frame();
    s.pointer = e.pos(Math.round((dx - f.area.x) / f.sx), Math.round((dy - f.area.y) / f.sy));
    const g = drag.current;
    if (!g) return;
    if (g.kind === "pan") {
      s.panX = g.px + vx - g.sx;
      s.panY = g.py + vy - g.sy;
    } else if (g.kind === "guide") {
      const v = g.axis === "x" ? (dx - f.area.x) / f.sx : (dy - f.area.y) / f.sy;
      s.guides[s.orient][g.axis][g.i] = Math.round(v);
      g.out = g.axis === "x" ? vx < 0 : vy < 0;
    } else if (g.kind === "new") {
      g.x1 = dx;
      g.y1 = dy;
    } else {
      if (!g.changed) {
        change();
        g.changed = true;
      }
      const ddx = (vx - g.vx) / s.zoom;
      const ddy = (vy - g.vy) / s.zoom;
      const r = { ...g.rect };
      if (g.kind === "move") {
        r.x += ddx;
        r.y += ddy;
      } else {
        if (g.hx === 0) {
          r.x += ddx;
          r.w -= ddx;
        }
        if (g.hx === 1) r.w += ddx;
        if (g.hy === 0) {
          r.y += ddy;
          r.h -= ddy;
        }
        if (g.hy === 1) r.h += ddy;
        if (ev.shiftKey && g.rect.w && g.rect.h) {
          // Keep the shape (a square D-pad stays square).
          const ratio = g.rect.w / g.rect.h;
          if (g.hx === 0.5) r.w = r.h * ratio;
          else r.h = r.w / ratio;
        }
        r.w = Math.max(r.w, 8);
        r.h = Math.max(r.h, 8);
      }
      s.snapLines = [];
      if (s.snap && !ev.altKey) {
        const tg = snapTargets();
        const xEdges = g.kind === "move" ? [r.x, midX(r), right(r)] : g.hx === 0 ? [r.x] : g.hx === 1 ? [right(r)] : [];
        const yEdges = g.kind === "move" ? [r.y, midY(r), bottom(r)] : g.hy === 0 ? [r.y] : g.hy === 1 ? [bottom(r)] : [];
        const bx = snapAxis(xEdges, tg.xs);
        const by = snapAxis(yEdges, tg.ys);
        if (bx) {
          if (g.kind === "move") r.x += bx.d;
          else if (g.hx === 0) {
            r.x += bx.d;
            r.w -= bx.d;
          } else r.w += bx.d;
          s.snapLines.push({ axis: "x", v: bx.v });
        }
        if (by) {
          if (g.kind === "move") r.y += by.d;
          else if (g.hy === 0) {
            r.y += by.d;
            r.h -= by.d;
          } else r.h += by.d;
          s.snapLines.push({ axis: "y", v: by.v });
        }
      }
      applyRect(r);
    }
    force();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onUp = useCallback(() => {
    const s = st.current;
    const g = drag.current;
    if (!g) return;
    if (g.kind === "guide" && g.out) {
      s.guides[s.orient][g.axis].splice(g.i, 1);
      toast(e.toasts.guideRemoved);
    }
    if (g.kind === "new" && g.x1 != null && g.y1 != null) {
      const d = dev();
      const x = Math.min(g.x0, g.x1);
      const y = Math.min(g.y0, g.y1);
      const w = Math.abs(g.x1 - g.x0);
      const h = Math.abs(g.y1 - g.y0);
      if (w > 4 && h > 4) {
        change();
        const q = (v: number) => Math.round(v * 10000) / 10000;
        const item: DecorJson =
          g.shape === "grill"
            ? { shape: "grill", x: q(x / d.w), y: q(y / d.h), w: q(w / d.w), h: q(h / d.h), radius: 6, fill: "#000000", opacity: 0.35, stroke: 0 }
            : { shape: "rect", x: q(x / d.w), y: q(y / d.h), w: q(w / d.w), h: q(h / d.h), radius: 12, fill: "#ffffff", opacity: 0.07, stroke: 0.18 };
        s.skin.decor[s.orient].push(item);
        s.sel = { t: "decor", i: s.skin.decor[s.orient].length - 1 };
        s.tool = "select";
      }
    }
    drag.current = null;
    s.snapLines = [];
    force();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rulerDown = (axis: "x" | "y", ev: React.PointerEvent) => {
    ev.preventDefault();
    const s = st.current;
    // The top ruler makes horizontal guides, the left one vertical guides.
    const along = axis === "x" ? "y" : "x";
    s.guides[s.orient][along].push(0);
    s.showGuides = true;
    drag.current = { kind: "guide", axis: along, i: s.guides[s.orient][along].length - 1 };
    onMove(ev.nativeEvent);
  };

  const nudge = (dx: number, dy: number) => {
    const b = selBox();
    if (!b || !st.current.sel) return;
    change();
    if (st.current.sel.t === "part") {
      b.x += dx;
      b.y += dy;
    } else {
      b.x = round(b.x + dx / 400);
      b.y = round(b.y + dy / 800);
    }
    force();
  };

  const zoomBy = (k: number) => {
    const vp = viewport.current;
    const s = st.current;
    if (!vp) return;
    const cx = vp.clientWidth / 2;
    const cy = vp.clientHeight / 2;
    const [wx, wy] = fromView(cx, cy);
    s.zoom = Math.min(4, Math.max(0.2, s.zoom * k));
    s.panX = cx - wx * s.zoom;
    s.panY = cy - wy * s.zoom;
    force();
  };

  // ------------------------------------------------------- files, export

  const exportJson = () => {
    const s = st.current;
    const text = serialize(s.skin);
    const name = fileName(s.skin);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    s.dirty = false;
    s.file = name;
    const errors = [...validate(s.skin, BUILTIN_SKINS.map((b) => b.id)), ...check(s.skin.layout, s.aspect)].filter((i) => i.level === "error").length;
    toast(errors ? e.toasts.exportedProblems(name, errors) : s.skin.background && Object.keys(s.skin.background).length ? e.toasts.exportedFolder(name) : e.toasts.exported(name));
  };

  const openFiles = (files: File[]) => {
    const s = st.current;
    let skinFile: File | null = null;
    for (const f of files) {
      if (/\.json$/i.test(f.name)) skinFile = f;
      else if (/\.(png|jpe?g)$/i.test(f.name)) s.pictures[f.name] = URL.createObjectURL(f);
    }
    if (!skinFile) {
      force();
      return;
    }
    const name = skinFile.name;
    void skinFile.text().then((text) => {
      try {
        const v = JSON.parse(text) as SkinJson;
        if (!v || v.format !== 1 || !v.id) throw new Error(e.toasts.notSkin);
        const id = newRecord(v, name, emptyGuides());
        load(v, name, id, undefined, true);
        toast(e.toasts.opened(name));
      } catch (err) {
        toast(e.toasts.cannotOpen(name, err instanceof Error ? err.message : String(err)));
      }
    });
  };

  const setBackground = (file: File) => {
    const s = st.current;
    if (!/\.(png|jpe?g)$/i.test(file.name)) {
      toast(e.toasts.usePng);
      return;
    }
    change();
    s.pictures[file.name] = URL.createObjectURL(file);
    s.skin.background = { ...(s.skin.background ?? {}), [s.orient]: file.name };
    s.file = "skin.json";
    force();
  };

  // ------------------------------------------------------------ code view

  const applyCode = () => {
    const s = st.current;
    const text = s.codeText;
    try {
      const v = JSON.parse(text) as SkinJson;
      if (!v || v.format !== 1) throw new Error(e.code.formatOne);
      if (!v.layout || !v.layout.portrait || !v.layout.landscape) throw new Error(e.code.bothLayouts);
      change();
      s.skin = complete(v, baseSkin());
      s.codeStatus = { ok: true, text: e.code.applied };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const pos = /position (\d+)/.exec(message);
      const line = pos ? text.slice(0, Number(pos[1])).split("\n").length : null;
      s.codeStatus = { ok: false, text: `✕ ${line ? e.code.line(line) : ""}${message.replace(/ in JSON at position \d+.*$/, "")}` };
    }
    force();
  };

  const setView = (v: View) => {
    const s = st.current;
    s.view = v;
    scrollToSel.current = true;
    force();
    window.requestAnimationFrame(() => {
      fit();
      force();
    });
  };

  // ------------------------------------------------------------- wiring

  useEffect(() => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onMove, onUp]);

  useEffect(() => {
    fit();
    force();
    const onResize = () => force();
    window.addEventListener("resize", onResize);
    const vp = viewport.current;
    // The wheel moves around; with ⌘ or Ctrl it zooms (passive: false to keep the page still).
    const onWheel = (ev: WheelEvent) => {
      const s = st.current;
      ev.preventDefault();
      if (ev.ctrlKey || ev.metaKey) {
        const [vx, vy] = pointer(ev);
        const [wx, wy] = fromView(vx, vy);
        s.zoom = Math.min(4, Math.max(0.2, s.zoom * Math.exp(-ev.deltaY * 0.01)));
        s.panX = vx - wx * s.zoom;
        s.panY = vy - wy * s.zoom;
      } else {
        s.panX -= ev.deltaX;
        s.panY -= ev.deltaY;
      }
      force();
    };
    vp?.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("resize", onResize);
      vp?.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const s = st.current;
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (/INPUT|SELECT|TEXTAREA/.test(el.tagName) || el.getAttribute("role") === "combobox");
      const mod = ev.metaKey || ev.ctrlKey;
      if (mod && ev.key.toLowerCase() === "z" && !(typing && el?.tagName === "TEXTAREA")) {
        ev.preventDefault();
        if (ev.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if (mod && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        exportJson();
        return;
      }
      if (mod && (ev.key === "=" || ev.key === "+")) {
        ev.preventDefault();
        zoomBy(1.25);
        return;
      }
      if (mod && ev.key === "-") {
        ev.preventDefault();
        zoomBy(0.8);
        return;
      }
      if (mod && ev.key === "0") {
        ev.preventDefault();
        fit();
        force();
        return;
      }
      if (typing) return;
      if (mod && ev.key.toLowerCase() === "d" && s.sel?.t === "decor") {
        ev.preventDefault();
        action("dupDecor");
        return;
      }
      const step = ev.shiftKey ? 10 : 1;
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const a = arrows[ev.key];
      if (a) {
        ev.preventDefault();
        nudge(a[0], a[1]);
        return;
      }
      if ((ev.key === "Backspace" || ev.key === "Delete") && s.sel?.t === "decor") {
        action("delDecor");
        return;
      }
      if (ev.key === "Escape") {
        s.sel = null;
        s.tool = "select";
        force();
        return;
      }
      if (ev.key === " " && !spaceDown.current) {
        spaceDown.current = true;
        ev.preventDefault();
        force();
        return;
      }
      if (ev.key === "1" || ev.key === "2" || ev.key === "3") {
        setView((["design", "split", "code"] as const)[Number(ev.key) - 1]!);
        return;
      }
      const tools: Record<string, Tool> = { v: "select", h: "hand", r: "rect", g: "grill" };
      if (tools[ev.key]) s.tool = tools[ev.key]!;
      else if (ev.key === "s") s.snap = !s.snap;
      else if (ev.key === "#") s.grid = !s.grid;
      else if (ev.key === "b") s.showBoxes = !s.showBoxes;
      else if (ev.key === ";") s.showGuides = !s.showGuides;
      else return;
      force();
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.key === " ") {
        spaceDown.current = false;
        force();
      }
    };
    const onBeforeUnload = (ev: BeforeUnloadEvent) => {
      // Everything is saved as it changes; warn only when the browser refused it.
      if (st.current.saveFailed && st.current.recordId) ev.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------- actions

  type Action = "centerX" | "fullWidth" | "addLabel" | "removeLabel" | "dupDecor" | "delDecor" | "resetControls" | "removeBg" | "copySmoke";
  const action = (act: Action) => {
    const s = st.current;
    const p = layoutOf();
    change();
    const b = selBox();
    if (act === "centerX" && b) b.x = Math.round((p.canvas.w - b.w) / 2);
    if (act === "fullWidth" && b) {
      b.x = 0;
      b.w = p.canvas.w;
    }
    if (act === "addLabel") p.label = { x: 12, y: 0, w: p.canvas.w - 24, h: 14 };
    if (act === "removeLabel") {
      delete p.label;
      s.sel = null;
    }
    if (act === "dupDecor" && s.sel?.t === "decor") {
      const d = clone(s.skin.decor[s.orient][s.sel.i]!);
      d.x = Math.min(1 - d.w, d.x + 0.02);
      d.y = Math.min(1 - d.h, d.y + 0.02);
      s.skin.decor[s.orient].push(d);
      s.sel = { t: "decor", i: s.skin.decor[s.orient].length - 1 };
    }
    if (act === "delDecor" && s.sel?.t === "decor") {
      s.skin.decor[s.orient].splice(s.sel.i, 1);
      s.sel = null;
    }
    if (act === "resetControls" && s.skin.style?.controls) {
      for (const k of [...PALETTE_KEYS, "lit", "litLabel"]) delete s.skin.style.controls[k];
    }
    if (act === "removeBg" && s.skin.background) {
      delete s.skin.background[s.orient];
      if (!Object.keys(s.skin.background).length) {
        delete s.skin.background;
        s.file = fileName(s.skin);
      }
    }
    if (act === "copySmoke") {
      const smoke = baseSkin();
      if (smoke.layout?.[s.orient]) s.skin.layout[s.orient] = clone(smoke.layout[s.orient]!);
    }
    force();
  };

  /** A change to the skin from the inspector: kept for undo, then drawn. */
  const edit = (fn: (s: State) => void) => {
    change();
    fn(st.current);
    force();
  };

  // ----------------------------------------------------------- rendering

  const d = dev();
  const placement = placementOf(layoutOf())!;
  const l = compute(placement, d, landscape(), S.aspect, S.buttons, S.starts);
  const serialized = serialize(S.skin);
  const codeText = S.codeTyping ? S.codeText : serialized;
  const codeLines = codeText.split("\n");
  const lit = S.codeTyping ? null : selectedLines(codeLines, S.sel, S.orient);
  const issues: (Issue | FormatIssue)[] = [...validate(S.skin, BUILTIN_SKINS.map((b) => b.id)), ...check(S.skin.layout, S.aspect)];
  const errors = issues.filter((i) => i.level === "error").length;
  const bgName = S.skin.background?.[S.orient] ?? "";
  const background = bgName ? (S.pictures[bgName] ?? null) : null;
  const f = frame();

  // Rulers in canvas units, redrawn after every render.
  useLayoutEffect(() => {
    for (const axis of ["x", "y"] as const) {
      const c = axis === "x" ? rulerX.current : rulerY.current;
      if (!c) continue;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h) continue;
      const dpr = window.devicePixelRatio || 1;
      c.width = w * dpr;
      c.height = h * dpr;
      const ctx = c.getContext("2d");
      if (!ctx) continue;
      const css = getComputedStyle(c);
      ctx.scale(dpr, dpr);
      ctx.fillStyle = css.getPropertyValue("--ruler-bg") || "#131720";
      ctx.fillRect(0, 0, w, h);
      const unit = (axis === "x" ? f.sx : f.sy) * S.zoom;
      const origin = axis === "x" ? S.panX + f.area.x * S.zoom : S.panY + f.area.y * S.zoom;
      const span = axis === "x" ? w : h;
      const every = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((v) => v * unit >= 7) ?? 500;
      const labelEvery = [10, 20, 50, 100, 200, 500, 1000].find((v) => v * unit >= 45) ?? 1000;
      const first = Math.floor(-origin / unit / every) * every;
      ctx.strokeStyle = css.getPropertyValue("--ruler-tick") || "#3a4256";
      ctx.fillStyle = css.getPropertyValue("--ruler-text") || "#8c95a8";
      ctx.font = "9px ui-monospace, Menlo, monospace";
      for (let v = first; origin + v * unit <= span; v += every) {
        const pos = Math.round(origin + v * unit) + 0.5;
        const big = v % labelEvery === 0;
        const len = big ? 10 : v % (every * 5) === 0 ? 6 : 3;
        ctx.beginPath();
        if (axis === "x") {
          ctx.moveTo(pos, h);
          ctx.lineTo(pos, h - len);
        } else {
          ctx.moveTo(w, pos);
          ctx.lineTo(w - len, pos);
        }
        ctx.stroke();
        if (big) {
          if (axis === "x") ctx.fillText(String(v), pos + 2, 10);
          else {
            ctx.save();
            ctx.translate(9, pos - 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(String(v), 0, 0);
            ctx.restore();
          }
        }
      }
      const sr = selRect();
      if (sr) {
        ctx.fillStyle = "rgba(242,163,58,.2)";
        if (axis === "x") ctx.fillRect(S.panX + sr.x * S.zoom, 0, sr.w * S.zoom, h);
        else ctx.fillRect(0, S.panY + sr.y * S.zoom, w, sr.h * S.zoom);
      }
    }
  });

  // The selected lines scroll into view in the code, once per selection change.
  useLayoutEffect(() => {
    const ta = codeArea.current;
    if (!ta || !scrollToSel.current || !lit) return;
    scrollToSel.current = false;
    const top = lit[0] * LINE_H;
    if (top < ta.scrollTop || top > ta.scrollTop + ta.clientHeight - 60) ta.scrollTop = Math.max(0, top - 60);
    if (codeHl.current) codeHl.current.scrollTop = ta.scrollTop;
  });

  // Overlay: boxes, selection, guides and snap lines, in viewport pixels.
  const overlay: ReactNode[] = [];
  const box = (r: Rect) => {
    const [x, y] = toView(r.x, r.y);
    return { x, y, width: r.w * S.zoom, height: r.h * S.zoom };
  };
  if (S.showGuides) {
    S.guides[S.orient].x.forEach((v, i) => {
      const [x] = toView(f.area.x + v * f.sx, 0);
      overlay.push(
        <g key={`gx${i}`}>
          <line x1={x} y1={-9999} x2={x} y2={9999} className="se-guide" />
          <line x1={x} y1={-9999} x2={x} y2={9999} className="se-hit se-guide-hit is-x" data-guide="x" data-i={i} />
        </g>,
      );
    });
    S.guides[S.orient].y.forEach((v, i) => {
      const [, y] = toView(0, f.area.y + v * f.sy);
      overlay.push(
        <g key={`gy${i}`}>
          <line x1={-9999} y1={y} x2={9999} y2={y} className="se-guide" />
          <line x1={-9999} y1={y} x2={9999} y2={y} className="se-hit se-guide-hit is-y" data-guide="y" data-i={i} />
        </g>,
      );
    });
  }
  S.skin.decor[S.orient].forEach((_, i) => {
    const on = S.sel?.t === "decor" && S.sel.i === i;
    overlay.push(<rect key={`d${i}`} {...box(decorRect(i))} className={`se-hit se-decor-box${on || !S.showBoxes ? " is-quiet" : ""}`} data-decor={i} />);
  });
  for (const k of PART_KEYS) {
    const r = partRect(k);
    if (!r) continue;
    const on = S.sel?.t === "part" && S.sel.k === k;
    const b = box(r);
    overlay.push(<rect key={`p${k}`} {...b} className={`se-hit se-part-box${on || !S.showBoxes ? " is-quiet" : ""}`} stroke={PART_COLORS[k]} data-part={k} />);
    if (S.showBoxes && !on) {
      overlay.push(
        <text key={`t${k}`} x={b.x + 3} y={b.y - 3} fill={PART_COLORS[k]} className="se-part-name">
          {k}
        </text>,
      );
    }
  }
  const sr = selRect();
  const sb = selBox();
  if (sr && sb) {
    const b = box(sr);
    overlay.push(<rect key="sel" {...b} className="se-sel" />);
    const handles: [number, number, string][] = [[0, 0, "nwse"], [0.5, 0, "ns"], [1, 0, "nesw"], [0, 0.5, "ew"], [1, 0.5, "ew"], [0, 1, "nesw"], [0.5, 1, "ns"], [1, 1, "nwse"]];
    for (const [hx, hy, cur] of handles) {
      overlay.push(<rect key={`h${hx}${hy}`} className={`se-handle is-${cur}`} data-h={`${hx},${hy}`} x={b.x + hx * b.width - 5} y={b.y + hy * b.height - 5} width={10} height={10} />);
    }
    const label = S.sel?.t === "part" ? `${round(sb.w)} × ${round(sb.h)}` : `${Math.round(sb.w * 1000) / 10} × ${Math.round(sb.h * 1000) / 10} %`;
    overlay.push(
      <g key="size">
        <rect x={b.x + b.width / 2 - 44} y={b.y + b.height + 8} width={88} height={20} rx={10} className="se-size-bg" />
        <text x={b.x + b.width / 2} y={b.y + b.height + 22} className="se-size-text">
          {label}
        </text>
      </g>,
    );
  }
  for (const [i, s] of S.snapLines.entries()) {
    if (s.axis === "x") {
      const [x] = toView(s.v, 0);
      overlay.push(<line key={`s${i}`} x1={x} y1={-9999} x2={x} y2={9999} className="se-snap" />);
    } else {
      const [, y] = toView(0, s.v);
      overlay.push(<line key={`s${i}`} x1={-9999} y1={y} x2={9999} y2={y} className="se-snap" />);
    }
  }
  const g = drag.current;
  if (g?.kind === "new" && g.x1 != null && g.y1 != null) {
    const [ax, ay] = toView(Math.min(g.x0, g.x1), Math.min(g.y0, g.y1));
    overlay.push(<rect key="new" x={ax} y={ay} width={Math.abs(g.x1 - g.x0) * S.zoom} height={Math.abs(g.y1 - g.y0) * S.zoom} className="se-new" />);
  }

  // ------------------------------------------------------------ inspector

  const num = (key: string, label: string, value: number, onValue: (v: number) => void, step = 1) => (
    <label className="se-num" key={key}>
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(ev) => {
          const v = parseFloat(ev.target.value);
          if (!Number.isNaN(v)) edit(() => onValue(v));
        }}
      />
    </label>
  );
  const color = (label: string, value: string, onValue: (v: string) => void) => (
    <label className="se-field" key={label}>
      <span>{label}</span>
      <input type="color" value={value} onChange={(ev) => edit(() => onValue(ev.target.value))} />
      <span className="se-v mono" aria-hidden="true">{value}</span>
    </label>
  );
  const range = (label: string, value: number, onValue: (v: number) => void, min = 0, max = 1, step = 0.01) => (
    <label className="se-field" key={label}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(ev) => edit(() => onValue(parseFloat(ev.target.value)))} />
      <span className="se-v mono" aria-hidden="true">{round(value)}</span>
    </label>
  );
  const checkbox = (label: string, value: boolean, onValue: (v: boolean) => void) => (
    <label className="se-field" key={label}>
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(ev) => edit(() => onValue(ev.target.checked))} />
    </label>
  );
  const text = (label: string, value: string, onValue: (v: string) => void, placeholder = "") => (
    <label className="se-field" key={label}>
      <span>{label}</span>
      <input className="input se-text" type="text" value={value} placeholder={placeholder} onChange={(ev) => edit(() => onValue(ev.target.value))} />
    </label>
  );
  const choose = <V extends string>(label: string, value: V, options: readonly { value: V; label: string }[], onValue: (v: V) => void) => (
    <div className="se-field" key={label}>
      <span>{label}</span>
      <Select value={value} options={options} ariaLabel={label} className="select-sm" onChange={(v) => edit(() => onValue(v))} />
    </div>
  );
  const controlsStyle = (s: State) => {
    s.skin.style = s.skin.style ?? {};
    s.skin.style.controls = s.skin.style.controls ?? {};
    return s.skin.style.controls;
  };

  let inspector: ReactNode;
  if (S.sel?.t === "part") {
    const k = S.sel.k;
    const b = layoutOf()[k] as { x: number; y: number; w: number; h: number; direction?: string; hide?: boolean; size?: number } | undefined;
    const name = e.parts[k];
    inspector = (
      <section>
        <h3 className="se-h">{e.selection(name)}</h3>
        {!b ? (
          <>
            <p className="small muted">{e.noPart(name.toLowerCase())}</p>
            <button type="button" className="button button-secondary" onClick={() => action("addLabel")}>
              {e.addLabel}
            </button>
          </>
        ) : (
          <>
            <div className="se-grid2">
              {num("x", "X", round(b.x), (v) => (b.x = v))}
              {num("y", "Y", round(b.y), (v) => (b.y = v))}
              {num("w", "W", round(b.w), (v) => (b.w = v))}
              {num("h", "H", round(b.h), (v) => (b.h = v))}
            </div>
            <div className="se-row">
              <button type="button" className="button button-secondary" onClick={() => action("centerX")}>
                {e.centerX}
              </button>
              <button type="button" className="button button-secondary" onClick={() => action("fullWidth")}>
                {e.fullWidth}
              </button>
              {k === "label" && (
                <button type="button" className="button button-secondary" onClick={() => action("removeLabel")}>
                  {e.remove}
                </button>
              )}
            </div>
            <p className="small muted">{e.help[k]}</p>
            {k === "menu" && (
              <>
                {choose(e.direction, b.direction === "column" ? "column" : "row", [{ value: "row", label: e.row }, { value: "column", label: e.column }], (v) => (b.direction = v))}
                {checkbox(e.folds, b.hide === true, (v) => (b.hide = v))}
                {range(e.buttonSize, b.size ?? 36, (v) => (b.size = v), 28, 60, 1)}
              </>
            )}
            {(k === "starts" || k === "coin") && (
              <>
                <h3 className="se-h is-sub">{e.capsules}</h3>
                <div className="se-grid2">
                  {num("pw", "W", layoutOf().pill?.w ?? 58, (v) => (layoutOf().pill = { w: v, h: layoutOf().pill?.h ?? 34 }))}
                  {num("ph", "H", layoutOf().pill?.h ?? 34, (v) => (layoutOf().pill = { w: layoutOf().pill?.w ?? 58, h: v }))}
                </div>
              </>
            )}
          </>
        )}
      </section>
    );
  } else if (S.sel?.t === "decor") {
    const i = S.sel.i;
    const dd = S.skin.decor[S.orient][i]!;
    inspector = (
      <section>
        <h3 className="se-h">{e.selection(dd.shape === "grill" ? e.grill(i + 1) : e.plate(i + 1))}</h3>
        <div className="se-grid2">
          {num("x", "X", round(dd.x * 100), (v) => (dd.x = v / 100), 0.1)}
          {num("y", "Y", round(dd.y * 100), (v) => (dd.y = v / 100), 0.1)}
          {num("w", "W", round(dd.w * 100), (v) => (dd.w = v / 100), 0.1)}
          {num("h", "H", round(dd.h * 100), (v) => (dd.h = v / 100), 0.1)}
        </div>
        <p className="small muted">{e.decorNote}</p>
        {choose(e.shape, dd.shape, [{ value: "rect", label: e.plateShape }, { value: "grill", label: e.grillShape }] as const, (v) => (dd.shape = v))}
        {range(e.corner, dd.radius, (v) => (dd.radius = v), 0, 60, 1)}
        {color(e.color, hex(dd.fill, "#ffffff"), (v) => (dd.fill = v))}
        {range(e.opacity, dd.opacity, (v) => (dd.opacity = v))}
        {dd.shape !== "grill" && range(e.outline, dd.stroke, (v) => (dd.stroke = v))}
        <div className="se-row">
          <button type="button" className="button button-secondary" onClick={() => action("dupDecor")}>
            {e.duplicate}
          </button>
          <button type="button" className="button button-secondary" onClick={() => action("delDecor")}>
            {e.deleteDecor}
          </button>
        </div>
      </section>
    );
  } else {
    const s = S.skin;
    const sh = s.shell ?? {};
    const m = menuStyle(s);
    const p = palette(s);
    const ds = design(s);
    const shellSet = (key: string) => (v: string | number) => {
      s.shell = s.shell ?? {};
      (s.shell as Record<string, unknown>)[key] = v;
    };
    const menuSet = (key: string) => (v: string | number) => setPath(s as unknown as Record<string, unknown>, `style.menu.${key}`, v);
    const litColor = hex(s.style?.controls?.lit);
    inspector = (
      <>
        <section>
          <h3 className="se-h">{e.skin}</h3>
          {text(e.id, s.id, (v) => {
            s.id = v.trim();
            if (!s.background || !Object.keys(s.background).length) st.current.file = fileName(s);
          }, "my-skin")}
          {(["en", "es", "pt"] as const).map((lang) => text(e.nameIn(lang), s.name[lang] ?? "", (v) => (s.name = { ...s.name, [lang]: v })))}
          {text(e.author, s.author ?? "", (v) => (s.author = v))}
        </section>
        <section>
          <h3 className="se-h">{e.plastic}</h3>
          {color(e.center, hex(sh.center, "#8a8c94"), shellSet("center"))}
          {color(e.edge, hex(sh.edge, "#3c3d44"), shellSet("edge"))}
          {color(e.rim, hex(sh.rim, "#d8d9de"), shellSet("rim"))}
          {range(e.gloss, sh.gloss ?? 0.3, shellSet("gloss"))}
          {range(e.grain, sh.grain ?? 0.06, shellSet("grain"))}
          {checkbox(e.rings, s.rings !== false, (v) => (s.rings = v))}
          {checkbox(e.screws, s.screws !== false, (v) => (s.screws = v))}
          {color(e.bezel, hex(s.screen.bezel, "#07080c"), (v) => (s.screen.bezel = v))}
          {text(e.labelText, s.screen.label ?? "", (v) => (s.screen.label = v), "GO-LINK · ARCADE")}
        </section>
        <section>
          <h3 className="se-h">{e.buttonsSection}</h3>
          {choose(e.tone, s.controls === "light" ? "light" : "dark", [{ value: "dark", label: e.tones.dark }, { value: "light", label: e.tones.light }] as const, (v) => (s.controls = v))}
          {choose(e.buttonShape, ds.shape, SHAPES.map((v) => ({ value: v, label: e.shapes[v] })), (v) => (controlsStyle(st.current).shape = v))}
          {range(e.ring, round(ds.ring), (v) => (controlsStyle(st.current).ring = v), 0, 0.25, 0.005)}
          {choose(e.labels, ds.labels, LABELS.map((v) => ({ value: v, label: e.labelKinds[v] })), (v) => (controlsStyle(st.current).labels = v))}
          {range(e.dome, ds.dome, (v) => (controlsStyle(st.current).dome = v))}
          {checkbox(e.well, !!ds.well, (v) => {
            const c = controlsStyle(st.current);
            if (v) c.well = { size: 0.14, depth: 0.6, color: "#000000" };
            else delete c.well;
          })}
          {ds.well && (
            <>
              {range(e.wellSize, ds.well.size, (v) => setPath(s as unknown as Record<string, unknown>, "style.controls.well.size", v), 0, 0.5, 0.01)}
              {range(e.wellDepth, ds.well.depth, (v) => setPath(s as unknown as Record<string, unknown>, "style.controls.well.depth", v))}
              {color(e.wellColor, ds.well.color, (v) => setPath(s as unknown as Record<string, unknown>, "style.controls.well.color", v))}
            </>
          )}
          <h3 className="se-h is-sub">{e.dpad}</h3>
          {range(e.arm, round(ds.dpadArm), (v) => setPath(s as unknown as Record<string, unknown>, "style.controls.dpad.arm", v), 0.25, 0.6, 0.01)}
          {range(e.dpadCorner, round(ds.dpadRadius), (v) => setPath(s as unknown as Record<string, unknown>, "style.controls.dpad.radius", v), 0, 0.5, 0.01)}
          {choose(e.marks, ds.dpadMarks, MARKS.map((v) => ({ value: v, label: e.markKinds[v] })), (v) => setPath(s as unknown as Record<string, unknown>, "style.controls.dpad.marks", v))}
          <details className="se-details">
            <summary>{e.ownColors}</summary>
            {PALETTE_KEYS.map((k) => color(e.colors[k], p[k], (v) => (controlsStyle(st.current)[k] = v)))}
            {checkbox(e.tint, !!litColor, (v) => {
              const c = controlsStyle(st.current);
              if (v) c.lit = "#f2a33a";
              else delete c.lit;
            })}
            {litColor && color(e.heldTint, litColor, (v) => (controlsStyle(st.current).lit = v))}
            <button type="button" className="button button-secondary" onClick={() => action("resetControls")}>
              {e.toneColors}
            </button>
          </details>
        </section>
        <section>
          <h3 className="se-h">{e.menuSection}</h3>
          {color(e.menuColors.fill, m.fill, menuSet("fill"))}
          {range(e.menuColors.fillOpacity, m.fillOpacity, menuSet("fillOpacity"))}
          {color(e.menuColors.border, m.border, menuSet("border"))}
          {range(e.menuColors.borderOpacity, m.borderOpacity, menuSet("borderOpacity"))}
          {color(e.menuColors.button, m.button, menuSet("button"))}
          {color(e.menuColors.icon, m.icon, menuSet("icon"))}
          {color(e.menuColors.active, m.active, menuSet("active"))}
          {color(e.menuColors.activeButton, m.activeButton, menuSet("activeButton"))}
        </section>
        <section>
          <h3 className="se-h">{e.pictureSection}</h3>
          <button
            type="button"
            className="se-drop"
            onClick={() => bgInput.current?.click()}
            onDragOver={(ev) => {
              ev.preventDefault();
              ev.currentTarget.classList.add("is-over");
            }}
            onDragLeave={(ev) => ev.currentTarget.classList.remove("is-over")}
            onDrop={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              ev.currentTarget.classList.remove("is-over");
              const file = ev.dataTransfer.files[0];
              if (file) setBackground(file);
            }}
          >
            <span>{bgName ? `${bgName}${S.pictures[bgName] ? "" : ` ${e.openToSee}`}` : e.dropPicture}</span>
            <span className="small muted">{e.pictureSize(landscape() ? "2622 × 1206" : "1206 × 2622", e.orientNames[S.orient])}</span>
          </button>
          {bgName && (
            <div className="se-row">
              <button type="button" className="button button-secondary" onClick={() => action("removeBg")}>
                {e.removePicture}
              </button>
            </div>
          )}
          <p className="small muted">{e.pictureNote}</p>
        </section>
        <section>
          <h3 className="se-h">{e.canvas(e.orientNames[S.orient])}</h3>
          <p className="small muted">{e.canvasNote(landscape() ? "818 × 373" : "402 × 778")}</p>
          <div className="se-grid2">
            {num("cw", "W", layoutOf().canvas.w, (v) => (layoutOf().canvas.w = Math.max(100, v)))}
            {num("ch", "H", layoutOf().canvas.h, (v) => (layoutOf().canvas.h = Math.max(100, v)))}
          </div>
          <div className="se-row">
            <button type="button" className="button button-secondary" onClick={() => action("copySmoke")}>
              {e.resetSmoke}
            </button>
          </div>
        </section>
      </>
    );
  }

  const iconButton = (label: string, icon: keyof typeof ICON_PATHS, onClick: () => void, on = false, disabled = false, id?: string) => (
    <button type="button" id={id} className={`icon-button se-icon${on ? " is-on" : ""}`} aria-label={label} aria-pressed={on || undefined} data-tip={label} onClick={onClick} disabled={disabled}>
      <Icon name={icon} />
    </button>
  );
  const segButton = (label: string, on: boolean, onClick: () => void, tip?: string) => (
    <button key={label} type="button" className={on ? "is-on" : ""} aria-pressed={on} title={tip} onClick={onClick}>
      {label}
    </button>
  );
  const toolButton = (tool: Tool, icon: keyof typeof ICON_PATHS, label: string) =>
    iconButton(label, icon, () => {
      st.current.tool = tool;
      force();
    }, S.tool === tool);
  const toggle = (key: "snap" | "grid" | "showBoxes" | "showGuides", icon: keyof typeof ICON_PATHS, label: string) =>
    iconButton(label, icon, () => {
      st.current[key] = !st.current[key];
      force();
    }, S[key]);

  return (
    <div className="page skin-editor-page">
      <div className="skin-editor-small">
        <h1>{e.title}</h1>
        <p className="muted">{e.smallScreen}</p>
        <Link to="/docs/skin-editor" className="button button-secondary">
          {e.welcome.manual}
        </Link>
      </div>
      <div
        className="skin-editor"
        onDragOver={(ev) => ev.preventDefault()}
        onDrop={(ev) => {
          if (ev.defaultPrevented) return;
          ev.preventDefault();
          openFiles([...ev.dataTransfer.files]);
        }}
      >
        <div className="se-top">
          <h1 className="se-title">{e.title}</h1>
          <Select
            value=""
            ariaLabel={e.builtinLabel}
            className="select-sm"
            options={[{ value: "", label: e.builtin }, ...BUILTIN_SKINS.map((b) => ({ value: b.id, label: b.name[lang] ?? b.name.en ?? b.id }))]}
            onChange={(v) => {
              const b = BUILTIN_SKINS.find((x) => x.id === v);
              if (b) load(b, undefined, null);
            }}
          />
          <div className="se-lib-anchor">
            <button
              type="button"
              className={`button button-secondary se-lib-button${S.libOpen ? " is-on" : ""}`}
              aria-expanded={S.libOpen}
              aria-controls="se-library"
              title={e.library.tip}
              onClick={() => {
                st.current.libOpen = !st.current.libOpen;
                st.current.confirmDelete = null;
                force();
              }}
            >
              {e.library.button}
              <span className="se-count">{Object.keys(S.lib.skins).length}</span>
            </button>
            {S.libOpen && (
              <div
                id="se-library"
                className="se-library"
                role="dialog"
                aria-label={e.library.title}
                onKeyDown={(ev) => {
                  if (ev.key === "Escape") {
                    ev.stopPropagation();
                    st.current.libOpen = false;
                    st.current.confirmDelete = null;
                    force();
                  }
                }}
              >
                <div className="se-library-head">
                  <h2 className="se-h">{e.library.title}</h2>
                  <span className="small muted">{e.library.local}</span>
                </div>
                {!Object.keys(S.lib.skins).length && <p className="small muted">{e.library.empty}</p>}
                <ul>
                  {sortedRecords(S.lib).map(([id, r]) => {
                    const name = r.skin.name?.[lang] || r.skin.name?.en || r.skin.id;
                    const on = S.recordId === id;
                    const asking = S.confirmDelete === id;
                    return (
                      <li key={id} className={`se-rec${on ? " is-on" : ""}`}>
                        <button type="button" className="se-rec-open" aria-current={on || undefined} onClick={() => openRecord(id)}>
                          <span className="se-sw" style={{ background: hex(r.skin.shell?.center, "#888888") }} />
                          <span className="se-rec-text">
                            <span className="se-rec-name">{name}</span>
                            <span className="small muted mono">
                              {r.skin.id} · {new Date(r.updatedAt).toLocaleString(lang, { dateStyle: "short", timeStyle: "short" })}
                            </span>
                          </span>
                        </button>
                        {asking ? (
                          <span className="se-rec-confirm" role="group" aria-label={e.library.confirmDelete(name)}>
                            <span className="small">{e.library.confirmDelete(name)}</span>
                            <button type="button" className="button button-danger se-small" onClick={() => deleteRecord(id)}>
                              {e.library.delete}
                            </button>
                            <button
                              type="button"
                              className="button button-secondary se-small"
                              onClick={() => {
                                st.current.confirmDelete = null;
                                force();
                              }}
                            >
                              {e.library.cancel}
                            </button>
                          </span>
                        ) : (
                          <span className="se-rec-actions">
                            {iconButton(e.library.duplicate, "copy", () => duplicateRecord(id))}
                            {iconButton(e.library.delete, "trash", () => {
                              st.current.confirmDelete = id;
                              force();
                            })}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="small muted">{e.library.renameHint}</p>
              </div>
            )}
          </div>
          <span className="mono se-file">{fileName(S.skin)}</span>
          {S.recordId ? (
            <span className={`small ${S.saveFailed ? "se-bad" : "muted"}`}>{S.saveFailed ? e.library.notSaved : S.dirty ? e.notExported : e.library.saved}</span>
          ) : (
            <span className="se-badge" title={e.library.builtinNote}>
              <LockIcon size={13} />
              <span className="se-badge-text">{e.library.builtinBadge}</span>
            </span>
          )}
          <span className="spacer" />
          <div className="se-seg" role="group" aria-label={e.viewLabel}>
            {(["design", "split", "code"] as const).map((v) => segButton(e.views[v], S.view === v, () => setView(v), e.viewTips[v]))}
          </div>
          <div className="se-seg" role="group" aria-label={e.orientLabel}>
            {(["portrait", "landscape"] as const).map((o) =>
              segButton(e.orients[o], S.orient === o, () => {
                st.current.orient = o;
                st.current.sel = null;
                fit();
                force();
              }),
            )}
          </div>
          <Select
            value={S.device}
            ariaLabel={e.previewOn}
            className="select-sm"
            options={DEVICE_IDS.map((id) => ({ value: id, label: deviceOf(id).name }))}
            onChange={(v) => {
              st.current.device = v;
              fit();
              force();
            }}
          />
          {iconButton(e.undo, "undo", doUndo, false, !undoStack.current.length)}
          {iconButton(e.redo, "redo", doRedo, false, !redoStack.current.length)}
          <button
            type="button"
            className="button button-secondary"
            title={e.newTip}
            onClick={() => {
              const s = clone(S.skin) as SkinJson;
              s.id = copyOf(st.current.lib, s, {}, "my-skin").id;
              s.name = { ...e.newNames };
              s.author = "";
              const id = newRecord(s, fileName(s), emptyGuides());
              load(s, fileName(s), id, undefined, true);
              toast(e.toasts.newSkin);
            }}
          >
            {e.newSkin}
          </button>
          <button type="button" className="button button-secondary" title={e.openTip} onClick={() => openInput.current?.click()}>
            {e.open}
          </button>
          <input
            ref={openInput}
            type="file"
            accept=".json,image/png,image/jpeg"
            multiple
            hidden
            onChange={(ev) => {
              openFiles([...(ev.target.files ?? [])]);
              ev.target.value = "";
            }}
          />
          <input
            ref={bgInput}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(ev) => {
              const file = ev.target.files?.[0];
              if (file) setBackground(file);
              ev.target.value = "";
            }}
          />
          <button type="button" className="icon-button se-guide" aria-label={e.welcome.guideTip} data-tip={e.welcome.guide} onClick={() => setWelcome(true)}>
            <span aria-hidden="true">?</span>
          </button>
          <button type="button" className="button button-primary" title={e.exportTip} onClick={exportJson}>
            {e.exportJson}
          </button>
        </div>

        <div className="se-main">
          <div className="se-tools" role="toolbar" aria-label={e.toolsLabel} aria-orientation="vertical">
            {toolButton("select", "select", e.tools.select)}
            {toolButton("hand", "hand", e.tools.hand)}
            {toolButton("rect", "plate", e.tools.plate)}
            {toolButton("grill", "grill", e.tools.grill)}
            <span className="se-tsep" />
            {toggle("snap", "snap", e.tools.snap)}
            {toggle("grid", "grid", e.tools.grid)}
            {toggle("showBoxes", "boxes", e.tools.boxes)}
            {toggle("showGuides", "guides", e.tools.guides)}
          </div>

          <aside className="se-layers" aria-label={e.layers}>
            <h2 className="se-h">
              {e.layers} · {e.orientNames[S.orient]}
            </h2>
            <ul>
              {PART_KEYS.map((k) => {
                const on = S.sel?.t === "part" && S.sel.k === k;
                return (
                  <li key={k}>
                    <button
                      type="button"
                      className={on ? "is-on" : ""}
                      aria-pressed={on}
                      onClick={() => {
                        st.current.sel = { t: "part", k };
                        scrollToSel.current = true;
                        force();
                      }}
                    >
                      <span className="se-sw" style={{ background: PART_COLORS[k] }} />
                      {e.parts[k]}
                      {!layoutOf()[k] && ` ${e.off}`}
                      <span className="se-k mono">{k}</span>
                    </button>
                  </li>
                );
              })}
              {S.skin.decor[S.orient].map((dd, i) => {
                const on = S.sel?.t === "decor" && S.sel.i === i;
                return (
                  <li key={`d${i}`}>
                    <button
                      type="button"
                      className={on ? "is-on" : ""}
                      aria-pressed={on}
                      onClick={() => {
                        st.current.sel = { t: "decor", i };
                        scrollToSel.current = true;
                        force();
                      }}
                    >
                      <span className="se-sw" style={{ background: dd.shape === "grill" ? "#000" : hex(dd.fill, "#fff") }} />
                      {dd.shape === "grill" ? e.grill(i + 1) : e.plate(i + 1)}
                      <span className="se-k mono">decor</span>
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  className={!S.sel ? "is-on" : ""}
                  aria-pressed={!S.sel}
                  onClick={() => {
                    st.current.sel = null;
                    scrollToSel.current = true;
                    force();
                  }}
                >
                  <span className="se-sw" style={{ background: hex(S.skin.shell?.center, "#888888") }} />
                  {e.shellLayer}
                  <span className="se-k mono">shell</span>
                </button>
              </li>
            </ul>
            <h2 className="se-h is-sub">{e.preview}</h2>
            <div className="se-field">
              <span>{e.buttons}</span>
              <Select value={String(S.buttons)} ariaLabel={e.buttons} className="select-sm" options={["1", "2", "3", "4", "5", "6"].map((v) => ({ value: v, label: v }))} onChange={(v) => { st.current.buttons = Number(v); force(); }} />
            </div>
            <div className="se-field">
              <span>{e.players}</span>
              <Select value={String(S.starts)} ariaLabel={e.players} className="select-sm" options={["1", "2", "3", "4"].map((v) => ({ value: v, label: v }))} onChange={(v) => { st.current.starts = Number(v); force(); }} />
            </div>
            <div className="se-field">
              <span>{e.game}</span>
              <Select
                value={S.aspect === 0.75 ? "vertical" : S.aspect > 1.5 ? "wide" : "standard"}
                ariaLabel={e.game}
                className="select-sm"
                options={(["standard", "vertical", "wide"] as const).map((v) => ({ value: v, label: e.aspects[v] }))}
                onChange={(v) => {
                  st.current.aspect = v === "vertical" ? 0.75 : v === "wide" ? 384 / 224 : 4 / 3;
                  force();
                }}
              />
            </div>
            <div className="se-field">
              <span>{e.picture}</span>
              <button type="button" className="button button-secondary" title={e.pictureTip} onClick={() => pictureInput.current?.click()}>
                {e.choosePicture}
              </button>
              {S.picture && (
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => {
                    st.current.picture = null;
                    force();
                  }}
                >
                  {e.clearPicture}
                </button>
              )}
              <input
                ref={pictureInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(ev) => {
                  const file = ev.target.files?.[0];
                  st.current.picture = file ? URL.createObjectURL(file) : null;
                  ev.target.value = "";
                  force();
                }}
              />
            </div>
            <label className="se-field">
              <span>{e.showPressed}</span>
              <input type="checkbox" checked={S.held} onChange={(ev) => { st.current.held = ev.target.checked; force(); }} />
            </label>
            <p className="small muted se-hint">{e.hint}</p>
          </aside>

          <section className={`se-stage${S.view === "code" ? " is-hidden" : ""}`} aria-label={e.stage}>
            <canvas ref={rulerX} className="se-ruler is-x" aria-label={e.rulerX} role="img" onPointerDown={(ev) => rulerDown("x", ev)} />
            <canvas ref={rulerY} className="se-ruler is-y" aria-label={e.rulerY} role="img" onPointerDown={(ev) => rulerDown("y", ev)} />
            <div className="se-corner" />
            <div
              ref={viewport}
              className={`se-viewport${S.tool === "hand" || spaceDown.current ? " is-hand" : S.tool === "rect" || S.tool === "grill" ? " is-add" : ""}`}
              onPointerDown={onDown}
            >
              <div className="se-world" style={{ transform: `translate(${S.panX}px, ${S.panY}px) scale(${S.zoom})` }}>
                <div className={`se-device is-${S.orient}`} style={{ width: d.w, height: d.h }}>
                  <SkinPhone skin={S.skin} orient={S.orient} dev={d} layout={l} held={S.held} picture={S.picture} background={background} />
                </div>
              </div>
              <svg className="se-overlay">{overlay}</svg>
            </div>
            {/* The zoom floats on the canvas, like in drawing apps, so the top bar fits one row. */}
            <div className="se-zoombar" role="group" aria-label={e.zoomLabel}>
              {iconButton(e.zoomOut, "minus", () => zoomBy(0.8))}
              <span className="mono se-zoom">{Math.round(S.zoom * 100)} %</span>
              {iconButton(e.zoomIn, "plus", () => zoomBy(1.25))}
              <button
                type="button"
                className="button button-secondary button-compact"
                title={e.fitTip}
                onClick={() => {
                  fit();
                  force();
                }}
              >
                {e.fit}
              </button>
            </div>
            {S.toast && (
              <div className="se-toast" role="status">
                {S.toast}
              </div>
            )}
          </section>

          {S.view !== "design" && (
            <section className="se-code" aria-label={e.code.label}>
              <div className="se-code-head mono">
                <span>{fileName(S.skin)}</span>
                <span className="spacer" />
                {S.codeStatus && <span className={S.codeStatus.ok ? "is-ok" : "is-bad"}>{S.codeStatus.text}</span>}
                <button
                  type="button"
                  className="button button-secondary se-copy"
                  title={e.code.copyTip}
                  onClick={() => {
                    void navigator.clipboard?.writeText(serialize(st.current.skin)).then(() => toast(e.code.copied));
                  }}
                >
                  {e.code.copy}
                </button>
              </div>
              <div className="se-code-body">
                <pre ref={codeHl} className="mono" aria-hidden="true">
                  {codeLines.map((line, i) => (
                    <span key={i} className={`se-ln${lit && i >= lit[0] && i <= lit[1] ? " is-on" : ""}`}>
                      <CodeLine line={line} />
                    </span>
                  ))}
                </pre>
                <textarea
                  ref={codeArea}
                  className="mono"
                  spellCheck={false}
                  wrap="off"
                  autoCapitalize="off"
                  autoComplete="off"
                  aria-label={e.code.label}
                  value={codeText}
                  onChange={(ev) => {
                    const s = st.current;
                    s.codeTyping = true;
                    s.codeText = ev.target.value;
                    window.clearTimeout(codeTimer.current);
                    codeTimer.current = window.setTimeout(applyCode, 300);
                    force();
                  }}
                  onBlur={() => {
                    const s = st.current;
                    window.clearTimeout(codeTimer.current);
                    if (s.codeTyping) applyCode();
                    s.codeTyping = false;
                    force();
                  }}
                  onScroll={(ev) => {
                    if (codeHl.current) {
                      codeHl.current.scrollTop = ev.currentTarget.scrollTop;
                      codeHl.current.scrollLeft = ev.currentTarget.scrollLeft;
                    }
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Tab") {
                      ev.preventDefault();
                      document.execCommand("insertText", false, "  ");
                    }
                  }}
                />
              </div>
            </section>
          )}

          <aside className="se-inspector" aria-label={e.skin}>
            {inspector}
            <section>
              <h3 className="se-h">{e.checks}</h3>
              <ul className="se-checks">
                {!issues.length && <li className="is-ok">✓ {e.allGood}</li>}
                {issues.slice(0, 40).map((i, n) => (
                  <li key={n} className={i.level === "error" ? "is-error" : "is-warn"}>
                    {i.level === "error" ? "✕" : "!"} {issueText(i)}
                  </li>
                ))}
                {issues.length > 40 && <li className="is-warn">{e.more(issues.length - 40)}</li>}
              </ul>
            </section>
          </aside>
        </div>

        <footer className="se-status mono">
          <span>{e.statusCanvas(layoutOf().canvas.w, layoutOf().canvas.h, deviceOf(S.device).name)}</span>
          <span>
            {S.snap ? e.snapOn : e.snapOff}
            {S.grid ? e.grid8 : ""}
          </span>
          <span>{S.pointer}</span>
          <span className="spacer" />
          <span className={errors ? "is-bad" : "is-ok"}>{errors ? e.problems(errors) : issues.length ? e.notes(issues.length) : e.ready}</span>
        </footer>
      </div>
      {welcome && <SkinEditorWelcome onClose={() => setWelcome(false)} onManual={() => navigate("/docs/skin-editor")} />}
    </div>
  );
}
