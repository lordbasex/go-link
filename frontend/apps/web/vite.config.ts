// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { defineConfig, searchForWorkspaceRoot, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Strict Content Security Policy for the production build. connect-src
// allows any wss: host because users may pick their own signaling server.
// It is not applied in dev: Vite's hot reload needs inline scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' wss:",
  "media-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml(html) {
      // The build's version, to check which one a server is serving
      // (curl -s https://go-link.org/ | grep go-link-version).
      const version = (process.env.VITE_APP_VERSION || "dev").replace(/[^\w.+-]/g, "");
      return html.replace(
        "<head>",
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="go-link-version" content="${version}" />`,
      );
    },
  };
}

// Chrome origin trial tokens (comma separated, VITE_ORIGIN_TRIAL_TOKENS) for
// built-in AI APIs still in trial, such as the Proofreader: each token is
// registered for one origin. Without any, those APIs stay off and Willy
// Maker falls back or hides what needs them.
function originTrials(): Plugin {
  let list = "";
  return {
    name: "origin-trials",
    configResolved(config) {
      // .env files and the environment, as import.meta.env sees them
      list = String(config.env.VITE_ORIGIN_TRIAL_TOKENS ?? "");
    },
    transformIndexHtml(html) {
      const tokens = list
        .split(",")
        .map((t) => t.trim())
        .filter((t) => /^[A-Za-z0-9+/=]+$/.test(t));
      if (!tokens.length) return html;
      return html.replace("<head>", `<head>\n${tokens.map((t) => `    <meta http-equiv="origin-trial" content="${t}" />`).join("\n")}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy(), originTrials()],
  server: {
    port: 5180,
    strictPort: true,
    // The skin editor reads the apps' built-in skins from docs/skins/builtin,
    // and Willy Maker's AI pack carries the ROM docs from docs/rom.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), "../../../docs/skins/builtin", "../../../docs/rom"] },
  },
  // Source maps stay off the published files (the deploy also deletes them).
  build: {
    sourcemap: "hidden",
    // Small fonts would be inlined as data: URLs, which the CSP's
    // font-src 'self' blocks: they stay files.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
});
