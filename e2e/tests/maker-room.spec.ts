// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { pairingCode } from "../stack";

// Willy Maker's Play on my go-link, end to end: a game made on the site
// goes to the linked device, which opens its room with the real core, and
// the site opens that room with the game playing. It needs the emulator
// core (E2E_CORE_DIR, see global-setup.ts), so it is skipped without one.

/** The core in the device's throwaway HOME, copied there by global-setup.ts. */
function hasCore(): boolean {
  const cores = fileURLToPath(new URL("../.state/home/go-link/cores", import.meta.url));
  return existsSync(cores) && readdirSync(cores).some((f) => f.startsWith("mame2003_plus_libretro"));
}

test("a Willy Maker game plays in its own room on the linked go-link", async ({ page }) => {
  test.skip(!hasCore(), "no emulator core: set E2E_CORE_DIR");
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1400, height: 900 });

  // link the device
  await page.goto("/device");
  const code = pairingCode();
  await page.locator("#d1").evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, code);
  await page.getByRole("checkbox", { name: /I have read and accept/ }).check();
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await expect(page.getByText("Linked · live")).toBeVisible();

  // a game from the Buenos Aires template
  await page.goto("/tools/willy-maker");
  await page.getByRole("button", { name: /Next: the board/ }).click();
  await page.getByRole("radio", { name: /Buenos Aires template/ }).click();
  await page.getByRole("button", { name: /Next: name and players/ }).click();
  await page.getByLabel("Game title").fill("Dead Air");
  await page.getByRole("button", { name: /Next: the first level/ }).click();
  await page.getByRole("button", { name: "Create the game" }).click();
  await expect(page.getByRole("button", { name: "Build" })).toBeVisible();

  // Create ROM, then Play on my go-link: the site opens the room the device opened
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("button", { name: "Create ROM", exact: true }).click();
  await expect(page.getByText("It boots", { exact: false }).first()).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Play on my go-link" }).click();
  await expect(page).toHaveURL(/\/r\/[0-9a-f-]{36}$/, { timeout: 120_000 });
  await expect
    .poll(async () => page.evaluate(() => {
      const v = document.querySelector("video.video") as HTMLVideoElement | null;
      return v ? v.videoWidth > 0 && v.readyState >= 2 : false;
    }), { timeout: 60_000 })
    .toBe(true);
  await expect(page.getByRole("heading", { name: "Dead Air" }).first()).toBeVisible();
});
