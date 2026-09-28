// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useCallback, useEffect, useState, type RefObject } from "react";

// Safari (iPad before 16.4) still uses the webkit-prefixed names.
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type Orientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

function fullscreenElement(): Element | null {
  const d = document as FsDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

/**
 * Full screen for an element. Where the browser cannot put an element in
 * full screen (iPhone Safari only allows it for bare videos, which would
 * hide the on-screen gamepad), the element fills the window instead:
 * "pseudo" full screen, drawn with CSS.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [real, setReal] = useState(false);
  const [pseudo, setPseudo] = useState(false);

  useEffect(() => {
    const sync = () => {
      const el = fullscreenElement();
      setReal(el !== null && (el === ref.current || el === document.documentElement));
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, [ref]);

  // Pseudo full screen: no page scroll behind it, and Esc leaves it.
  useEffect(() => {
    if (!pseudo) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => (e.key === "Escape" || e.code === "Escape") && setPseudo(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [pseudo]);

  const toggle = useCallback((lockLandscape = true) => {
    const el = ref.current as FsElement | null;
    if (!el) return;
    if (pseudo) {
      setPseudo(false);
      return;
    }
    const d = document as FsDocument;
    if (fullscreenElement()) {
      void Promise.resolve((d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d)).catch(() => undefined);
      return;
    }
    const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (!request) {
      setPseudo(true);
      return;
    }
    void Promise.resolve(request.call(el))
      .then(() => {
        // Phones play sideways; Android allows locking it in full screen.
        if (lockLandscape) void (screen.orientation as Orientation | undefined)?.lock?.("landscape").catch(() => undefined);
      })
      .catch(() => setPseudo(true));
  }, [ref, pseudo]);

  /**
   * The whole page in real full screen, as it is (no pseudo, no rotation
   * lock): what a console needs, since its drawer and dialogs live outside
   * the element.
   */
  const enterQuietly = useCallback((): boolean => {
    const el = document.documentElement as FsElement;
    const request = el && (el.requestFullscreen ?? el.webkitRequestFullscreen);
    if (!request || fullscreenElement()) return false;
    void Promise.resolve(request.call(el)).catch(() => undefined);
    return true;
  }, []);

  return { active: real || pseudo, pseudo, toggle, enterQuietly };
}
