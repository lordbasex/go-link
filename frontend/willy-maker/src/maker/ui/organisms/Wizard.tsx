// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The new game wizard: the genre (only the platform shooter has an engine
// today; the rest are listed as coming soon), board and layout plus a
// starting point, then name and players, then the first level.

import { useEffect, useMemo, useRef, useState } from "react";
import { BEATEMUP_RULES, LIGHTGUN_RULES, MAZE_RULES, PUZZLE_RULES, QUIZ_RULES, RACING_RULES, SPORTS_RULES, VERSUS_RULES, PLATFORMER_RULES, SHIP_RULES, TOPDOWN_RULES, VERTICAL_RULES } from "../../engine/rules";
import { shapeArenaLevel, shapeFieldLevel, shapePuzzleLevel, shapeTrackLevel } from "../../editor/puzzleLevel";
import { useGameText } from "../../game/texts";
import { defaultWalk } from "../../model";
import { useCore } from "../../i18n";
import { DEFAULT_GENRE, GENRES, genreAvailable, InputError, inputErrorText, newProject, objectLayer, type GenreId, type LayoutId, type Level, type Project } from "../../model";
import { projectFromTemplate, addStarterTilesets, type TemplateId } from "../../templates";
import { buenosAiresLevel } from "../../templates/buenosAires";
import { attachStarterImages } from "../../io/starter";
import { putAsset } from "../../io/assets";
import { decodeImage, encodePng } from "../../sprites/image";
import { clearLevelArt, preparePicture, setPicture as setPictureInto } from "../../editor/pictureImport";
import type { Rgba } from "../../editor/picture";
import { levelFromTiled } from "../../io/tiled";
import { drawLevel, paletteFrom } from "../render";
import { useStarterImages } from "../useTileImages";
import { Capsule, Card, Eyebrow, Field, Segmented, SoonBadge } from "../atoms";

type Start = TemplateId | "tiled" | "picture";

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

/** Genre, board and start, name and players, the first level. */
const STEPS = 4;

/** Tiled maps bigger than this are refused before they are read. */
const MAX_MAP_BYTES = 16 * 1024 * 1024;

