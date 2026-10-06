// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useSyncExternalStore } from "react";

/**
 * Places in the main header that a page can fill with its own content (the
 * room puts its title on the left and its actions on the right). The header
 * is rendered once, outside the routes, so the page reaches them through a
 * portal into these elements.
 */
export type HeaderSlotName = "info" | "actions";
const slots: Record<HeaderSlotName, HTMLElement | null> = { info: null, actions: null };
const listeners = new Set<() => void>();

export function setHeaderSlot(name: HeaderSlotName, el: HTMLElement | null) {
  if (slots[name] === el) return;
  slots[name] = el;
  listeners.forEach((l) => l());
}

export function useHeaderSlot(name: HeaderSlotName): HTMLElement | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => slots[name],
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
