// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// "Prompt for image AI" (T-29): a dialog that writes prompts for an image AI,
// for any kind of art the game needs, with what the CPS-1 board needs filled
// in (prompts/imagePrompt.ts). The choices are kept with the project.

import { useId, useMemo, useRef, useState } from "react";
import { useMessages } from "../../i18n";
import { promptEn, type PromptMessages } from "../../i18n/prompt.en";
import { promptEs } from "../../i18n/prompt.es";
import { promptPt } from "../../i18n/prompt.pt";
import type { CharacterRole, Project } from "../../model";
import type { EditorStore } from "../../editor/store";
import { ANIMS, DEFAULT_HEIGHT } from "../../sprites/presets";
import { buildPrompts, defaultChoices, EXAMPLE, FLAGS, mergeChoices, SUBTYPES, type PromptChoices, type PromptKind } from "../../prompts/imagePrompt";
import { Capsule, Field, Segmented } from "../atoms";
import { IconCopy } from "../icons";

export const PROMPT = { en: promptEn, es: promptEs, pt: promptPt };

export function usePromptMessages(): PromptMessages {
  return useMessages(PROMPT);
}

const KINDS: PromptKind[] = ["background", "character", "object", "effect", "tiles"];

/** The saved choices of a kind over its defaults (fields a newer version added keep their defaults). */
function restore(kind: PromptKind, project: Project, sub?: string): PromptChoices {
  const c = mergeChoices(defaultChoices(kind, project), project.settings.imagePrompts?.[kind]);
  if (sub && SUBTYPES[kind].includes(sub)) c.sub = sub;
  if (!SUBTYPES[kind].includes(c.sub)) c.sub = SUBTYPES[kind][0]!;
  if (!project.levels.some((l) => l.id === c.levelId)) c.levelId = project.levels[0]?.id ?? "";
  return c;
}

/** A "?" that explains a checkbox, by hover and by keyboard focus. */
function Help({ text, label }: { text: string; label: string }) {
  const id = useId();
  return (
    <>
      <button type="button" className="wm-help" data-tip={text} aria-label={label} aria-describedby={id}>
        ?
      </button>
      <span id={id} className="wm-sr">
        {text}
      </span>
    </>
  );
}

function CopyBox({ label, text, t }: { label: string; text: string; t: PromptMessages }) {
  const [copied, setCopied] = useState(false);
  const pre = useRef<HTMLPreElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // no clipboard: select the text so the user copies it
      const sel = window.getSelection();
      if (sel && pre.current) {
        sel.removeAllRanges();
        const r = document.createRange();
        r.selectNodeContents(pre.current);
        sel.addRange(r);
      }
    }
  };
  return (
    <div className="wm-prompt-out">
      <div className="wm-row">
        <span className="wm-field-label">{label}</span>
        <Capsule size="sm" onClick={() => void copy()} aria-label={`${t.copy}: ${label}`}>
          <IconCopy /> {copied ? t.copied : t.copy}
        </Capsule>
      </div>
      <pre ref={pre} className="wm-tree-pre wm-mono wm-prompt" aria-label={label}>
        {text}
      </pre>
    </div>
  );
}

