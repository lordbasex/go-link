// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The canvas: the level centred with a 48 px margin on the neutral ground,
// scaled by the zoom. Its art (the board's tiles) is drawn on a canvas the
// size of the visible part; zones and objects are elements over it, so they
// can be picked, dragged and outlined. The tools work here: select and move
// (and resize zones by their handle), draw a zone, erase, and the hand (or
// Space held) to pan. ⌘ / Ctrl / Alt + wheel zooms around the pointer, a
// right click opens the context menu and a picture dropped on it becomes
// the background. Past the level's right end, Add scene puts another
// picture (or the same art again) after it, and the timeline under the
// canvas (StageTimeline) follows and moves what the view shows.

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { Plus, Repeat, Upload } from "lucide-react";
import { cleanBands, frontTilesetId, objectLayer, objectVisible, zoneVisible, type Level, type Zone } from "../../model";
import type { EditorStore } from "../../editor/store";
import { addZone, findObject, findZone, LiveEdit, removeItem, sameRef, targetGroup, type ItemRef } from "../../editor/zoneOps";
import { useStudioText } from "../../i18n";
import { drawArt, type TileImage } from "../render";
import { FrontBox, ObjectBox, ZoneBox } from "./LevelItems";
import { removePiece } from "./front";
import { boxOf, groupName, hasBackgroundArt, hitAt } from "./select";
import { MAX_ZOOM, MIN_ZOOM, useStudioUi, useUiState } from "./state";

/** Margin around the level (px). */
const MARGIN = 48;
/** The collision grid: zones always snap to it. */
const CELL = 16;
const SCREEN_W = 384;
const SCREEN_H = 224;
/** Add scene's slot after the level's end: its gap and width (screen px). */
const SLOT_GAP = 12;
const SLOT_W = 132;

export interface StageApi {
  /** Multiplies the zoom, keeping the level point under (clientX, clientY), or the view's centre, in place. */
  zoomBy(factor: number, at?: { clientX: number; clientY: number }): void;
  /** Sets the zoom so the whole level fits the view. */
  fit(): void;
  /** Sets the zoom (around the view's centre). */
  zoomTo(zoom: number): void;
  /** The level point at the view's centre. */
  center(): { x: number; y: number };
  /** Where a level point is on the page (client px). */
  toClient(x: number, y: number): { x: number; y: number };
  /** The part of the level the view shows (level px). */
  view(): { x: number; y: number; w: number; h: number };
  /** Scrolls so the view is centred on a level point. */
  goTo(x: number, y: number): void;
}

export interface StageProps {
  store: EditorStore;
  level: Level;
  version: number;
  images: Map<string, TileImage>;
  apiRef: Ref<StageApi>;
  onCursor: (p: { x: number; y: number } | null) => void;
  /** Display names of zones and objects (translated). */
  zoneLabel: (z: Zone) => string;
  objectLabel: (name: string) => string;
  onFile: (file: File) => void;
  onInsertBackground: () => void;
  onExample: () => void;
  onDemo: () => void;
  /** Add scene: a picture file after the level's end, or null to choose one. */
  onAddScene: (file: File | null) => void;
  /** Add scene with the level's own art again. */
  onRepeatScene: () => void;
  /** The view moved or changed size (the timeline follows it). */
  onView?: () => void;
}

type Drag =
  | { mode: "pan"; x0: number; y0: number; sl: number; st: number }
  | { mode: "draw"; x0: number; y0: number }
  | { mode: "move"; ref: ItemRef; dx: number; dy: number; edit: LiveEdit }
  | { mode: "resize"; id: string; edit: LiveEdit };

const snapTo = (v: number, g: number) => Math.round(v / g) * g;