export function Wizard({ onCreated }: { onCreated: (p: Project) => void }) {
  const t = useCore();
  const gt = useGameText();
  const [step, setStep] = useState(1);
  const [genre, setGenre] = useState<GenreId>(DEFAULT_GENRE);
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
  const pictureRef = useRef<HTMLInputElement>(null);
  const [picture, setPicture] = useState<{ name: string; rgba: Rgba } | null>(null);
  const [pictureError, setPictureError] = useState(false);
  const baPreview = useMemo(() => buenosAiresLevel(1), []);
  const emptyPreview = useMemo(() => projectFromTemplate("empty", { title: "", layout: "slammast", players: 1, screens: 1 }).levels[0]!, []);

  const reset = () => {
    setStep(1);
    setGenre(DEFAULT_GENRE);
    setTitle("");
    setAuthor("");
    setLevelName("");
    setTiled(null);
    setTiledError(null);
    setPicture(null);
    setPictureError(false);
  };

  const pickPicture = async (f: File) => {
    setPictureError(false);
    try {
      const rgba = await decodeImage(new Uint8Array(await f.arrayBuffer()), f.type || "image/png");
      setPicture({ name: f.name, rgba });
      setStart("picture");
    } catch {
      setPicture(null);
      setPictureError(true);
    }
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
    } else if (start === "picture" && picture) {
      // a game from a picture: an empty level as wide as the picture, nothing drawn, the picture as the play layer
      p = projectFromTemplate("empty", { title: name, author, layout, players, levelName: levelName.trim() || t.wizard.levelNamePh, screens: 1, height });
      const level = p.levels[0]!;
      clearLevelArt(level);
      const prepared = preparePicture(level, picture.rgba, { layer: "play", height, x: 0, repeat: false, grow: true }, null);
      const ts = prepared.fit.tileset;
      setPictureInto(p, prepared, await putAsset(await encodePng(ts.w, ts.h, ts.data), "image/png"));
      const exit = objectLayer(level).items.find((o) => o.type === "exit");
      if (exit) exit.x = Math.max(exit.x, level.size.w - 64);
    } else p = projectFromTemplate(start === "tiled" || start === "picture" ? "empty" : start, { title: name, author, layout, players, levelName: levelName.trim() || t.wizard.levelNamePh, screens, height });
    p.genre = genre;
    // a platformer starts with its own rules (no weapons, stomping), changeable in the Rules card
    if (genre === "platformer") p.settings.rules = { ...(p.settings.rules ?? {}), ...PLATFORMER_RULES };
    // a beat 'em up walks a street in depth: its rules, and a band over each level's floor
    // a light gun game: crosshairs, a camera that moves by itself and holds at camera locks
    if (genre === "light-gun") p.settings.rules = { ...(p.settings.rules ?? {}), ...LIGHTGUN_RULES };
    // a horizontal shooter: ships over a level the camera scrolls by itself
    if (genre === "horizontal-shooter") p.settings.rules = { ...(p.settings.rules ?? {}), ...SHIP_RULES };
    // a vertical shooter: the same ships, climbing the level from its bottom
    if (genre === "vertical-shooter") p.settings.rules = { ...(p.settings.rules ?? {}), ...VERTICAL_RULES };
    // a top-down run and gun: seen from above, walking and shooting in 8 directions
    if (genre === "top-down-shooter") p.settings.rules = { ...(p.settings.rules ?? {}), ...TOPDOWN_RULES };
    // a maze game: grid moves, dots in every empty cell, chasers
    if (genre === "maze") p.settings.rules = { ...(p.settings.rules ?? {}), ...MAZE_RULES };
    // a racing game: cars on a ring track seen from above
    if (genre === "racing") {
      p.settings.rules = { ...(p.settings.rules ?? {}), ...RACING_RULES };
      for (const level of p.levels) shapeTrackLevel(level);
    }
    // a sports game: football on a field with a goal at each end
    if (genre === "sports") {
      p.settings.rules = { ...(p.settings.rules ?? {}), ...SPORTS_RULES };
      for (const level of p.levels) shapeFieldLevel(level);
    }
    // a versus fighting game: two fighters on a one-screen floor
    if (genre === "versus-fighting") {
      p.settings.rules = { ...(p.settings.rules ?? {}), ...VERSUS_RULES };
      for (const level of p.levels) shapeArenaLevel(level);
    }
    // a quiz game: questions on the screen, a few samples in the editor's language to start from
    if (genre === "quiz-party") {
      p.settings.rules = { ...(p.settings.rules ?? {}), ...QUIZ_RULES };
      p.quiz = gt.quiz.samples.map((q) => ({ ...q, a: [...q.a] as [string, string, string] }));
      for (const level of p.levels) shapePuzzleLevel(level, true);
    }
    // a puzzle game: a well of falling gems per player, framed by the level's walls
    if (genre === "puzzle") {
      p.settings.rules = { ...(p.settings.rules ?? {}), ...PUZZLE_RULES };
      for (const level of p.levels) shapePuzzleLevel(level);
    }
    if (genre === "beat-em-up") {
      p.settings.rules = { ...(p.settings.rules ?? {}), ...BEATEMUP_RULES };
      for (const level of p.levels) level.walk = defaultWalk(level);
    }
    await attachStarterImages(p);
    setBusy(false);
    reset();
    onCreated(p);
  };

  const canNext = step === 1 ? genreAvailable(genre) : step !== 2 || (start === "tiled" ? !!tiled : start === "picture" ? !!picture : true);

  return (
    <Card className="wm-wizard">
      <div className="wm-wizard-head">
        <Eyebrow accent>
          {t.wizard.title} · {t.wizard.step(step, STEPS)}
        </Eyebrow>
        <span className="wm-steps" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => (
            <i key={n} className={n <= step ? "is-on" : ""} />
          ))}
        </span>
      </div>

      {step === 1 && (
        <>
          <h2 className="wm-wizard-q">{t.wizard.genreQ}</h2>
          <p className="wm-lead">{t.wizard.genreHint}</p>
          <div className="wm-genres" role="radiogroup" aria-label={t.wizard.genreQ}>
            {GENRES.map((id) => {
              const ready = genreAvailable(id);
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={genre === id}
                  disabled={!ready}
                  className={`wm-choice${genre === id ? " is-on" : ""}${ready ? "" : " is-soon"}`}
                  onClick={() => setGenre(id)}
                >
                  <span className="wm-choice-head">
                    <b>{t.genres[id].name}</b>
                    {ready ? <span className="wm-chip is-on">{t.wizard.available}</span> : <SoonBadge label={t.support.soon} tip={false} />}
                  </span>
                  <span className="wm-dim">{t.genres[id].text}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {step === 2 && (
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
          <button
            type="button"
            role="radio"
            aria-checked={start === "picture"}
            className={`wm-choice is-art${start === "picture" ? " is-on" : ""}`}
            onClick={() => {
              setStart("picture");
              if (!picture) pictureRef.current?.click();
            }}
          >
            <span className="wm-template-art is-upload" aria-hidden="true">
              ▣
            </span>
            <b>{t.wizard.templatePicture}</b>
            <span className="wm-dim">{picture ? t.wizard.picturePicked(picture.name, picture.rgba.w, picture.rgba.h) : t.wizard.templatePictureText}</span>
          </button>
          </div>
          <input
            ref={pictureRef}
            type="file"
            accept="image/*"
            hidden
            aria-label={t.wizard.pickPicture}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void pickPicture(f);
            }}
          />
          {pictureError && (
            <p className="wm-note is-error" role="alert">
              {t.wizard.pictureError}
            </p>
          )}
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

      {step === 3 && (
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

      {step === 4 && (
        <>
          <h2 className="wm-wizard-q">{t.wizard.levelQ}</h2>
          {start === "buenos-aires" && <p className="wm-lead">{t.wizard.templateSize}</p>}
          {start === "tiled" && tiled && (
            <p className="wm-lead">
              {t.wizard.tiledPicked(tiled.name)} · {tiled.level.size.w} × {tiled.level.size.h} px
            </p>
          )}
          {start === "picture" && picture && (
            <>
              <p className="wm-lead">
                {t.wizard.picturePicked(picture.name, picture.rgba.w, picture.rgba.h)} · {t.wizard.pictureLevel}
              </p>
              <Field label={t.wizard.levelName}>
                <input className="wm-input" value={levelName} maxLength={60} placeholder={t.wizard.levelNamePh} onChange={(e) => setLevelName(e.target.value)} autoFocus />
              </Field>
              <Field label={t.wizard.height}>
                <Segmented label={t.wizard.height} value={height} options={[224, 448, 672].map((px) => ({ value: px, label: t.wizard.heightN(px, px / 224) }))} onChange={setHeight} />
              </Field>
            </>
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
        {step < STEPS ? (
          <Capsule size="lg" tone="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
            {step === 1 ? t.wizard.next0 : step === 2 ? t.wizard.next1 : t.wizard.next2} →
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
