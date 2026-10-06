// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The home screen: the games saved in this browser, "Open .zip", and the
// new game wizard beside them.

import { useEffect, useRef, useState } from "react";
import { useCore, type CoreMessages } from "../../i18n";
import { cloneProject, InputError, inputErrorText, newId, newProject, type Project } from "../../model";
import { putAsset } from "../../io/assets";
import { asCopy, exportProjectZip, importProjectZip, zipName, type ImportedProject } from "../../io/projectZip";
import { deleteProject, listProjects, loadProject, saveProject, type ProjectSummary } from "../../io/storage";
import { drawLevel, paletteFrom } from "../render";
import { useProjectImages } from "../useTileImages";
import { Capsule, Card, Eyebrow, IconButton, Logo } from "../atoms";
import { IconDots, IconPlus, IconUpload } from "../icons";
import { Wizard } from "./Wizard";
import { downloadBytes } from "../download";

export function agoText(t: CoreMessages, iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 60_000) return t.ago.now;
  const min = Math.floor(ms / 60_000);
  if (min < 60) return t.ago.minutes(min);
  const h = Math.floor(min / 60);
  if (h < 24) return t.ago.hours(h);
  if (h < 48) return t.ago.yesterday;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The first screen of a saved game, drawn from its level. */
export function Thumb({ id, className = "wm-thumb" }: { id: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [project] = useState(() => loadProject(id));
  const images = useProjectImages(project ?? EMPTY);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext?.("2d");
    const level = project?.levels[0];
    if (!canvas || !ctx || !level) return;
    // the first screen, where the game starts
    drawLevel(ctx, level, {
      view: { x: 0, y: Math.max(0, level.size.h - 224), zoom: canvas.width / 384, w: canvas.width, h: canvas.height },
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
  }, [project, images]);
  return <canvas ref={ref} className={className} width={224} height={130} aria-hidden="true" />;
}

const EMPTY = newProject({ title: "" });

function ProjectRow({ s, onOpen, onChanged }: { s: ProjectSummary; onOpen: (id: string) => void; onChanged: () => void }) {
  const t = useCore();
  const [menu, setMenu] = useState(false);
  const [asking, setAsking] = useState(false);
  const duplicate = () => {
    const p = loadProject(s.id);
    if (!p) return;
    const saved = saveProject(asCopy(cloneProject(p), t.home.copySuffix));
    setMenu(false);
    if (!saved.ok) window.alert(saved.reason === "full" ? t.ide.saveFull : t.ide.saveBlocked);
    onChanged();
  };
  const download = async () => {
    const p = loadProject(s.id);
    if (!p) return;
    setMenu(false);
    downloadBytes(await exportProjectZip(p), zipName(p), "application/zip");
  };
  return (
    <Card className="wm-project">
      <Thumb id={s.id} />
      <div className="wm-project-body">
        <div className="wm-project-title">{s.title}</div>
        <div className="wm-mono wm-dim">{t.home.meta(s.board.replace("cps1/", "CPS-1 · "), s.levels, agoText(t, s.updatedAt))}</div>
        {asking && (
          <div className="wm-ask" role="alert">
            <span>{t.home.deleteAsk(s.title)}</span>
            <span className="wm-row">
              <Capsule size="sm" onClick={() => setAsking(false)}>
                {t.home.cancel}
              </Capsule>
              <Capsule
                size="sm"
                tone="danger"
                onClick={async () => {
                  await deleteProject(s.id);
                  onChanged();
                }}
              >
                {t.home.deleteYes}
              </Capsule>
            </span>
          </div>
        )}
      </div>
      <Capsule onClick={() => onOpen(s.id)}>{t.home.open}</Capsule>
      <div className="wm-menu-wrap">
        <IconButton label={t.home.more(s.title)} aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
          <IconDots />
        </IconButton>
        {menu && (
          <div className="wm-menu" role="menu">
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
    </Card>
  );
}

/** A project .zip bigger than this is refused before it is read (the zip reader's own limit is 256 MB). */
const MAX_ZIP_BYTES = 256 * 1024 * 1024;

/** Opening a project .zip: reads it, asks when a game with its id is already here, saves it and opens it. */
export function useZipImport(onOpen: (id: string) => void, refresh: () => void) {
  const t = useCore();
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ImportedProject | null>(null);

  const finishImport = async (imp: ImportedProject, project: Project) => {
    for (const a of imp.assets) await putAsset(a.bytes, a.type);
    const saved = saveProject(project);
    if (!saved.ok) {
      // nothing half-saved: the list keeps what it had
      setConflict(null);
      setError(saved.reason === "full" ? t.ide.saveFull : t.ide.saveBlocked);
      return;
    }
    refresh();
    setConflict(null);
    onOpen(project.id);
  };

  const onZip = async (file: File) => {
    setError(null);
    setImporting(t.importZip.reading);
    try {
      if (file.size > MAX_ZIP_BYTES) throw new InputError("file.too-big", { mb: Math.round(file.size / 1048576), max: MAX_ZIP_BYTES / 1048576 });
      const imp = await importProjectZip(new Uint8Array(await file.arrayBuffer()));
      setImporting(null);
      if (listProjects().some((p) => p.id === imp.project.id)) setConflict(imp);
      else await finishImport(imp, imp.project);
    } catch (e) {
      setImporting(null);
      setError(t.importZip.error(inputErrorText(t.inputErrors, e)));
    }
  };

  return { importing, error, setError, conflict, setConflict, finishImport, onZip };
}

export function Home({ onOpen, storageOk }: { onOpen: (id: string) => void; storageOk: boolean }) {
  const t = useCore();
  const [list, setList] = useState<ProjectSummary[]>(() => listProjects());
  const fileRef = useRef<HTMLInputElement>(null);
  const wizardRef = useRef<HTMLDivElement>(null);
  const refresh = () => setList(listProjects());
  const { importing, error, setError, conflict, setConflict, finishImport, onZip } = useZipImport(onOpen, refresh);

  return (
    <div className="wm-home">
      <section className="wm-home-list" aria-labelledby="wm-home-title">
        <Eyebrow accent>{t.eyebrow}</Eyebrow>
        <h1 id="wm-home-title" className="wm-home-title">
          <Logo />
        </h1>
        <p className="wm-lead">{t.intro}</p>
        <div className="wm-row">
          <Capsule
            tone="primary"
            size="lg"
            onClick={() => {
              wizardRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
              wizardRef.current?.querySelector<HTMLElement>("button, input")?.focus();
            }}
          >
            <IconPlus /> {t.home.newGame}
          </Capsule>
          <Capsule size="lg" onClick={() => fileRef.current?.click()}>
            <IconUpload /> {t.home.openZip}
          </Capsule>
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
          <p className="wm-note is-warn" role="status">
            {t.home.storageBlocked}
          </p>
        )}
        {importing && <p className="wm-note" role="status">{importing}</p>}
        {error && (
          <p className="wm-note is-error" role="alert">
            {error}
          </p>
        )}
        {conflict && (
          <Card className="wm-conflict" role="alertdialog" aria-labelledby="wm-conflict-title">
            <strong id="wm-conflict-title">{t.importZip.sameTitle}</strong>
            <span>{t.importZip.sameText(conflict.project.title)}</span>
            {conflict.missing.length > 0 && <span className="wm-dim">{t.importZip.missing(conflict.missing.length)}</span>}
            <div className="wm-row">
              <Capsule onClick={() => setConflict(null)}>{t.home.cancel}</Capsule>
              <Capsule onClick={() => void finishImport(conflict, { ...conflict.project, id: newId() })}>{t.importZip.keepBoth}</Capsule>
              <Capsule tone="primary" onClick={() => void finishImport(conflict, conflict.project)}>
                {t.importZip.replace}
              </Capsule>
            </div>
          </Card>
        )}
        <Eyebrow>{t.home.myGames}</Eyebrow>
        {list.length === 0 ? (
          <p className="wm-dim">{t.home.empty}</p>
        ) : (
          <ul className="wm-projects">
            {list.map((s) => (
              <li key={s.id}>
                <ProjectRow s={s} onOpen={onOpen} onChanged={refresh} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <div ref={wizardRef} className="wm-home-wizard">
        <Wizard
          onCreated={(p) => {
            const saved = saveProject(p);
            if (!saved.ok) {
              setError(saved.reason === "full" ? t.ide.saveFull : t.ide.saveBlocked);
              return;
            }
            refresh();
            onOpen(p.id);
          }}
        />
      </div>
    </div>
  );
}