export function PromptDialog({ store, project, kind: startKind, sub: startSub, onClose }: { store: EditorStore; project: Project; kind: PromptKind; sub?: string; onClose: () => void }) {
  const t = usePromptMessages();
  const [all, setAll] = useState<Partial<Record<PromptKind, PromptChoices>>>(() => ({ [startKind]: restore(startKind, project, startSub) }));
  const [kind, setKind] = useState<PromptKind>(startKind);
  const c = all[kind] ?? restore(kind, project);
  const set = (patch: Partial<PromptChoices>) => setAll((a) => ({ ...a, [kind]: { ...c, ...patch } }));
  const result = useMemo(() => buildPrompts(c, project), [c, project]);
  const subs = t.subs[kind] as Record<string, string>;
  const flags = t.flags[kind] as Record<string, string[]>;
  const role = (kind === "character" ? c.sub : "hero") as CharacterRole;

  const close = () => {
    // keep the choices with the game (one undo step, only when something changed)
    const saved = project.settings.imagePrompts ?? {};
    const changed = Object.entries(all).filter(([k, v]) => JSON.stringify(saved[k]) !== JSON.stringify(v));
    if (changed.length) {
      store.editProject(t.title, (cur) => {
        cur.settings.imagePrompts = { ...(cur.settings.imagePrompts ?? {}), ...Object.fromEntries(changed.map(([k, v]) => [k, JSON.parse(JSON.stringify(v)) as Record<string, unknown>])) };
      });
    }
    onClose();
  };

  const toggle = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

  return (
    <div className="wm-picture-back" role="presentation" onPointerDown={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === "Escape" && close()}>
      <div className="wm-picture wm-card wm-promptdlg" role="dialog" aria-modal="true" aria-label={t.title}>
        <h2 className="wm-wizard-q">{t.title}</h2>
        <p className="wm-dim wm-small">{t.lead}</p>

        <Segmented label={t.kindQ} value={kind} options={KINDS.map((k) => ({ value: k, label: t.kinds[k] }))} onChange={(k) => {
            setAll((a) => ({ ...a, [k]: a[k] ?? restore(k, project) }));
            setKind(k);
          }}
        />

        <div className="wm-prompt-grid">
          {SUBTYPES[kind].length > 1 && (
            <Field label={t.subQ}>
              <select
                className="wm-input"
                value={c.sub}
                onChange={(e) => {
                  const sub = e.target.value;
                  // a character's animations and height follow its role
                  if (kind === "character") set({ sub, anims: ANIMS[sub as CharacterRole].map((a) => a.name), height: DEFAULT_HEIGHT[sub as CharacterRole] });
                  else set({ sub });
                }}
              >
                {SUBTYPES[kind].map((s) => (
                  <option key={s} value={s}>
                    {subs[s]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {kind === "background" && project.levels.length > 1 && (
            <Field label={t.level}>
              <select className="wm-input" value={c.levelId} onChange={(e) => set({ levelId: e.target.value })}>
                {project.levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {kind === "character" && (
            <Field label={t.height} hint={t.heightHelp}>
              <input className="wm-input" type="number" min={16} max={224} value={c.height} onChange={(e) => set({ height: Math.max(16, Math.min(224, Number(e.target.value) || DEFAULT_HEIGHT[role])) })} />
            </Field>
          )}
          {(kind === "object" || kind === "effect") && (
            <>
              <Field label={`${t.cells} (↔)`}>
                <input className="wm-input" type="number" min={1} max={16} value={c.cellsW} onChange={(e) => set({ cellsW: Math.max(1, Math.min(16, Number(e.target.value) || 1)) })} />
              </Field>
              <Field label={`${t.cells} (↕)`}>
                <input className="wm-input" type="number" min={1} max={14} value={c.cellsH} onChange={(e) => set({ cellsH: Math.max(1, Math.min(14, Number(e.target.value) || 1)) })} />
              </Field>
              {c.flags.includes("animated") && (
                <Field label={t.frames}>
                  <input className="wm-input" type="number" min={1} max={16} value={c.frames} onChange={(e) => set({ frames: Math.max(1, Math.min(16, Number(e.target.value) || 1)) })} />
                </Field>
              )}
            </>
          )}
        </div>

        <Field label={t.description}>
          <textarea className="wm-input wm-prompt-desc" rows={4} placeholder={t.descriptionPh} value={c.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>

        <fieldset className="wm-prompt-flags">
          <legend className="wm-field-label">{t.options}</legend>
          {FLAGS[kind].map((f) => (
            <span key={f.id} className="wm-prompt-flag">
              <label className="wm-small">
                <input type="checkbox" checked={c.flags.includes(f.id)} onChange={(e) => set({ flags: toggle(c.flags, f.id, e.target.checked) })} /> {flags[f.id]?.[0] ?? f.id}
              </label>
              <Help text={flags[f.id]?.[1] ?? ""} label={`${t.help}: ${flags[f.id]?.[0] ?? f.id}`} />
            </span>
          ))}
        </fieldset>

        {kind === "character" && (
          <fieldset className="wm-prompt-flags">
            <legend className="wm-field-label">
              {t.anims} <Help text={t.animsHelp} label={`${t.help}: ${t.anims}`} />
            </legend>
            {ANIMS[role].map((a) => (
              <label key={a.name} className="wm-small wm-mono">
                <input type="checkbox" checked={c.anims.includes(a.name)} onChange={(e) => set({ anims: toggle(c.anims, a.name, e.target.checked) })} /> {a.name} ({a.frames})
              </label>
            ))}
          </fieldset>
        )}

        <div className="wm-prompt-grid">
          <Field label={t.location}>
            <input className="wm-input" placeholder={t.locationPh} value={c.location} onChange={(e) => set({ location: e.target.value })} />
          </Field>
          <Field label={t.time}>
            <select className="wm-input" value={c.time} onChange={(e) => set({ time: e.target.value as PromptChoices["time"] })}>
              {(Object.keys(t.times) as (keyof PromptMessages["times"])[]).map((k) => (
                <option key={k} value={k}>
                  {t.times[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.weather}>
            <input className="wm-input" placeholder={t.weatherPh} value={c.weather} onChange={(e) => set({ weather: e.target.value })} />
          </Field>
          <Field label={t.palette}>
            <input className="wm-input" placeholder={t.palettePh} value={c.palette} onChange={(e) => set({ palette: e.target.value })} />
          </Field>
        </div>
        <Field label={t.style} hint={t.styleNote}>
          <input className="wm-input" placeholder={t.stylePh} value={c.style} onChange={(e) => set({ style: e.target.value })} />
        </Field>
        <Field label={t.quality}>
          <select className="wm-input" value={c.quality} onChange={(e) => set({ quality: e.target.value as PromptChoices["quality"] })}>
            <option value="native">{t.qualities.native}</option>
            <option value="blocky">{t.qualities.blocky}</option>
          </select>
        </Field>
        {kind === "background" && (
          <Capsule size="sm" className="wm-self-start" onClick={() => set({ ...EXAMPLE, flags: [...EXAMPLE.flags] })}>
            {t.example}
          </Capsule>
        )}

        <h3 className="wm-field-label">{t.result}</h3>
        {result.prompts.map((p, i) => (
          <CopyBox key={i} label={`${subs[c.sub] ?? p.title}${result.prompts.length > 1 ? ` ${i + 1}/${result.prompts.length}` : ""} · ${t.size(p.size.w, p.size.h)}`} text={p.text} t={t} />
        ))}
        <CopyBox label={t.negative} text={result.negative} t={t} />
        <p className="wm-note wm-small">{t.howTo[kind]}</p>
        <p className="wm-dim wm-small">{t.saved}</p>

        <div className="wm-wizard-foot">
          <Capsule size="lg" tone="primary" onClick={close}>
            {t.close}
          </Capsule>
        </div>
      </div>
    </div>
  );
}
