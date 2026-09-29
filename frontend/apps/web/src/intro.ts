// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useSyncExternalStore } from "react";
import { playCoin, tryPlayCoinNow } from "./coin";
import { hideSplash } from "./splash";

// The startup intro of index.html ("INSERT COIN") and its setting. The coin
// plays with "INSERT COIN" when the browser allows sound without a gesture;
// otherwise on the first tap or key, and only while the intro still shows or
// in the first seconds (no nagging). The same tap skips the intro.

export const STARTUP_SOUND_KEY = "go-link.startup-sound";
/** After this, a first tap no longer plays the coin. */
const COIN_WINDOW_MS = 4000;
/** When "INSERT COIN" shows in the intro (public/splash.css). */
const COIN_AT_MS = 1100;

const listeners = new Set<() => void>();

/** Whether the startup sound is on (the default). A per-browser choice. */
export function startupSoundOn(): boolean {
  try {
    return window.localStorage.getItem(STARTUP_SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setStartupSound(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(STARTUP_SOUND_KEY);
    else window.localStorage.setItem(STARTUP_SOUND_KEY, "off");
  } catch {
    // storage blocked: the choice lasts for this page
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The startup sound setting; re-renders when it changes. */
export function useStartupSound(): boolean {
  return useSyncExternalStore(subscribe, startupSoundOn, () => true);
}

function splashShowing(): boolean {
  const el = document.getElementById("splash");
  return el !== null && !el.classList.contains("is-gone");
}

/** Waits for the first gesture: coin (if due) and skip. Call once at startup. */
export function installIntro(): void {
  // The events every browser (Safari too) accepts as the gesture that
  // unlocks sound: touchend on phones, mousedown and keydown elsewhere.
  const events = ["touchend", "mousedown", "keydown"] as const;
  let played = false;
  const onGesture = (e: Event) => {
    if (e instanceof KeyboardEvent && ["Shift", "Control", "Alt", "Meta", "Tab"].includes(e.key)) return;
    events.forEach((name) => window.removeEventListener(name, onGesture, true));
    const showing = splashShowing();
    if (!played && startupSoundOn() && (showing || performance.now() < COIN_WINDOW_MS)) playCoin();
    played = true;
    if (showing) hideSplash();
  };
  events.forEach((name) => window.addEventListener(name, onGesture, true));
  // Some browsers let a site the visitor often plays media on make sound at
  // once: then the coin plays with "INSERT COIN", like the apps; otherwise it
  // waits for the first gesture above.
  window.setTimeout(() => {
    if (played || !startupSoundOn() || !splashShowing()) return;
    void tryPlayCoinNow().then((ok) => {
      if (ok) played = true;
    });
  }, Math.max(0, COIN_AT_MS - performance.now()));
}
