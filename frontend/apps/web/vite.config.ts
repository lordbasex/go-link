// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Strict Content Security Policy for the production build. connect-src
// allows any wss: host because users may pick their own signaling server.
// It is not applied in dev: Vite's hot reload needs inline scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
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
      return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  server: { port: 5180, strictPort: true },
  // Source maps stay off the published files (the deploy also deletes them).
  build: { sourcemap: "hidden" },
});
