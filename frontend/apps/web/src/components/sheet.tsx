// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";

const SHEET_QUERY = "(max-width: 700px), (pointer: coarse) and (max-height: 560px)";

/** Whether the screen is a phone's, where popovers become bottom sheets. */
export function useSheetLayout(): boolean {
  const query = typeof window !== "undefined" ? window.matchMedia?.(SHEET_QUERY) : undefined;
  const [match, setMatch] = useState(() => query?.matches === true);
  useEffect(() => {
    if (!query) return;
    const change = () => setMatch(query.matches);
    query.addEventListener?.("change", change);
    return () => query.removeEventListener?.("change", change);
  }, [query]);
  return match;
}

/**
 * A bottom sheet lives outside the dock (the dock's transform and blur
 * would trap a fixed element), over a scrim that closes it. In full
 * screen it goes into the full screen element so it stays visible.
 */
export function inSheet(sheet: boolean, setOpen: (open: boolean) => void, content: ReactNode): ReactNode {
  if (!sheet || typeof document === "undefined") return content;
  return createPortal(
    <>
      <button
        type="button"
        className="sheet-scrim"
        aria-label={t.audio.close}
        onClick={() => setOpen(false)}
      />
      {content}
    </>,
    document.fullscreenElement ?? document.body,
  );
}
