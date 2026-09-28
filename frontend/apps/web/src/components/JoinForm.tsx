// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useId, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { parseInvite } from "@go-link/shared";
import { t } from "../i18n";
import { GamepadIcon, LockIcon } from "./Icons";
import { TermsCheck } from "./legal/TermsCheck";
import { acceptTerms, termsAccepted } from "../legal";

/**
 * The code (or link) and the PIN of an invitation, as the guest join page
 * and the "Join a game" dialog ask for them. The PIN travels in the page's
 * history state, never in the address.
 */
export function JoinForm({ className, autoFocus = false }: { className?: string; autoFocus?: boolean }) {
  const navigate = useNavigate();
  const id = useId();
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [needsTerms] = useState(() => !termsAccepted());
  const [agreed, setAgreed] = useState(false);
  const [askTerms, setAskTerms] = useState(false);
  const target = parseInvite(code);
  const ready = target !== null && /^\d{6}$/.test(pin);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!target || !ready) return;
    if (needsTerms && !agreed) {
      setAskTerms(true);
      return;
    }
    if (needsTerms) acceptTerms();
    navigate(`/g/${"invite" in target ? target.invite : target.code}`, { state: { pin } });
  };

  return (
    <form className={className} onSubmit={submit} noValidate>
      <div className="stack-xs">
        <label htmlFor={`${id}-code`} className="field-label">
          {t.guest.codeLabel}
        </label>
        <div className="guest-field">
          <GamepadIcon size={18} />
          <input
            id={`${id}-code`}
            className="input input-mono"
            inputMode="numeric"
            autoComplete="off"
            autoFocus={autoFocus}
            placeholder="123 456 789"
            value={code}
            onChange={(e) => setCode(e.target.value.slice(0, 120))}
          />
        </div>
        <span className="small faint">{t.guest.codeHint}</span>
      </div>
      <div className="stack-xs">
        <label htmlFor={`${id}-pin`} className="field-label">
          {t.guest.pinLabel}
        </label>
        <div className="guest-field">
          <LockIcon size={17} />
          <input
            id={`${id}-pin`}
            className="input input-mono"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </div>
      </div>
      {needsTerms && <TermsCheck guest checked={agreed} onChange={setAgreed} showError={askTerms} />}
      <div className="pair-submit">
        <button type="submit" className="button button-primary" disabled={!ready}>
          {t.guest.join}
        </button>
        <span className="small muted">
          {t.guest.ownDevice} <Link to="/device">{t.guest.ownDeviceLink}</Link>
        </span>
      </div>
    </form>
  );
}
