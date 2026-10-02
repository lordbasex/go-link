// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// "Prompt for image AI" (T-29): a dialog that writes prompts for an image AI,
// for any kind of art the game needs, with what the CPS-1 board needs filled
// in (prompts/imagePrompt.ts). The choices are kept with the project.

import { useId, useMemo, useRef, useState } from "react";
import { useMessages, useWmLang } from "../../i18n";
import { useEnglish } from "../../ai/useEnglish";
import { AiTextArea } from "./AiTextArea";
import { hasBuiltInAi } from "../../ai/chromeAi";
import { promptEn, type PromptMessages } from "../../i18n/prompt.en";
import { promptEs } from "../../i18n/prompt.es";
import { promptPt } from "../../i18n/prompt.pt";
import type { CharacterRole, Project } from "../../model";
import type { EditorStore } from "../../editor/store";
import { ANIMS, DEFAULT_HEIGHT } from "../../sprites/presets";
import { buildPrompts, chatMessages, defaultChoices, EXAMPLE, FIELDS, flagApplies, FLAGS, mergeChoices, parseCustomAnim, SUBTYPES, type PromptChoices, type PromptKind } from "../../prompts/imagePrompt";
import { Capsule, Field, Segmented } from "../atoms";
import { IconCopy } from "../icons";
import { AnimPreview } from "./AnimPreview";
import { RefPictures, refPng } from "./RefPictures";
import { useSpritesText } from "../../sprites/text";

export const PROMPT = { en: promptEn, es: promptEs, pt: promptPt };

export function usePromptMessages(): PromptMessages {
  return useMessages(PROMPT);
}

