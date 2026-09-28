// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import {
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { CODE_DIGITS, ServerError, SignalError } from "@go-link/shared";
import { t } from "../i18n";
import { useSignal } from "../signal/SignalProvider";
import { ServerHelp } from "../components/ServerSettings";
import { SkeletonDashboard } from "../components/ui/Skeleton";
import { DeviceDashboard } from "../components/device/DeviceDashboard";
import { TermsCheck } from "../components/legal/TermsCheck";
import { acceptTerms, termsAccepted } from "../legal";

type Failure = "incomplete" | "invalid" | "rateLimited" | "unreachable";

function failureOf(err: unknown): Failure {
  if (err instanceof SignalError && err.fromServer) {
    return err.message === ServerError.RateLimited ? "rateLimited" : "invalid";
  }
  return "unreachable";
}

export function DevicePage({
  tab = "overview",
}: {
  tab?: "overview" | "roms" | "history";
}) {
  const {
    linkDevice,
    hostLink,
    savedLink,
    deviceOffline,
    unlinkDevice,
    linkNotice,
    clearLinkNotice,
  } = useSignal();
  const [digits, setDigits] = useState<string[]>(() =>
    Array(CODE_DIGITS).fill(""),
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  // The host accepts the terms of use before linking (once per version).
  const [agreed, setAgreed] = useState(termsAccepted);
  const [askTerms, setAskTerms] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const focus = (i: number) =>
    inputs.current[Math.max(0, Math.min(i, CODE_DIGITS - 1))]?.focus();

  const fill = (start: number, text: string) => {
    const incoming = text
      .replace(/\D/g, "")
      .slice(0, CODE_DIGITS - start)
      .split("");
    if (incoming.length === 0) return;
    setDigits((cur) => {
      const next = [...cur];
      incoming.forEach((d, k) => (next[start + k] = d));
      return next;
    });
    setFailure(null);
    focus(start + incoming.length);
  };

  const onChange = (i: number, value: string) => {
    if (value === "") {
      setDigits((cur) => cur.map((d, k) => (k === i ? "" : d)));
      return;
    }
    fill(i, value);
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && digits[i] === "" && i > 0) {
      e.preventDefault();
      setDigits((cur) => cur.map((d, k) => (k === i - 1 ? "" : d)));
      focus(i - 1);
    } else if (e.key === "ArrowLeft") {
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      focus(i + 1);
    }
  };

  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    fill(i, e.clipboardData.getData("text"));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const code = digits.join("");
    if (code.length !== CODE_DIGITS) {
      setFailure("incomplete");
      return;
    }
    if (!agreed) {
      setAskTerms(true);
      return;
    }
    acceptTerms();
    setBusy(true);
    setFailure(null);
    try {
      // Stay here: the page turns into the device panel.
      await linkDevice(code);
      setDigits(Array(CODE_DIGITS).fill(""));
    } catch (err) {
      setFailure(failureOf(err));
    } finally {
      setBusy(false);
    }
  };

  const errorText = failure ? t.pairing[failure] : "";
  // A remembered device reconnects on its own: the code form is only for
  // a browser that is not linked.
  const showForm = !hostLink && !savedLink;

  return (
    <div className="page">
      {hostLink ? (
        <div className="page-body dash-page">
          <DeviceDashboard tab={tab} />
        </div>
      ) : savedLink && !deviceOffline ? (
        // A remembered device is reconnecting: the dashboard's shape, not
        // the pairing page, since it is coming back in a moment.
        <div className="page-body dash-page">
          <SkeletonDashboard label={t.pairing.reconnectingTitle} />
        </div>
      ) : (
        <div className="page-body pair">
          <section className="pair-main">
            <div className="stack-sm">
              <span className="eyebrow eyebrow-accent">
                {t.pairing.eyebrow}
              </span>
              <h1 className="pair-title">{t.pairing.title}</h1>
              <p className="muted lead pair-lead">{t.pairing.subtitle}</p>
            </div>

            {savedLink && (
              <div
                className="card pair-card stack-sm"
                role="status"
                aria-live="polite"
              >
                <strong className="with-icon">
                  <span
                    className={`dot ${deviceOffline ? "dot-danger" : "dot-voice"}`}
                  />
                  {deviceOffline
                    ? t.pairing.offlineTitle
                    : t.pairing.reconnectingTitle}
                </strong>
                <p className="muted">
                  {deviceOffline
                    ? t.pairing.offlineText
                    : t.pairing.reconnectingText}
                </p>
                <div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={unlinkDevice}
                  >
                    {t.pairing.forget}
                  </button>
                </div>
              </div>
            )}

            {showForm && linkNotice && (
              <div className="help-box" role="alert">
                <p>
                  {linkNotice === "unlinked"
                    ? t.pairing.noticeUnlinked
                    : t.pairing.noticeAuthFailed}
                </p>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={clearLinkNotice}
                >
                  {t.pairing.noticeDismiss}
                </button>
              </div>
            )}

            {showForm && (
              <form
                onSubmit={submit}
                className="card pair-card stack-md"
                noValidate
              >
                <label htmlFor="d1" className="field-label">
                  {t.pairing.codeLabel}
                </label>
                <div className="code-inputs">
                  {[0, 1, 2].map((g) => (
                    <div key={g} className="code-group">
                      {[0, 1, 2].map((k) => {
                        const i = g * 3 + k;
                        return (
                          <input
                            key={i}
                            ref={(el) => {
                              inputs.current[i] = el;
                            }}
                            id={`d${i + 1}`}
                            className="code-digit"
                            type="text"
                            inputMode="numeric"
                            autoComplete={i === 0 ? "one-time-code" : "off"}
                            maxLength={CODE_DIGITS}
                            value={digits[i]}
                            aria-label={t.pairing.digit(i + 1)}
                            aria-invalid={
                              failure === "invalid" ? true : undefined
                            }
                            onChange={(e) => onChange(i, e.target.value)}
                            onKeyDown={(e) => onKeyDown(i, e)}
                            onPaste={(e) => onPaste(i, e)}
                            onFocus={(e) => e.target.select()}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
                {errorText && (
                  <p className="form-error" role="alert">
                    {errorText}
                  </p>
                )}
                {failure === "invalid" && <ServerHelp />}
                <TermsCheck checked={agreed} onChange={setAgreed} showError={askTerms} />
                <div className="pair-submit">
                  <button
                    type="submit"
                    className="button button-primary button-large"
                    disabled={busy}
                  >
                    {busy ? t.pairing.linking : t.pairing.submit}
                  </button>
                  <span className="small faint">{t.pairing.tip}</span>
                </div>
              </form>
            )}

            {showForm && (
              <div className="download stack-sm">
                <span className="muted small-plus">
                  {t.pairing.downloadTitle}
                </span>
                <div className="chip-row">
                  {t.pairing.platforms.map((p) => (
                    <span key={p} className="platform-chip">
                      {p}
                    </span>
                  ))}
                </div>
                <span className="small faint">{t.pairing.downloadSoon}</span>
              </div>
            )}
          </section>

          <aside className="pair-aside" aria-label={t.pairing.previewCaption}>
            <div className="pair-window" aria-hidden="true">
              <div className="preview-bar">
                <span className="preview-light" />
                <span className="preview-light" />
                <span className="preview-light" />
                <span className="preview-url">go-link device</span>
              </div>
              <div className="pair-window-body">
                <span className="dash-mini-title">{t.pairing.windowCode}</span>
                <span className="pair-window-code">482 915 306</span>
                <svg width="84" height="84" viewBox="0 0 84 84">
                  <circle
                    cx="42"
                    cy="42"
                    r="36"
                    fill="none"
                    stroke="var(--color-divider)"
                    strokeWidth="6"
                  />
                  <circle
                    className="pair-countdown"
                    cx="42"
                    cy="42"
                    r="36"
                    fill="none"
                    stroke="var(--color-voice)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    transform="rotate(-90 42 42)"
                  />
                </svg>
                <span className="small faint">{t.pairing.windowHint}</span>
              </div>
            </div>
            <ol className="pair-steps">
              {t.pairing.steps.map((step, i) => (
                <li key={step.title}>
                  <span className="pair-step-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="small-plus muted">
                    <strong>{step.title}</strong> {step.text}
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}
    </div>
  );
}
