// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useState } from "react";
import { t } from "../../i18n";

const SAMPLE = "482915306";
const CYCLE_S = 9 * 60 + 12;

/**
 * A faithful copy of the go-link window as it looks before a browser is
 * linked (backend-device/internal/gui/onboarding.go): the link tile, the
 * two steps, the code in boxes and its countdown, with the same texts the
 * app shows in each language. It is a picture: nothing in it is a control.
 */
export function AppWindowPreview() {
  const [left, setLeft] = useState(CYCLE_S);
  useEffect(() => {
    const id = window.setInterval(() => setLeft((s) => (s <= 1 ? CYCLE_S : s - 1)), 1000);
    return () => window.clearInterval(id);
  }, []);
  const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const a = t.pairing.app;
  return (
    <figure className="appwin" aria-label={a.caption}>
      <div className="appwin-frame" aria-hidden="true">
        <div className="appwin-bar">
          <span className="appwin-light is-red" />
          <span className="appwin-light is-yellow" />
          <span className="appwin-light is-green" />
          <span className="appwin-name">go-link</span>
        </div>
        <div className="appwin-body">
          <div className="appwin-head">
            <span className="appwin-tile">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
                <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
              </svg>
            </span>
            <div className="appwin-titles">
              <span className="appwin-title">{a.title}</span>
              <span className="appwin-text">{a.text}</span>
            </div>
          </div>
          <div className="appwin-card">
            <div className="appwin-step">
              <span className="appwin-num">1</span>
              <span className="appwin-step-text">
                <b>{a.step1}</b>
                <span className="appwin-url">go-link.org/device</span>
              </span>
              <span className="appwin-btn">{a.copy}</span>
            </div>
            <hr />
            <div className="appwin-step">
              <span className="appwin-num">2</span>
              <span className="appwin-step-text">
                <b>{a.step2}</b>
                <span className="appwin-hint">{a.step2Hint}</span>
              </span>
            </div>
            <div className="appwin-code">
              {[0, 1, 2].map((g) => (
                <span key={g} className="appwin-group">
                  {SAMPLE.slice(g * 3, g * 3 + 3)
                    .split("")
                    .map((d, i) => (
                      <span key={i} className="appwin-digit">
                        {d}
                      </span>
                    ))}
                </span>
              ))}
            </div>
            <div className="appwin-foot">
              <span className="appwin-countdown">{a.newCode(time)}</span>
              <span className="appwin-btn">{a.copyCode}</span>
            </div>
          </div>
          <div className="appwin-bottom">
            <span className="appwin-status">
              <i />
              {a.connected}
            </span>
            <span className="appwin-open">{a.open}</span>
          </div>
        </div>
      </div>
      <figcaption className="small muted">{a.caption}</figcaption>
    </figure>
  );
}