export function Stage({ store, level, version, images, apiRef, onCursor, zoneLabel, objectLabel, onFile, onInsertBackground, onExample, onDemo, onAddScene, onRepeatScene, onView }: StageProps) {
  const t = useStudioText();
  const ui = useStudioUi();
  const s = useUiState();
  const scroller = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const [draft, setDraftState] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const draftRef = useRef(draft);
  const setDraft = (r: typeof draft) => {
    draftRef.current = r;
    setDraftState(r);
  };
  const [panning, setPanning] = useState(false);
  // the level point to keep in place after the next zoom change
  const anchor = useRef<{ lx: number; ly: number; vx: number; vy: number } | null>(null);
  const z = s.zoom;

  const zoomAround = useCallback(
    (next: number, at?: { clientX: number; clientY: number }) => {
      const el = scroller.current;
      const cur = ui.get().zoom;
      next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 100) / 100));
      if (!el || next === cur) return;
      const r = el.getBoundingClientRect();
      const vx = at ? at.clientX - r.left : el.clientWidth / 2;
      const vy = at ? at.clientY - r.top : el.clientHeight / 2;
      const off = offsets(el, level, cur);
      anchor.current = { lx: (el.scrollLeft + vx - off.x) / cur, ly: (el.scrollTop + vy - off.y) / cur, vx, vy };
      ui.setZoom(next);
    },
    [level, ui],
  );

  useImperativeHandle(apiRef, () => ({
    zoomBy: (factor, at) => zoomAround(ui.get().zoom * factor, at),
    zoomTo: (zoom) => zoomAround(zoom),
    fit() {
      const el = scroller.current;
      if (el) zoomAround(Math.min((el.clientWidth - 2 * MARGIN) / level.size.w, (el.clientHeight - 2 * MARGIN) / level.size.h));
    },
    toClient(x, y) {
      const r = board.current?.getBoundingClientRect();
      const zz = ui.get().zoom;
      return { x: (r?.left ?? 0) + x * zz, y: (r?.top ?? 0) + y * zz };
    },
    center() {
      const el = scroller.current;
      if (!el) return { x: level.size.w / 2, y: level.size.h / 2 };
      const off = offsets(el, level, z);
      return { x: Math.round((el.scrollLeft + el.clientWidth / 2 - off.x) / z), y: Math.round((el.scrollTop + el.clientHeight / 2 - off.y) / z) };
    },
    view() {
      const el = scroller.current;
      if (!el) return { x: 0, y: 0, w: level.size.w, h: level.size.h };
      const off = offsets(el, level, z);
      const x = Math.max(0, (el.scrollLeft - off.x) / z);
      const y = Math.max(0, (el.scrollTop - off.y) / z);
      return { x, y, w: Math.min(level.size.w - x, el.clientWidth / z), h: Math.min(level.size.h - y, el.clientHeight / z) };
    },
    goTo(x, y) {
      const el = scroller.current;
      if (!el) return;
      const off = offsets(el, level, z);
      el.scrollLeft = x * z + off.x - el.clientWidth / 2;
      el.scrollTop = y * z + off.y - el.clientHeight / 2;
    },
  }));

  // after a zoom, scroll so the anchored level point is back under its spot
  useLayoutEffect(() => {
    const el = scroller.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    const off = offsets(el, level, z);
    el.scrollLeft = a.lx * z + off.x - a.vx;
    el.scrollTop = a.ly * z + off.y - a.vy;
  }, [z, level]);

  // a new level opens at its bottom left, where the player usually starts
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) {
      el.scrollLeft = 0;
      el.scrollTop = el.scrollHeight;
    }
  }, [level.id]);

  // ⌘ / Ctrl / Alt + wheel zooms around the pointer (a passive listener could not stop the page zoom)
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
      e.preventDefault();
      zoomAround(ui.get().zoom * Math.exp(-e.deltaY * 0.0022), { clientX: e.clientX, clientY: e.clientY });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoomAround, ui]);

  // the art: only the visible part, redrawn on scroll, zoom, size and every change
  const paint = useCallback(() => {
    const el = scroller.current;
    const cv = art.current;
    if (!el || !cv) return;
    const off = offsets(el, level, z);
    const x0 = Math.max(0, (el.scrollLeft - off.x) / z);
    const y0 = Math.max(0, (el.scrollTop - off.y) / z);
    const x1 = Math.min(level.size.w, (el.scrollLeft + el.clientWidth - off.x) / z);
    const y1 = Math.min(level.size.h, (el.scrollTop + el.clientHeight - off.y) / z);
    if (x1 <= x0 || y1 <= y0) return;
    const w = Math.ceil((x1 - x0) * z);
    const h = Math.ceil((y1 - y0) * z);
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.ceil(w * dpr) || cv.height !== Math.ceil(h * dpr)) {
      cv.width = Math.ceil(w * dpr);
      cv.height = Math.ceil(h * dpr);
    }
    cv.style.left = `${x0 * z}px`;
    cv.style.top = `${y0 * z}px`;
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const ctx = cv.getContext("2d");
    if (ctx) drawArt(ctx, level, { x: x0, y: y0, zoom: z, w, h }, dpr, images);
  }, [level, z, images]);
  useLayoutEffect(paint, [paint, version]);
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(el);
    return () => ro.disconnect();
  }, [paint]);
  const raf = useRef(0);
  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      paint();
      onView?.();
    });
  };
  // a zoom, a new size or a resized view moves what the timeline shows
  useEffect(() => onView?.(), [z, level.size.w, level.size.h, onView]);

  const world = (e: { clientX: number; clientY: number }) => {
    const r = board.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
  };
  const clampX = (v: number) => Math.max(0, Math.min(level.size.w, v));
  const clampY = (v: number) => Math.max(0, Math.min(level.size.h, v));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || s.playing || !board.current) return;
    if ((e.target as HTMLElement).closest(".studio-empty")) return;
    const st = ui.get();
    const el = scroller.current!;
    if (st.tool === "hand" || st.spacePan) {
      e.preventDefault();
      drag.current = { mode: "pan", x0: e.clientX, y0: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
      setPanning(true);
    } else {
      const p = world(e);
      const handle = (e.target as HTMLElement).getAttribute?.("data-handle");
      const hit = hitAt(level, p.x, p.y);
      if (st.tool === "erase") {
        if (hit?.kind === "front") {
          void removePiece(store, level.id, hit.id, t.undoLabels.frontRemove);
          if (sameRef(hit, st.sel)) ui.set({ sel: null });
        } else if (hit && hit.kind !== "bg") {
          removeItem(store, level.id, hit, t.undoLabels.delete);
          if (sameRef(hit, st.sel)) ui.set({ sel: null });
        }
        return;
      }
      if (st.tool === "zone") {
        const gid = targetGroup(level, "zones", st.activeGroup);
        const g = level.groups?.find((x) => x.id === gid);
        if (g?.locked) {
          ui.flash(t.toast.groupLocked(groupName(g, t.groupNames)));
          return;
        }
        if (p.x < 0 || p.y < 0 || p.x > level.size.w || p.y > level.size.h) return;
        const x0 = Math.floor(p.x / CELL) * CELL;
        const y0 = Math.floor(p.y / CELL) * CELL;
        drag.current = { mode: "draw", x0, y0 };
        setDraft({ x: x0, y: y0, w: 0, h: 0 });
      } else if (handle && findZone(level, handle)) {
        drag.current = { mode: "resize", id: handle, edit: new LiveEdit(store, level.id, t.undoLabels.resize) };
      } else if (!hit) {
        ui.set({ sel: null });
        return;
      } else {
        ui.set({ sel: hit });
        if (hit.kind === "bg") return;
        const it = hit.kind === "zone" ? findZone(level, hit.id)! : hit.kind === "front" ? level.front!.find((f) => f.id === hit.id)! : findObject(level, hit.id)!;
        drag.current = { mode: "move", ref: hit, dx: p.x - it.x, dy: p.y - it.y, edit: new LiveEdit(store, level.id, t.undoLabels.move) };
      }
    }
    const move = (ev: PointerEvent) => onDragMove(ev);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onDragEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onDragMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === "pan") {
      const el = scroller.current!;
      el.scrollLeft = d.sl - (e.clientX - d.x0);
      el.scrollTop = d.st - (e.clientY - d.y0);
      return;
    }
    const p = world(e);
    if (d.mode === "draw") {
      const x2 = clampX(snapTo(p.x, CELL));
      const y2 = clampY(snapTo(p.y, CELL));
      setDraft({ x: Math.min(d.x0, x2), y: Math.min(d.y0, y2), w: Math.abs(x2 - d.x0), h: Math.abs(y2 - d.y0) });
    } else if (d.mode === "resize") {
      d.edit.change((lv) => {
        const zn = findZone(lv, d.id);
        if (!zn) return;
        zn.w = Math.max(CELL, clampX(snapTo(p.x, CELL)) - zn.x);
        zn.h = Math.max(CELL, clampY(snapTo(p.y, CELL)) - zn.y);
      });
    } else if (d.mode === "move") {
      d.edit.change((lv) => {
        if (d.ref.kind === "zone") {
          const zn = findZone(lv, d.ref.id);
          if (!zn) return;
          zn.x = Math.max(0, Math.min(lv.size.w - zn.w, snapTo(p.x - d.dx, CELL)));
          zn.y = Math.max(0, Math.min(lv.size.h - zn.h, snapTo(p.y - d.dy, CELL)));
        } else if (d.ref.kind === "front") {
          const id = d.ref.id;
          const f = lv.front?.find((x) => x.id === id);
          if (!f) return;
          const g = ui.get().grid;
          f.x = Math.max(-f.cols * CELL, Math.min(lv.size.w, snapTo(p.x - d.dx, g)));
          f.y = Math.max(-f.rows * CELL, Math.min(lv.size.h, snapTo(p.y - d.dy, g)));
        } else if (d.ref.kind === "object") {
          const o = findObject(lv, d.ref.id);
          if (!o) return;
          const g = o.type === "crate" ? CELL : ui.get().grid;
          o.x = Math.max(0, Math.min(lv.size.w, snapTo(p.x - d.dx, g)));
          o.y = Math.max(0, Math.min(lv.size.h, snapTo(p.y - d.dy, g)));
        }
      });
    }
  };

  const onDragEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === "pan") setPanning(false);
    else if (d.mode === "move" || d.mode === "resize") d.edit.commit();
    else if (d.mode === "draw") {
      const r = draftRef.current;
      setDraft(null);
      if (!r) return;
      // a click without a drag makes a 4 × 2 cell zone
      const w = r.w || 4 * CELL;
      const h = r.h || 2 * CELL;
      const st = ui.get();
      const id = addZone(store, level.id, { kind: st.zoneKind, x: Math.max(0, Math.min(r.x, level.size.w - w)), y: Math.max(0, Math.min(r.y, level.size.h - h)), w, h, group: targetGroup(level, "zones", st.activeGroup) }, t.undoLabels.drawZone);
      ui.set({ sel: { kind: "zone", id } });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!board.current || s.playing) return;
    const p = world(e);
    onCursor(p.x >= 0 && p.y >= 0 && p.x <= level.size.w && p.y <= level.size.h ? { x: Math.floor(p.x), y: Math.floor(p.y) } : null);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (s.playing || !board.current || (e.target as HTMLElement).closest(".studio-empty")) return;
    const p = world(e);
    const ref = hitAt(level, p.x, p.y);
    ui.set({ menu: { x: e.clientX, y: e.clientY, target: { kind: "canvas", at: { x: Math.round(p.x), y: Math.round(p.y) }, ref } }, sel: ref, viewMenu: false });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  const sel = s.sel;
  const items = objectLayer(level).items;
  const zones = level.zones ?? [];
  const hasArt = hasBackgroundArt(level);
  const empty = !hasArt && zones.length === 0 && items.length === 0;
  const hero = items.find((o) => o.type === "player_start" && objectVisible(level, o));
  const heroBox = hero ? boxOf(hero) : null;
  const frame = heroBox
    ? {
        x: Math.max(0, Math.min(level.size.w - SCREEN_W, heroBox.x + heroBox.w / 2 - SCREEN_W / 2)),
        y: Math.max(0, Math.min(level.size.h - SCREEN_H, heroBox.y + heroBox.h / 2 - SCREEN_H / 2)),
      }
    : // no hero yet: the first screen, at the level's bottom left
      { x: 0, y: Math.max(0, level.size.h - SCREEN_H) };
  const cell = s.grid * z;
  const gridLine = hasArt ? "color-mix(in srgb, var(--color-bg) 22%, transparent)" : "color-mix(in srgb, var(--color-text) 10%, transparent)";
  const cursor = s.tool === "hand" || s.spacePan ? (panning ? "grabbing" : "grab") : s.tool === "zone" ? "crosshair" : "default";
  const bgSelected = sel?.kind === "bg";

  return (
    <div
      ref={scroller}
      className="studio-stage"
      style={{ cursor }}
      tabIndex={-1}
      onScroll={onScroll}
      onPointerDown={onPointerDown}
      onMouseMove={onMouseMove}
      onMouseLeave={() => onCursor(null)}
      onContextMenu={onContextMenu}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="studio-stage-pad" style={{ padding: MARGIN, paddingRight: MARGIN + slotRoom(level) }}>
        {hasArt && (
          // Add scene: after the level's end, a new picture (chosen, or dropped here) or the same art again
          <div
            className="studio-add-scene"
            style={{ left: MARGIN + level.size.w * z + SLOT_GAP, top: MARGIN, width: SLOT_W, height: level.size.h * z }}
            onPointerDown={(e) => e.stopPropagation()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const f = e.dataTransfer.files[0];
              if (f) onAddScene(f);
            }}
          >
            <button type="button" className="studio-add-scene-main" title={t.addScene.hint} onClick={() => onAddScene(null)}>
              <Plus size={36} aria-hidden="true" />
              <span>{t.addScene.add}</span>
            </button>
            <button type="button" className="btn btn-ghost studio-add-scene-repeat" title={t.addScene.repeatHint} onClick={onRepeatScene}>
              <Repeat size={14} aria-hidden="true" />
              {t.addScene.repeat}
            </button>
          </div>
        )}
        <div ref={board} className={`studio-level${hasArt ? " has-art" : ""}`} style={{ width: level.size.w * z, height: level.size.h * z }}>
          <canvas ref={art} className={`studio-art${bgSelected ? " is-selected" : ""}`} aria-hidden="true" />
          {bgSelected && <div className="studio-bg-outline" />}
          {bgSelected &&
            // the parallax bands: rows that move at their own speed in the game
            cleanBands(level).map((b) => (
              <div key={b.y0} className="studio-band" style={{ top: b.y0 * z, height: (b.y1 - b.y0) * z }}>
                <span>{t.depth.bandTag(b.speed)}</span>
              </div>
            ))}
          {s.showGrid && cell >= 4 && (
            <div
              className="studio-grid"
              style={{ backgroundImage: `linear-gradient(to right, ${gridLine} 1px, transparent 1px), linear-gradient(to bottom, ${gridLine} 1px, transparent 1px)`, backgroundSize: `${cell}px ${cell}px` }}
            />
          )}
          <div className="studio-zones" style={{ opacity: s.zoneOpacity / 100 }}>
            {zones.map((zn) =>
              zoneVisible(level, zn) ? <ZoneBox key={zn.id} zone={zn} z={z} label={zoneLabel(zn)} selected={sel?.kind === "zone" && sel.id === zn.id} showLabel={s.showLabels || (sel?.kind === "zone" && sel.id === zn.id)} /> : null,
            )}
            {draft && <ZoneBox zone={{ id: "draft", kind: s.zoneKind, n: 0, group: "", ...draft }} z={z} label="" selected={false} showLabel={false} />}
          </div>
          {items.map((o) =>
            objectVisible(level, o) ? (
              <ObjectBox key={o.name} o={o} box={boxOf(o)} z={z} label={objectLabel(o.name)} selected={sel?.kind === "object" && sel.id === o.name} showLabel={s.showLabels || (sel?.kind === "object" && sel.id === o.name)} />
            ) : null,
          )}
          {(level.front ?? []).map((f) => (
            <FrontBox key={f.id} piece={f} image={images.get(frontTilesetId(level.id))} z={z} selected={sel?.kind === "front" && sel.id === f.id} label={t.front.piece(f.name)} />
          ))}
          {s.debug.frame && (
            <div className="studio-frame" style={{ left: frame.x * z, top: frame.y * z, width: SCREEN_W * z, height: SCREEN_H * z }}>
              <span>{t.frameLabel}</span>
            </div>
          )}
          {empty && (
            <div className="studio-empty-wrap">
              <div className="studio-empty">
                <div className="studio-empty-kicker">{t.empty.kicker}</div>
                <div className="studio-empty-title">{t.empty.title}</div>
                <p>{t.empty.text}</p>
                <div className="studio-empty-actions">
                  <button type="button" className="btn btn-primary" onClick={onInsertBackground}>
                    <Upload size={16} aria-hidden="true" />
                    {t.empty.insert}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={onExample}>
                    {t.empty.example}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={onDemo}>
                    {t.empty.demo}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The room Add scene's slot takes after the level (none until the level has a background). */
const slotRoom = (level: Level) => (hasBackgroundArt(level) ? SLOT_GAP + SLOT_W : 0);

/** Where the level's top left sits inside the scrolled content (it is centred when smaller than the view). */
function offsets(el: HTMLElement, level: Level, z: number): { x: number; y: number } {
  const cw = level.size.w * z + 2 * MARGIN + slotRoom(level);
  const ch = level.size.h * z + 2 * MARGIN;
  return { x: Math.max(0, (el.clientWidth - cw) / 2) + MARGIN, y: Math.max(0, (el.clientHeight - ch) / 2) + MARGIN };
}
