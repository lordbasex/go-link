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
  await expect(menu.getByRole("link")).toHaveText(["How it works", "Rooms", "My device", "Docs", "Tools"]);
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

test("the host picks the video quality of game rooms, and the device keeps it", async () => {
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "Video quality" }) });
  const quality = card.getByRole("combobox", { name: "Quality" });
  await expect(quality).toHaveText(/High/);
  await quality.click();
  await page.getByRole("option", { name: /^Saver/ }).click();
  // The select shows what the device reports back in device_status.
  await expect(quality).toHaveText(/Saver/);
  await page.reload();
  await expect(page.getByText("Linked · live")).toBeVisible();
  await expect(quality).toHaveText(/Saver/);
  await quality.click();
  await page.getByRole("option", { name: /^High/ }).click();
  await expect(quality).toHaveText(/High/);
});

test("the test pattern room streams video", async () => {
  // four accessibility checks and the picture styles: a slow runner needs more than the default minute
  test.setTimeout(120_000);
  await page.getByRole("link", { name: "Test pattern" }).click();
  await expect(page).toHaveURL(/\/r\/[0-9a-f-]{36}$/);
  await expectVideoPlaying(page);
  await expectAccessible(page, "owner's room");
  // The same room in the light theme (the video keeps its dark colors).
  await switchTheme(page, "Light mode");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectAccessible(page, "owner's room (light)");
  await expectOutputList(page, "light");
  await switchTheme(page, "Dark mode");
  await expectOutputList(page, "dark");
  await expectPictureStyles(page);
  await expectControlsBesideTheVideo(page);
  // The stream figures: the test card is sent at its own size (no 2x).
  await clickControl(page, "Connection details");
  const figures = page.getByRole("dialog", { name: "Connection details" });
  await expect(figures).toContainText("640×480");
  await expect(figures).not.toContainText("2×");
  await page.keyboard.press("Escape");
});

/** In a room the theme lives in the header's "…" (Settings). */
async function switchTheme(p: Page, name: "Light mode" | "Dark mode") {
  await p.getByRole("button", { name: "Settings" }).click();
  const menu = p.getByRole("menu", { name: "Settings" });
  await expect(menu.getByRole("menuitem", { name: /Device linked/ })).toBeVisible();
  await menu.getByRole("menuitem", { name, exact: true }).click();
  await p.keyboard.press("Escape");
  await expect(menu).toBeHidden();
}

/** The side panel is one canvas with tabs: the dock's controls button opens
 * it on Controls (the keyboard and gamepads), the video keeps its height,
 * the Chat tab brings the chat back, and the header's chat button closes and
 * reopens the panel. */
