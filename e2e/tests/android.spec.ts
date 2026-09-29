// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "../android";
import { PORTS } from "../ports";
import { pairingCode, stack } from "../stack";

// The go-link Player Android app against the test stack (its own signalhub,
// headless device and website). The owner is a Chromium page that links the
// device, opens the test pattern room (taking P1, with Chromium's fake
// microphone tone) and makes invitations; the app, driven through adb and
// UiAutomator, joins as a guest. The app's debug build logs its room events
// and WebRTC counters (tag GoLinkE2E), and the device runs with --debug so
// its log shows every input packet.
//
// Run with: npm run test:android (needs an emulator or phone in `adb
// devices` and the debug APK: ./gradlew :app:assembleDebug in
// mobile/android). Skipped when no device is attached.

const here = dirname(fileURLToPath(import.meta.url));
const APK = process.env.ANDROID_APK || resolve(here, "../../mobile/android/app/build/outputs/apk/debug/app-debug.apk");
// The emulator reaches the computer at 10.0.2.2; a phone can use
// `adb reverse tcp:8191 tcp:8191` and ANDROID_SIGNAL_URL=ws://127.0.0.1:8191/ws.
const SIGNAL_URL = process.env.ANDROID_SIGNAL_URL || `ws://10.0.2.2:${PORTS.signal}/ws`;
const OUT = resolve(here, "../test-results/android");

const serial = A.attachedDevice();
test.skip(!serial, "no Android device in `adb devices`");
test.describe.configure({ mode: "serial" });

let owner: BrowserContext;
let page: Page;
let probe: A.Probe;
let recorder: A.ScreenRecorder;
let shot = 0;
let appPort = 0;
let ownerPort = 0;
const usedPins: string[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function snap(name: string) {
  A.screenshot(join(OUT, `${String(++shot).padStart(2, "0")}-${name}.png`));
}

/** The device log from `from` (a byte offset) on. */
function deviceLog(from = 0): string {
  return readFileSync(stack().deviceLog, "utf8").slice(from);
}

test.beforeAll(async ({ browser }) => {
  if (!existsSync(APK)) throw new Error(`no APK at ${APK}: run ./gradlew :app:assembleDebug in mobile/android`);
  if (process.env.ANDROID_SERIAL === undefined) process.env.ANDROID_SERIAL = serial;
  mkdirSync(OUT, { recursive: true });
  A.adb("install", "-r", APK);
  // A clean app: no server, no terms, no passes, no permissions.
  A.shell(`am force-stop ${A.PACKAGE}`);
  A.shell(`pm clear ${A.PACKAGE}`);
  // Skip the headphones explainer (Bluetooth); the microphone is granted later on purpose.
  A.shell(`pm grant ${A.PACKAGE} android.permission.BLUETOOTH_CONNECT || true`);
  A.shell("cmd connectivity airplane-mode disable || true");
  A.shell("settings put system screen_off_timeout 1800000");
  A.shell("input keyevent KEYCODE_WAKEUP");
  A.shell("wm dismiss-keyguard || true");
  probe = new A.Probe();
  probe.start();
  recorder = new A.ScreenRecorder();
  recorder.start();

  owner = await browser.newContext();
  // Keep every RTCPeerConnection so the owner's WebRTC counters can be read.
  await owner.addInitScript(() => {
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
  page = await owner.newPage();
});

test.afterAll(async () => {
  try {
    A.shell("cmd connectivity airplane-mode disable || true");
    snap("end");
    A.shell(`am force-stop ${A.PACKAGE}`);
  } catch {
    // the device went away
  }
  probe?.stop();
  const videos = recorder ? await recorder.stop(OUT) : [];
  await owner?.close();
  // Optional copy of the evidence (screen recording and screenshots).
  const evidence = process.env.E2E_EVIDENCE_DIR;
  if (evidence) {
    mkdirSync(evidence, { recursive: true });
    cpSync(OUT, evidence, { recursive: true });
  }
  console.log(`android evidence: ${OUT} (${videos.length} recording chunk(s))`);
});

/** Opens the owner's Invite dialog: a fresh one-person PIN for the room. */
async function invite(): Promise<{ invite: string; code: string; pin: string }> {
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Invite to/ });
  await expect(dialog.locator(".invite-code").nth(1)).toHaveText(/^\d{6}$/);
  const url = await dialog.locator(".invite-url").innerText();
  const code = (await dialog.locator(".invite-code").first().innerText()).replace(/\s/g, "");
  const pin = (await dialog.locator(".invite-code").nth(1).innerText()).trim();
  await dialog.getByRole("button", { name: "Got it" }).click();
  const token = url.split("/g/")[1]!.trim();
  expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(code).toMatch(/^\d{9}$/);
  return { invite: token, code, pin };
}

/** Fills the app's PIN form (the invitation is already on it) and joins. */
async function joinWithPin(pin: string) {
  await A.fill({ id: "join-pin" }, pin);
  A.hideKeyboard();
  const terms = await A.waitFor({ id: "terms-check" });
  if (!terms.checked) A.tap(terms);
  await A.tapOn({ id: "join-button" });
}

/** Waits until the app streams from a seat; returns its port. */
async function waitSeated(from: number): Promise<number> {
  const e = await probe.waitFor((x) => x.ev === "ui" && x.phase === "STREAMING" && /^P\d/.test(String(x.me)), 60_000, from);
  return Number(String(e.me).slice(1, 2));
}

/** Sums a counter of one track over the app's latest stats line. */
function appIn(track: string, key: keyof A.TrackStats): number {
  return Number(probe.lastStats()?.in?.[track]?.[key] ?? 0);
}

async function leaveRoom() {
  A.hideKeyboard();
  await A.tapOn({ desc: "Leave" });
  await A.waitFor({ id: "home-code" });
}

/** Clicks a control on the owner's video dock, waking the auto-hidden overlays first. */
async function clickOnStage(target: ReturnType<Page["locator"]>) {
  const stage = page.locator(".video-stage");
  const box = await stage.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await expect(stage).not.toHaveClass(/is-idle/);
  await target.click();
}

/** The owner's inbound RTP packets for a stream id (e.g. voice-p2), from the SDP's msid lines. */
async function ownerInbound(stream: string): Promise<number> {
  return page.evaluate(async (want) => {
    let total = 0;
    for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs) {
      if (pc.connectionState === "closed" || !pc.remoteDescription) continue;
      const mids = new Map<string, string>();
      for (const section of pc.remoteDescription.sdp.split(/\r?\nm=/)) {
        const mid = section.match(/a=mid:(\S+)/)?.[1];
        const msid = section.match(/a=msid:(\S+)/)?.[1];
        if (mid && msid) mids.set(mid, msid);
      }
      const stats = await pc.getStats();
      stats.forEach((s: { type: string; kind?: string; mid?: string; packetsReceived?: number }) => {
        if (s.type === "inbound-rtp" && s.kind === "audio" && s.mid && mids.get(s.mid) === want) total += s.packetsReceived ?? 0;
      });
    }
    return total;
  }, stream);
}

