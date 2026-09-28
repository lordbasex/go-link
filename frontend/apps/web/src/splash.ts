// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

/** The logo shows at least this long on every load (branding). */
export const SPLASH_MIN_MS = 3000;
/** ...and never longer than this, even if the device does not answer. */
export const SPLASH_MAX_MS = 8000;

/** Fades out the logo of index.html and removes it. Safe to call twice. */
export function hideSplash(): void {
  const el = document.getElementById("splash");
  if (!el || el.classList.contains("is-gone")) return;
  el.classList.add("is-gone");
  window.setTimeout(() => el.remove(), 400);
}
