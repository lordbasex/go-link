// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { Brand } from "../Headers";
import { GithubIcon } from "../Icons";
import { REPO_URL } from "../../config";

/** The site's footer: links, licenses, trademarks and the legal pages. */
export function SiteFooter() {
  const f = t.legal.footer;
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand stack-sm">
          <Brand />
          <p className="small muted">{f.tagline}</p>
          <a className="icon-button" href={REPO_URL} target="_blank" rel="noopener" aria-label={f.github} data-tip={f.github}>
            <GithubIcon />
          </a>
        </div>
        <nav className="site-footer-col" aria-label={f.product}>
          <h2 className="site-footer-title">{f.product}</h2>
          <Link to="/">{t.nav.howItWorks}</Link>
          <Link to="/rooms">{t.nav.rooms}</Link>
          <Link to="/device">{t.nav.myDevice}</Link>
        </nav>
        <nav className="site-footer-col" aria-label={f.project}>
          <h2 className="site-footer-title">{f.project}</h2>
          <a href={REPO_URL} target="_blank" rel="noopener">
            {f.source}
          </a>
          <a href={`${REPO_URL}/releases`} target="_blank" rel="noopener">
            {f.releases}
          </a>
          <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noopener">
            {f.license}
          </a>
          <a href={`${REPO_URL}/blob/main/THIRD_PARTY_NOTICES.md`} target="_blank" rel="noopener">
            {f.notices}
          </a>
        </nav>
        <nav className="site-footer-col" aria-label={f.legal}>
          <h2 className="site-footer-title">{f.legal}</h2>
          <Link to="/terms">{t.legal.terms.title}</Link>
          <Link to="/privacy">{t.legal.privacy.title}</Link>
          <a href={`${REPO_URL}/blob/main/docs/legal.md`} target="_blank" rel="noopener">
            {f.legalDoc}
          </a>
        </nav>
      </div>
      <div className="site-footer-bottom small faint">
        <p>
          © 2026 {f.rights} {f.noRoms}
        </p>
        <p>{f.trademark}</p>
      </div>
    </footer>
  );
}