test("the owner links the device and opens the test pattern room", async () => {
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
});

test("the app is pointed at the local signalhub from Settings (debug build only)", async () => {
  A.shell(`am start -n ${A.PACKAGE}/.MainActivity`);
  await A.tapOn({ id: "home-settings" }, 60_000);
  await A.fill({ id: "settings-server-url" }, SIGNAL_URL);
  A.hideKeyboard();
  await A.tapOn({ id: "settings-server-save" });
  // Saved only after the server answered hello.
  await A.waitFor({ text: "Saved: new rooms use this server." }, 20_000);
  await A.waitFor({ text: `Custom signaling server: ${SIGNAL_URL}` });
  snap("settings-local-server");
  A.shell("input keyevent 4");
  await A.waitFor({ id: "home-code" });
});

test("joins by App Link with the PIN and the terms, takes a seat and shows the picture", async () => {
  const inv = await invite();
  usedPins.push(inv.pin);
  const from = probe.mark();
  // The link carries only the invitation; the PIN is typed in the app.
  A.shell(`am start -a android.intent.action.VIEW -d https://go-link.org/g/${inv.invite} ${A.PACKAGE}`);
  await A.waitFor({ text: `https://go-link.org/g/${inv.invite}` });
  snap("app-link-pin-form");
  await joinWithPin(inv.pin);
  appPort = await waitSeated(from);
  const seat = await A.waitFor({ id: "room-seat", text: `You are P${appPort}` });
  const ui = probe.lastUi()!;
  ownerPort = Number(String(ui.seats).match(/P(\d)=(?!-)\S+/g)?.map((s) => Number(s[1])).find((p) => p !== appPort) ?? 0);
  expect(ownerPort).toBeGreaterThan(0);
  // The picture: the area between the title and the dock is lit and varied (not black).
  await expect.poll(() => appIn("video", "frames"), { timeout: 30_000 }).toBeGreaterThan(30);
  await sleep(1500);
  const dock = await A.waitFor({ id: "dock-mic" });
  const picture = A.pictureStats([0, seat.bounds[3] + 8, 1_000_000, dock.bounds[1] - 8]);
  snap("room-streaming");
  console.log(`app P${appPort} (owner P${ownerPort}); picture lit ${picture.litShare.toFixed(2)}, ${picture.colors} colors; path ${probe.lastStats()?.path}`);
  expect(picture.litShare).toBeGreaterThan(0.25);
  expect(picture.colors).toBeGreaterThan(8);
});

