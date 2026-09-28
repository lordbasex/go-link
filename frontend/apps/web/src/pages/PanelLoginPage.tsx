// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useState, type FormEvent } from "react";
import { SignalError } from "@go-link/shared";
import { t } from "../i18n";
import { cleanPanelToken } from "../panel";
import { PANEL_BAD_TOKEN, useSignal } from "../signal/SignalProvider";
import { LockIcon, MonitorIcon } from "../components/Icons";

/**
 * The way into a headless device's local web panel: its panel token, a
 * UUID v4 the device prints in its log and shows with `device panel
 * token`. The browser keeps it and comes back by itself.
 */
export function PanelLoginPage() {
  const { linkDevice, linkNotice, clearLinkNotice } = useSignal();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const token = cleanPanelToken(value);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || busy) return;
    setBusy(true);
    setError("");
    clearLinkNotice();
    try {
      await linkDevice(token);
    } catch (err) {
      const text = err instanceof Error ? err.message : "";
      setError(
        text === PANEL_BAD_TOKEN
          ? t.panel.wrong
          : err instanceof SignalError && err.fromServer
            ? t.panel.tooMany
            : t.panel.offline,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-body pair">
        <section className="pair-main">
          <div className="stack-sm">
            <span className="eyebrow eyebrow-accent">{t.panel.eyebrow}</span>
            <h1 className="pair-title">{t.panel.title}</h1>
            <p className="muted lead pair-lead">{t.panel.subtitle}</p>
          </div>
          <form className="card pair-card stack-md" onSubmit={submit} noValidate>
            {linkNotice === "auth_failed" && (
              <p className="notice" role="status">
                {t.panel.changed}
              </p>
            )}
            <div className="stack-xs">
              <label htmlFor="panel-token" className="field-label">
                {t.panel.tokenLabel}
              </label>
              <div className="guest-field">
                <LockIcon size={17} />
                <input
                  id="panel-token"
                  className="input input-mono"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  placeholder="xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx"
                  value={value}
                  aria-invalid={error ? true : undefined}
                  onChange={(e) => setValue(e.target.value.slice(0, 64))}
                />
              </div>
              <span className="small faint">{t.panel.tokenHint}</span>
            </div>
            {error && (
              <p className="form-error small" role="alert">
                {error}
              </p>
            )}
            <div className="pair-submit">
              <button type="submit" className="button button-primary" disabled={!token || busy}>
                {busy ? t.panel.opening : t.panel.open}
              </button>
            </div>
          </form>
        </section>
        <aside className="pair-aside">
          <div className="card stack-md">
            <h2 className="card-title with-icon">
              <MonitorIcon size={18} />
              {t.panel.whereTitle}
            </h2>
            <ol className="pair-steps">
              {t.panel.where.map((step, i) => (
                <li key={step}>
                  <span className="pair-step-number">{i + 1}</span>
                  <span className="muted">{step}</span>
                </li>
              ))}
            </ol>
            <pre className="panel-command mono">device panel token</pre>
          </div>
        </aside>
      </div>
    </div>
  );
}
