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
  await expect(menu.getByRole("link")).toHaveText(["How it works", "Rooms", "My device", "Docs"]);
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
  // The host accepts the terms of use before linking.
  await page.getByRole("checkbox", { name: /I have read and accept/ }).check();
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
  // The same room in the light theme (the video keeps its dark colors).
  await page.getByRole("button", { name: "Light mode" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectAccessible(page, "owner's room (light)");
  await page.getByRole("button", { name: "Dark mode" }).first().click();
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
  // After the PIN: "What's your name?", checked as it is typed.
  const step = guest.page.getByRole("dialog", { name: "What\u2019s your name?" });
  await expect(step).toBeVisible();
  await expectAccessible(guest.page, "name step");
  await enterName(guest.page, "Zoë");
  await expectVideoPlaying(guest.page);
  await expectAccessible(guest.page, "guest's room");

  const late = await joinAsGuest(browser, code, pin);
  await expect(late.page.getByText("Someone already came in with this invitation.", { exact: false })).toBeVisible();
  await guest.context.close();
  await late.context.close();
});

/** Answers "What's your name?": a symbol is refused as typed, then the name goes in. */
async function enterName(p: Page, name: string) {
  const step = p.getByRole("dialog", { name: "What\u2019s your name?" });
  const field = step.getByRole("textbox", { name: "Your name" });
  await field.fill(`${name}!`);
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(step.getByRole("button", { name: "Enter the room" })).toBeDisabled();
  await field.fill(name);
  await step.getByRole("button", { name: "Enter the room" }).click();
  await expect(step).toBeHidden();
}

/** Wakes a room page's auto-hidden controls (mouse over the video). */
async function wake(p: Page) {
  const stage = p.locator(".video-stage");
  const box = await stage.boundingBox();
  if (box) await p.mouse.move(box.x + box.width / 2 + Math.random() * 10, box.y + box.height / 3, { steps: 4 });
  await expect(stage).not.toHaveClass(/is-idle/);
}

/** A new invitation from the owner's room: the 9 digit code and its PIN. */
async function newInvitation() {
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Invite to/ });
  await expect(dialog.locator(".invite-code").nth(1)).toHaveText(/^\d{6}$/);
  const code = (await dialog.locator(".invite-code").first().innerText()).replace(/\s/g, "");
  const pin = (await dialog.locator(".invite-code").nth(1).innerText()).trim();
  await dialog.getByRole("button", { name: "Got it" }).click();
  return { code, pin };
}

