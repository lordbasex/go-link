// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { defineConfig } from "@playwright/test";
import { PORTS } from "./ports";

// A real Chromium against a real signalhub, a real headless device and the
// website, all started by global-setup.ts on their own ports, so nothing of
// the developer's (signalhub, device, rooms) is touched. The steps depend on
// each other (pair, then reconnect, then invite...), so they run in order.
//
// Three projects: "web" (npm test), "android" (npm run test:android: the
// go-link Player app on an emulator or phone through adb, skipped when no
// device is attached) and "shots" (npm run shots: the landing page's
// screenshots, with an invented ROM library). E2E_CHROMIUM_SINGLE_PROCESS=1 runs Chromium as one
// process, only for a local session whose macOS launchd context is broken.
const singleProcess = process.env.E2E_CHROMIUM_SINGLE_PROCESS === "1" ? ["--single-process", "--no-zygote"] : [];

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
        ...singleProcess,
      ],
    },
  },
  projects: [
    { name: "web", testIgnore: /(android|shots)\.spec\.ts$/ },
    // One long story on a real Android device: minutes, not seconds.
    { name: "android", testMatch: /android\.spec\.ts$/, timeout: 240_000 },
    // The landing page's screenshots (npm run shots), never part of npm test.
    { name: "shots", testMatch: /shots\.spec\.ts$/, timeout: 1_800_000 },
  ],
  webServer: {
    // The website in dev mode (no CSP, so ws:// to the local signalhub works).
    command: `npm --prefix ../frontend run dev -w @go-link/web -- --port ${PORTS.web} --strictPort`,
    url: `http://localhost:${PORTS.web}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_SIGNAL_URL: `ws://127.0.0.1:${PORTS.signal}/ws`, VITE_DEMO_DATA: "false" },
  },
});
