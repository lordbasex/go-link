// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The dropped sheet with its frame boxes: click to select (Shift adds),
// drag a box to move it, drag its corner to resize it, arrows nudge the
// selection by a pixel (Shift: 8). Boxes are real buttons, positioned in
// percentages of the sheet so they follow any zoom.

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { SourceFrame } from "../convert";

export interface BoxLabel {
  text: string;
  /** Color slot 0-7 (an animation), or -1 for an unassigned frame. */
  color: number;
}

export interface SheetViewProps {
  url: string;
  w: number;
  h: number;
  frames: SourceFrame[];
  selected: ReadonlySet<string>;
  labels: ReadonlyMap<string, BoxLabel>;
  zoom: number;
  label: string;
  frameLabel(n: number): string;
  onSelect(id: string | null, additive: boolean): void;
  onChange(frames: SourceFrame[]): void;
  onDelete(): void;
}

interface Drag {
  kind: "move" | "resize";
  id: string;
  x0: number;
  y0: number;
  start: SourceFrame;
  scale: number;
  moved: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function SheetView({ url, w, h, frames, selected, labels, zoom, label, frameLabel, onSelect, onChange, onDelete }: SheetViewProps) {
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const boxRefs = useRef(new Map<string, HTMLButtonElement>());

  // geometry through element.style (the CSP allows it; no inline style attributes needed)
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    el.style.aspectRatio = `${w} / ${h}`;
    el.style.width = `${zoom * 100}%`;
  }, [w, h, zoom]);
  useEffect(() => {
    for (const f of frames) {
      const el = boxRefs.current.get(f.id);
      if (!el) continue;
      el.style.left = `${(f.x / w) * 100}%`;
      el.style.top = `${(f.y / h) * 100}%`;
      el.style.width = `${(f.w / w) * 100}%`;
      el.style.height = `${(f.h / h) * 100}%`;
      el.style.setProperty("--pvx", `${(f.px / Math.max(1, f.w)) * 100}%`);
      el.style.setProperty("--pvy", `${((f.py + 0.5) / Math.max(1, f.h)) * 100}%`);
    }
  }, [frames, w, h]);

  const update = (id: string, fn: (f: SourceFrame) => SourceFrame) => onChange(frames.map((f) => (f.id === id ? fn(f) : f)));

  const down = (e: PointerEvent<HTMLElement>, id: string, kind: Drag["kind"]) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const f = frames.find((x) => x.id === id);
    const rect = stage.current?.getBoundingClientRect();
    if (!f || !rect || !rect.width) return;
    drag.current = { kind, id, x0: e.clientX, y0: e.clientY, start: f, scale: w / rect.width, moved: false };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // synthetic events have no capture
    }
  };

  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = Math.round((e.clientX - d.x0) * d.scale);
    const dy = Math.round((e.clientY - d.y0) * d.scale);
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
    if (!d.moved && d.kind === "move" && !selected.has(d.id)) onSelect(d.id, false);
    d.moved = true;
    const s = d.start;
    if (d.kind === "move") update(d.id, (f) => ({ ...f, x: clamp(s.x + dx, 0, w - s.w), y: clamp(s.y + dy, 0, h - s.h) }));
    else
      update(d.id, (f) => {
        const nw = clamp(s.w + dx, 4, w - s.x);
        const nh = clamp(s.h + dy, 4, h - s.y);
        return { ...f, w: nw, h: nh, px: clamp(f.px, 0, nw - 1), py: clamp(s.py + (nh - s.h), 0, nh - 1) };
      });
  };

  const up = (e: PointerEvent<HTMLElement>, id: string) => {
    const d = drag.current;
    drag.current = null;
    // a click without dragging toggles the selection
    if (d && !d.moved && d.kind === "move") onSelect(id, e.shiftKey);
  };

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selected.size) {
        e.preventDefault();
        onDelete();
      }
      return;
    }
    if (e.key === "Escape") {
      onSelect(null, false);
      return;
    }
    const step = e.shiftKey ? 8 : 1;
    const dir: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const v = dir[e.key];
    if (!v || !selected.size) return;
    e.preventDefault();
    onChange(frames.map((f) => (selected.has(f.id) ? { ...f, x: clamp(f.x + v[0], 0, w - f.w), y: clamp(f.y + v[1], 0, h - f.h) } : f)));
  };

  return (
    <div className="wms-sheet-scroll" onKeyDown={key}>
      <div className="wms-sheet" ref={stage} role="group" aria-label={label} onPointerDown={() => onSelect(null, false)}>
        <img className="wms-sheet-img" src={url} alt="" draggable={false} />
        {frames.map((f, i) => {
          const lb = labels.get(f.id);
          const on = selected.has(f.id);
          return (
            <button
              key={f.id}
              type="button"
              ref={(el) => {
                if (el) boxRefs.current.set(f.id, el);
                else boxRefs.current.delete(f.id);
              }}
              className={`wms-box${on ? " is-on" : ""}`}
              data-c={lb?.color ?? -1}
              aria-pressed={on}
              aria-label={`${frameLabel(i + 1)}${lb ? ` · ${lb.text}` : ""}`}
              onPointerDown={(e) => down(e, f.id, "move")}
              onPointerMove={move}
              onPointerUp={(e) => up(e, f.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(f.id, e.shiftKey);
                }
              }}
            >
              <span className="wms-box-tag">{lb ? lb.text : i + 1}</span>
              <span className="wms-box-pivot" aria-hidden="true" />
              {on && selected.size === 1 ? <span className="wms-box-grip" aria-hidden="true" onPointerDown={(e) => down(e, f.id, "resize")} onPointerMove={move} onPointerUp={(e) => up(e, f.id)} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
