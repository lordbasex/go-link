// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A floating menu (240 px, ink border): the rail's flyouts and, later, the
// canvas's context menus. It stays inside the window, closes on Esc, on a
// click outside or after an item runs, and moves with the arrow keys.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

export type MenuEntry =
  | { kind: "head"; label: string }
  | { kind: "sep" }
  | { kind: "item"; label: string; onSelect: () => void; shortcut?: string; checked?: boolean; swatch?: string; danger?: boolean; disabled?: boolean; title?: string };

const WIDTH = 240;

export function Menu({ x, y, entries, label, onClose }: { x: number; y: number; entries: MenuEntry[]; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // keep it inside the window once its height is known
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - WIDTH - 8)), top: Math.max(8, Math.min(y, window.innerHeight - h - 8)) });
  }, [x, y, entries.length]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    next?.focus();
  };

  return (
    <>
      <div
        className="mdn-menu-backdrop"
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div ref={ref} className="mdn-menu" role="menu" aria-label={label} style={{ left: pos.left, top: pos.top, width: WIDTH }} onKeyDown={onKey} onMouseDown={(e) => e.stopPropagation()}>
        {entries.map((m, i) =>
          m.kind === "head" ? (
            <div key={i} className="mdn-menu-head" role="presentation">
              {m.label}
            </div>
          ) : m.kind === "sep" ? (
            <div key={i} className="mdn-menu-sep" role="separator" />
          ) : (
            <button
              key={i}
              type="button"
              role={m.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
              aria-checked={m.checked !== undefined ? m.checked : undefined}
              className={`mdn-menu-item${m.danger ? " is-danger" : ""}`}
              disabled={m.disabled}
              title={m.title}
              onClick={() => {
                onClose();
                m.onSelect();
              }}
            >
              <span className="mdn-menu-mark" aria-hidden="true">
                {m.checked ? <Check size={14} strokeWidth={3} /> : m.swatch ? <span className="mdn-swatch" style={{ background: m.swatch }} /> : null}
              </span>
              <span className="mdn-menu-label">{m.label}</span>
              {m.shortcut && <span className="mdn-menu-key">{m.shortcut}</span>}
            </button>
          ),
        )}
      </div>
    </>
  );
}
