// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@go-link/shared/tokens.css";
import "./styles/global.css";
import { App } from "./App";
import { DEFAULT_SIGNAL_URL, DEMO_DATA } from "./config";
import { SignalProvider } from "./signal/SignalProvider";
import { migrateLegacyStorage } from "@go-link/shared";
import { useLang } from "./i18n";
import { panelSocketUrl } from "./panel";

/** The device's socket when this page is its local web panel. */
const PANEL_URL = panelSocketUrl();

// Settings saved when the project was called MAME WebRTC.
try {
  migrateLegacyStorage(window.localStorage);
} catch {
  // storage blocked
}

/** Re-renders the whole tree when the language changes. Nothing remounts,
 * so connections and a running game survive the switch. */
function LangRoot() {
  useLang();
  return (
    <BrowserRouter>
      <SignalProvider defaultUrl={DEFAULT_SIGNAL_URL} demo={DEMO_DATA} panelUrl={PANEL_URL}>
        <App />
      </SignalProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LangRoot />
  </StrictMode>,
);
