// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Willy Maker's template: the home screen or the IDE of one game, inside an
// error boundary (a crash shows a short note; the last autosave is safe).

import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { LangProvider, useCore, type Lang } from "../i18n";
import { loadProject, saveProject } from "../io/storage";
import { attachStarterImages } from "../io/starter";
import { newProject, type Project } from "../model";
import { Home } from "./organisms/Home";
import { Ide } from "./organisms/Ide";
import { DeviceProvider, type MakerDevice } from "./device";
import "./willy-maker.css";

// The editor and its home are their own chunk; the classic editor stays behind ?editor=classic.
const Studio = lazy(() => import("./studio/Studio").then((m) => ({ default: m.Studio })));
const GamesHome = lazy(() => import("./studio/GamesHome").then((m) => ({ default: m.GamesHome })));
type StudioStart = import("./studio/Studio").StudioStart;

export interface WillyMakerProps {
  /** The site's current language. */
  lang: Lang;
  /** The open game's id (from the address), or null for the home screen. */
  projectId?: string | null;
  /** Called when the open game changes, so the host can keep it in its address. */
  onProjectId?: (id: string | null) => void;
  /** The owner's linked go-link device, for the ROM test on it (Export tab). */
  device?: MakerDevice | null;
  /** The site's theme, and how to change it and the language (the new editor's header has both). */
  theme?: "dark" | "light";
  onLang?: (lang: Lang) => void;
  onTheme?: (theme: "dark" | "light") => void;
  /** Which editor (and home screen) the site shows: the new one (default) or the classic one. */
  editor?: "classic" | "next";
}

function storageWorks(): boolean {
  try {
    const k = "go-link.wm.probe";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function Shell({ projectId, onProjectId, lang, theme = "dark", onLang, onTheme, editor = "next" }: Omit<WillyMakerProps, "device">) {
  const t = useCore();
  const [openId, setOpenId] = useState<string | null>(projectId ?? null);
  const [project, setProject] = useState<Project | null>(null);
  const [failed, setFailed] = useState(false);
  const [storageOk] = useState(storageWorks);

  useEffect(() => setOpenId(projectId ?? null), [projectId]);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (!openId) {
      setProject(null);
      return;
    }
    const p = loadProject(openId);
    if (!p) {
      setProject(null);
      setFailed(true);
      return;
    }
    // older starter projects get their tile pictures again if they lost them
    void attachStarterImages(p).then(() => alive && setProject(p));
    return () => {
      alive = false;
    };
  }, [openId]);

  // how the new editor opens a game it has just made (its first workspace, tool and note)
  const [start, setStart] = useState<StudioStart | undefined>(undefined);
  const created = (p: Project, how: StudioStart) => {
    saveProject(p);
    open(p.id, how);
  };

  const open = (id: string | null, how?: StudioStart) => {
    setStart(how);
    setScratch(null);
    setOpenId(id);
    onProjectId?.(id);
  };

  // the demo started from the home runs on a game that is never saved
  const [scratch, setScratch] = useState<Project | null>(null);
  const loading = <p className="wm-pad wm-dim">{t.home.loading}</p>;

  if (scratch && !openId)
    return (
      <Suspense fallback={loading}>
        <Studio key={scratch.id} project={scratch} scratch lang={lang} theme={theme} onLang={onLang} onTheme={onTheme} onHome={() => open(null)} onCreated={created} start={{ demo: true }} />
      </Suspense>
    );

  if (openId && project && project.id === openId)
    return editor === "next" ? (
      <Suspense fallback={loading}>
        <Studio key={project.id} project={project} lang={lang} theme={theme} onLang={onLang} onTheme={onTheme} onHome={() => open(null)} onCreated={created} start={start} />
      </Suspense>
    ) : (
      <Ide key={project.id} project={project} onHome={() => open(null)} />
    );
  if (openId && !failed) return loading;
  return (
    <>
      {failed && (
        <p className="wm-note is-error wm-pad" role="alert">
          {t.ide.loadFailed}
        </p>
      )}
      {editor === "next" ? (
        <Suspense fallback={loading}>
          <GamesHome lang={lang} onLang={onLang} storageOk={storageOk} onOpen={open} onCreated={created} onDemo={() => setScratch(newProject({ title: "" }))} />
        </Suspense>
      ) : (
        <Home onOpen={open} storageOk={storageOk} />
      )}
    </>
  );
}

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  render() {
    return this.state.broken ? this.props.fallback : this.props.children;
  }
}

function Broken() {
  const t = useCore();
  return (
    <div className="wm-pad" role="alert">
      <h2>{t.errors.title}</h2>
      <p className="wm-dim">{t.errors.text}</p>
    </div>
  );
}

export function WillyMakerApp({ lang, device = null, ...rest }: WillyMakerProps) {
  return (
    <LangProvider value={lang}>
      <DeviceProvider value={device}>
        <div className="wm-root stage-tokens">
          <Boundary fallback={<Broken />}>
            <Shell lang={lang} {...rest} />
          </Boundary>
        </div>
      </DeviceProvider>
    </LangProvider>
  );
}
