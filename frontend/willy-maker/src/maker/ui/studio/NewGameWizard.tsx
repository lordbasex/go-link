// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The new game wizard, in six steps: the game's type (every genre), the
// board and its buttons, the name and players, the first level's background
// (the example, a picture of your own or nothing), the hero, and a summary.
// The steps done can be visited again; the language can change on the way.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Upload } from "lucide-react";
import { useCore, useStudioText, type Lang } from "../../i18n";
import { GENRES, genreAvailable, type GenreId, type LayoutId, type Project } from "../../model";
import { useGameText } from "../../game/texts";
import { createGame, type NewBackground } from "./newGame";
import { EXAMPLE_URL } from "./example";
import { isImageFile } from "./background";
import { boardOf } from "../../board/cps1";

const LANGS: readonly Lang[] = ["es", "en", "pt"];

export interface NewGameWizardProps {
  lang: Lang;
  onLang?: (lang: Lang) => void;
  onCancel: () => void;
  /** The made project; `characters` when the hero is to come from a sprite sheet. */
  onCreated: (p: Project, opts: { characters: boolean; drawFloor: boolean }) => void;
  onDemo: () => void;
}

type BgChoice = "example" | "upload" | "empty";

export function NewGameWizard({ lang, onLang, onCancel, onCreated, onDemo }: NewGameWizardProps) {
  const t = useStudioText();
  const w = t.wizard;
  const core = useCore();
  const gt = useGameText();
  const [step, setStep] = useState(0);
  const [genre, setGenre] = useState<GenreId>("platform-shooter");
  const [layout, setLayout] = useState<LayoutId>("slammast");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [players, setPlayers] = useState(1);
  const [bg, setBg] = useState<BgChoice>("example");
  const [upload, setUpload] = useState<{ file: File; url: string } | null>(null);
  const [autoZones, setAutoZones] = useState(true);
  const [hero, setHero] = useState<number | "sheet">(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const total = w.steps.length;
  const last = step === total - 1;

  useEffect(() => () => void (upload && URL.revokeObjectURL(upload.url)), [upload]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onCancel]);

  const canNext = step !== 3 || bg !== "upload" || !!upload;
  const background = useMemo<NewBackground>(() => (bg === "example" ? { kind: "example", autoZones } : bg === "upload" && upload ? { kind: "upload", file: upload.file } : { kind: "empty" }), [bg, autoZones, upload]);

  const create = async () => {
    setBusy(true);
    setError(false);
    try {
      const p = await createGame(
        { genre, layout, title, author, players, background, heroVariant: hero === "sheet" ? 0 : hero },
        { untitled: w.untitled, levelName: w.levelName, groups: t.exampleGroups, quizSamples: gt.quiz.samples },
      );
      onCreated(p, { characters: hero === "sheet", drawFloor: bg === "upload" || (bg === "example" && !autoZones) });
    } catch {
      setError(true);
      setBusy(false);
    }
  };

  const pick = (on: boolean) => `studio-wiz-card${on ? " is-on" : ""}`;
  const st = w.steps[step]!;
  const heroName = hero === "sheet" ? w.heroes.upload : hero === 0 ? w.heroes.willy : w.heroes.recruit(hero);
  const bgSummary = bg === "example" ? (autoZones ? w.bgSummary.marked : w.bgSummary.example) : bg === "upload" ? (upload?.file.name ?? w.bgSummary.upload) : w.bgSummary.empty;

  return (
    <div className="mdn-backdrop studio-wiz-back" role="presentation">
      <div className="studio-wiz" role="dialog" aria-modal="true" aria-labelledby="studio-wiz-title">
        <div className="studio-wiz-side">
          <div className="studio-brand">
            Willy <span>Maker</span>
          </div>
          <div className="studio-wiz-heading">{w.heading}</div>
          <ol className="studio-wiz-steps">
            {w.steps.map((s, i) => (
              <li key={i}>
                <button type="button" disabled={i > step} aria-current={i === step ? "step" : undefined} className={i === step ? "is-on" : i < step ? "is-done" : undefined} onClick={() => setStep(i)}>
                  <span className="studio-wiz-badge" aria-hidden="true">
                    {i < step ? <Check size={12} strokeWidth={3} /> : i + 1}
                  </span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
          <div className="studio-spacer" />
          <div className="studio-wiz-foot">
            <span className="studio-muted">{w.firstTime}</span>
            <div className="seg" role="group" aria-label={t.language}>
              {LANGS.map((l) => (
                <button key={l} type="button" lang={l} title={t.langNames[l]} aria-pressed={lang === l} onClick={() => onLang?.(l)}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-secondary" onClick={onDemo}>
              {w.watchDemo}
            </button>
          </div>
        </div>

        <div className="studio-wiz-main">
          <div className="studio-wiz-body">
            <div className="studio-wiz-titles">
              <div className="studio-dialog-kicker">{w.stepOf(step + 1, total)}</div>
              <h2 id="studio-wiz-title" className="studio-wiz-title">
                {st.title}
              </h2>
              <p className="studio-wiz-lead">{st.lead}</p>
            </div>

            {step === 0 && (
              <div className="studio-wiz-grid is-types" role="radiogroup" aria-label={st.title}>
                {GENRES.map((id) => {
                  const ok = genreAvailable(id);
                  return (
                    <button key={id} type="button" role="radio" aria-checked={genre === id} disabled={!ok} className={pick(genre === id)} onClick={() => setGenre(id)}>
                      <span className="studio-wiz-card-head">
                        <span className="studio-wiz-card-name">{core.genres[id].name}</span>
                        <span className={`studio-wiz-tag${ok ? " is-ok" : ""}`}>{ok ? w.available : w.soon}</span>
                      </span>
                      <span className="studio-wiz-card-desc">{core.genres[id].text}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 1 && (
              <>
                <div className="studio-wiz-grid is-3" role="radiogroup" aria-label={st.title}>
                  {(["cps1", "neogeo", "more"] as const).map((id) => (
                    <button key={id} type="button" role="radio" aria-checked={id === "cps1"} disabled={id !== "cps1"} className={`${pick(id === "cps1")} is-tall`}>
                      <span className="studio-wiz-card-head">
                        <span className="studio-wiz-card-name is-big">{w.boardNames[id]}</span>
                        <span className={`studio-wiz-tag${id === "cps1" ? " is-ok" : ""}`}>{id === "cps1" ? w.available : w.soon}</span>
                      </span>
                      {w.boards[id].map((line) => (
                        <span key={line} className="studio-wiz-card-desc tabular">
                          {line}
                        </span>
                      ))}
                    </button>
                  ))}
                </div>
                <div className="mdn-kicker">{w.buttonsLabel}</div>
                <div className="studio-wiz-grid is-2" role="radiogroup" aria-label={w.buttonsLabel}>
                  {(["slammast", "captcomm"] as const).map((id) => {
                    const b = id === "slammast" ? w.buttons.three : w.buttons.two;
                    return (
                      <button key={id} type="button" role="radio" aria-checked={layout === id} className={pick(layout === id)} onClick={() => setLayout(id)}>
                        <span className="studio-wiz-card-name">{b.name}</span>
                        <span className="studio-wiz-card-desc">{b.desc}</span>
                      </button>
                    );
                  })}
                </div>
                <BoardSpec spec={w.spec} layout={layout} />
              </>
            )}

            {step === 2 && (
              <div className="studio-wiz-form">
                <label>
                  {w.titleLabel}
                  <input className="input is-big" value={title} placeholder={w.titlePlaceholder} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label>
                  {w.authorLabel}
                  <input className="input is-big" value={author} onChange={(e) => setAuthor(e.target.value)} />
                </label>
                <div className="studio-wiz-field">
                  <span>{w.playersLabel}</span>
                  <div className="seg studio-wiz-players" role="radiogroup" aria-label={w.playersLabel}>
                    {[1, 2, 3, 4].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={players === n} aria-pressed={players === n} onClick={() => setPlayers(n)}>
                        {w.players(n)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <>
                <div className="studio-wiz-grid is-3" role="radiogroup" aria-label={st.title}>
                  <button type="button" role="radio" aria-checked={bg === "example"} className={pick(bg === "example")} onClick={() => setBg("example")}>
                    <span className="studio-wiz-thumb" style={{ backgroundImage: `url(${EXAMPLE_URL})` }} aria-hidden="true" />
                    <span className="studio-wiz-card-name">{w.backgrounds.example.name}</span>
                    <span className="studio-wiz-card-desc">{w.backgrounds.example.desc}</span>
                  </button>
                  <button type="button" role="radio" aria-checked={bg === "upload"} className={pick(bg === "upload")} onClick={() => file.current?.click()}>
                    <span className={`studio-wiz-thumb${upload ? "" : " is-blank"}`} style={upload ? { backgroundImage: `url(${upload.url})` } : undefined} aria-hidden="true" />
                    <span className="studio-wiz-card-name">{upload ? upload.file.name : w.backgrounds.upload.name}</span>
                    <span className="studio-wiz-card-desc">{upload ? w.backgrounds.upload.change : w.backgrounds.upload.desc}</span>
                  </button>
                  <button type="button" role="radio" aria-checked={bg === "empty"} className={pick(bg === "empty")} onClick={() => setBg("empty")}>
                    <span className="studio-wiz-thumb is-empty" aria-hidden="true" />
                    <span className="studio-wiz-card-name">{w.backgrounds.empty.name}</span>
                    <span className="studio-wiz-card-desc">{w.backgrounds.empty.desc}</span>
                  </button>
                </div>
                {bg === "example" && (
                  <label className="studio-check is-inline">
                    <input type="checkbox" checked={autoZones} onChange={() => setAutoZones((v) => !v)} />
                    {w.autoZones}
                  </label>
                )}
                <input
                  ref={file}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f || !isImageFile(f)) return;
                    setUpload({ file: f, url: URL.createObjectURL(f) });
                    setBg("upload");
                  }}
                />
              </>
            )}

            {step === 4 && (
              <div className="studio-wiz-grid is-heroes" role="radiogroup" aria-label={st.title}>
                {[0, 1, 2, 3].map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={hero === v} className={pick(hero === v)} onClick={() => setHero(v)}>
                    <span className="studio-wiz-hero" aria-hidden="true">
                      <span className={`studio-wiz-hero-body is-shirt-${v}`} />
                    </span>
                    <span className="studio-wiz-card-name">{v === 0 ? w.heroes.willy : w.heroes.recruit(v)}</span>
                    <span className="studio-wiz-card-desc">{w.heroes.meta}</span>
                  </button>
                ))}
                <button type="button" role="radio" aria-checked={hero === "sheet"} className={`${pick(hero === "sheet")} is-dashed`} onClick={() => setHero("sheet")}>
                  <span className="studio-wiz-hero" aria-hidden="true">
                    <Upload size={28} />
                  </span>
                  <span className="studio-wiz-card-name">{w.heroes.upload}</span>
                  <span className="studio-wiz-card-desc">{w.heroes.uploadMeta}</span>
                </button>
              </div>
            )}

            {step === 5 && (
              <div className="studio-wiz-summary">
                <dl>
                  {(
                    [
                      [w.summary.type, core.genres[genre].name],
                      [w.summary.board, w.boardSummary(layout === "slammast" ? 3 : 2)],
                      [w.summary.title, title.trim() || w.untitled],
                      [w.summary.players, String(players)],
                      [w.summary.background, bgSummary],
                      [w.summary.hero, heroName],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="studio-wiz-after">
                  <span className="mdn-kicker">{w.afterTitle}</span>
                  <ol>
                    {w.after.map((a, i) => (
                      <li key={i}>
                        <span className="studio-wiz-badge is-ink" aria-hidden="true">
                          {i + 1}
                        </span>
                        <span>
                          <b>{a.t}</b> {i === 0 && bg === "example" && autoZones ? a.done : a.d}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            <div className="studio-wiz-needs">
              <span className="mdn-kicker">{w.needsTitle}</span>
              <ul>
                {st.needs.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
            {error && (
              <p className="studio-wiz-error" role="alert">
                {w.failed}
              </p>
            )}
          </div>
          <div className="studio-wiz-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              {w.cancel}
            </button>
            <span className="studio-spacer" />
            <button type="button" className="btn btn-secondary" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              {w.back}
            </button>
            <button type="button" className="btn btn-primary studio-wiz-next" disabled={!canNext || busy} onClick={() => (last ? void create() : setStep((s) => s + 1))}>
              {last ? w.create : w.next(w.steps[step + 1]!.label)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The chosen board's spec sheet: which of the family's boards a game is built for, and what it has (board/cps1.ts `hardware`). */
function BoardSpec({ spec, layout }: { spec: ReturnType<typeof useStudioText>["wizard"]["spec"]; layout: LayoutId }) {
  const b = boardOf();
  const h = b.hardware;
  const MB = 1024 * 1024;
  const seat = b.layouts.find((l) => l.id === layout) ?? b.layouts[0]!;
  const rows: [string, string][] = [
    [spec.labels.board, spec.board(h.year, h.set)],
    [spec.labels.cpu, spec.cpu(h.cpu.chip, h.cpu.mhz, h.core, h.cpu.realMhz)],
    [spec.labels.sound, spec.sound(h.soundCpu.chip, h.soundCpu.mhz, h.sound.chip, h.sound.channels, b.rom.soundBytes / MB)],
    [spec.labels.screen, spec.screen(b.screen.w, b.screen.h, b.screen.fps)],
    [spec.labels.colors, spec.colors(h.colors.onScreen, h.colors.total)],
    [spec.labels.sprites, spec.sprites(b.sprites.tile, h.spritesPerScreen, h.engineSprites)],
    [spec.labels.layers, spec.layers(b.layers.map((l) => l.tile).join(" · "))],
    [spec.labels.palettes, spec.palettes(b.palettes.sprite, b.colors.perPalette)],
    [spec.labels.memory, spec.memory(b.rom.graphicsBytes / MB, b.rom.programBytes / MB, b.rom.soundBytes / MB, h.workRamKB)],
    [spec.labels.controls, spec.controls(seat.players, seat.buttons)],
    [spec.labels.bios, spec.bios],
  ];
  return (
    <section className="studio-wiz-spec" aria-label={spec.title(b.name)}>
      <span className="mdn-kicker">{spec.title(b.name)}</span>
      <p>{spec.lead(h.year, h.set)}</p>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="studio-wiz-spec-note">{spec.note(h.cpu.mhz, h.cpu.realMhz)}</p>
    </section>
  );
}
