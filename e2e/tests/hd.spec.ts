// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { pairingCode, stack } from "../stack";

// go-link HD's experiment (T-31, docs/experiments/hd-streaming.md): the test
// room streams the HD scene through the real WebRTC path, and Chrome measures
// what arrives. Runs only when asked:
//   E2E_HD=out.json E2E_DEVICE_ARGS="--test-room-hd 1080p --hd-far far.png --hd-play play.png" \
//     npx playwright test tests/hd.spec.ts --project=web

test.skip(!process.env.E2E_HD, "go-link HD's experiment runs only with E2E_HD");

test("the HD scene reaches a room: frames, size and the device's CPU", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/device");
  await page.locator("#d1").evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, pairingCode());
  await page.getByRole("checkbox", { name: /I have read and accept/ }).check();
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await expect(page.getByText("Linked · live")).toBeVisible();
  await page.getByRole("link", { name: "Test pattern" }).click();
  await expect
    .poll(async () => page.evaluate(() => {
      const v = document.querySelector("video.video") as HTMLVideoElement | null;
      return v ? v.videoWidth > 0 && v.readyState >= 2 && !v.paused : false;
    }), { timeout: 60_000 })
    .toBe(true);
  await page.waitForTimeout(5000); // the encoder and the jitter buffer settle
  const read = () => page.evaluate(() => {
    const v = document.querySelector("video.video") as HTMLVideoElement;
    const q = v.getVideoPlaybackQuality();
    return { t: performance.now(), frames: q.totalVideoFrames, dropped: q.droppedVideoFrames, w: v.videoWidth, h: v.videoHeight };
  });
  const cpu: number[] = [];
  const a = await read();
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    // the device's process, found by its binary (ps adds every thread's CPU: 100 = one core)
    const line = execFileSync("ps", ["-Awwo", "pid=,%cpu=,command="], { env: { ...process.env, LC_ALL: "C" } }).toString().split("\n").find((l) => l.includes(stack().bin) && l.includes("--headless"));
    if (line) cpu.push(Number(line.trim().split(/\s+/)[1]));
  }
  const b = await read();
  const secs = (b.t - a.t) / 1000;
  await page.mouse.move(400, 300);
  await page.getByRole("button", { name: "Connection details" }).click();
  const details = await page.getByRole("dialog", { name: "Connection details" }).innerText();
  const result = {
    args: process.env.E2E_DEVICE_ARGS ?? "",
    size: `${b.w}x${b.h}`,
    fps: (b.frames - a.frames) / secs,
    droppedPerSecond: (b.dropped - a.dropped) / secs,
    deviceCpuPercent: cpu.reduce((x, y) => x + y, 0) / cpu.length,
    details: details.replace(/\s+/g, " ").trim(),
  };
  writeFileSync(process.env.E2E_HD!, JSON.stringify(result, null, 2));
  expect(b.w).toBeGreaterThan(0);
});
