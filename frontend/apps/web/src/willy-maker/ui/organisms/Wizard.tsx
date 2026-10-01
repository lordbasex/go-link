// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The new game wizard: board and layout plus a starting point, then name and
// players, then the first level.

import { useEffect, useMemo, useRef, useState } from "react";
import { useCore } from "../../i18n";
import { InputError, inputErrorText, newProject, type LayoutId, type Level, type Project } from "../../model";
import { projectFromTemplate, addStarterTilesets, type TemplateId } from "../../templates";
import { buenosAiresLevel } from "../../templates/buenosAires";
import { attachStarterImages } from "../../io/starter";
import { levelFromTiled } from "../../io/tiled";
import { drawLevel, paletteFrom } from "../render";
import { useStarterImages } from "../useTileImages";
import { Capsule, Card, Eyebrow, Field, Segmented } from "../atoms";

type Start = TemplateId | "tiled";

function TemplatePreview({ level }: { level: Level }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const images = useStarterImages();
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext?.("2d");
    if (!canvas || !ctx) return;
    const zoom = canvas.width / 384;
    drawLevel(ctx, level, {
      view: { x: 0, y: level.size.h - 224, zoom, w: canvas.width, h: canvas.height },
      dpr: 1,
      palette: paletteFrom(canvas),
      images,
      showGrid: false,
      showScreen: false,
      reach: null,
      selected: null,
      hover: null,
      label: () => "",
      ledgeText: () => "",
    });
  }, [level, images]);
  return <canvas ref={ref} className="wm-template-art" width={384} height={224} aria-hidden="true" />;
}

/** Tiled maps bigger than this are refused before they are read. */
const MAX_MAP_BYTES = 16 * 1024 * 1024;

