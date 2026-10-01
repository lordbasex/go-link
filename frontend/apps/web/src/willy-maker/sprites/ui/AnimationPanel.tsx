// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The art spec's animations for the character's role (plus any added by
// name): pick one, add the selected boxes to it, set its speed and loop.

import { useEffect, useRef, useState } from "react";
import type { CharacterRole } from "../../model";
import type { DraftAnim } from "../convert";
import { ANIMS, type AnimPreset } from "../presets";
import type { SpritesMessages } from "../../i18n/sprites.en";
import { fmt } from "../text";
import { paint } from "../image";
import type { ScaledFrame } from "@go-link/cps1";

export interface AnimationPanelProps {
  t: SpritesMessages;
  role: CharacterRole;
  anims: Record<string, DraftAnim>;
  active: string | null;
  selectedCount: number;
  /** The board picture of each frame, for the thumbnails. */
  thumbs: ReadonlyMap<string, ScaledFrame>;
  /** The frame's number on the sheet. */
  numberOf(id: string): number;
  colorOf(anim: string): number;
  onActive(name: string): void;
  onChange(anims: Record<string, DraftAnim>): void;
  onAddSelected(name: string): void;
}

/** The presets plus the animations the draft has that are not presets. */
export function animList(role: CharacterRole, anims: Record<string, DraftAnim>): AnimPreset[] {
  const presets = ANIMS[role];
  const extra = Object.keys(anims)
    .filter((n) => !presets.some((p) => p.name === n))
    .map((name) => ({ name, frames: 0, fps: anims[name]!.fps, loop: anims[name]!.loop }));
  return [...presets, ...extra];
}

function Thumb({ frame, label }: { frame: ScaledFrame | undefined; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && frame) paint(ref.current, frame.w, frame.h, frame.rgba);
  }, [frame]);
  return <canvas ref={ref} className="wms-thumb" role="img" aria-label={label} />;
}

export function AnimationPanel({ t, role, anims, active, selectedCount, thumbs, numberOf, colorOf, onActive, onChange, onAddSelected }: AnimationPanelProps) {
  const [newName, setNewName] = useState("");
  const list = animList(role, anims);
  const current = active ? (anims[active] ?? null) : null;
  const preset = list.find((p) => p.name === active);

  const set = (name: string, patch: Partial<DraftAnim>) => {
    const base = anims[name] ?? { frames: [], fps: preset?.fps ?? 10, loop: preset?.loop ?? true };
    onChange({ ...anims, [name]: { ...base, ...patch } });
  };

  const addNew = () => {
    const name = newName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!name) return;
    if (!anims[name]) onChange({ ...anims, [name]: { frames: [], fps: 10, loop: true } });
    onActive(name);
    setNewName("");
  };

  return (
    <section className="wms-card" aria-labelledby="wms-anims-title">
      <h3 className="wms-h" id="wms-anims-title">
        {t.animations}
      </h3>
      <div className="wms-anims">
        {list.map((p) => {
          const a = anims[p.name];
          const n = a?.frames.length ?? 0;
          const count = p.frames ? fmt(t.animFrames, { n, want: p.frames }) : fmt(t.animFramesFree, { n });
          return (
            <button key={p.name} type="button" className={`wms-anim${active === p.name ? " is-on" : ""}${n === 0 ? " is-empty" : ""}`} aria-pressed={active === p.name} onClick={() => onActive(p.name)}>
              <span className="wms-dot" data-c={n ? colorOf(p.name) : -1} aria-hidden="true" />
              <span className="wms-anim-name">{p.name}</span>
              <span className="wms-anim-count">
                {count}
                {n === 0 && p.frames ? ` · ${t.missing}` : n && a ? ` · ${a.fps} fps` : ""}
              </span>
            </button>
          );
        })}
      </div>
      {active ? (
        <div className="wms-anim-edit">
          <div className="wms-row">
            <strong className="wms-anim-title">{active}</strong>
            <span className="wms-spacer" />
            <label className="wms-field wms-field-num">
              <span>{t.fps}</span>
              <input type="number" min={1} max={60} value={current?.fps ?? preset?.fps ?? 10} onChange={(e) => set(active, { fps: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} />
            </label>
            <label className="wms-check">
              <input type="checkbox" checked={current?.loop ?? preset?.loop ?? true} onChange={(e) => set(active, { loop: e.target.checked })} />
              <span>{t.loop}</span>
            </label>
          </div>
          <ol className="wms-frames">
            {(current?.frames ?? []).map((id, i) => (
              <li key={`${id}-${i}`} className="wms-frame-chip">
                <Thumb frame={thumbs.get(id)} label={fmt(t.frameLabel, { n: numberOf(id) })} />
                <span className="wms-frame-n">{numberOf(id)}</span>
                <button
                  type="button"
                  className="wms-x"
                  aria-label={fmt(t.removeFrame, { n: numberOf(id), anim: active })}
                  data-tip={fmt(t.removeFrame, { n: numberOf(id), anim: active })}
                  onClick={() => set(active, { frames: current!.frames.filter((_, k) => k !== i) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          <div className="wms-row">
            <button type="button" className="wms-cap is-on" disabled={!selectedCount} onClick={() => onAddSelected(active)}>
              + {t.addSelected}
              {selectedCount ? ` (${selectedCount})` : ""}
            </button>
            {current?.frames.length ? (
              <button type="button" className="wms-cap" onClick={() => set(active, { frames: [] })}>
                {t.clearAnim}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="wms-note">{t.noAnimHint}</p>
      )}
      <form
        className="wms-row"
        onSubmit={(e) => {
          e.preventDefault();
          addNew();
        }}
      >
        <label className="wms-field wms-grow">
          <span className="wms-sr">{t.newAnim}</span>
          <input type="text" value={newName} placeholder={t.newAnimPlaceholder} onChange={(e) => setNewName(e.target.value)} />
        </label>
        <button type="submit" className="wms-cap" disabled={!newName.trim()}>
          + {t.addAnim}
        </button>
      </form>
    </section>
  );
}
