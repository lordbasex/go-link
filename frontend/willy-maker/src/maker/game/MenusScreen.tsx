// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Menus tab: the seven screens (title, demo, player select, HUD,
// continue, game over, high scores), each with a live 384 x 224 preview in
// the board's 8 x 8 font, its text fields with fit checks, background,
// music slot and credits line. Every change is a command on the editor store.

import { useEffect, useRef, useState } from "react";
import { snapColor } from "../board/cps1";
import type { EditorStore } from "../editor/store";
import { ownSlot, type Project, type ValidationIssue } from "../model";
import { Capsule, Eyebrow, Segmented } from "../ui/atoms";
import { paletteFrom } from "../ui/render";
import { useProjectImages } from "../ui/useTileImages";
import { IssuesCard } from "./GameScreen";
import { MENU_FIELDS, MENU_SCREENS, MUSIC_SLOTS, backgroundOf, creditsText, menuText, screenOf, screenProblems, type MenuScreenId } from "./menus";
import { drawMenuScreen, SCREEN_H, SCREEN_W } from "./preview";
import { setCredits, setDemoLevel, setMenuBackground, setMenuCredits, setMenuMusic, setMenuText } from "./settings";
import { fill, useMenusText } from "./texts";
import "./game.css";

export interface MenusScreenProps {
  store: EditorStore;
  project: Project;
  /** The store's version: the preview redraws when it changes. */
  version: number;
  screen: MenuScreenId;
  onScreen: (id: MenuScreenId) => void;
  /** A field to focus (from a "Go to"). */
  focusField?: string | null;
  issues: ValidationIssue[];
  onGo: (target: NonNullable<ValidationIssue["target"]>) => void;
}

