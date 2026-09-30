// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "../android";

// The gamepad skins on the go-link Player Android app, in its debug lab
// (--es lab skin: a skin around the test card, no room): every built-in
// skin in portrait and landscape, each control sends its own bit and then
// 0, and in landscape the menu over the picture folds into its handle
// while in portrait (under the picture) it stays. Mirrors the iOS app's
// testSkinPad. Screenshots go to test-results/android-skins.
//
// Run with: npm run test:android:skins (needs an emulator or phone in
// `adb devices` and the debug APK: ./gradlew :app:assembleDebug in
// mobile/android). Skipped when no device is attached.

const here = dirname(fileURLToPath(import.meta.url));
const APK = process.env.ANDROID_APK || resolve(here, "../../mobile/android/app/build/outputs/apk/debug/app-debug.apk");
const OUT = resolve(here, "../test-results/android-skins");
const serial = A.attachedDevice();
test.skip(!serial, "no Android device in `adb devices`");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Portrait (0) or landscape (1), with auto-rotate off. */
function rotate(landscape: boolean) {
  A.shell("settings put system accelerometer_rotation 0");
  A.shell(`settings put system user_rotation ${landscape ? 1 : 0}`);
}

async function logText(): Promise<string> {
  return A.find({ id: "pad-log" })?.text ?? "";
}

test("every skin's controls answer in both orientations", async () => {
  if (!existsSync(APK)) throw new Error(`no APK at ${APK}: run ./gradlew :app:assembleDebug in mobile/android`);
  if (process.env.ANDROID_SERIAL === undefined) process.env.ANDROID_SERIAL = serial!;
  mkdirSync(OUT, { recursive: true });
  A.installApp(APK);
  const skins: [string, number, number][] = [["violet", 6, 2], ["blue", 4, 2], ["green", 2, 4], ["orange", 3, 1], ["red", 6, 4], ["smoke", 1, 2]];
  try {
    for (const [skin, buttons, starts] of skins) {
      rotate(false);
      A.shell(`am force-stop ${A.PACKAGE}`);
      A.shell(`am start -n ${A.PACKAGE}/.MainActivity --es lab skin --es skin ${skin} --ei buttons ${buttons} --ei starts ${starts}`);
      for (const landscape of [false, true]) {
        rotate(landscape);
        const name = landscape ? "landscape" : "portrait";
        await A.waitFor({ id: "pad-layout", text: name }, 15_000);
        await sleep(800);
        A.screenshot(join(OUT, `${skin}-${name}.png`));
        const press = async (id: string, bits: number, at?: (n: A.UiNode) => [number, number]) => {
          A.tap(await A.waitFor({ id: "pad-clear" }));
          await expect.poll(logText, { timeout: 5_000 }).toBe("");
          const n = await A.waitFor({ id }, 5_000);
          A.hold(at ? at(n) : A.center(n), 300);
          await expect.poll(logText, { timeout: 5_000, message: `${id} in ${skin} ${name}` }).toBe(`${bits} 0`);
        };
        await press("pad-button-1", 1 << 4);
        await press(`pad-button-${buttons}`, 1 << (3 + buttons));
        await press("pad-coin", 1 << 11);
        await press(`pad-start-${starts}`, 1 << (17 + starts));
        const [l, t, r, b] = [0, 1, 2, 3];
        await press("pad-dpad", 1 << 3, (n) => [Math.round(n.bounds[l] + (n.bounds[r] - n.bounds[l]) * 0.85), Math.round((n.bounds[t] + n.bounds[b]) / 2)]);
        await press("pad-dpad", 1 << 0, (n) => [Math.round((n.bounds[l] + n.bounds[r]) / 2), Math.round(n.bounds[t] + (n.bounds[b] - n.bounds[t]) * 0.15)]);
      }
      // Landscape: the menu over the picture folds into its handle.
      await A.waitFor({ id: "dock-handle" }, 8_000);
      if (skin === "violet") A.screenshot(join(OUT, "violet-landscape-menu-hidden.png"));
      // Portrait: under the picture, it stays.
      rotate(false);
      await A.waitFor({ id: "pad-layout", text: "portrait" }, 15_000);
      await sleep(4_000);
      expect(A.find({ id: "dock-handle" }), `${skin}: the portrait menu must stay`).toBeUndefined();
      expect(A.find({ id: "lab-settings" }), `${skin}: the portrait menu is shown`).toBeDefined();
    }
  } finally {
    rotate(false);
    A.shell(`am force-stop ${A.PACKAGE}`);
  }
});