export function Wizard({ onCreated }: { onCreated: (p: Project) => void }) {
  const t = useCore();
  const [step, setStep] = useState(1);
  const [layout, setLayout] = useState<LayoutId>("slammast");
  const [start, setStart] = useState<Start>("buenos-aires");
  const [tiled, setTiled] = useState<{ name: string; level: Level } | null>(null);
  const [tiledError, setTiledError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [players, setPlayers] = useState(4);
  const [levelName, setLevelName] = useState("");
  const [screens, setScreens] = useState(4);
  const [height, setHeight] = useState(224);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const baPreview = useMemo(() => buenosAiresLevel(1), []);
  const emptyPreview = useMemo(() => projectFromTemplate("empty", { title: "", layout: "slammast", players: 1, screens: 1 }).levels[0]!, []);

  const reset = () => {
    setStep(1);
    setTitle("");
    setAuthor("");
    setLevelName("");
    setTiled(null);
    setTiledError(null);
  };

  const pickTiled = async (f: File) => {
    setTiledError(null);
    try {
      if (f.size > MAX_MAP_BYTES) throw new InputError("file.too-big", { mb: Math.round(f.size / 1048576), max: MAX_MAP_BYTES / 1048576 });
      const level = levelFromTiled(await f.text(), f.name);
      setTiled({ name: f.name, level });
      setStart("tiled");
    } catch (e) {
      setTiled(null);
      setTiledError(t.wizard.tiledError(inputErrorText(t.inputErrors, e)));
    }
  };

  const create = async () => {
    setBusy(true);
    const name = title.trim() || t.wizard.gameTitlePh;
    let p: Project;
    if (start === "tiled" && tiled) {
      p = newProject({ title: name, author, layout, players, levels: [tiled.level] });
      addStarterTilesets(p);
    } else p = projectFromTemplate(start === "tiled" ? "empty" : start, { title: name, author, layout, players, levelName: levelName.trim() || t.wizard.levelNamePh, screens, height });
    await attachStarterImages(p);
    setBusy(false);
    reset();
    onCreated(p);
  };

  const canNext = step !== 1 || start !== "tiled" || !!tiled;

  return (
    <Card className="wm-wizard">
      <div className="wm-wizard-head">
        <Eyebrow accent>
          {t.wizard.title} · {t.wizard.step(step, 3)}
        </Eyebrow>
        <span className="wm-steps" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <i key={n} className={n <= step ? "is-on" : ""} />
          ))}
        </span>
      </div>

      {step === 1 && (
        <>
          <h2 className="wm-wizard-q">{t.wizard.boardQ}</h2>
          <div className="wm-grid3" role="radiogroup" aria-label={t.wizard.boardQ}>
            <button type="button" role="radio" aria-checked="true" className="wm-choice is-on">
              <span className="wm-choice-head">
                <b>CPS-1</b>
                <span className="wm-chip is-on">{t.wizard.chosen}</span>
              </span>
              <span className="wm-mono wm-specs">
                {t.wizard.cps1Specs.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </span>
            </button>
            <button type="button" role="radio" aria-checked="false" className="wm-choice" disabled>
              <b>{t.wizard.neoGeo}</b>
              <span className="wm-dim">{t.wizard.neoGeoText}</span>
            </button>
            <button type="button" role="radio" aria-checked="false" className="wm-choice" disabled>
              <b>{t.wizard.moreBoards}</b>
              <span className="wm-dim">{t.wizard.moreBoardsText}</span>
            </button>
          </div>
          <Eyebrow>{t.wizard.layoutQ}</Eyebrow>
          <div className="wm-grid2" role="radiogroup" aria-label={t.wizard.layoutQ}>
            {(["slammast", "captcomm"] as const).map((id) => (
              <button key={id} type="button" role="radio" aria-checked={layout === id} className={`wm-choice${layout === id ? " is-on" : ""}`} onClick={() => setLayout(id)}>
                <b>{id === "slammast" ? t.wizard.slammast : t.wizard.captcomm}</b>
                <span className="wm-dim">{id === "slammast" ? t.wizard.slammastText : t.wizard.captcommText}</span>
              </button>
            ))}
          </div>
          <Eyebrow>{t.wizard.startQ}</Eyebrow>
          <div className="wm-grid3" role="radiogroup" aria-label={t.wizard.startQ}>
            <button type="button" role="radio" aria-checked={start === "buenos-aires"} className={`wm-choice is-art${start === "buenos-aires" ? " is-on" : ""}`} onClick={() => setStart("buenos-aires")}>
              <TemplatePreview level={baPreview} />
              <b>{t.wizard.templateBa}</b>
              <span className="wm-dim">{t.wizard.templateBaText}</span>
            </button>
            <button type="button" role="radio" aria-checked={start === "empty"} className={`wm-choice is-art${start === "empty" ? " is-on" : ""}`} onClick={() => setStart("empty")}>
              <TemplatePreview level={emptyPreview} />
              <b>{t.wizard.templateEmpty}</b>
              <span className="wm-dim">{t.wizard.templateEmptyText}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={start === "tiled"}
              className={`wm-choice is-art${start === "tiled" ? " is-on" : ""}`}
              onClick={() => {
                setStart("tiled");
                if (!tiled) fileRef.current?.click();
              }}
            >
              <span className="wm-template-art is-upload" aria-hidden="true">
                ⇪
              </span>
              <b>{t.wizard.templateTiled}</b>
              <span className="wm-dim">{tiled ? t.wizard.tiledPicked(tiled.name) : t.wizard.templateTiledText}</span>
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".tmj,.json,.tmx,application/json"
            hidden
            aria-label={t.wizard.pickTiled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void pickTiled(f);
            }}
          />
          {tiledError && (
            <p className="wm-note is-error" role="alert">
              {tiledError}
            </p>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <h2 className="wm-wizard-q">{t.wizard.nameQ}</h2>
          <Field label={t.wizard.gameTitle}>
            <input className="wm-input" value={title} maxLength={60} placeholder={t.wizard.gameTitlePh} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </Field>
          <Field label={t.wizard.author}>
            <input className="wm-input" value={author} maxLength={60} onChange={(e) => setAuthor(e.target.value)} />
          </Field>
          <Field label={t.wizard.players}>
            <Segmented label={t.wizard.players} value={players} options={[1, 2, 3, 4].map((n) => ({ value: n, label: t.wizard.playersN(n) }))} onChange={setPlayers} />
          </Field>
        </>
      )}

      {step === 3 && (
        <>
          <h2 className="wm-wizard-q">{t.wizard.levelQ}</h2>
          {start === "buenos-aires" && <p className="wm-lead">{t.wizard.templateSize}</p>}
          {start === "tiled" && tiled && (
            <p className="wm-lead">
              {t.wizard.tiledPicked(tiled.name)} · {tiled.level.size.w} × {tiled.level.size.h} px
            </p>
          )}
          {start === "empty" && (
            <>
              <Field label={t.wizard.levelName}>
                <input className="wm-input" value={levelName} maxLength={60} placeholder={t.wizard.levelNamePh} onChange={(e) => setLevelName(e.target.value)} autoFocus />
              </Field>
              <Field label={t.wizard.length}>
                <Segmented label={t.wizard.length} value={screens} options={[2, 4, 8, 13, 21].map((n) => ({ value: n, label: t.wizard.screens(n) }))} onChange={setScreens} />
              </Field>
              <Field label={t.wizard.height}>
                <Segmented label={t.wizard.height} value={height} options={[224, 448, 672].map((px) => ({ value: px, label: t.wizard.heightN(px, px / 224) }))} onChange={setHeight} />
              </Field>
            </>
          )}
        </>
      )}

      <div className="wm-wizard-foot">
        {step === 1 ? (
          <Capsule size="lg" onClick={reset}>
            {t.wizard.cancel}
          </Capsule>
        ) : (
          <Capsule size="lg" onClick={() => setStep(step - 1)}>
            {t.wizard.back}
          </Capsule>
        )}
        {step < 3 ? (
          <Capsule size="lg" tone="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
            {step === 1 ? t.wizard.next1 : t.wizard.next2} →
          </Capsule>
        ) : (
          <Capsule size="lg" tone="primary" disabled={busy} onClick={() => void create()}>
            {busy ? t.wizard.creating : t.wizard.create}
          </Capsule>
        )}
      </div>
    </Card>
  );
}