/** What a description is about, in English, for Chrome's richer description. */
function whatEnglish(c: PromptChoices): string {
  return `${c.sub === "other" || c.sub === "set" ? "" : `${c.sub} `}${c.kind === "tiles" ? "tile set" : c.kind} for a side-scrolling arcade game`;
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

function CopyBox({ label, text, t, hint, primary, images = [] }: { label: string; text: string; t: PromptMessages; hint?: string; primary?: boolean; images?: string[] }) {
  // with reference pictures, each click copies the next one, then the text (a chat AI takes one pasted thing at a time)
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const pre = useRef<HTMLPreElement>(null);
  const select = () => {
    const sel = window.getSelection();
    if (sel && pre.current) {
      sel.removeAllRanges();
      const r = document.createRange();
      r.selectNodeContents(pre.current);
      sel.addRange(r);
    }
  };
  const copy = async () => {
    setFailed(false);
    try {
      if (step < images.length) {
        const png = await refPng(images[step]!);
        if (!png) throw new Error("no picture");
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        setStep(step + 1);
        return;
      }
      await navigator.clipboard.writeText(text);
      setStep(0);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setFailed(true);
      if (step >= images.length) select();
    }
  };
  const action = step < images.length ? t.copyImage(step + 1, images.length) : images.length ? t.copyText : copied ? t.copied : t.copy;
  return (
    <div className="wm-prompt-out">
      <div className="wm-row">
        <span className="wm-field-label">{label}</span>
        <Capsule size="sm" tone={primary ? "primary" : undefined} onClick={() => void copy()} aria-label={`${action}: ${label}`}>
          <IconCopy /> {copied && !images.length ? t.copied : action}
        </Capsule>
      </div>
      {images.length > 0 && (
        <p className="wm-dim wm-small" role="status">
          {copied ? t.copiedAll : step > 0 ? t.pasteNow(step, images.length) : t.copySteps(images.length)}
        </p>
      )}
      {failed && <p className="wm-note is-warn wm-small">{t.copyFailed}</p>}
      {hint && <p className="wm-dim wm-small">{hint}</p>}
      <pre ref={pre} className={`wm-tree-pre wm-mono wm-prompt${primary ? " is-all" : ""}`} aria-label={label}>
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
  // the free text in English, translated on this computer when Chrome can (ai/useEnglish.ts)
  const lang = useWmLang();
  const what = t.kinds[kind];
  const english = useEnglish({ description: c.description, location: c.location, weather: c.weather, palette: c.palette, style: c.style }, lang, {
    description: what,
    location: `${what}, ${t.location.toLowerCase()}`,
    weather: `${what}, ${t.weather.toLowerCase()}`,
    palette: `${what}, ${(kind === "background" || kind === "tiles" ? t.palette : t.colors).toLowerCase()}`,
  });
  const result = useMemo(() => buildPrompts({ ...c, ...english.values }, project), [c, english.values, project]);
  // what a translated field says in the prompt, so a wrong word ("sirena" as "mermaid") is seen in time
  const inPrompt = (k: "description" | "location" | "weather" | "palette" | "style") => {
    const en = english.values[k];
    return en && en.trim() && en.trim() !== c[k].trim() ? t.ai.inPrompt(en) : undefined;
  };
  const langNames = new Intl.DisplayNames([lang], { type: "language" });
  const subs = t.subs[kind] as Record<string, string>;
  const flags = t.flags[kind] as Record<string, string[]>;
  const role = (kind === "character" ? c.sub : "hero") as CharacterRole;
  // the animation whose example is showing (hover or keyboard focus)
  const [peek, setPeek] = useState<string | null>(null);
  const peekId = useId();
  const names = useSpritesText().animNames;
  const [newAnim, setNewAnim] = useState({ name: "", frames: 4 });
  const own = c.customAnims.map(parseCustomAnim).filter((a): a is { name: string; frames: number } => a !== null && !ANIMS[role].some((p) => p.name === a.name));

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
        {!hasBuiltInAi() && <p className="wm-dim wm-small">{t.ai.none}</p>}

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

        <div className="wm-field">
          <label className="wm-field-label" htmlFor={`${peekId}-desc`}>
            {t.description}
          </label>
          <AiTextArea id={`${peekId}-desc`} value={c.description} onChange={(description) => set({ description })} lang={lang} what={whatEnglish(c)} placeholder={t.descriptionPh} t={t.ai} />
          {inPrompt("description") && <span className="wm-field-hint wm-inprompt">{inPrompt("description")}</span>}
        </div>

        <RefPictures refs={c.refImages} onChange={(refImages) => set({ refImages })} t={t} />

        <fieldset className="wm-prompt-flags">
          <legend className="wm-field-label">{t.options}</legend>
          {FLAGS[kind].filter((f) => flagApplies(kind, c.sub, f)).map((f) => (
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
            <div className="wm-row wm-prompt-anim-all">
              <Capsule size="sm" onClick={() => set({ anims: [...ANIMS[role].map((a) => a.name), ...own.map((a) => a.name)] })}>
                {t.allAnims}
              </Capsule>
              <Capsule size="sm" onClick={() => set({ anims: [] })}>
                {t.noAnims}
              </Capsule>
              <span className="wm-dim wm-small">{t.animsChosen(c.anims.filter((n) => ANIMS[role].some((a) => a.name === n) || own.some((a) => a.name === n)).length)}</span>
            </div>
            {!c.anims.some((n) => ANIMS[role].some((a) => a.name === n) || own.some((a) => a.name === n)) && <p className="wm-note wm-small wm-prompt-anim-all">{t.noAnimsNote}</p>}
            {[...ANIMS[role].map((a) => ({ name: a.name, frames: a.frames, own: false })), ...own.map((a) => ({ ...a, own: true }))].map((a) => (
              <span key={a.name} className="wm-anim-chip" onMouseEnter={() => setPeek(a.name)} onMouseLeave={() => setPeek((x) => (x === a.name ? null : x))}>
                <label className="wm-small">
                  <input
                    type="checkbox"
                    checked={c.anims.includes(a.name)}
                    aria-describedby={peek === a.name ? `${peekId}-${a.name}` : undefined}
                    onFocus={() => setPeek(a.name)}
                    onBlur={() => setPeek((x) => (x === a.name ? null : x))}
                    onChange={(e) => set({ anims: toggle(c.anims, a.name, e.target.checked) })}
                  />{" "}
                  {names[a.name] ?? a.name} <span className="wm-mono wm-dim">{names[a.name] ? `${a.name} · ` : ""}{a.frames}</span>
                </label>
                {a.own && (
                  <button type="button" className="wm-help" aria-label={t.removeAnim(a.name)} data-tip={t.removeAnim(a.name)} onClick={() => set({ customAnims: c.customAnims.filter((x) => parseCustomAnim(x)?.name !== a.name), anims: c.anims.filter((n) => n !== a.name) })}>
                    ×
                  </button>
                )}
                {peek === a.name && (
                  <span id={`${peekId}-${a.name}`}>
                    <AnimPreview name={a.name} frames={a.frames} text={t.animDesc[a.name] ?? t.ownAnim} labels={{ example: t.animExample, shownWith: t.animShownWith, none: t.animNoExample, frames: t.animFrames }} />
                  </span>
                )}
              </span>
            ))}
            <form
              className="wm-row wm-prompt-anim-new"
              onSubmit={(e) => {
                e.preventDefault();
                const name = newAnim.name
                  .trim()
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .replace(/[^a-z0-9_]+/g, "_")
                  .replace(/^_+|_+$/g, "")
                  .slice(0, 24);
                if (!name || c.customAnims.length >= 16) return;
                const known = ANIMS[role].find((a) => a.name === name || (names[a.name] ?? "").toLowerCase() === newAnim.name.trim().toLowerCase());
                if (known) set({ anims: [...new Set([...c.anims, known.name])] });
                else
                  set({
                    customAnims: [...c.customAnims.filter((x) => parseCustomAnim(x)?.name !== name), `${name}:${Math.max(1, Math.min(16, newAnim.frames))}`],
                    anims: [...new Set([...c.anims, name])],
                  });
                setNewAnim({ name: "", frames: 4 });
              }}
            >
              <label className="wm-field wm-grow">
                <span className="wm-field-label">{t.newAnim}</span>
                <input className="wm-input" value={newAnim.name} placeholder={t.newAnimPh} onChange={(e) => setNewAnim({ ...newAnim, name: e.target.value })} />
              </label>
              <label className="wm-field">
                <span className="wm-field-label">{t.frames}</span>
                <input className="wm-input wm-prompt-num" type="number" min={1} max={16} value={newAnim.frames} onChange={(e) => setNewAnim({ ...newAnim, frames: Number(e.target.value) || 1 })} />
              </label>
              <Capsule type="submit" size="sm" disabled={!newAnim.name.trim()}>
                + {t.addAnim}
              </Capsule>
            </form>
          </fieldset>
        )}

        {FIELDS[kind].some((f) => f !== "style") && (
          <div className="wm-prompt-grid">
            {FIELDS[kind].includes("location") && (
              <Field label={t.location} hint={inPrompt("location")}>
                <input className="wm-input" placeholder={t.locationPh} value={c.location} onChange={(e) => set({ location: e.target.value })} />
              </Field>
            )}
            {FIELDS[kind].includes("time") && (
              <Field label={t.time}>
                <select className="wm-input" value={c.time} onChange={(e) => set({ time: e.target.value as PromptChoices["time"] })}>
                  {(Object.keys(t.times) as (keyof PromptMessages["times"])[]).map((k) => (
                    <option key={k} value={k}>
                      {t.times[k]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {FIELDS[kind].includes("weather") && (
              <Field label={t.weather} hint={inPrompt("weather")}>
                <input className="wm-input" placeholder={t.weatherPh} value={c.weather} onChange={(e) => set({ weather: e.target.value })} />
              </Field>
            )}
            {FIELDS[kind].includes("palette") && (
              <Field label={kind === "background" || kind === "tiles" ? t.palette : t.colors} hint={inPrompt("palette")}>
                <input className="wm-input" placeholder={t.palettePhs[kind]} value={c.palette} onChange={(e) => set({ palette: e.target.value })} />
              </Field>
            )}
          </div>
        )}
        <Field label={t.style} hint={inPrompt("style") ?? t.styleNote}>
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
        {english.state === "working" && (
          <p className="wm-dim wm-small" role="status">
            {t.ai.translating}
          </p>
        )}
        {english.state === "done" && <p className="wm-note is-ok wm-small">{t.ai.translated(english.from.map((x) => langNames.of(x) ?? x).join(", "))}</p>}
        {english.state === "needs-download" && (
          <div className="wm-note is-warn wm-small" role="note">
            <p>{t.ai.notYet}</p>
            <p>{t.ai.prepareHelp}</p>
            <Capsule size="sm" disabled={english.progress !== null} onClick={() => void english.prepare()}>
              {english.progress !== null ? t.ai.downloading(Math.round(english.progress * 100)) : t.ai.prepare}
            </Capsule>
          </div>
        )}
        {english.state === "unavailable" && (
          <p className="wm-note is-warn wm-small" role="note">
            {t.ai.untranslated}
          </p>
        )}
        <p className="wm-dim wm-small">{result.prompts.length > 1 ? t.messagesHelp(result.prompts.length) : t.allHelp}</p>
        {chatMessages(result).map((m, i) => (
          <CopyBox key={i} label={`${result.prompts.length > 1 ? t.message(i + 1, result.prompts.length) : t.all} · ${t.aspect(result.prompts[i]!.aspect)}`} text={m} t={t} primary images={i === 0 ? c.refImages : []} />
        ))}
        <details className="wm-prompt-parts">
          <summary className="wm-small">{t.parts}</summary>
          {result.prompts.map((p, i) => (
            <CopyBox key={i} label={`${subs[c.sub] ?? p.title}${result.prompts.length > 1 ? ` ${i + 1}/${result.prompts.length}` : ""} · ${t.aspect(p.aspect)}`} text={p.text} t={t} />
          ))}
          <CopyBox label={t.negative} text={result.negative} t={t} />
        </details>
        <p className="wm-dim wm-small">{t.boardNote}</p>
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
