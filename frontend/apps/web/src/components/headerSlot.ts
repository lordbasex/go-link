// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useSyncExternalStore } from "react";

/**
 * A place in the main header that a page can fill with its own buttons
 * (the room puts its actions there). The header is rendered once, outside
 * the routes, so the page reaches it through a portal into this element.
 */
let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

export function setHeaderSlot(el: HTMLElement | null) {
  if (slot === el) return;
  slot = el;
  listeners.forEach((l) => l());
}

export function useHeaderSlot(): HTMLElement | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => slot,
    () => null,
  );
}

/** True while the media query matches (and follows it as it changes). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (l) => {
      const m = window.matchMedia?.(query);
      m?.addEventListener("change", l);
      return () => m?.removeEventListener("change", l);
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}
