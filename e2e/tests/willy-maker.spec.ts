// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { MAKER_URL } from "../ports";

// Willy Maker end to end, on its own site (no signalhub, no device):
// create a Buenos Aires game, paint, place an object, play a few frames,
// undo, reload (the autosave brings it back) and export both zips.

/** The names of the files in a .zip, from its central directory. */
function zipNames(bytes: Buffer): string[] {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  const count = bytes.readUInt16LE(end + 10);
  let p = bytes.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const n = bytes.readUInt16LE(p + 28);
    names.push(bytes.subarray(p + 46, p + 46 + n).toString("utf8"));
    p += 46 + n + bytes.readUInt16LE(p + 30) + bytes.readUInt16LE(p + 32);
  }
  return names;
}

/** The saved project, straight from the browser's storage. */
async function saved(page: Page, id: string): Promise<{ title: string; levels: { layers: { kind: string; data?: string; items?: { name: string; type: string }[] }[] }[] }> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), `go-link.wm.p.${id}`);
}

test("Willy Maker: create, paint, place, play, undo, reload and export", async ({ page }) => {
  test.setTimeout(180_000);
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(String(e)));
  await page.setViewportSize({ width: 1400, height: 900 });
  // the classic editor (the new one is the default; this checks the classic flow end to end)
  await page.goto(`${MAKER_URL}/?editor=classic`);

  // the wizard: the genre (only the platform shooter today), then the Buenos Aires template
  await page.getByRole("button", { name: /Next: the board/ }).click();
  await page.getByRole("radio", { name: /Buenos Aires template/ }).click();
  await page.getByRole("button", { name: /Next: name and players/ }).click();
  await page.getByLabel("Game title").fill("Dead Air");
  await page.getByRole("button", { name: /Next: the first level/ }).click();
  await page.getByRole("button", { name: "Create the game" }).click();
  await expect(page.getByRole("button", { name: "Build" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`^${MAKER_URL}/[0-9a-f-]{36}$`));
  const id = page.url().split("/").pop()!;
  await expect(page.getByText("saved in this browser")).toBeVisible();
  const canvas = page.getByRole("application", { name: /Level canvas/ });
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const objects = async () => (await saved(page, id)).levels[0]!.layers.find((l) => l.kind === "objects")!.items!.length;
  const collision = async () => (await saved(page, id)).levels[0]!.layers.find((l) => l.kind === "tags")!.data;

  // paint a few solid cells with the pencil
  const before = await collision();
  await page.getByRole("button", { name: "Pencil: paint the part (B)" }).click();
  const parts = page.getByRole("region", { name: "Parts" });
  await parts.getByRole("button", { name: "Solid", exact: true }).click();
  await page.mouse.move(box.x + 300, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 200, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: /^Undo: / })).toBeEnabled();
  await expect.poll(collision).not.toBe(before);
  const painted = await collision();

  // place an object
  const count = await objects();
  await parts.getByRole("tab", { name: "Objects" }).click();
  await parts.locator(".wm-partgrid button").first().click();
  await page.mouse.click(box.x + 500, box.y + 160);
  await expect.poll(objects).toBe(count + 1);

  // play a few frames: the clock moves
  await page.getByTitle("Play the level (P)").click();
  const clock = page.getByText(/time \d+:\d\d/);
  await expect(clock).toBeVisible();
  await page.keyboard.down("ArrowRight");
  await expect(clock).toHaveText(/time 0:0[1-9]/);
  await page.keyboard.up("ArrowRight");
  await page.getByRole("button", { name: "Back to building" }).click();
  await expect(canvas).toBeVisible();

  // undo takes the object back off, the paint stays
  await page.getByRole("button", { name: /^Undo: / }).click();
  await expect.poll(objects).toBe(count);
  expect(await collision()).toBe(painted);

  // the autosave keeps it across a reload
  await expect(page.getByText("saved in this browser")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Build" })).toBeVisible();
  expect(await objects()).toBe(count);
  expect(await collision()).toBe(painted);

  // export both zips, after the review (and its picture checks) is done
  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Ready|warning/ })).toBeVisible();
  const [project] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download project/ }).click()]);
  expect(project.suggestedFilename()).toBe("dead-air.willy.zip");
  const projectFiles = zipNames(readFileSync((await project.path())!));
  expect(projectFiles).toEqual(expect.arrayContaining(["project.json", "README.txt"]));
  expect(projectFiles.some((n) => n.startsWith("assets/"))).toBe(true);
  const download = page.getByRole("button", { name: /Download AI pack/ });
  await expect(download).toBeEnabled();
  const [pack] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), download.click()]);
  expect(pack.suggestedFilename()).toBe("dead-air.ai-pack.zip");
  const packFiles = zipNames(readFileSync((await pack.path())!));
  expect(packFiles[0]).toBe("PROMPT.md");
  expect(packFiles).toEqual(expect.arrayContaining(["project.json", "review.json", "levels/level-1.tmj", "tilesets/collision.png", "tilesets/ts-city.png", "docs/art-spec.md"]));
  await expect(page.getByText("Downloaded dead-air.ai-pack.zip")).toBeVisible();
  expect(problems).toEqual([]);
});
