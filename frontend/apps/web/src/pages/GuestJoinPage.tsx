// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { t } from "../i18n";
import { JoinForm } from "../components/JoinForm";

/**
 * A guest's way in (a browser with no device of its own): the room's code
 * (or its link) and its PIN, both from whoever invited them. Rooms are
 * private, so a guest sees no list of games. Laid out like the device
 * pairing page: the form on the left, how it works on the right.
 */
export function GuestJoinPage() {
  return (
    <div className="page">
      <div className="page-body pair guest-join">
        <section className="pair-main">
          <div className="stack-sm">
            <span className="eyebrow eyebrow-accent">{t.guest.eyebrow}</span>
            <h1 className="pair-title">{t.guest.title}</h1>
            <p className="muted lead pair-lead">{t.guest.subtitle}</p>
          </div>

          <JoinForm className="card pair-card stack-md" />
        </section>

        <aside className="pair-aside">
          <div className="pair-window guest-window" aria-hidden="true">
            <div className="guest-window-body">
              <span className="eyebrow">{t.guest.sampleTitle}</span>
              <div className="guest-sample-row">
                <span className="small muted">{t.guest.codeLabel}</span>
                <span className="guest-sample-code">123 456 789</span>
              </div>
              <div className="guest-sample-row">
                <span className="small muted">{t.guest.pinLabel}</span>
                <span className="guest-sample-code is-pin">482 913</span>
              </div>
            </div>
          </div>
          <div className="card stack-md">
            <h2 className="card-title">{t.guest.stepsTitle}</h2>
            <ol className="pair-steps">
              {t.guest.steps.map((step, i) => (
                <li key={step}>
                  <span className="pair-step-number">{i + 1}</span>
                  <span className="muted">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
