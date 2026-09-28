// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

/** The project's public signaling server. */
export const OFFICIAL_SIGNAL_URL = "wss://signal.go-link.org/ws";

/** Default server for this build (VITE_SIGNAL_URL), else the official one. */
export const DEFAULT_SIGNAL_URL = import.meta.env.VITE_SIGNAL_URL || OFFICIAL_SIGNAL_URL;

/** true when the build shows the design's sample data. */
export const DEMO_DATA = import.meta.env.VITE_DEMO_DATA === "true";

/** How often the lobby refreshes the public room list. */
export const LOBBY_REFRESH_MS = 15_000;
