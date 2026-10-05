// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The site around Willy Maker: where the main site is, the language and the
// theme (the same keys as go-link.org, kept per site by the browser).

import { useSyncExternalStore } from "react";
import type { Lang } from "./maker";

/** The main site (VITE_SITE_URL), which keeps the link to the owner's go-link. */
export const SITE_URL = (import.meta.env.VITE_SITE_URL || (import.meta.env.DEV ? "http://localhost:5180" : "https://go-link.org")).replace(/\/+$/, "");

/** This build (git describe, set by `make maker-build`). */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || "dev";

const LANG_KEY = "go-link.lang";
const THEME_KEY = "go-link.theme";
export const LANGS: Lang[] = ["en", "es", "pt"];

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage blocked: the choice lasts for this page
  }
}

function startLang(): Lang {
  const saved = read(LANG_KEY);
  if (saved === "en" || saved === "es" || saved === "pt") return saved;
  const nav = typeof navigator !== "undefined" ? navigator.language.slice(0, 2).toLowerCase() : "en";
  return nav === "es" || nav === "pt" ? nav : "en";
}

let lang: Lang = typeof window !== "undefined" ? startLang() : "en";
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function setLang(next: Lang): void {
  lang = next;
  write(LANG_KEY, next);
  document.documentElement.lang = next;
  listeners.forEach((fn) => fn());
}

/** The site's language; re-renders when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, () => lang, () => "en" as Lang);
}

export type Theme = "dark" | "light";
const THEME_COLOR: Record<Theme, string> = { dark: "#0e1016", light: "#f3f4f7" };

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Dark (the default) or light; public/theme.js applies the saved one before the page paints. */
export function setTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  write(THEME_KEY, theme);
  listeners.forEach((fn) => fn());
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => "dark" as Theme);
}
