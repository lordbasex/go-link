// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import * as A from "./android";
import { pairingCode } from "./stack";

// The browser side of the Android tests (e2e/tests/android*.spec.ts): the
// owner's Chromium page that links the device, opens the test pattern room
// and makes invitations, browser guests that fill the seats, and the app
// steps every Android test shares (pointing it at the test signalhub,
// typing the PIN).

/** A context whose pages keep every RTCPeerConnection in window.__pcs, so their WebRTC counters can be read. */
export async function trackedContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const Native = window.RTCPeerConnection;
    const all: RTCPeerConnection[] = [];
    (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs = all;
    const Patched = function (this: unknown, ...args: ConstructorParameters<typeof RTCPeerConnection>) {
      const pc = new Native(...args);
      all.push(pc);
      return pc;
    } as unknown as typeof RTCPeerConnection;
    Patched.prototype = Native.prototype;
    Object.setPrototypeOf(Patched, Native);
    window.RTCPeerConnection = Patched;
  });
  return context;
}

/** The owner links the device with its pairing code and opens the test pattern room (taking P1). */
export async function ownerOpensTestPattern(page: Page) {
  await page.goto("/device");
  const code = pairingCode();
  expect(code).toMatch(/^\d{9}$/);
  await page.locator("#d1").evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, code);
  await page.getByRole("checkbox", { name: /I have read and accept/ }).check();
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await expect(page.getByText("Linked · live")).toBeVisible();
  await page.getByRole("link", { name: "Test pattern" }).click();
  await expect(page).toHaveURL(/\/r\/[0-9a-f-]{36}$/);
  await expect
    .poll(() => page.evaluate(() => (document.querySelector("video.video") as HTMLVideoElement | null)?.videoWidth ?? 0), { timeout: 30_000 })
    .toBeGreaterThan(0);
}

export interface Invitation {
  /** The link the website shows (on the test stack's own address). */
  url: string;
  invite: string;
  code: string;
  pin: string;
}

/** Opens the owner's Invite dialog: a fresh one-person PIN for the room. */
export async function invite(page: Page): Promise<Invitation> {
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Invite to/ });
  await expect(dialog.locator(".invite-code").nth(1)).toHaveText(/^\d{6}$/);
  const url = (await dialog.locator(".invite-url").innerText()).trim();
  const code = (await dialog.locator(".invite-code").first().innerText()).replace(/\s/g, "");
  const pin = (await dialog.locator(".invite-code").nth(1).innerText()).trim();
  await dialog.getByRole("button", { name: "Got it" }).click();
  const token = url.split("/g/")[1]!.trim();
  expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(code).toMatch(/^\d{9}$/);
  return { url, invite: token, code, pin };
}

/** A browser with no device of its own joins with the code and the PIN (the website's Join a game form). */
export async function joinAsBrowserGuest(browser: Browser, code: string, pin: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const p = await context.newPage();
  await p.goto("/");
  await p.getByRole("button", { name: "Join a game" }).first().click();
  const dialog = p.getByRole("dialog", { name: "Join a game" });
  await dialog.getByPlaceholder("123 456 789").fill(code);
  await dialog.getByPlaceholder("000000").fill(pin);
  await dialog.getByRole("checkbox", { name: /I have read and accept/ }).check();
  await dialog.getByRole("button", { name: "Join", exact: true }).click();
  return { context, page: p };
}

/** Wakes a room page's auto-hidden overlays (mouse over the video) so its controls can be clicked. */
export async function wakeStage(page: Page) {
  const stage = page.locator(".video-stage");
  const box = await stage.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2 + Math.random() * 10, box.y + box.height / 2, { steps: 4 });
  await expect(stage).not.toHaveClass(/is-idle/);
}

/** The seat a room page holds (its own avatar in the players capsule), or 0. */
export async function ownSeat(page: Page): Promise<number> {
  const label = await page.locator(".players-capsule .capsule-avatar.is-you").first().getAttribute("aria-label").catch(() => null);
  return Number(label?.match(/^P(\d)/)?.[1] ?? 0);
}

/** The app is pointed at the test signalhub in Settings (debug builds accept ws:// to the computer). */
export async function pointAppAt(url: string) {
  A.shell(`am start -n ${A.PACKAGE}/.MainActivity`);
  await A.tapOn({ id: "home-settings" }, 60_000);
  await A.fill({ id: "settings-server-url" }, url);
  A.hideKeyboard();
  await A.tapOn({ id: "settings-server-save" });
  // Saved only after the server answered hello.
  await A.waitFor({ text: "Saved: new rooms use this server." }, 20_000);
  await A.waitFor({ text: `Custom signaling server: ${url}` });
}

/** Fills the app's PIN form (the invitation is already on it) and joins. */
export async function joinWithPin(pin: string) {
  await A.fill({ id: "join-pin" }, pin);
  A.hideKeyboard();
  const terms = await A.waitFor({ id: "terms-check" });
  if (!terms.checked) A.tap(terms);
  await A.tapOn({ id: "join-button" });
}

/** A clean app: installed, no server, no terms, no passes, no permissions but Bluetooth; screen on. */
export function freshApp(apk: string) {
  A.installApp(apk);
  A.shell(`am force-stop ${A.PACKAGE}`);
  A.shell(`pm clear ${A.PACKAGE}`);
  // Skip the headphones explainer (Bluetooth); the microphone is granted later on purpose.
  A.shell(`pm grant ${A.PACKAGE} android.permission.BLUETOOTH_CONNECT || true`);
  A.shell("cmd connectivity airplane-mode disable || true");
  A.shell("settings put system screen_off_timeout 1800000");
  // A fresh emulator shows the one-time "Viewing full screen" hint over the
  // app the first time it goes full screen; mark it as already seen.
  A.shell("settings put secure immersive_mode_confirmations confirmed");
  A.shell("input keyevent KEYCODE_WAKEUP");
  A.shell("wm dismiss-keyguard || true");
  // A slow emulator may already show a system dialog (the launcher not
  // responding); a dump closes it before the app starts.
  A.dump();
}
