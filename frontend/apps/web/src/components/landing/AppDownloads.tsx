// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { t } from "../../i18n";
import { RELEASE_VERSION, androidDownload } from "../../downloads";
import { androidAppUrl } from "../AndroidAppCard";
import { DownloadIcon } from "../Icons";

/**
 * The Player app's downloads: Android (the signed APK of this release) and
 * iPhone/iPad, which is not out yet, so it is plain text, never a link.
 */
export function AppDownloads({ showMeta = true }: { showMeta?: boolean }) {
  const apk = androidDownload();
  return (
    <div className="lp-app-downloads">
      <div className="lp-app-buttons">
        <a className="button button-primary lp-cta" href={androidAppUrl()} target="_blank" rel="noopener noreferrer">
          <DownloadIcon size={18} />
          {t.playerApp.android}
        </a>
        <span className="lp-soon">{t.playerApp.ios}</span>
      </div>
      {showMeta && <span className="small faint lp-app-meta">{apk ? t.playerApp.meta(RELEASE_VERSION, apk.mb) : t.playerApp.metaNoSize}</span>}
    </div>
  );
}