test("the on-screen gamepad reaches the device", async () => {
  const offset = deviceLog().length;
  const dpad = await A.waitFor({ id: "pad-dpad" });
  const [l, t, r, b] = dpad.bounds;
  A.hold([Math.round((l + r) / 2), t + Math.round((b - t) * 0.15)], 400); // up
  A.hold([l + Math.round((r - l) * 0.85), Math.round((t + b) / 2)], 400); // right
  A.hold(A.center(await A.waitFor({ id: "pad-button-1" })), 400);
  A.hold(A.center(await A.waitFor({ id: "pad-coin" })), 400);
  snap("gamepad");
  await expect
    .poll(() => {
      const lines = [...deviceLog(offset).matchAll(/msg=input peer_id=\S+ player=0 buttons=(\S+)/g)].map((m) => m[1]);
      return ["up", "right", "b1", "coin"].filter((btn) => lines.includes(btn));
    }, { timeout: 15_000 })
    .toEqual(["up", "right", "b1", "coin"]);
});

test("the game's sound arrives and is decoded (inbound RTP and audio level)", async () => {
  const p0 = appIn("game", "packets");
  const e0 = appIn("game", "energy");
  let maxLevel = 0;
  const end = Date.now() + 8_000;
  while (Date.now() < end) {
    maxLevel = Math.max(maxLevel, appIn("game", "level"));
    await sleep(500);
  }
  const p1 = appIn("game", "packets");
  const e1 = appIn("game", "energy");
  console.log(`game audio: packets ${p0} -> ${p1}, energy ${e0.toFixed(3)} -> ${e1.toFixed(3)}, max level ${maxLevel.toFixed(3)}`);
  expect(p1 - p0).toBeGreaterThan(100); // 50 packets per second of Opus
  expect(e1).toBeGreaterThan(e0);
  expect(maxLevel).toBeGreaterThan(0);
});

test("chat goes both ways", async () => {
  const fromOwner = `owner-says-hi-${Date.now() % 100000}`;
  const fromApp = `android-says-hi-${Date.now() % 100000}`;
  const mark = probe.mark();
  const chat = page.locator("#chatmsg");
  if (!(await chat.isVisible())) await page.getByRole("button", { name: "Show the chat" }).click();
  await chat.fill(fromOwner);
  await chat.press("Enter");
  await probe.waitFor((e) => e.ev === "chat" && e.text === fromOwner, 20_000, mark);

  await A.tapOn({ id: "dock-chat" });
  await A.waitFor({ text: fromOwner });
  await A.fill({ id: "chat-input" }, fromApp);
  await A.tapOn({ id: "chat-send" });
  await expect(page.getByText(fromApp)).toBeVisible();
  await probe.waitFor((e) => e.ev === "chat" && e.text === fromApp, 20_000, mark);
  A.hideKeyboard();
  snap("chat");
  A.shell("input keyevent 4"); // close the sheet
  await A.waitFor({ id: "pad-dpad" });
});

