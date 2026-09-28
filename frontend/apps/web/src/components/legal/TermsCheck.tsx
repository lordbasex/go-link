// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useId } from "react";
import { t } from "../../i18n";

/**
 * The terms of use checkbox: a host must tick it before linking a device,
 * a guest before joining a game. The links open in a new tab so the form
 * keeps what was typed.
 */
export function TermsCheck({
  checked,
  onChange,
  guest = false,
  showError = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  guest?: boolean;
  showError?: boolean;
}) {
  const id = useId();
  const a = t.legal.accept;
  return (
    <div className="terms-check">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={showError && !checked ? true : undefined}
        aria-describedby={showError && !checked ? `${id}-error` : undefined}
      />
      <label htmlFor={id} className="small-plus">
        {a.before}
        <a href="/terms" target="_blank" rel="noopener">
          {a.terms}
        </a>
        {a.and}
        <a href="/privacy" target="_blank" rel="noopener">
          {a.privacy}
        </a>
        {guest ? a.guestAfter : a.after}
      </label>
      {showError && !checked && (
        <p id={`${id}-error`} className="form-error" role="alert">
          {a.required}
        </p>
      )}
    </div>
  );
}
