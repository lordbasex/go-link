// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { searchForWorkspaceRoot } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Willy Maker's AI pack bundles the ROM docs (docs/rom) as raw text.
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), "../docs/rom"] } },
  test: {
    environment: "jsdom",
    include: ["packages/*/test/**/*.test.ts", "apps/*/src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
