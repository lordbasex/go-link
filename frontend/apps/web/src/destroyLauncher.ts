// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Starts the "Destroy this page" game on the landing (the header's devil).
// The game is a separate chunk loaded only on the first click, and it plays
// on the whole app (#root); this file only knows its public entry.

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "./i18n";

type Session = { exit(): void; finish?: () => void };
let active: Session | null = null;
let starting = false;

/** Waits until the landing is on screen (after a navigation to "/"). */
function landingReady(timeoutMs = 6000): Promise<boolean> {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      const splash = document.getElementById("splash");
      const ready = document.querySelector(".page.lp") && (!splash || splash.classList.contains("is-gone"));
      if (ready) return resolve(true);
      if (performance.now() - t0 > timeoutMs) return resolve(false);
      window.setTimeout(check, 100);
    };
    check();
  });
}

/** Opens the mission briefing; on another page it goes to "/" first. */
export async function launchDestroy(pathname: string, navigate: (to: string) => void): Promise<void> {
  if (active || starting) return;
  starting = true;
  try {
    if (pathname !== "/") navigate("/");
    const [mod, ok] = await Promise.all([import("./destroy"), landingReady()]);
    const root = document.getElementById("root");
    if (!ok || !root) return;
    active = mod.startDestroy({
      root,
      messages: t.destroy,
      onExit: () => {
        active = null;
      },
      debug: import.meta.env.DEV,
    });
    // Development only: lets end-to-end checks finish a mission at once.
    if (import.meta.env.DEV) (window as unknown as { __destroy?: Session }).__destroy = active;
  } finally {
    starting = false;
  }
}

/**
 * The game's direct link (go-link.org/WillyGorklingo): goes to the landing,
 * replacing the link in the history, and opens the mission briefing there.
 */
export function DestroyLink(): null {
  const navigate = useNavigate();
  useEffect(() => {
    void launchDestroy("/WillyGorklingo", (to) => navigate(to, { replace: true }));
  }, [navigate]);
  return null;
}
