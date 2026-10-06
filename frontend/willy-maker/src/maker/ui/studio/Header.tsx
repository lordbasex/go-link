// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The editor's header (48 px): back to the games, the brand, the game's
// title and board, the workspaces, new game and demo, the language, the
// panels, the theme, undo and redo, and Play.

import { ChevronLeft, CirclePlay, Moon, PanelLeft, PanelRight, Play, Plus, Redo2, Square, Sun, Undo2 } from "lucide-react";
import { useStudioText, type Lang } from "../../i18n";
import type { Project } from "../../model";
import { layoutOf } from "../../board/cps1";
import { MOD_PREFIX, useStudioUi, useUiState, type Workspace } from "./state";

export const WORKSPACES: readonly Workspace[] = ["level", "characters", "game", "menus", "export"];
const LANGS: readonly Lang[] = ["es", "en", "pt"];

export interface HeaderProps {
  project: Project;
  lang: Lang;
  theme: "dark" | "light";
  wide: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onHome: () => void;
  onNewGame: () => void;
  onDemo: () => void;
  onLang?: (lang: Lang) => void;
  onTheme?: (theme: "dark" | "light") => void;
  onUndo: () => void;
  onRedo: () => void;
  onPlay: () => void;
  onStop: () => void;
}

export function Header(p: HeaderProps) {
  const t = useStudioText();
  const ui = useStudioUi();
  const s = useUiState();
  const buttons = layoutOf(p.project).buttons;
  return (
    <header className="studio-header">
      <button type="button" className="btn btn-icon" aria-label={t.myGames} title={t.myGames} onClick={p.onHome}>
        <ChevronLeft size={18} />
      </button>
      <div className="studio-brand">
        Willy <span>Maker</span>
      </div>
      <div className="studio-vsep" aria-hidden="true" />
      <div className="studio-title" title={p.project.title}>
        {p.project.title}
      </div>
      {p.wide && <span className="tag tag-outline">{t.boardTag(p.project.settings.players, buttons)}</span>}
      <nav className="seg studio-workspaces" aria-label={t.workspacesLabel}>
        {WORKSPACES.map((w) => (
          <button key={w} type="button" aria-pressed={s.workspace === w} aria-current={s.workspace === w ? "page" : undefined} onClick={() => ui.set({ workspace: w, menu: null, viewMenu: false })}>
            {t.workspaces[w]}
          </button>
        ))}
      </nav>
      <div className="studio-spacer" />
      <button type="button" className="btn btn-secondary" title={t.newGame} aria-label={p.wide ? undefined : t.newGame} onClick={p.onNewGame}>
        <Plus size={16} />
        {p.wide && t.newGame}
      </button>
      <button type="button" className="btn btn-secondary" title={t.demo} aria-label={p.wide ? undefined : t.demo} onClick={p.onDemo}>
        <CirclePlay size={16} />
        {p.wide && t.demo}
      </button>
      <div className="seg studio-langs" role="group" aria-label={t.language}>
        {LANGS.map((l) => (
          <button key={l} type="button" lang={l} title={t.langNames[l]} aria-pressed={p.lang === l} onClick={() => p.onLang?.(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="studio-pair">
        <button type="button" className={`btn btn-icon studio-panel-btn${s.leftHidden ? "" : " is-on"}`} aria-pressed={!s.leftHidden} aria-label={t.leftPanel} title={t.leftPanel} onClick={() => ui.set({ leftHidden: !s.leftHidden })}>
          <PanelLeft size={16} />
        </button>
        <button type="button" className={`btn btn-icon studio-panel-btn${s.rightHidden ? "" : " is-on"}`} aria-pressed={!s.rightHidden} aria-label={t.rightPanel} title={t.rightPanel} onClick={() => ui.set({ rightHidden: !s.rightHidden })}>
          <PanelRight size={16} />
        </button>
      </div>
      <button type="button" className="btn btn-icon btn-secondary" aria-label={t.theme} title={t.theme} onClick={() => p.onTheme?.(p.theme === "light" ? "dark" : "light")}>
        {p.theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
      </button>
      <div className="studio-vsep" aria-hidden="true" />
      <div className="studio-pair is-wide">
        <button type="button" className="btn btn-icon btn-secondary" aria-label={t.undo(MOD_PREFIX)} title={t.undo(MOD_PREFIX)} disabled={!p.canUndo} onClick={p.onUndo}>
          <Undo2 size={16} />
        </button>
        <button type="button" className="btn btn-icon btn-secondary" aria-label={t.redo(MOD_PREFIX)} title={t.redo(MOD_PREFIX)} disabled={!p.canRedo} onClick={p.onRedo}>
          <Redo2 size={16} />
        </button>
      </div>
      {s.playing ? (
        <button type="button" className="btn btn-primary studio-play" onClick={p.onStop}>
          <Square size={16} fill="currentColor" />
          {t.stop}
        </button>
      ) : (
        <button type="button" className="btn btn-primary studio-play" onClick={p.onPlay}>
          <Play size={16} fill="currentColor" />
          {t.play}
        </button>
      )}
    </header>
  );
}
