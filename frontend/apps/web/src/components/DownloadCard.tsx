// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { t } from "../i18n";
import {
  CHECKSUMS_URL,
  PLATFORMS,
  RELEASE_PAGE,
  RELEASE_VERSION,
  armDownloadFor,
  detectPlatform,
  downloadFor,
  type Platform,
} from "../downloads";
import { DownloadIcon, MonitorIcon, PlayIcon } from "./Icons";
import { Wizard } from "./landing/Wizard";

/**
 * "No go-link yet?" on My device: the download for the visitor's system,
 * the other systems (with their sizes, from the latest release), and the
 * how-it-works walkthrough in a dialog.
 */
export function DownloadCard() {
  const detected = useMemo(() => detectPlatform(), []);
  const main: Platform = detected ?? "windows";
  const file = downloadFor(main);
  const [how, setHow] = useState(false);
  useEffect(() => {
    if (!how) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setHow(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [how]);
  const others = PLATFORMS.filter((p) => p !== main).flatMap((p) => {
    const rows: { key: string; name: string; href: string; size: string; internal?: boolean }[] = [];
    const f = downloadFor(p);
    if (f) rows.push({ key: p, name: t.wizard.platform[p], href: f.url, size: `${f.mb} MB` });
    else if (p === "docker") rows.push({ key: p, name: t.wizard.platform[p], href: "/docs/docker", size: t.downloads.guide, internal: true });
    const arm = armDownloadFor(p);
    if (arm) rows.push({ key: `${p}-arm`, name: `${t.wizard.platform[p]} ARM`, href: arm.url, size: `${arm.mb} MB` });
    return rows;
  });
  const armMain = armDownloadFor(main);
  if (armMain) others.unshift({ key: `${main}-arm`, name: `${t.wizard.platform[main]} ARM`, href: armMain.url, size: `${armMain.mb} MB` });

  return (
    <section className="dl-card" aria-labelledby="dl-title">
      <div className="dl-head">
        <div className="stack-sm">
          <h2 id="dl-title" className="dl-title">
            {t.downloads.title}
          </h2>
          <p className="muted small-plus">{t.downloads.text}</p>
        </div>
        <button type="button" className="button button-secondary button-compact" onClick={() => setHow(true)}>
          <PlayIcon size={14} />
          {t.downloads.how}
        </button>
      </div>

      {file && (
        <div className="dl-main">
          <span className="dl-icon" aria-hidden="true">
            <MonitorIcon size={22} />
          </span>
          <span className="dl-main-text">
            <b>{t.wizard.platform[main]}</b>
            <span className="small muted">
              {detected ? `${t.downloads.detected(t.wizard.platform[main])} · ` : ""}
              {t.wizard.note[main]}
            </span>
          </span>
          <a className="button button-primary" href={file.url}>
            <DownloadIcon size={18} />
            {t.wizard.download(t.wizard.platform[main], file.mb)}
          </a>
        </div>
      )}

      <div className="stack-sm">
        <span className="eyebrow">{t.downloads.others}</span>
        <div className="dl-others">
          {others.map((o) =>
            o.internal ? (
              <Link key={o.key} to={o.href} className="dl-other">
                <span>{o.name}</span>
                <span className="mono small muted">{o.size}</span>
              </Link>
            ) : (
              <a key={o.key} href={o.href} className="dl-other">
                <span>{o.name}</span>
                <span className="mono small muted">{o.size}</span>
              </a>
            ),
          )}
        </div>
      </div>

      <p className="dl-foot small muted">
        <span className="dl-version mono">{RELEASE_VERSION}</span>
        <a href={RELEASE_PAGE}>{t.downloads.all}</a>
        <span aria-hidden="true">·</span>
        <a href={CHECKSUMS_URL}>{t.downloads.verify}</a>
        <span aria-hidden="true">·</span>
        <Link to="/docs/install">{t.downloads.install}</Link>
      </p>

      {how && (
        <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setHow(false)}>
          <div className="dialog wz-dialog" role="dialog" aria-modal="true" aria-label={t.wizard.title}>
            <div className="wz-dialog-head">
              <span className="eyebrow eyebrow-accent">{t.wizard.eyebrow}</span>
              <button type="button" className="icon-button" aria-label={t.downloads.close} onClick={() => setHow(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <Wizard onDone={() => setHow(false)} />
          </div>
        </div>
      )}
    </section>
  );
}
