// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { MAKER_URL } from "../ports";

// A whole game made in the new editor with art from an image AI, the way a
// user would: the pictures in fixtures/maker-art were made from the prompts
// Willy Maker writes (PROMPTS.md), pasted in an image AI, and are used as
// they came. The test makes the game with the wizard over the background,
// marks its zones, imports the hero, the enemy and an item in Characters,
// places them, plays the level, runs the bots and creates the ROM, which
// powers on in the board model. Every step leaves a screenshot and the
// numbers it saw in test-results/maker-games/ (report.json), for a review
// of what the tool did with the pictures.

const HERE = dirname(fileURLToPath(import.meta.url));
const ART = join(HERE, "..", "fixtures", "maker-art");
const OUT = join(HERE, "..", "test-results", "maker-games");
const art = (name: string) => join(ART, name);
const hasArt = ["background.png", "hero.png", "enemy.png", "item.png"].every(
  (f) => existsSync(art(f)),
);

interface SavedLevel {
  id: string;
  size: { w: number; h: number };
  zones?: { kind: string; x: number; y: number; w: number; h: number }[];
  layers: {
    kind: string;
    items?: {
      name: string;
      type: string;
      x: number;
      y: number;
      kind?: string;
      look?: string;
    }[];
  }[];
}
interface SavedProject {
  title: string;
  levels: SavedLevel[];
  characters: {
    id: string;
    name: string;
    role: string;
    height: number;
    frames: unknown[];
    anims: Record<string, { frames: string[] }>;
  }[];
  settings: { players: number; slots?: { character?: string }[] };
}

/** The games made: a platform shooter (the wizard's first genre) and a beat 'em up, with the same pictures. */
const GAMES = [
  { dir: "platform-shooter", title: "Neon Rescue", genre: null },
  { dir: "beat-em-up", title: "Dock Brawl", genre: /^Beat 'em up/ },
] as const;

let out = OUT;
let report: Record<string, unknown> = {};
const note = (key: string, value: unknown) => {
  report[key] = value;
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
};

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(out, `${name}.png`) });
}

async function saved(page: Page): Promise<SavedProject> {
  const id = page.url().split("/").pop()!.split("?")[0];
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    `go-link.wm.p.${id}`,
  );
}

/** A level point (level px) on the screen, from the canvas's level box. */
async function toScreen(page: Page, x: number, y: number) {
  const box = (await page.locator(".studio-level").boundingBox())!;
  const p = await saved(page);
  const z = box.width / p.levels[0]!.size.w;
  return { x: box.x + x * z, y: box.y + y * z };
}