export function MenusScreen({ store, project, version, screen, onScreen, focusField, issues, onGo }: MenusScreenProps) {
  const m = useMenusText();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showSafe, setShowSafe] = useState(true);
  const images = useProjectImages(project);
  const scr = screenOf(project, screen);
  const bg = backgroundOf(project, screen);

  useEffect(() => {
    const canvas = canvasRef.current;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas?.getContext("2d") ?? null;
    } catch {
      ctx = null;
    }
    if (!canvas || !ctx) return;
    drawMenuScreen(ctx, project, screen, { palette: paletteFrom(canvas), images, showSafe });
  }, [project, version, screen, images, showSafe]);

  useEffect(() => {
    if (!focusField) return;
    const el = document.getElementById(`wm-menu-field-${focusField}`);
    if (el instanceof HTMLInputElement) el.focus();
  }, [focusField, screen]);

  const screenIssues = issues.filter((i) => i.target?.tab === "menus" && i.target.screen === screen);
  const problems = screenProblems(project, screen);

  return (
    <div className="wm-menus">
      <section className="wm-game-card wm-card wm-menus-main" aria-labelledby="wm-menus-title">
        <h2 id="wm-menus-title" className="wm-h is-accent">
          {m.title}
        </h2>
        <div className="wm-row is-wrap" role="tablist" aria-label={m.screensLabel}>
          {MENU_SCREENS.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={id === screen} className={`wm-cap is-sm${id === screen ? " is-on" : ""}`} onClick={() => onScreen(id)}>
              {m.screens[id]}
            </button>
          ))}
        </div>
        <div className="wm-menus-stage">
          <canvas ref={canvasRef} className="wm-menus-canvas" width={SCREEN_W} height={SCREEN_H} role="img" aria-label={fill(m.preview, { screen: m.screens[screen] })} />
        </div>
        <div className="wm-row is-wrap">
          <Capsule size="sm" on={showSafe} title={m.safeTip} onClick={() => setShowSafe((v) => !v)}>
            {m.safeArea}
          </Capsule>
          <span className="wm-dim wm-small">{m.font}</span>
        </div>
      </section>

      <div className="wm-game-col">
        <section className="wm-game-card wm-card" aria-labelledby="wm-menu-text-title">
          <h2 id="wm-menu-text-title" className="wm-h is-accent">
            {m.text} · {m.screens[screen]}
          </h2>
          {MENU_FIELDS[screen].map((f) => {
            const value = menuText(project, screen, f.id);
            const saved = typeof scr.texts?.[f.id] === "string";
            const mine = problems.filter((x) => x.field === f.id);
            const glyphs = mine.find((x) => x.kind === "glyphs");
            const overflow = mine.some((x) => x.kind === "overflow");
            const outside = mine.some((x) => x.kind === "safe");
            const id = `wm-menu-field-${f.id}`;
            const status = glyphs?.kind === "glyphs" ? fill(m.glyphs, { chars: glyphs.chars.join(" ") }) : overflow ? m.overflow : outside ? m.outside : m.fits;
            const bad = !!glyphs || overflow;
            return (
              <div key={f.id} className="wm-menus-field">
                <label className="wm-field-label" htmlFor={id}>
                  {m.fields[f.id as keyof typeof m.fields] ?? f.id}
                  {f.scale === 2 ? " · 2×" : ""}
                </label>
                <div className="wm-row">
                  <input
                    id={id}
                    className={`wm-input is-sm wm-grow${bad ? " is-bad" : ""}`}
                    value={value}
                    maxLength={48}
                    aria-describedby={`${id}-status`}
                    onChange={(e) => setMenuText(store, screen, f.id, e.target.value, m.undo.text)}
                  />
                  <span className="wm-mono wm-dim wm-small">{fill(m.count, { n: value.length, max: f.max })}</span>
                  <Capsule size="sm" title={m.resetTip} disabled={!saved} onClick={() => setMenuText(store, screen, f.id, null, m.undo.text)}>
                    {m.reset}
                  </Capsule>
                </div>
                <span id={`${id}-status`} className={`wm-small ${bad ? "wm-bad" : outside ? "wm-dim" : "wm-ok"}`}>
                  {status}
                </span>
              </div>
            );
          })}
          {screen === "attract" && (
            <label className="wm-menus-field">
              <span className="wm-field-label">{m.demoLevel}</span>
              <select className="wm-input is-sm" value={String(scr.demoLevel ?? "")} onChange={(e) => setDemoLevel(store, e.target.value, m.undo.demo)}>
                {project.levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        <section className="wm-game-card wm-card" aria-labelledby="wm-menu-look-title">
          <h2 id="wm-menu-look-title" className="wm-h">
            {m.background}
          </h2>
          <Segmented
            label={m.background}
            value={bg.kind}
            options={(["level", "solid"] as const).map((k) => ({ value: k, label: m.backgrounds[k] }))}
            onChange={(k) =>
              setMenuBackground(store, screen, k === "level" ? { kind: "level", level: project.levels[0]?.id ?? "" } : { kind: "solid", color: "#000000" }, m.undo.background)
            }
          />
          {bg.kind === "level" ? (
            <label className="wm-menus-field">
              <span className="wm-field-label">{m.level}</span>
              <select className="wm-input is-sm" value={bg.level || project.levels[0]?.id || ""} onChange={(e) => setMenuBackground(store, screen, { kind: "level", level: e.target.value }, m.undo.background)}>
                {project.levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="wm-menus-field wm-row">
              <span className="wm-field-label">{m.color}</span>
              <input
                type="color"
                className="wm-menus-color"
                value={bg.color.toLowerCase()}
                onChange={(e) => setMenuBackground(store, screen, { kind: "solid", color: snapColor(e.target.value) }, m.undo.background)}
              />
              <span className="wm-mono wm-small">{bg.color}</span>
            </label>
          )}

          <div className="wm-menus-field">
            <label className="wm-field-label" htmlFor="wm-menu-music">
              {m.music}
            </label>
            <select id="wm-menu-music" className="wm-input is-sm" aria-describedby="wm-menu-music-note" value={scr.music ?? "none"} onChange={(e) => setMenuMusic(store, screen, e.target.value, m.undo.music)}>
              {MUSIC_SLOTS.map((id) => (
                <option key={id} value={id}>
                  {m.musicSlots[id]}
                </option>
              ))}
              {(project.settings.sound?.songs ?? []).map((song) => (
                <option key={song.id} value={ownSlot(song.id)}>
                  {song.name}
                </option>
              ))}
            </select>
            <span id="wm-menu-music-note" className="wm-dim wm-small">
              {m.musicNote}
            </span>
          </div>

          <Eyebrow>{m.credits}</Eyebrow>
          <div className="wm-row">
            <Capsule size="sm" on={!!scr.credits} onClick={() => setMenuCredits(store, screen, !scr.credits, m.undo.credits)}>
              {m.showCredits}
            </Capsule>
          </div>
          <label className="wm-menus-field">
            <span className="wm-field-label">{m.creditsLine}</span>
            <input className="wm-input is-sm" id="wm-menu-field-credits" maxLength={48} value={creditsText(project)} onChange={(e) => setCredits(store, e.target.value, m.undo.credits)} />
          </label>
        </section>

        <IssuesCard issues={screenIssues} onGo={onGo} />
      </div>
    </div>
  );
}
