// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useSyncExternalStore, type ReactNode } from "react";

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

/** An entry a page adds to the header's "..." menu (the room's Picture). */
export interface HeaderMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}
let menuItems: HeaderMenuItem[] = [];
const menuListeners = new Set<() => void>();

export function setHeaderMenuItems(items: HeaderMenuItem[]) {
  menuItems = items;
  menuListeners.forEach((l) => l());
}

export function useHeaderMenuItems(): HeaderMenuItem[] {
  return useSyncExternalStore(
    (l) => {
      menuListeners.add(l);
      return () => menuListeners.delete(l);
    },
    () => menuItems,
    () => menuItems,
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
