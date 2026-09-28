// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { test } from "@playwright/test";
import { expectAccessible } from "../a11y";
import { PORTS } from "../ports";

// Every page a visitor can reach without a linked device, in both themes.
// The linked pages (device dashboard, room) are checked inside the story.
const pages = [
  { path: "/", name: "landing" },
  { path: "/rooms", name: "rooms" },
  { path: "/device", name: "device (not linked)" },
  { path: "/g", name: "guest join" },
  { path: "/create", name: "new game" },
  { path: "/terms", name: "terms of use" },
  { path: "/privacy", name: "privacy policy" },
  { path: "/nowhere", name: "not found" },
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });
    for (const { path, name } of pages) {
      test(`${name} has no accessibility problems`, async ({ page }) => {
        await page.goto(path);
        await page.locator("main").first().waitFor();
        await expectAccessible(page, `${name} (${scheme})`);
      });
    }
    test("the join dialog has no accessibility problems", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Join a game" }).first().click();
      await page.getByRole("dialog", { name: "Join a game" }).waitFor();
      await expectAccessible(page, `join dialog (${scheme})`);
    });
    test("the device panel login has no accessibility problems", async ({ page }) => {
      await page.goto(`http://127.0.0.1:${PORTS.panel}/`);
      await page.getByLabel("Panel token").waitFor();
      await expectAccessible(page, `panel login (${scheme})`);
    });
  });
}
