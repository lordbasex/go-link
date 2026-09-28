// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { expectAccessible } from "../a11y";
import { PORTS } from "../ports";
import { pairingCode, panelToken } from "../stack";

// One story, in order: someone opens the site, links their device, comes
// back after a reload, opens the test pattern room, invites a friend (who
// gets in with the code and the PIN, while a second person with the same
// PIN is refused), and finally manages the device from its local panel.

test.describe.configure({ mode: "serial" });

let owner: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  owner = await browser.newContext();
  page = await owner.newPage();
});

test.afterAll(async () => {
  await owner.close();
});

/** Waits until the page's video is playing real frames. */
async function expectVideoPlaying(p: Page) {
  await expect
    .poll(async () => p.evaluate(() => {
      const v = document.querySelector("video.video") as HTMLVideoElement | null;
      return v ? v.videoWidth > 0 && v.readyState >= 2 && !v.paused : false;
    }), { timeout: 30_000 })
    .toBe(true);
}

test("the landing page opens with the quick way into a game", async () => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Your arcade, online/ })).toBeVisible();
  const menu = page.getByRole("navigation", { name: "Main" });
  await expect(menu.getByRole("link")).toHaveText(["How it works", "Rooms", "My device"]);
  await page.getByRole("button", { name: "Join a game" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Join a game" });
  await expect(dialog.getByPlaceholder("123 456 789")).toBeVisible();
  await dialog.getByRole("button", { name: "Got it" }).click();
  await expect(dialog).toBeHidden();
});

test("links the device with its pairing code and shows it live", async () => {
  await page.goto("/device");
  const code = pairingCode();
  expect(code).toMatch(/^\d{9}$/);
  // Pasting the whole code in the first box fills them all.
  await page.locator("#d1").evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, code);
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await expect(page.getByText("Linked · live")).toBeVisible();
  // Hardware and usage arrive over the WebRTC data channel.
  await expect(page.getByRole("region", { name: "Live figures" })).toBeVisible();
  await expectAccessible(page, "linked device dashboard");
});

test("comes back after a reload: the device proves itself, then the browser shows its token", async () => {
  await page.reload();
  await expect(page.getByText("Linked · live")).toBeVisible();
});

test("the test pattern room streams video", async () => {
  await page.getByRole("link", { name: "Test pattern" }).click();
  await expect(page).toHaveURL(/\/r\/[0-9a-f-]{36}$/);
  await expectVideoPlaying(page);
  await expectAccessible(page, "owner's room");
});

test("an invitation lets one person in; the same PIN refuses the next one", async ({ browser }) => {
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Invite to/ });
  const code = (await dialog.locator(".invite-code").first().innerText()).replace(/\s/g, "");
  await expect(dialog.locator(".invite-code").nth(1)).toHaveText(/^\d{6}$/);
  const pin = (await dialog.locator(".invite-code").nth(1).innerText()).trim();
  expect(code).toMatch(/^\d{9}$/);
  await dialog.getByRole("button", { name: "Got it" }).click();

  const guest = await joinAsGuest(browser, code, pin);
  await expectVideoPlaying(guest.page);
  await expectAccessible(guest.page, "guest's room");

  const late = await joinAsGuest(browser, code, pin);
  await expect(late.page.getByText("Someone already came in with this invitation.", { exact: false })).toBeVisible();
  await guest.context.close();
  await late.context.close();
});

/** A browser with no device of its own joins with the code and the PIN. */
async function joinAsGuest(browser: Browser, code: string, pin: string) {
  const context = await browser.newContext();
  const p = await context.newPage();
  await p.goto("/");
  await p.getByRole("button", { name: "Join a game" }).first().click();
  const dialog = p.getByRole("dialog", { name: "Join a game" });
  await dialog.getByPlaceholder("123 456 789").fill(code);
  await dialog.getByPlaceholder("000000").fill(pin);
  await dialog.getByRole("button", { name: "Join", exact: true }).click();
  return { context, page: p };
}

test("the device's local web panel opens with its token and plays its rooms", async ({ browser }) => {
  const context = await browser.newContext();
  const p = await context.newPage();
  await p.goto(`http://127.0.0.1:${PORTS.panel}/`);
  await expect(p.getByRole("heading", { name: "Device panel" })).toBeVisible();
  await p.getByLabel("Panel token").fill(panelToken());
  await p.getByRole("button", { name: "Open the panel" }).click();
  // The panel opens on the rooms; the device page shows it linked.
  await p.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My device" }).click();
  await expect(p.getByText("Linked · live")).toBeVisible();
  // Playing from the panel: signalhub refuses the panel's origin, so the
  // room goes through the device's own socket.
  await p.getByRole("link", { name: "Test pattern" }).click();
  await expectVideoPlaying(p);
  await context.close();
});
