// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { checkSignalUrl } from "@go-link/shared";
import { t } from "../i18n";
import { useSignal } from "../signal/SignalProvider";

/**
 * Lets the user switch to their own signaling server. The address is
 * validated and a real connection must answer with hello before it is
 * saved. It never comes from a URL parameter.
 */
export function ServerDialog() {
  const {
    server,
    defaultUrl,
    setCustomServer,
    resetToOfficialServer,
    serverDialogOpen,
    setServerDialogOpen,
    testServer,
  } = useSignal();
  const [value, setValue] = useState(server.url);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!serverDialogOpen) return;
    setValue(server.url);
    setError("");
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setServerDialogOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [serverDialogOpen, server.url, setServerDialogOpen]);

  if (!serverDialogOpen) return null;

  const close = () => setServerDialogOpen(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const check = checkSignalUrl(value);
    if (!check.ok) {
      setError(t.server.problems[check.problem]);
      return;
    }
    setTesting(true);
    setError("");
    try {
      await testServer(check.url);
      setCustomServer(check.url);
      close();
    } catch {
      setError(t.server.unreachable);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <h2 id={titleId} className="dialog-title">
          {t.server.dialogTitle}
        </h2>
        <p id={descId} className="muted">
          {t.server.dialogIntro}
        </p>
        <p className="dialog-current">
          {t.server.current}: <code>{server.url}</code>
          {!server.custom && <span className="tag">{t.server.official}</span>}
        </p>
        <form onSubmit={submit} className="stack-sm" noValidate>
          <label htmlFor="signal-url" className="field-label">
            {t.server.urlLabel}
          </label>
          <input
            ref={inputRef}
            id="signal-url"
            className="input input-mono"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={t.server.urlPlaceholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          {error && (
            <p id={errorId} className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            {server.custom && (
              <button
                type="button"
                className="button button-ghost"
                onClick={() => {
                  resetToOfficialServer();
                  close();
                }}
              >
                {t.server.useOfficial}
              </button>
            )}
            <span className="spacer" />
            <button
              type="button"
              className="button button-secondary"
              onClick={close}
            >
              {t.server.cancel}
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={testing || value.trim() === ""}
            >
              {testing ? t.server.testing : t.server.testAndSave}
            </button>
          </div>
        </form>
        <p className="dialog-footnote">
          {t.server.official}: <code>{defaultUrl}</code>
        </p>
      </div>
    </div>
  );
}

/** Always visible while a custom server is active. */
export function CustomServerBanner() {
  const { server, resetToOfficialServer } = useSignal();
  if (!server.custom) return null;
  return (
    <div className="server-banner" role="status">
      <span>
        {t.server.bannerText} <code>{server.url}</code>
      </span>
      <button
        type="button"
        className="button button-small button-secondary"
        onClick={resetToOfficialServer}
      >
        {t.server.backToOfficial}
      </button>
    </div>
  );
}

/** Shown when a room or code is not found: the host may use another server. */
export function ServerHelp() {
  const { setServerDialogOpen } = useSignal();
  return (
    <div className="help-box">
      <strong>{t.server.helpTitle}</strong>
      <p className="muted">{t.server.helpText}</p>
      <button
        type="button"
        className="button button-secondary button-small"
        onClick={() => setServerDialogOpen(true)}
      >
        {t.server.helpAction}
      </button>
    </div>
  );
}