test("only the host pauses: a player asks, the host accepts or declines, a guest's pause is refused", async ({ browser }) => {
  // Several rounds with two browsers: slower CI machines need more than the default minute.
  test.setTimeout(180_000);
  const { code, pin } = await newInvitation();
  // This guest's browser is tampered with: every hello carries a name with
  // symbols and emoji, and the page keeps the control channel to send what
  // the website would never send. The device must clean and refuse.
  const context = await browser.newContext();
  // This guest uses the light theme.
  await context.addInitScript(() => localStorage.setItem("go-link.theme", "light"));
  await context.addInitScript(() => {
    const send = RTCDataChannel.prototype.send;
    RTCDataChannel.prototype.send = function (this: RTCDataChannel, data: string | Blob | ArrayBuffer | ArrayBufferView) {
      if (this.label === "control") {
        (window as unknown as { __control: RTCDataChannel }).__control = this;
        if (typeof data === "string" && data.includes('"hello"')) {
          const m = JSON.parse(data) as { name?: string };
          m.name = "<b>Zoë</b> 😀!!";
          data = JSON.stringify(m);
        }
      }
      return send.call(this, data as string);
    } as typeof RTCDataChannel.prototype.send;
  });
  const g = await context.newPage();
  await g.goto("/");
  await g.getByRole("button", { name: "Join a game" }).first().click();
  const join = g.getByRole("dialog", { name: "Join a game" });
  await join.getByPlaceholder("123 456 789").fill(code);
  await join.getByPlaceholder("000000").fill(pin);
  await join.getByRole("checkbox", { name: /I have read and accept/ }).check();
  await join.getByRole("button", { name: "Join", exact: true }).click();
  await enterName(g, "Zoe");
  await expectVideoPlaying(g);
  await expectAccessible(g, "guest's room (light)");

  // The device cleaned the name: everyone sees "bZoëb".
  await expect(page.locator(".players-capsule [aria-label*='bZoëb']").first()).toBeAttached();

  // A guest's own pause is refused by the device, whatever its page sends.
  await g.evaluate(() => (window as unknown as { __control: RTCDataChannel }).__control.send(JSON.stringify({ type: "pause", paused: true })));
  await expect(g.getByText("Only the host pauses the game: ask for a pause instead.")).toBeVisible();
  await expect(g.locator(".video-paused")).toHaveCount(0);

  // Ask; the host accepts: paused for everyone, in the requester's name.
  await wake(g);
  await g.getByRole("button", { name: "Ask the host for a pause" }).click();
  await expect(g.getByText("You asked the host for a pause…")).toBeVisible();
  const ask = page.getByRole("alertdialog", { name: "bZoëb wants to pause" });
  await expect(ask).toBeVisible();
  await expectAccessible(page, "host's pause request");
  await ask.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(g.locator(".video-paused-label")).toHaveText("Paused by bZoëb");
  await expect(page.locator(".video-paused-label")).toHaveText("Paused by bZoëb");
  await expect(g.getByText("bZoëb asked for a pause and", { exact: false }).first()).toBeVisible();
  // Only the host resumes.
  await expect(g.locator(".video-paused").getByRole("button", { name: "Resume" })).toHaveCount(0);
  await page.locator(".video-paused").getByRole("button", { name: "Resume" }).click();
  await expect(g.locator(".video-paused")).toHaveCount(0);

  // Ask again; the host would rather keep playing.
  await wake(g);
  await g.getByRole("button", { name: "Ask the host for a pause" }).click();
  await page.getByRole("alertdialog", { name: "bZoëb wants to pause" }).getByRole("button", { name: "Keep playing" }).click();
  await expect(g.locator(".pause-note")).toHaveText("The host would rather keep playing");
  await expect(g.locator(".video-paused")).toHaveCount(0);

  // Asking and withdrawing leaves nothing for the host.
  await wake(g);
  await g.getByRole("button", { name: "Ask the host for a pause" }).click();
  await expect(page.getByRole("alertdialog", { name: "bZoëb wants to pause" })).toBeVisible();
  await g.getByRole("button", { name: "Cancel the request for a pause" }).first().click();
  await expect(page.getByRole("alertdialog", { name: "bZoëb wants to pause" })).toHaveCount(0);

  // The host away from the room, on another page of the linked website,
  // still gets the request, naming the room.
  const roomUrl = page.url();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Rooms" }).click();
  await wake(g);
  await g.getByRole("button", { name: "Ask the host for a pause" }).click();
  const notice = page.getByRole("alertdialog", { name: "bZoëb wants to pause \u201cTest pattern\u201d" });
  await expect(notice).toBeVisible();
  await expectAccessible(page, "pause request notice");
  await notice.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(g.locator(".video-paused-label")).toHaveText("Paused by bZoëb");
  await page.goto(roomUrl);
  await page.locator(".video-paused").getByRole("button", { name: "Resume" }).click();
  await expect(g.locator(".video-paused")).toHaveCount(0);
  await context.close();
});

test("the controller test page lights the keyboard's buttons", async ({ browser }) => {
  const context = await browser.newContext();
  const p = await context.newPage();
  await p.goto("/test-controller");
  await expect(p.getByRole("heading", { level: 1, name: "Test controller" })).toBeVisible();
  await p.keyboard.down("ArrowLeft");
  await p.keyboard.down("KeyX");
  await expect(p.getByText("Left · Button 2")).toBeVisible();
  await expect(p.locator(".test-pad .tc-lamp.is-on")).toHaveCount(2);
  await expect(p.locator(".test-controller-latency")).toContainText("ms");
  await p.keyboard.up("ArrowLeft");
  await p.keyboard.up("KeyX");
  await expect(p.getByText("Nothing pressed yet")).toBeVisible();
  await context.close();
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
  await dialog.getByRole("checkbox", { name: /I have read and accept/ }).check();
  await dialog.getByRole("button", { name: "Join", exact: true }).click();
  return { context, page: p };
}

test("the device's local web panel opens with its token and plays its rooms", async ({ browser }) => {
  const context = await browser.newContext();
  const p = await context.newPage();
  await p.goto(`http://127.0.0.1:${PORTS.panel}/`);
  await expect(p.getByRole("heading", { name: "Device panel" })).toBeVisible();
  await p.getByLabel("Panel token").fill(panelToken());
  await p.getByRole("checkbox", { name: /I have read and accept/ }).check();
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
