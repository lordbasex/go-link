// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// maker.go-link.org/ in the new editor's look: the games saved in this
// browser as cards (open, duplicate, download .zip, delete), New game (the
// new game wizard), Open .zip and Watch demo.

import { useRef, useState } from "react";
import { FolderOpen, MoreHorizontal, Play, Plus } from "lucide-react";
import { useCore, useStudioText, type Lang } from "../../i18n";
import { cloneProject, newId, type Project } from "../../model";
import { asCopy, exportProjectZip, zipName } from "../../io/projectZip";
import { deleteProject, listProjects, loadProject, saveProject, type ProjectSummary } from "../../io/storage";
import { downloadBytes } from "../download";
import { agoText, Thumb, useZipImport } from "../organisms/Home";
import { NewGameWizard } from "./NewGameWizard";
import type { StudioStart } from "./Studio";
import "../modernist.css";
import "./studio.css";

export interface GamesHomeProps {
  lang: Lang;
  onLang?: (lang: Lang) => void;
  storageOk: boolean;
  onOpen: (id: string) => void;
  /** A game the wizard made: save it and open it, with how to start. */
  onCreated: (p: Project, start: StudioStart) => void;
  onDemo: () => void;
}

function GameCard({ s, onOpen, onChanged, onError }: { s: ProjectSummary; onOpen: (id: string) => void; onChanged: () => void; onError: (text: string) => void }) {
  const t = useCore();
  const [menu, setMenu] = useState(false);
  const [asking, setAsking] = useState(false);
  const duplicate = () => {
    setMenu(false);
    const p = loadProject(s.id);
    if (!p) return;
    const saved = saveProject(asCopy(cloneProject(p), t.home.copySuffix));
    if (!saved.ok) onError(saved.reason === "full" ? t.ide.saveFull : t.ide.saveBlocked);
    onChanged();
  };
  const download = async () => {
    setMenu(false);
    const p = loadProject(s.id);
    if (p) downloadBytes(await exportProjectZip(p), zipName(p), "application/zip");
  };
  return (
    <li className="studio-game-card">
      <button type="button" className="studio-game-open" onClick={() => onOpen(s.id)}>
        <Thumb id={s.id} className="studio-game-thumb" />
        <span className="studio-game-title">{s.title}</span>
        <span className="studio-game-meta tabular">{t.home.meta(s.board.replace("cps1/", "CPS-1 · "), s.levels, agoText(t, s.updatedAt))}</span>
      </button>
      <div className="studio-game-more">
        <button type="button" className="btn btn-icon" aria-label={t.home.more(s.title)} title={t.home.more(s.title)} aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
          <MoreHorizontal size={16} />
        </button>
        {menu && (
          <div className="studio-game-menu" role="menu">
            <button type="button" role="menuitem" onClick={duplicate}>
              {t.home.duplicate}
            </button>
            <button type="button" role="menuitem" onClick={() => void download()}>
              {t.home.exportZip}
            </button>
            <button
              type="button"
              role="menuitem"
              className="is-danger"
              onClick={() => {
                setMenu(false);
                setAsking(true);
              }}
            >
              {t.home.delete}
            </button>
          </div>
        )}
      </div>
      {asking && (
        <div className="studio-game-ask" role="alert">
          <span>{t.home.deleteAsk(s.title)}</span>
          <span className="studio-home-row">
            <button type="button" className="btn btn-secondary" onClick={() => setAsking(false)}>
              {t.home.cancel}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                await deleteProject(s.id);
                onChanged();
              }}
            >
              {t.home.deleteYes}
            </button>
          </span>
        </div>
      )}
    </li>
  );
}

export function GamesHome({ lang, onLang, storageOk, onOpen, onCreated, onDemo }: GamesHomeProps) {
  const t = useCore();
  const st = useStudioText();
  const [list, setList] = useState<ProjectSummary[]>(() => listProjects());
  const [wizard, setWizard] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => setList(listProjects());
  const { importing, error, setError, conflict, setConflict, finishImport, onZip } = useZipImport(onOpen, refresh);

  return (
    <div className="mdn studio-home">
      <section className="studio-home-hero" aria-labelledby="studio-home-title">
        <span className="mdn-kicker studio-home-kicker">{t.eyebrow}</span>
        <h1 id="studio-home-title" className="studio-home-title">
          Willy <span>Maker</span>
        </h1>
        <p className="studio-home-lead">{t.intro}</p>
        <div className="studio-home-row">
          <button type="button" className="btn btn-primary" onClick={() => setWizard(true)}>
            <Plus size={16} /> {t.home.newGame}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            <FolderOpen size={16} /> {t.home.openZip}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onDemo}>
            <Play size={16} /> {st.demo}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onZip(f);
            }}
          />
        </div>
        {!storageOk && (
          <p className="studio-home-note" role="status">
            {t.home.storageBlocked}
          </p>
        )}
        {importing && (
          <p className="studio-home-note" role="status">
            {importing}
          </p>
        )}
        {error && (
          <p className="studio-home-note is-error" role="alert">
            {error}
          </p>
        )}
        {conflict && (
          <div className="studio-home-conflict" role="alertdialog" aria-labelledby="studio-conflict-title">
            <strong id="studio-conflict-title">{t.importZip.sameTitle}</strong>
            <span>{t.importZip.sameText(conflict.project.title)}</span>
            {conflict.missing.length > 0 && <span className="studio-home-dim">{t.importZip.missing(conflict.missing.length)}</span>}
            <div className="studio-home-row">
              <button type="button" className="btn btn-secondary" onClick={() => setConflict(null)}>
                {t.home.cancel}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => void finishImport(conflict, { ...conflict.project, id: newId() })}>
                {t.importZip.keepBoth}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void finishImport(conflict, conflict.project)}>
                {t.importZip.replace}
              </button>
            </div>
          </div>
        )}
      </section>
      <section className="studio-home-games" aria-labelledby="studio-home-mine">
        <h2 id="studio-home-mine" className="mdn-kicker">
          {t.home.myGames}
        </h2>
        {list.length === 0 ? (
          <p className="studio-home-dim">{t.home.empty}</p>
        ) : (
          <ul className="studio-games">
            {list.map((s) => (
              <GameCard key={s.id} s={s} onOpen={onOpen} onChanged={refresh} onError={setError} />
            ))}
          </ul>
        )}
      </section>
      {wizard && (
        <NewGameWizard
          lang={lang}
          onLang={onLang}
          onCancel={() => setWizard(false)}
          onDemo={() => {
            setWizard(false);
            onDemo();
          }}
          onCreated={(created, opts) => {
            setWizard(false);
            onCreated(created, opts.characters ? { workspace: "characters", toast: st.wizard.created } : { tool: opts.drawFloor ? "zone" : "select", toast: opts.drawFloor ? st.wizard.createdDraw : st.wizard.created });
          }}
        />
      )}
    </div>
  );
}