async function expectControlsBesideTheVideo(p: Page) {
  const stage = p.locator(".video-stage");
  const before = await stage.boundingBox();
  const canvas = p.getByRole("tablist", { name: "Room panel" });
  await clickControl(p, "Show controls");
  await expect(canvas.getByRole("tab", { name: "Controls" })).toHaveAttribute("aria-selected", "true");
  const panel = p.locator("#canvas-controls");
  await expect(panel.getByText("Keyboard").first()).toBeVisible();
  // The keyboard fits the panel: nothing to scroll sideways.
  expect(await panel.locator(".controls-panel").evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await expect(p.getByRole("textbox", { name: "Message" })).toBeHidden();
  const after = await stage.boundingBox();
  expect(Math.abs((after?.height ?? 0) - (before?.height ?? 0))).toBeLessThan(2);
  await expectAccessible(p, "room controls in the side panel");
  // Chat holds everything else: your place, the chat, the queue and the spectators.
  await canvas.getByRole("tab", { name: "Chat" }).click();
  await expect(p.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect(p.getByRole("tablist", { name: "Room", exact: true }).getByRole("tab", { name: "Queue" })).toBeVisible();
  const width = (await p.locator(".room-canvas").boundingBox())?.width;
  await canvas.getByRole("tab", { name: "Controls" }).click();
  expect((await p.locator(".room-canvas").boundingBox())?.width).toBe(width);
  await canvas.getByRole("tab", { name: "Chat" }).click();
  await p.getByRole("button", { name: "Close the panel" }).click();
  await expect(canvas).toBeHidden();
  await p.getByRole("button", { name: "Show the chat" }).click();
  await expect(canvas.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
}

/** The dock's Picture settings switch the GPU renderer on and off live, without a reload. */
async function expectPictureStyles(p: Page) {
  const stage = p.locator(".video-stage");
  // The site's default: smooth, with the game's colors on the sides (drawn by the GPU).
  await expect(stage).toHaveAttribute("data-picture-style", "smooth");
  await expect(stage).toHaveAttribute("data-picture-bands", "ambient");
  await expect(stage).toHaveAttribute("data-picture", /^webgl2?$/);
  await clickControl(p, "Picture");
  const settings = p.getByRole("dialog", { name: "Picture" });
  await settings.getByRole("combobox", { name: "Style" }).click();
  await p.getByRole("option", { name: /^Sharp/ }).click();
  await expect(stage).toHaveAttribute("data-picture", /^webgl2?$/);
  await expect(stage.locator("canvas.picture-canvas")).toBeVisible();
  await settings.getByRole("combobox", { name: "Sides" }).click();
  await p.getByRole("option", { name: /^Ambient/ }).click();
  await settings.getByRole("button", { name: "Compare" }).click();
  await expect(p.getByRole("slider", { name: "Comparison divider" })).toBeVisible();
  await expectAccessible(p, "room picture settings");
  // The game keeps playing under the canvas (sound, screenshots, recordings).
  await expectVideoPlaying(p);
  await settings.getByRole("button", { name: "Compare" }).click();
  await settings.getByRole("combobox", { name: "Style" }).click();
  await p.getByRole("option", { name: /^Smooth(?! edges)/ }).click();
  await settings.getByRole("combobox", { name: "Sides" }).click();
  await p.getByRole("option", { name: /^Black/ }).click();
  await expect(stage).toHaveAttribute("data-picture", "off");
  await p.keyboard.press("Escape");
  await expect(settings).toBeHidden();
}

/** The room's Output list (the site's Select) opens inside the voice settings, passes the checker and closes alone. */
async function expectOutputList(p: Page, theme: string) {
  await clickControl(p, "Volume and voice");
  const settings = p.getByRole("dialog", { name: /voice/i });
  const output = settings.getByRole("combobox", { name: "Output" });
  await output.click();
  await expect(p.getByRole("listbox", { name: "Output" })).toBeVisible();
  await expect(p.getByRole("option", { name: "System default" })).toHaveAttribute("aria-selected", "true");
  await expectAccessible(p, `room output list (${theme})`);
  await p.keyboard.press("Escape");
  await expect(p.getByRole("listbox")).toBeHidden();
  await expect(settings).toBeVisible();
  await expect(output).toBeFocused();
  await p.keyboard.press("Escape");
  await expect(settings).toBeHidden();
}

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

test("the host's picture default reaches guests who never chose one; a guest's own choice wins", async ({ browser }) => {
  test.setTimeout(150_000);
  const stage = page.locator(".video-stage");
  // The owner picks CRT arcade and makes it the room's default.
  await clickControl(page, "Picture");
  const settings = page.getByRole("dialog", { name: "Picture" });
  await settings.getByRole("combobox", { name: "Style" }).click();
  await page.getByRole("option", { name: /^CRT arcade/ }).click();
  await expect(stage).toHaveAttribute("data-picture-style", "crt");
  await settings.getByRole("button", { name: "Set as the room's default" }).click();
  // The device sends it back to everyone in room_state.
  await expect(settings.getByText("Room default: CRT arcade · Black")).toBeVisible();
  await expect(settings.getByText("This is the room's default.")).toBeVisible();
  await expectAccessible(page, "owner's picture settings");
  await page.keyboard.press("Escape");

  // A guest who never chose a picture gets the room's default.
  let inv = await newInvitation();
  const fresh = await joinAsGuest(browser, inv.code, inv.pin);
  await enterName(fresh.page, "Ana");
  await expectVideoPlaying(fresh.page);
  const freshStage = fresh.page.locator(".video-stage");
  await expect(freshStage).toHaveAttribute("data-picture-style", "crt");
  await expect(freshStage).toHaveAttribute("data-picture-bands", "black");
  await expect(freshStage).toHaveAttribute("data-picture", /^webgl2?$/);
  await clickControl(fresh.page, "Picture");
  const guestSettings = fresh.page.getByRole("dialog", { name: "Picture" });
  await expect(guestSettings.getByText("Room default: CRT arcade · Black")).toBeVisible();
  // Guests never change the room.
  await expect(guestSettings.getByRole("button", { name: "Set as the room's default" })).toHaveCount(0);
  await fresh.context.close();

  // A guest who chose Sharp before keeps Sharp, and may go back to the room's default.
  inv = await newInvitation();
  const picky = await joinAsGuest(browser, inv.code, inv.pin, (context) =>
    context.addInitScript(() => {
      if (!localStorage.getItem("go-link.picture-style")) localStorage.setItem("go-link.picture-style", "sharp");
    }),
  );
  await enterName(picky.page, "Bea");
  await expectVideoPlaying(picky.page);
  const pickyStage = picky.page.locator(".video-stage");
  await expect(pickyStage).toHaveAttribute("data-picture-style", "sharp");
  await clickControl(picky.page, "Picture");
  const pickySettings = picky.page.getByRole("dialog", { name: "Picture" });
  await expect(pickySettings.getByText("Room default: CRT arcade · Black")).toBeVisible();
  await expect(pickySettings.getByRole("button", { name: "Use the room's default" })).toBeVisible();
  await picky.context.close();

  // My device shows the test pattern room's default, and puts back the site's.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My device" }).click();
  await page.getByRole("button", { name: "Picture default" }).click();
  const dialog = page.getByRole("dialog", { name: "Picture default for \u201cTest pattern\u201d" });
  await expect(dialog.getByText("Now: CRT arcade · Black")).toBeVisible();
  await expectAccessible(page, "picture default dialog");
  await dialog.getByRole("button", { name: "Use the default" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Picture default" }).click();
  await expect(dialog.getByText("Now: the site's default (Smooth · Ambient)")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // Back to the room, with the owner's own picture back to Smooth.
  await page.getByRole("link", { name: "Test pattern" }).click();
  await expectVideoPlaying(page);
  await clickControl(page, "Picture");
  await expect(settings.getByText("Room default:")).toHaveCount(0);
  await settings.getByRole("combobox", { name: "Style" }).click();
  await page.getByRole("option", { name: /^Smooth(?! edges)/ }).click();
  await expect(stage).toHaveAttribute("data-picture", "off");
  await page.keyboard.press("Escape");
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

/**
 * Clicks one of the video's controls, once. They hide again after 3 s
 * without the mouse moving, which a slow runner can spend between waking
 * them and a pointer click (the video then takes the click, and retrying
 * could land a second click that closes what the first one opened). So the
 * controls are woken and seen, then the button gets a single click event.
 */
async function clickControl(p: Page, name: string) {
  const button = p.getByRole("button", { name });
  await wake(p);
  await expect(button).toBeVisible();
  await button.dispatchEvent("click");
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
  await clickControl(g, "Ask the host for a pause");
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
  await clickControl(g, "Ask the host for a pause");
  await page.getByRole("alertdialog", { name: "bZoëb wants to pause" }).getByRole("button", { name: "Keep playing" }).click();
  await expect(g.locator(".pause-note")).toHaveText("The host would rather keep playing");
  await expect(g.locator(".video-paused")).toHaveCount(0);

  // Asking and withdrawing leaves nothing for the host.
  await clickControl(g, "Ask the host for a pause");
  await expect(page.getByRole("alertdialog", { name: "bZoëb wants to pause" })).toBeVisible();
  await g.getByRole("button", { name: "Cancel the request for a pause" }).first().click();
  await expect(page.getByRole("alertdialog", { name: "bZoëb wants to pause" })).toHaveCount(0);

  // The host away from the room, on another page of the linked website,
  // still gets the request, naming the room.
  const roomUrl = page.url();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Rooms" }).click();
  await clickControl(g, "Ask the host for a pause");
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
async function joinAsGuest(browser: Browser, code: string, pin: string, prepare?: (context: BrowserContext) => Promise<void>) {
  const context = await browser.newContext();
  await prepare?.(context);
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
