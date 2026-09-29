// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { t } from "../../i18n";
import { AppDownloads } from "./AppDownloads";
import { Shot, type ShotName } from "./Shot";

/** The three pictures of the quick path, in step order. */
const STEP_SHOTS: ShotName[] = ["app-home", "app-pin", "app-room"];

/**
 * "Someone sent you a QR?": the guest's way into a game in three steps
 * (scan, type the PIN, play and talk), each with a real screenshot of the
 * Player app, then the app's downloads and the browser as the other way.
 */
export function GuestPath({ onJoin }: { onJoin: () => void }) {
  const g = t.guestPath;
  return (
    <section className="lp-section lp-band lp-guest" aria-labelledby="lp-guest">
      <div className="lp-guest-head">
        <div className="stack-sm">
          <span className="eyebrow eyebrow-accent">{g.eyebrow}</span>
          <h2 id="lp-guest" className="lp-h2">
            {g.title}
          </h2>
        </div>
        <span className="lp-chip">{g.only}</span>
      </div>
      <ol className="lp-guest-steps">
        {g.steps.map((s, i) => (
          <li key={s.title} className="lp-guest-step">
            <h3 className="lp-guest-title">
              <span className="lp-num" aria-hidden="true">
                {i + 1}
              </span>{" "}
              {s.title}
            </h3>
            <p className="muted">{s.text}</p>
            <div className={`lp-phone${i === STEP_SHOTS.length - 1 ? " is-accent" : ""}`}>
              <Shot name={STEP_SHOTS[i]!} alt={s.alt} />
            </div>
          </li>
        ))}
      </ol>
      <div className="lp-guest-bar">
        <AppDownloads showMeta={false} />
        <p className="small muted lp-guest-browser">
          {g.browser}{" "}
          <button type="button" className="lp-textlink" onClick={onJoin}>
            {g.browserCta}
          </button>
        </p>
      </div>
    </section>
  );
}
