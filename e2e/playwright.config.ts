// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { defineConfig } from "@playwright/test";
import { PORTS } from "./ports";

// A real Chromium against a real signalhub, a real headless device and the
// website, all started by global-setup.ts on their own ports, so nothing of
// the developer's (signalhub, device, rooms) is touched. The steps depend on
// each other (pair, then reconnect, then invite...), so they run in order.
export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  use: {
    baseURL: `http://localhost:${PORTS.web}`,
    locale: "en-US",
    trace: "retain-on-failure",
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  webServer: {
    // The website in dev mode (no CSP, so ws:// to the local signalhub works).
    command: `npm --prefix ../frontend run dev -w @go-link/web -- --port ${PORTS.web} --strictPort`,
    url: `http://localhost:${PORTS.web}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_SIGNAL_URL: `ws://127.0.0.1:${PORTS.signal}/ws`, VITE_DEMO_DATA: "false" },
  },
});
