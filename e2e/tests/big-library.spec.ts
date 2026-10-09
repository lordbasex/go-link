// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { pairingCode } from "../stack";

// A full MAME 0.78 collection is about 5,000 sets, and its list does not
// fit one WebRTC message (Chrome: 256 KiB): with the whole library in
// device_status, My device › ROMs never loaded. Now the device sends the
// library in numbers and pages of sets on request. This points the device
// at a folder of 6,000 sets and checks that the list loads, pages and is
// searched by the device, here and in New game.

// E2E_BIG_ROMS_DIR=/path/to/a/real/collection runs it on that folder instead
// (left untouched), with E2E_CORE_DIR for the sets' checks;
// E2E_BIG_SHOTS=DIR keeps screenshots there.
const REAL = process.env.E2E_BIG_ROMS_DIR;
const SHOTS = process.env.E2E_BIG_SHOTS;
const SETS = REAL ? readdirSync(REAL).filter((f) => /^[a-z0-9_]{1,16}\.zip$/.test(f)).length : 6000;
// The smallest zip: an empty end of central directory record. Without the
// core's game list (CI has none) the device lists the sets unchecked.
const EMPTY_ZIP = Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]);
const setName = (i: number) => `s${String(i).padStart(5, "0")}`;

test("a library of 6,000 sets loads, pages and is searched on the device", async ({ page }) => {
  test.setTimeout(180_000);
  const dir = REAL ?? mkdtempSync(join(tmpdir(), "go-link-big-"));
  if (!REAL) for (let i = 0; i < SETS; i++) writeFileSync(join(dir, `${setName(i)}.zip`), EMPTY_ZIP);
  const sets = readdirSync(dir).filter((f) => f.endsWith(".zip")).map((f) => f.slice(0, -4)).sort();
  const last = sets[sets.length - 1]!;
  const shot = async (name: string) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  };
  let before = "";
  try {
    await page.goto("/device");
    await page.locator("#d1").evaluate((el, text) => {
      const data = new DataTransfer();
      data.setData("text", text);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, pairingCode());
    await page.getByRole("checkbox", { name: /I have read and accept/ }).check();
    await page.getByRole("button", { name: "Link", exact: true }).click();
    await expect(page.getByText("Linked · live")).toBeVisible();

    await page.goto("/device/roms");
    const folder = page.getByLabel("ROM folder on the device's computer");
    before = await folder.inputValue();
    await folder.fill(dir);
    await page.getByRole("button", { name: "Use this folder" }).first().click();

    // The first page, from the device: 60 cards of 6,000.
    await expect(page.getByText(`Showing ${SETS} of ${SETS}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".roms-card")).toHaveCount(60);
    await shot("roms");
    // Scrolling to the end of the list asks for the next page.
    await page.locator(".list-more").scrollIntoViewIfNeeded();
    await expect(page.locator(".roms-card")).toHaveCount(120);
    // The device searches the whole library, not the pages shown.
    await page.getByPlaceholder("Search game, set or maker").fill(last);
    if (REAL) {
      // a real set's clones share its title, so they match too
      await expect(page.getByText(new RegExp(`Showing \\d of ${SETS}`))).toBeVisible();
      await expect(page.locator(".roms-card", { hasText: `${last} ·` })).toHaveCount(1);
    } else {
      await expect(page.getByText(`Showing 1 of ${SETS}`)).toBeVisible();
      await expect(page.locator(".roms-card")).toHaveCount(1);
    }
    await shot("roms-search");

    // New game picks from the same library, searched on the device too.
    await page.goto("/create");
    await expect(page.getByText(`${SETS} games in the library`)).toBeVisible();
    await page.getByRole("button", { name: /^Game/ }).first().click();
    // Every set runs here: without the game list none is checked.
    await expect(page.getByText(REAL ? /Showing 60 of \d+: type to narrow/ : `Showing 60 of ${SETS}: type to narrow`)).toBeVisible();
    await shot("new-game");
    if (!REAL) {
      await page.getByRole("combobox").fill(setName(4321));
      await expect(page.getByRole("option", { name: new RegExp(setName(4321)) })).toBeVisible();
      await expect(page.getByRole("option")).toHaveCount(1);
    }
  } finally {
    // Leave the device on its own folder for the other tests.
    if (before) {
      await page.goto("/device/roms");
      await page.getByLabel("ROM folder on the device's computer").fill(before);
      await page.getByRole("button", { name: "Use this folder" }).first().click();
      await expect(page.getByLabel("ROM folder on the device's computer")).toHaveValue(before);
    }
    if (!REAL) rmSync(dir, { recursive: true, force: true });
  }
});
