// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import type { ReactNode } from "react";
import { NAME_MAX, nameLength, nameProblem, type NameProblem } from "@go-link/shared";
import { t } from "../i18n";

/** The hint under a name field: what is wrong, or the rule. */
export function nameHint(problem: NameProblem | null): string {
  switch (problem) {
    case "chars":
      return t.alias.hintChars;
    case "short":
      return t.alias.hintShort;
    case "long":
      return t.alias.hintLong;
    default:
      return t.alias.hintOk;
  }
}

/**
 * A player's name (alias) with live checking: letters, digits and spaces,
 * 2 to 20 characters. A symbol or emoji turns the field red and says why;
 * the counter shows the length the device will count.
 */
export function NameField({
  id,
  value,
  onChange,
  autoFocus,
  large,
  after,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  /** The big field of the "What's your name?" step. */
  large?: boolean;
  /** Shown next to the field (a Save button). */
  after?: ReactNode;
}) {
  // Nothing typed yet is not an error: the button just waits.
  const problem = value === "" ? null : nameProblem(value);
  const n = nameLength(value);
  const hintId = `${id}-hint`;
  return (
    <>
      <div className="name-field-row">
      <input
        id={id}
        className={`input ${large ? "name-input-large" : "input-dark input-small"}${problem ? " is-invalid" : ""}`}
        // A little room over the limit so a paste can be seen and fixed.
        maxLength={NAME_MAX + 10}
        autoComplete="nickname"
        autoCapitalize="words"
        spellCheck={false}
        autoFocus={autoFocus}
        value={value}
        placeholder={t.room.namePlaceholder}
        aria-invalid={problem ? true : undefined}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
      />
      {after}
      </div>
      <div className="name-hint-row small" id={hintId}>
        <span className={problem ? "name-hint is-error" : "name-hint"} aria-live="polite">
          {nameHint(problem)}
        </span>
        <span className={`name-count mono${n > NAME_MAX ? " is-error" : ""}`}>
          <span aria-hidden="true">
            {n}/{NAME_MAX}
          </span>
          <span className="visually-hidden">{t.alias.counterLabel(n, NAME_MAX)}</span>
        </span>
      </div>
    </>
  );
}
