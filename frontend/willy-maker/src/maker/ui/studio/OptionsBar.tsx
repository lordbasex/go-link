// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The options bar (44 px) over the canvas: what the active tool needs (the
// zone kinds for Draw zone, a hint for the others, the debug overlays while
// playing), then View, the grid size and the zoom.

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Eye } from "lucide-react";
import { useStudioText } from "../../i18n";
import type { ZoneKind } from "../../model";
import { ZONE_SWATCH } from "./kinds";
import { DEBUG_FLAGS, useStudioUi, useUiState, type DebugFlag } from "./state";

export function OptionsBar({ kinds, onZoomBy }: { kinds: readonly ZoneKind[]; onZoomBy: (factor: number) => void }) {
  const t = useStudioText();
  const ui = useStudioUi();
  const s = useUiState();
  return (
    <div className="studio-options">
      {s.playing ? (
        <>
          <span className="studio-options-label">{t.debugLabel}</span>
          <div className="studio-chips" role="group" aria-label={t.viewDebug}>
            {DEBUG_FLAGS.map((f) => (
              <button key={f} type="button" className="studio-chip" aria-pressed={s.debug[f]} onClick={() => ui.toggleDebug(f)}>
                {t.debug[f]}
              </button>
            ))}
          </div>
        </>
      ) : s.tool === "zone" ? (
        <>
          <span className="studio-options-label">{t.thisIs}</span>
          <div className="studio-chips" role="group" aria-label={t.tools.zone}>
            {kinds.map((k) => (
              <button key={k} type="button" className="studio-chip" aria-pressed={s.zoneKind === k} title={t.zoneKinds[k].hint} onClick={() => ui.set({ zoneKind: k })}>
                <span className="mdn-swatch" style={{ background: ZONE_SWATCH[k] }} aria-hidden="true" />
                {t.zoneKinds[k].name}
              </button>
            ))}
          </div>
          <span className="studio-options-hint">{t.zoneKinds[s.zoneKind].hint}</span>
        </>
      ) : (
        <span className="studio-options-hint">{t.toolHints[s.tool]}</span>
      )}
      <div className="studio-spacer" />
      <ViewMenu />
      <div className="seg studio-gridsize" role="group" aria-label={t.gridSize}>
        {([8, 16] as const).map((g) => (
          <button key={g} type="button" aria-pressed={s.grid === g} onClick={() => ui.set({ grid: g })}>
            {g}
          </button>
        ))}
      </div>
      <div className="studio-vsep is-short" aria-hidden="true" />
      <div className="studio-zoom">
        <button type="button" className="btn btn-icon studio-small" aria-label={t.zoomOut} title={t.zoomOut} onClick={() => onZoomBy(1 / 1.25)}>
          −
        </button>
        <span className="tabular" aria-live="polite">
          {Math.round(s.zoom * 100)} %
        </span>
        <button type="button" className="btn btn-icon studio-small" aria-label={t.zoomIn} title={t.zoomIn} onClick={() => onZoomBy(1.25)}>
          +
        </button>
      </div>
    </div>
  );
}

/** View ▾: the editor's grid and labels, and the debug overlays; it counts the active overlays. */
function ViewMenu() {
  const t = useStudioText();
  const ui = useStudioUi();
  const s = useUiState();
  const ref = useRef<HTMLDivElement>(null);
  const count = DEBUG_FLAGS.filter((f) => s.debug[f]).length;
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!s.viewMenu) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) ui.set({ viewMenu: false });
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") ui.set({ viewMenu: false });
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [s.viewMenu, ui]);

  const debugLabel = (f: DebugFlag) => (f === "frame" ? t.frameMenu : t.debug[f]);
  return (
    <div className="studio-view" ref={ref}>
      <button type="button" className="btn btn-secondary studio-view-btn" aria-expanded={s.viewMenu}
        aria-haspopup="true"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 268)), top: r.bottom + 4 });
          ui.set({ viewMenu: !s.viewMenu });
        }}
      >
        <Eye size={14} aria-hidden="true" />
        {count ? t.viewCount(count) : t.view}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {s.viewMenu && (
        <div className="studio-view-pop" role="group" aria-label={t.view} style={pos}>
          <div className="mdn-menu-head">{t.viewEditor}</div>
          <label className="studio-check">
            <input type="checkbox" checked={s.showGrid} onChange={() => ui.set({ showGrid: !s.showGrid })} />
            {t.grid}
          </label>
          <label className="studio-check">
            <input type="checkbox" checked={s.showLabels} onChange={() => ui.set({ showLabels: !s.showLabels })} />
            {t.labels}
          </label>
          <div className="mdn-menu-sep" />
          <div className="mdn-menu-head">{t.viewDebug}</div>
          {DEBUG_FLAGS.map((f) => (
            <label key={f} className="studio-check">
              <input type="checkbox" checked={s.debug[f]} onChange={() => ui.toggleDebug(f)} />
              {debugLabel(f)}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