/** Draws a zone of a kind by dragging over the canvas, from one level corner to the other. */
async function drawZone(
  page: Page,
  kind: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  await page
    .locator(".studio-options")
    .getByRole("button", { name: kind, exact: true })
    .click();
  const a = await toScreen(page, x + 2, y + 2);
  const b = await toScreen(page, x + w - 2, y + h - 2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

/** Imports one sheet in Characters: the picture, a name, a role, the rows, then Save. */
async function importCharacter(
  page: Page,
  file: string,
  name: string,
  role: string,
  rows: boolean,
  height?: number,
) {
  const screen = page.locator(".wms");
  if (await screen.getByRole("button", { name: "Save character" }).isEnabled())
    await screen
      .getByRole("button", { name: /New character/ })
      .first()
      .click();
  await screen
    .getByLabel("Choose a picture", { exact: true })
    .setInputFiles(art(file));
  await expect(screen.getByText(/Found \d+ frames in your sheet/)).toBeVisible({
    timeout: 60_000,
  });
  const found = Number(
    (await screen
      .getByText(/Found \d+ frames in your sheet/)
      .textContent())!.match(/\d+/)![0],
  );
  await screen.getByRole("textbox", { name: "Name" }).fill(name);
  await screen
    .getByRole("combobox", { name: "Role" })
    .selectOption({ label: role });
  if (height)
    await screen
      .getByRole("spinbutton", { name: "Height on screen" })
      .fill(String(height));
  let assigned = "";
  if (rows) {
    await screen.getByRole("button", { name: "Assign by rows" }).click();
    assigned = (await screen.getByText(/^Assigned: /).textContent()) ?? "";
  } else {
    await screen.getByRole("button", { name: "Select all" }).click();
    await screen
      .getByRole("button", { name: /Add the selected frames/ })
      .click();
  }
  await shot(page, `characters-${name.toLowerCase()}`);
  const save = screen.getByRole("button", { name: "Save character" });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(
    screen.getByRole("status").filter({ hasText: "Saved" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(async () =>
      (await saved(page)).characters.some((c) => c.name === name),
    )
    .toBe(true);
  const ch = (await saved(page)).characters.find((c) => c.name === name)!;
  return {
    found,
    assigned,
    id: ch.id,
    frames: ch.frames.length,
    anims: Object.fromEntries(
      Object.entries(ch.anims).map(([k, v]) => [k, v.frames.length]),
    ),
  };
}

/** Places a picker card at the view's centre, then moves it with the Properties fields. */
async function place(
  page: Page,
  insert: string,
  tab: string,
  card: string,
  x: number,
  y: number,
) {
  await page
    .locator(".studio-left")
    .getByRole("button", { name: insert })
    .click();
  const picker = page.locator(".studio-picker");
  await picker
    .getByRole("tab", { name: tab })
    .click()
    .catch(() => undefined);
  await picker.locator(".studio-pick-card", { hasText: card }).first().click();
  await picker.getByRole("button", { name: "Place" }).click();
  await moveSelected(page, x, y);
}

async function moveSelected(page: Page, x: number, y: number) {
  const props = page.locator(".studio-props");
  await props.getByLabel("X", { exact: true }).fill(String(x));
  await props.getByLabel("Y", { exact: true }).fill(String(y));
  await props.getByLabel("Y", { exact: true }).blur();
}

test.skip(
  !hasArt,
  "needs the image AI pictures in e2e/fixtures/maker-art (see PROMPTS.md)",
);

for (const G of GAMES)
  test(`Willy Maker: ${G.title} (${G.dir}) made with image AI art, from the wizard to the ROM`, async ({
    page,
  }) => {
    test.setTimeout(900_000);
    out = join(OUT, G.dir);
    report = { game: G.title, genre: G.dir };
    mkdirSync(out, { recursive: true });
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(String(e)));
    await page.setViewportSize({ width: 1600, height: 960 });
    // Playwright's Chromium crashes when the page asks for Chrome's built-in AI (translation, proofreading,
    // dictation); without them Willy Maker works as in any other browser (ai/chromeAi.ts)
    await page.addInitScript(() => {
      for (const k of [
        "LanguageDetector",
        "Translator",
        "Proofreader",
        "LanguageModel",
        "SpeechRecognition",
        "webkitSpeechRecognition",
      ])
        delete (self as unknown as Record<string, unknown>)[k];
    });
    await page.goto(`${MAKER_URL}/`);

    await test.step("the wizard over the image AI background", async () => {
      await expect(
        page.getByRole("heading", { name: /My games/ }),
      ).toBeVisible();
      await shot(page, "01-home");
      await page.getByRole("button", { name: "New game" }).click();
      const wiz = page.getByRole("dialog");
      if (G.genre) await wiz.getByRole("radio", { name: G.genre }).click();
      await wiz.getByRole("button", { name: /^Next: / }).click(); // the genre
      await wiz.getByRole("button", { name: /^Next: / }).click(); // CPS-1, 3 buttons
      await wiz.getByPlaceholder("The Lag Protocol").fill(G.title);
      await wiz.getByRole("button", { name: /^Next: / }).click();
      await wiz
        .locator('input[type="file"]')
        .setInputFiles(art("background.png"));
      await expect(
        wiz.getByRole("radio", { name: /background\.png/ }),
      ).toHaveAttribute("aria-checked", "true");
      await shot(page, "02-wizard-background");
      await wiz.getByRole("button", { name: /^Next: / }).click(); // hero: Willy for now, the courier comes from Characters
      await wiz.getByRole("button", { name: /^Next: / }).click();
      await shot(page, "03-wizard-summary");
      await wiz.getByRole("button", { name: "Create game" }).click();
      await expect(page).toHaveURL(new RegExp(`^${MAKER_URL}/[0-9a-f-]{36}$`));
      await expect(page.locator(".studio-level")).toBeVisible();
      const p = await saved(page);
      note("level", {
        size: p.levels[0]!.size,
        objects: p.levels[0]!.layers.find((l) => l.kind === "objects")!.items,
      });
      await shot(page, "04-editor");
    });

    // the picture's walkway, the two piers and the crane's deck, in level px: the picture is fitted to the level's height
    const W = (await saved(page)).levels[0]!.size.w;
    const zonesSaved = async () =>
      ((await saved(page)).levels[0]!.zones ?? []).length;

    await test.step("zones over the picture", async () => {
      await drawZone(page, "Floor", 0, 208, W, 64);
      await drawZone(page, "Platform", 0, 128, 48, 16);
      await drawZone(page, "Platform", 304, 160, 80, 16);
      await drawZone(page, "Platform", 432, 128, 48, 16);
      await page.keyboard.press("v");
      await expect.poll(zonesSaved).toBe(4);
      const zones = (await saved(page)).levels[0]!.zones ?? [];
      note("zones", zones);
      await shot(page, "05-zones");
    });

    await test.step("the image AI prompt choices the hero's sheet was made with", async () => {
      await page
        .locator(".studio-left")
        .getByRole("button", { name: "Image AI prompts…" })
        .click();
      const dlg = page.getByRole("dialog", { name: "Prompt for an image AI" });
      await expect(dlg).toBeVisible();
      await dlg.getByRole("button", { name: "None", exact: true }).click();
      // by keyboard: hovering an animation shows its example, which moves the list under the pointer
      for (const a of ["idle", "walk", "jump", "shoot", "hit", "death"]) {
        const box = dlg.getByRole("checkbox", {
          name: new RegExp(`\\b${a} · \\d`),
        });
        await box.focus();
        await page.keyboard.press("Space");
        await expect(box).toBeChecked();
      }
      await shot(page, "06-prompt-dialog");
      await dlg
        .getByRole("button", { name: "Close", exact: true })
        .first()
        .click();
    });

    const chars: Record<string, unknown> = {};
    await test.step("Characters: the hero, the enemy and the item", async () => {
      await page
        .locator(".studio-workspaces")
        .getByRole("button", { name: "Characters" })
        .click();
      chars.hero = await importCharacter(
        page,
        "hero.png",
        "Courier",
        "Hero",
        true,
      );
      chars.enemy = await importCharacter(
        page,
        "enemy.png",
        "Sentinel",
        "Enemy",
        true,
      );
      // an item has no role of its own: any character can draw a pickup, at the size it is given
      chars.item = await importCharacter(
        page,
        "item.png",
        "Battery",
        "Boss",
        false,
        20,
      );
      note("characters", chars);
    });

    await test.step("Game: player 1 plays the courier", async () => {
      await page
        .locator(".studio-workspaces")
        .getByRole("button", { name: "Game" })
        .click();
      await page
        .getByRole("combobox", { name: "Character of player 1" })
        .selectOption({ label: "Courier" });
      // the tango pack: La Cumparsita on the title, its songs and effects on every screen
      await page.getByRole("button", { name: "Put in the tango pack" }).click();
      const title = page.getByRole("combobox", { name: "Title", exact: true });
      await expect(title).toHaveValue("own:la-cumparsita");
      await title.scrollIntoViewIfNeeded();
      await shot(page, "07-game");
    });

    await test.step("the level: the start, two sentinels, a battery and the exit", async () => {
      await page
        .locator(".studio-workspaces")
        .getByRole("button", { name: "Level" })
        .click();
      await expect(page.locator(".studio-level")).toBeVisible();
      // the wizard put the start and the exit on its own floor line; they go on the walkway
      const layers = page.locator(".studio-layers-list");
      await layers
        .getByText(/^Player 1/)
        .first()
        .click();
      await moveSelected(page, 48, 208);
      await layers
        .getByText(/^Exit$/)
        .first()
        .click();
      await moveSelected(page, 448, 208);
      await place(page, "Enemy…", "Enemies", "Sentinel", 240, 208);
      await place(page, "Enemy…", "Enemies", "Sentinel", 400, 208);
      await place(page, "Object…", "Objects", "Health", 336, 160);
      await page
        .locator(".studio-props")
        .getByRole("combobox", { name: /Picture/ })
        .selectOption({ label: "Battery" });
      const objectsSaved = async () =>
        (await saved(page)).levels[0]!.layers.find((l) => l.kind === "objects")!
          .items!;
      await expect
        .poll(
          async () =>
            (await objectsSaved()).find((o) => o.type === "pickup")?.look,
        )
        .toBe((chars.item as { id: string }).id);
      const objects = await objectsSaved();
      note("objects", objects);
      expect(
        objects.filter(
          (o) =>
            o.type === "enemy" && o.kind === (chars.enemy as { id: string }).id,
        ),
      ).toHaveLength(2);
      await page.keyboard.press("Escape");
      await shot(page, "08-level");
    });

    await test.step("play it", async () => {
      // play mode reads the keys once a frame: a press is held like a finger does, not for an instant
      const tap = async (key: string, ms = 120) => {
        await page.keyboard.down(key);
        await page.waitForTimeout(ms);
        await page.keyboard.up(key);
      };
      await page.getByRole("button", { name: "Play", exact: true }).click();
      await expect(
        page.locator(".studio-game canvas, .studio-game-stage canvas").first(),
      ).toBeVisible({ timeout: 30_000 });
      await page
        .locator(".studio-stage, .studio-game")
        .first()
        .focus()
        .catch(() => undefined);
      await page.waitForTimeout(1500);
      await tap("Enter");
      await page.waitForTimeout(800);
      await shot(page, "09-joined");
      const game = page.locator(".studio-game");
      const frame = async () => Number(await game.getAttribute("data-frame"));
      const startFrame = await frame();
      await page.keyboard.down("ArrowRight");
      for (let i = 0; i < 14; i++) {
        if (i % 4 === 1) await tap("KeyZ", 200);
        else if (i % 2 === 0) await tap("KeyX");
        else await page.waitForTimeout(300);
        if (i === 5) await shot(page, "10-playing");
      }
      // the game runs on (it is not started again) and player 1 went right
      expect(await frame()).toBeGreaterThan(startFrame + 120);
      note("snapRunning", {
        frame: await frame(),
        p1x: Number(await game.getAttribute("data-p1-x")),
        outcome: await game.getAttribute("data-outcome"),
      });
      await page.keyboard.up("ArrowRight");
      note("play", {
        hud: await page
          .locator(".studio-game")
          .innerText()
          .catch(() => ""),
      });
      await shot(page, "11-playing-later");
      await page.keyboard.press("Escape");
    });

    await test.step("Export: the review, the bots and the ROM on the board model", async () => {
      await page
        .locator(".studio-workspaces")
        .getByRole("button", { name: "Export" })
        .click();
      const review = page.locator(".wm-checks").first();
      await expect(review).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(3000);
      note("review", await review.locator("li").allInnerTexts());
      const [project] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: /Download project/ }).click(),
      ]);
      await project.saveAs(join(out, project.suggestedFilename()));
      await shot(page, "12-export-review");
      const bots = page.getByRole("button", { name: "Run the bots" });
      if (await bots.isEnabled()) {
        await bots.click();
        await page.waitForTimeout(2000);
        await expect(
          page.getByText(/cleared in \d+ s|game over|stuck|did not/).first(),
        ).toBeVisible({ timeout: 240_000 });
        note("bots", await page.locator(".wm-export").innerText());
        await shot(page, "13-bots");
      }
      const create = page.getByRole("button", { name: "Create ROM" });
      note("createRomEnabled", await create.isEnabled());
      if (await create.isEnabled()) {
        await create.click();
        await expect(
          page
            .getByText(
              /Your game on the board model, frame \d+|could not|failed/i,
            )
            .first(),
        ).toBeVisible({ timeout: 300_000 });
        note("rom", await page.locator(".wm-export").innerText());
        await page
          .getByText(/Your game on the board model/)
          .first()
          .scrollIntoViewIfNeeded()
          .catch(() => undefined);
        await shot(page, "14-rom-power-on");
        const download = page.getByRole("button", { name: /Download ROM/ });
        if (await download.isEnabled().catch(() => false)) {
          const [file] = await Promise.all([
            page.waitForEvent("download"),
            download.click(),
          ]);
          await file.saveAs(join(out, file.suggestedFilename()));
          note("romFile", file.suggestedFilename());
        }
      }
    });

    note("pageErrors", problems);
    expect(problems).toEqual([]);
  });
