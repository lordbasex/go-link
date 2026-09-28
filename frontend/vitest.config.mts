// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["packages/*/test/**/*.test.ts", "apps/*/src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