test("voice goes both ways between the seated players", async () => {
  // The owner's fake microphone (a tone) -> the device -> the app's voice-pN track.
  const mic = page.locator("button.mic-toggle");
  await clickOnStage(mic);
  await expect(mic).toHaveAttribute("aria-pressed", "true");
  const track = `voice-p${ownerPort}`;
  const v0 = appIn(track, "packets");
  await expect.poll(() => appIn(track, "packets"), { timeout: 20_000 }).toBeGreaterThan(v0 + 100);
  console.log(`app ${track}: packets ${v0} -> ${appIn(track, "packets")}, level ${appIn(track, "level")}`);

  // The app's microphone -> the device -> the owner's voice-p<app> track.
  A.shell(`pm grant ${A.PACKAGE} android.permission.RECORD_AUDIO`);
  const mark = probe.mark();
  await A.tapOn({ id: "dock-mic" });
  await probe.waitFor((e) => e.ev === "ui" && e.mic === true, 15_000, mark);
  const ownerTrack = `voice-p${appPort}`;
  const o0 = await ownerInbound(ownerTrack);
  await expect.poll(() => Number(probe.lastStats()?.out?.mic?.packets ?? 0), { timeout: 20_000 }).toBeGreaterThan(50);
  await expect.poll(() => ownerInbound(ownerTrack), { timeout: 20_000 }).toBeGreaterThan(o0 + 50);
  console.log(`app mic out ${probe.lastStats()?.out?.mic?.packets} packets; owner ${ownerTrack}: ${o0} -> ${await ownerInbound(ownerTrack)}`);
  snap("voice");
  await A.tapOn({ id: "dock-mic" });
  await clickOnStage(mic);
  await expect(mic).toHaveAttribute("aria-pressed", "false");
});

test("after the network drops the app comes back to its seat without the PIN (return token)", async () => {
  const mark = probe.mark();
  A.shell("cmd connectivity airplane-mode enable");
  try {
    await probe.waitFor((e) => e.ev === "ui" && e.phase !== "STREAMING", 90_000, mark);
    snap("offline");
  } finally {
    A.shell("cmd connectivity airplane-mode disable");
  }
  await waitSeated(mark);
  const events = probe.events.slice(mark).filter((e) => e.ev === "ui");
  // It never stopped to ask for a PIN: the device's return token was used.
  expect(events.some((e) => e.pin_needed === "true" && e.pin_busy === "false")).toBe(false);
  expect(A.find({ id: "room-pin" })).toBeUndefined();
  console.log(`reconnect: ${events.map((e) => `${e.phase}${e.reconnecting === "true" ? "(reconnecting)" : ""}`).join(" > ")}`);
  snap("back-after-network-drop");
});

test("a wrong PIN and an already used PIN are refused; the new invitation's PIN gets in", async () => {
  await leaveRoom();
  const inv = await invite();
  let wrong = String((Number(inv.pin) + 1) % 1_000_000).padStart(6, "0");
  while ([...usedPins, inv.pin].includes(wrong)) wrong = String((Number(wrong) + 7) % 1_000_000).padStart(6, "0");

  // A new join always asks the PIN (the old return token is not used).
  let mark = probe.mark();
  A.shell(`am start -a android.intent.action.VIEW -d https://go-link.org/g/${inv.invite} ${A.PACKAGE}`);
  await A.waitFor({ id: "join-pin" });
  await joinWithPin(wrong);
  const refused = await probe.waitFor((e) => e.ev === "ui" && e.pin_busy === "false" && typeof e.pin_reason === "string", 30_000, mark);
  await A.waitFor({ id: "room-pin-error" });
  snap("wrong-pin");
  console.log(`wrong PIN refused: ${refused.pin_reason}`);
  expect(refused.pin_reason).not.toBe("used");

  // The first invitation's PIN was already used by this app's earlier visit.
  mark = probe.mark();
  await A.fill({ id: "room-pin" }, usedPins[0]!);
  A.hideKeyboard();
  await A.tapOn({ id: "room-pin-send" });
  await probe.waitFor((e) => e.ev === "ui" && e.pin_busy === "false" && e.pin_reason === "used", 30_000, mark);
  await A.waitFor({ id: "room-pin-error" });
  snap("used-pin");

  mark = probe.mark();
  await A.fill({ id: "room-pin" }, inv.pin);
  A.hideKeyboard();
  await A.tapOn({ id: "room-pin-send" });
  usedPins.push(inv.pin);
  appPort = await waitSeated(mark);
  snap("admitted-after-refusals");
});

test("joins with the 9-digit code typed on the home screen", async () => {
  await leaveRoom();
  const inv = await invite();
  const mark = probe.mark();
  await A.tapOn({ id: "home-code" });
  await A.fill({ id: "join-code" }, inv.code);
  await joinWithPin(inv.pin);
  usedPins.push(inv.pin);
  appPort = await waitSeated(mark);
  await A.waitFor({ id: "room-seat", text: `You are P${appPort}` });
  await expect.poll(() => appIn("video", "frames"), { timeout: 30_000 }).toBeGreaterThan(30);
  snap("code-join-streaming");
});
