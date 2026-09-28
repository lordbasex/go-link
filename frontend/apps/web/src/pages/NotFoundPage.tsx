// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { Link, useLocation } from "react-router-dom";
import { t } from "../i18n";
import { GamepadIcon, MonitorIcon } from "../components/Icons";
import { SiteFooter } from "../components/legal/SiteFooter";

/** An address that leads nowhere: an arcade "game over" screen. */
export function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <div className="page">
      <div className="page-body not-found">
        <section className="not-found-screen" aria-labelledby="not-found-title">
          <p className="not-found-code" aria-hidden="true">
            404
          </p>
          <p className="not-found-over" aria-hidden="true">
            {t.notFound.gameOver}
          </p>
          <p className="eyebrow eyebrow-accent">{t.notFound.eyebrow}</p>
          <h1 id="not-found-title" className="page-title">
            {t.notFound.title}
          </h1>
          <p className="muted not-found-text">{t.notFound.text}</p>
          <p className="small faint">
            {t.notFound.address}: <code className="not-found-path">{pathname}</code>
          </p>
          <div className="not-found-actions">
            <Link to="/" className="button button-primary">
              {t.notFound.home}
            </Link>
            <Link to="/rooms" className="button button-secondary">
              <GamepadIcon size={18} />
              {t.notFound.back}
            </Link>
            <Link to="/device" className="button button-secondary">
              <MonitorIcon size={18} />
              {t.notFound.device}
            </Link>
          </div>
          <p className="not-found-coin" aria-hidden="true">
            {t.notFound.insertCoin}
          </p>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
