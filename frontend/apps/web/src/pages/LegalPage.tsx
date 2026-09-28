// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect } from "react";
import { getLang, t } from "../i18n";
import { ScaleIcon } from "../components/Icons";
import { HeroTile, PageHero } from "../components/ui/PageHero";
import { SiteFooter } from "../components/legal/SiteFooter";

/** The terms of use or the privacy policy (docs/legal.md). */
export function LegalPage({ doc }: { doc: "terms" | "privacy" }) {
  const page = t.legal[doc];
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [doc]);
  return (
    <div className="page">
      <div className="page-body dash-page legal-page">
        <PageHero
          tile={
            <HeroTile>
              <ScaleIcon size={30} />
            </HeroTile>
          }
          eyebrow={t.legal.updated}
          title={page.title}
          subtitle={page.intro}
        />
        {getLang() !== "en" && <p className="help-box small">{t.legal.prevails}</p>}
        <nav className="legal-toc card" aria-label={page.title}>
          <ol>
            {page.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="legal-text card">
          {page.sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`}>
              <h2 id={`${s.id}-title`}>{s.title}</h2>
              {s.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
              {s.list.length > 0 && (
                <ul>
                  {s.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          <p className="muted">{t.legal.contact}</p>
        </article>
      </div>
      <SiteFooter />
    </div>
  );
}
