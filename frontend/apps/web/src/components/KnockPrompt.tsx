// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useState } from "react";
import { t } from "../i18n";
import { acceptTerms, termsAccepted } from "../legal";
import { TermsCheck } from "./legal/TermsCheck";

/**
 * A guest who came with a group invitation (one link for several people):
 * a name for the host to recognise (and the terms, the first time), then a
 * wait while the host decides, or why the way in closed.
 */
export function KnockPrompt({
  mode,
  reason,
  name,
  onName,
  onSend,
  onLeave,
}: {
  mode: "form" | "waiting" | "ended";
  /** Why it ended: declined, full, expired, busy, wrong, blocked or locked. */
  reason?: string;
  /** The name, kept by the page so a reconnection never loses what was typed. */
  name: string;
  onName: (name: string) => void;
  onSend: (name: string) => void;
  onLeave: () => void;
}) {
  const [needsTerms] = useState(() => !termsAccepted());
  const [agreed, setAgreed] = useState(false);
  const [askTerms, setAskTerms] = useState(false);
  if (mode === "waiting") {
    return (
      <div className="pin-prompt card stack-md knock-prompt" role="status">
        <span className="knock-hand" aria-hidden="true">
          ✋
        </span>
        <div className="stack-xxs">
          <h2 className="card-title">{t.knock.waitingTitle}</h2>
          <p className="small muted">{t.knock.waitingText}</p>
        </div>
        <button type="button" className="button button-secondary button-block" onClick={onLeave}>
          {t.knock.leave}
        </button>
      </div>
    );
  }
  if (mode === "ended") {
    const text = (t.knock.ended as Record<string, string>)[reason ?? ""] ?? t.knock.ended.wrong;
    return (
      <div className="pin-prompt card stack-md knock-prompt" role="alert">
        <div className="stack-xxs">
          <h2 className="card-title">{t.knock.endedTitle}</h2>
          <p className="small muted">{text}</p>
        </div>
        <button type="button" className="button button-secondary button-block" onClick={onLeave}>
          {t.knock.back}
        </button>
      </div>
    );
  }
  const trimmed = name.trim();
  return (
    <form
      className="pin-prompt card stack-md knock-prompt"
      onSubmit={(e) => {
        e.preventDefault();
        if (needsTerms && !agreed) {
          setAskTerms(true);
          return;
        }
        if (!trimmed) return;
        if (needsTerms) acceptTerms();
        onSend(trimmed);
      }}
    >
      <div className="stack-xxs">
        <h2 className="card-title">{t.knock.formTitle}</h2>
        <p className="small muted">{t.knock.formText}</p>
      </div>
      <label className="field-label" htmlFor="knock-name">
        {t.knock.name}
      </label>
      <input
        id="knock-name"
        className="input"
        autoComplete="nickname"
        maxLength={24}
        autoFocus
        value={name}
        onChange={(e) => onName(e.target.value)}
      />
      {needsTerms && <TermsCheck guest checked={agreed} onChange={setAgreed} showError={askTerms} />}
      <button type="submit" className="button button-primary button-block" disabled={!trimmed}>
        {t.knock.send}
      </button>
    </form>
  );
}
