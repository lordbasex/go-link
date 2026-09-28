// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useState } from "react";
import { t } from "../i18n";
import { CopyIcon } from "./Icons";

/** Copies text to the clipboard and confirms it for a moment. */
export function CopyButton({
  text,
  label,
  showLabel = false,
}: {
  text: string;
  label: string;
  showLabel?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: nothing else to do
    }
  };
  return (
    <button
      type="button"
      className={
        showLabel ? "button button-secondary button-compact" : "icon-button"
      }
      aria-label={showLabel ? undefined : copied ? t.create.copied : label}
      onClick={copy}
    >
      <CopyIcon />
      {showLabel && (copied ? t.create.copied : label)}
      <span className="visually-hidden" aria-live="polite">
        {copied ? t.create.copied : ""}
      </span>
    </button>
  );
}
