// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The website also runs as a headless device's local web panel: the
// device serves these same files on the LAN and marks index.html with
// <meta name="go-link-panel">. Then the link to the device goes through
// the device's own WebSocket (only the WebRTC negotiation travels there)
// and the browser proves itself with the panel token, a UUID v4.

export const PANEL_TOKEN_KEY = "go-link.panel-token";

/** The device's WebSocket when this page is its panel, else "". */
export function panelSocketUrl(): string {
  if (typeof document === "undefined" || !document.querySelector('meta[name="go-link-panel"]')) return "";
  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A panel token as typed: spaces trimmed, lower case; "" when not a UUID. */
export function cleanPanelToken(text: string): string {
  const t = text.trim().toLowerCase();
  return UUID.test(t) ? t : "";
}
