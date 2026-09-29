// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useState, type FormEvent } from "react";
import { nameProblem, savedPlayerName } from "@go-link/shared";
import { t } from "../i18n";
import { UserIcon } from "./Icons";
import { NameField } from "./NameField";

/**
 * "What's your name?": asked once the code and the PIN let a guest in,
 * before the room. It comes filled with the last name used in this
 * browser, so coming back is one tap.
 */
export function NameStep({ initial, onDone }: { initial?: string; onDone: (name: string) => void }) {
  const [value, setValue] = useState(() => initial || savedPlayerName());
  const ok = nameProblem(value) === null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ok) onDone(value.normalize("NFC").replace(/\s+/gu, " ").trim());
  };
  return (
    <form className="name-step card" role="dialog" aria-modal="true" aria-labelledby="name-step-title" onSubmit={submit}>
      <span className="name-step-icon" aria-hidden="true">
        <UserIcon size={30} />
      </span>
      <h2 className="name-step-title" id="name-step-title">
        {t.alias.title}
      </h2>
      <p className="name-step-text">{t.alias.text}</p>
      <label className="name-step-label" htmlFor="alias">
        {t.alias.label}
      </label>
      <NameField id="alias" value={value} onChange={setValue} autoFocus large />
      <p className="name-step-remember small">{t.alias.remember}</p>
      <button type="submit" className="button button-primary button-block" disabled={!ok}>
        {t.alias.enter}
      </button>
    </form>
  );
}
