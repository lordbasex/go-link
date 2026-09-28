// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { Link } from "react-router-dom";
import { t } from "../i18n";
import { HelpIcon } from "../components/Icons";
import { HeroTile, PageHero } from "../components/ui/PageHero";

export function NotFoundPage() {
  return (
    <div className="page">
      <div className="page-body dash-page">
        <PageHero
          tile={
            <HeroTile status="failed">
              <HelpIcon size={34} />
            </HeroTile>
          }
          eyebrow="404"
          title={t.notFound.title}
          actions={
            <Link to="/rooms" className="button button-primary">
              {t.notFound.back}
            </Link>
          }
        />
      </div>
    </div>
  );
}
