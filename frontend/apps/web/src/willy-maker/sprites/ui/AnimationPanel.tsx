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
import { AnimPreview } from "../../ui/organisms/AnimPreview";
import { usePromptMessages } from "../../ui/organisms/PromptDialog";

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
  /** Built-in animations deleted from the list. */
  hidden?: string[];
  onHidden?(hidden: string[]): void;
}

/** A name compared loosely: no accents, no case, no spaces or underscores. */
const loose = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** The presets plus the animations the draft has that are not presets. */
export function animList(role: CharacterRole, anims: Record<string, DraftAnim>, hidden: readonly string[] = []): AnimPreset[] {
  const presets = ANIMS[role].filter((p) => !hidden.includes(p.name) || anims[p.name]?.frames.length);
  const extra = Object.keys(anims)
    .filter((n) => !ANIMS[role].some((p) => p.name === n))
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

export function AnimationPanel({ t, role, anims, active, selectedCount, thumbs, numberOf, colorOf, onActive, onChange, onAddSelected, hidden = [], onHidden }: AnimationPanelProps) {
  const [newName, setNewName] = useState("");
  const [peek, setPeek] = useState<string | null>(null);
  const [sameAs, setSameAs] = useState<string | null>(null);
  const tp = usePromptMessages();
  const list = animList(role, anims, hidden);
  const builtIn = (name: string) => ANIMS[role].some((p) => p.name === name);
  const label = (name: string) => t.animNames[name] ?? name;
  const hiddenNow = hidden.filter((n) => builtIn(n) && !anims[n]?.frames.length);
  const current = active ? (anims[active] ?? null) : null;
  const preset = list.find((p) => p.name === active);

  const set = (name: string, patch: Partial<DraftAnim>) => {
    const base = anims[name] ?? { frames: [], fps: preset?.fps ?? 10, loop: preset?.loop ?? true };
    onChange({ ...anims, [name]: { ...base, ...patch } });
  };

  const addNew = () => {
    // a name the list already has in the user's language ("Correr") is that animation (run)
    const known = ANIMS[role].find((p) => loose(p.name) === loose(newName) || loose(label(p.name)) === loose(newName));
    if (known) {
      if (hidden.includes(known.name)) onHidden?.(hidden.filter((n) => n !== known.name));
      onActive(known.name);
      setSameAs(fmt(t.sameAs, { name: label(known.name), id: known.name }));
      setNewName("");
      return;
    }
    setSameAs(null);
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
            <button
              key={p.name}
              type="button"
              className={`wms-anim${active === p.name ? " is-on" : ""}${n === 0 ? " is-empty" : ""}`}
              aria-pressed={active === p.name}
              aria-describedby={peek === p.name ? `wms-peek-${p.name}` : undefined}
              onClick={() => onActive(p.name)}
              onMouseEnter={() => setPeek(p.name)}
              onMouseLeave={() => setPeek((x) => (x === p.name ? null : x))}
              onFocus={() => setPeek(p.name)}
              onBlur={() => setPeek((x) => (x === p.name ? null : x))}
            >
              <span className="wms-dot" data-c={n ? colorOf(p.name) : -1} aria-hidden="true" />
              <span className="wms-anim-name">
                {label(p.name)}
                {label(p.name) !== p.name && <span className="wms-anim-id">{p.name}</span>}
              </span>
              <span className="wms-anim-count">
                {count}
                {n === 0 && p.frames ? ` · ${t.missing}` : n && a ? ` · ${a.fps} fps` : ""}
              </span>
              {peek === p.name && (
                <span id={`wms-peek-${p.name}`} className="wms-peek">
                  <AnimPreview
                    name={p.name}
                    frames={p.frames || n}
                    text={[tp.animDesc[p.name], fmt(t.internalName, { id: p.name })].filter(Boolean).join(" ")}
                    labels={{ example: tp.animExample, shownWith: tp.animShownWith, none: tp.animNoExample, frames: tp.animFrames }}
                  />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {active ? (
        <div className="wms-anim-edit">
          <div className="wms-row">
            <strong className="wms-anim-title">
              {label(active)}
              {label(active) !== active && <span className="wms-anim-id">{active}</span>}
            </strong>
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
            <button
              type="button"
              className="wms-cap"
              data-tip={t.deleteAnimTip}
              onClick={() => {
                const { [active]: _gone, ...rest } = anims;
                onChange(rest);
                if (builtIn(active) && !hidden.includes(active)) onHidden?.([...hidden, active]);
                onActive("");
              }}
            >
              {t.deleteAnim}
            </button>
          </div>
        </div>
      ) : (
        <p className="wms-note">{t.noAnimHint}</p>
      )}
      {hiddenNow.length > 0 && (
        <p className="wms-note wms-hidden">
          {fmt(t.hidden, { n: hiddenNow.length })}{" "}
          {hiddenNow.map((n) => (
            <button key={n} type="button" className="wms-cap is-sm" aria-label={fmt(t.showAgain, { name: label(n) })} onClick={() => onHidden?.(hidden.filter((x) => x !== n))}>
              + {label(n)}
            </button>
          ))}
        </p>
      )}
      {sameAs && (
        <p className="wms-note" role="status">
          {sameAs}
        </p>
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
