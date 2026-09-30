// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { expect, test } from "@playwright/test";
import { expectAccessible } from "../a11y";

// The picture styles demo: the GPU renderer's shaders compile in a real
// browser and every style and side can be picked live, without a device.

test("the picture demo draws every style and side with the GPU", async ({ page }) => {
  // CI machines draw WebGL in software: every style and side takes longer there.
  test.setTimeout(240_000);
  const problems: string[] = [];
  page.on("console", (m) => {
    if (/shader|program|picture renderer/i.test(m.text())) problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(String(e)));
  await page.goto("/picture-demo");
  await expect(page.getByRole("heading", { level: 1, name: "Picture styles" })).toBeVisible();
  const stage = page.locator(".picture-demo-stage");
  await expect(stage).toHaveAttribute("data-renderer", /^webgl2?$/);
  await expect(page.getByRole("slider", { name: "Comparison divider" })).toBeVisible();
  const pick = async (label: string, option: string) => {
    await page.getByRole("combobox", { name: label }).click();
    await page.getByRole("option", { name: new RegExp(`^${option}(?! edges)`) }).click();
  };
  for (const style of ["Sharp", "CRT arcade", "Smooth edges", "Smooth"]) {
    await pick("Style", style);
    for (const side of ["Ambient", "Frame", "Black"]) await pick("Sides", side);
  }
  // Remembered for the rooms too.
  await pick("Style", "Sharp");
  expect(await page.evaluate(() => localStorage.getItem("go-link.picture-style"))).toBe("sharp");
  await expect(stage).toHaveAttribute("data-renderer", /^webgl2?$/);
  expect(problems).toEqual([]);
  await expectAccessible(page, "picture demo");
});
