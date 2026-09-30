// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// "Destroy this page": the one public entry of the game. Any page (any root
// element) can be played on: its copy is split into words and parts, the
// hero breaks them with a machine gun, a knife and a bazooka, and four
// people wait inside to be rescued. The real page is only hidden while
// playing and comes back untouched.
//
// The folder is self-contained: engine/ (pure rules), host/ (the DOM
// adapter), assets/ (atlas loading and drawing), audio/, ui/ (atomic design)
// and its own texts (messages.ts). Its pictures live in public/destroy.

import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { Session } from "./host/session";
import type { DestroyMessages } from "./messages";
import { DestroyApp } from "./ui/DestroyApp";
import { Guard } from "./ui/Guard";
import "./ui/destroy.css";

export type { DestroyMessages } from "./messages";

export interface DestroyOptions {
  /** The element whose page is played on (the whole app, a section, anything). */
  root: HTMLElement;
  messages: DestroyMessages;
  /** Where player.json, npcs.json and their pictures are served. */
  assetBase?: string;
  /** Called after the page has been put back. */
  onExit?: () => void;
  /** Less motion: no shaking, fewer particles (defaults to the system setting). */
  reducedMotion?: boolean;
  /** Development help: exposes a finish() to break everything at once. */
  debug?: boolean;
  /** The Lag gang guards the page (on by default). */
  enemies?: boolean;
}

export interface DestroySession {
  /** Leaves at once and puts the page back. */
  exit(): void;
  /** Breaks everything and frees everyone (debug only). */
  finish?: () => void;
  /** Where everyone is (debug only). */
  peek?: () => unknown;
  /** Plays with scripted controls (debug only). */
  drive?: (c: Record<string, boolean | number> | null) => void;
  /** Moves the mission clock forward (debug only). */
  skipTime?: (seconds: number) => void;
}

export function startDestroy(opts: DestroyOptions): DestroySession {
  const doc = opts.root.ownerDocument;
  const reduced = opts.reducedMotion ?? doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const host = doc.createElement("div");
  // The game stays dark in both themes, like the video stage.
  host.className = "dz-host stage-tokens";
  // The game's own layers are never part of a page to destroy.
  host.setAttribute("data-destroy-ui", "");
  doc.body.appendChild(host);
  const ui = createRoot(host);
  let closed = false;
  const session = new Session(
    opts.root,
    opts.assetBase ?? "/destroy",
    reduced,
    () => {
      if (closed) return;
      closed = true;
      ui.unmount();
      host.remove();
      opts.onExit?.();
    },
    opts.enemies ?? true,
    { help: opts.messages.help },
  );
  ui.render(createElement(Guard, null, createElement(DestroyApp, { session, m: opts.messages })));
  void session.open();
  return {
    exit: () => session.exit(),
    ...(opts.debug ? { finish: () => session.finish(), peek: () => session.peek(), drive: (c: Record<string, boolean | number> | null) => session.drive(c), skipTime: (seconds: number) => session.skipTime(seconds) } : {}),
  };
}
