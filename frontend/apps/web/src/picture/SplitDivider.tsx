// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { t } from "../i18n";

/**
 * The comparison's vertical line: drag it (or focus it and use the arrow
 * keys) to move the border between the browser's usual look (left) and
 * the chosen style (right). A real slider for assistive technology.
 */
export function SplitDivider({ value, onChange, after }: { value: number; onChange: (v: number) => void; after: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const clamp = (v: number) => Math.min(0.98, Math.max(0.02, v));
  const fromPointer = (e: PointerEvent) => {
    const box = rootRef.current?.parentElement?.getBoundingClientRect();
    if (box && box.width > 0) onChange(clamp((e.clientX - box.left) / box.width));
  };
  const key = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const next =
      e.key === "ArrowLeft" || e.key === "ArrowDown" ? value - step
      : e.key === "ArrowRight" || e.key === "ArrowUp" ? value + step
      : e.key === "Home" ? 0.02
      : e.key === "End" ? 0.98
      : null;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(clamp(next));
  };
  return (
    <div className="picture-split" ref={rootRef} style={{ left: `${value * 100}%` }}>
      <span className="picture-split-label is-before" aria-hidden="true">{t.picture.before}</span>
      <span className="picture-split-label is-after" aria-hidden="true">{after}</span>
      <div
        className="picture-split-handle"
        role="slider"
        tabIndex={0}
        aria-label={t.picture.divider}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={`${Math.round(value * 100)} %`}
        onKeyDown={key}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
        </svg>
      </div>
    </div>
  );
}
