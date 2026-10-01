// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Willy Maker's template: the home screen or the IDE of one game, inside an
// error boundary (a crash shows a short note; the last autosave is safe).

import { Component, useEffect, useState, type ReactNode } from "react";
import { LangProvider, useCore, type Lang } from "../i18n";
import { loadProject } from "../io/storage";
import { attachStarterImages } from "../io/starter";
import type { Project } from "../model";
import { Home } from "./organisms/Home";
import { Ide } from "./organisms/Ide";
import "./willy-maker.css";

export interface WillyMakerProps {
  /** The site's current language. */
  lang: Lang;
  /** The open game's id (from the address), or null for the home screen. */
  projectId?: string | null;
  /** Called when the open game changes, so the host can keep it in its address. */
  onProjectId?: (id: string | null) => void;
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

function Shell({ projectId, onProjectId }: Omit<WillyMakerProps, "lang">) {
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

  const open = (id: string | null) => {
    setOpenId(id);
    onProjectId?.(id);
  };

  if (openId && project && project.id === openId) return <Ide key={project.id} project={project} onHome={() => open(null)} />;
  if (openId && !failed) return <p className="wm-pad wm-dim">{t.home.loading}</p>;
  return (
    <>
      {failed && (
        <p className="wm-note is-error wm-pad" role="alert">
          {t.ide.loadFailed}
        </p>
      )}
      <Home onOpen={open} storageOk={storageOk} />
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

export function WillyMakerApp({ lang, ...rest }: WillyMakerProps) {
  return (
    <LangProvider value={lang}>
      <div className="wm-root stage-tokens">
        <Boundary fallback={<Broken />}>
          <Shell {...rest} />
        </Boundary>
      </div>
    </LangProvider>
  );
}
