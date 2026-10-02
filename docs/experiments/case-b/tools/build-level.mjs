// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Case B, step 1: a user builds Game Spec v1's level in Willy Maker.
// Drives the real UI with Playwright (no code of Willy Maker is changed and
// no project data is written by hand): New game, the level, the menus, the
// Export review, the AI pack. Before every action a note is injected into
// the page (what, why, the control outlined), a screenshot is taken and the
// step goes to timeline.json; the whole session is recorded as video.
//
// Usage: node build-level.mjs <out dir> [url] [stop after step]
//   PLAYWRIGHT=<path to playwright/index.mjs> overrides the import.

import { mkdirSync, writeFileSync, renameSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PW = process.env.PLAYWRIGHT ?? "/Volumes/HD12TB/github/MAME-WEBRTC/e2e/node_modules/playwright/index.mjs";
const { chromium } = await import(PW);

const OUT = process.argv[2] ?? "out";
const URL = process.argv[3] ?? "http://localhost:5301/tools/willy-maker";
const STOP = process.argv[4] ? Number(process.argv[4]) : Infinity;
const SHOTS = join(OUT, "shots");
mkdirSync(SHOTS, { recursive: true });
mkdirSync(join(OUT, "video"), { recursive: true });
mkdirSync(join(OUT, "downloads"), { recursive: true });

const VIEW = { width: 1920, height: 1080 };
const NOTE_MS = Number(process.env.NOTE_MS ?? 700);
const t0 = Date.now();
const timeline = [];
const consoleLog = [];
let n = 0;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEW, recordVideo: { dir: join(OUT, "video"), size: VIEW }, acceptDownloads: true, locale: "en-US" });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new globalThis.URL(URL).origin });
const page = await context.newPage();
page.on("console", (m) => consoleLog.push({ t: Date.now() - t0, type: m.type(), text: m.text() }));
page.on("pageerror", (e) => consoleLog.push({ t: Date.now() - t0, type: "pageerror", text: String(e) }));

// ---------------------------------------------------------------- notes

async function showNote(text, box) {
  await page.evaluate(
    ({ text, box, n }) => {
      let el = document.getElementById("__exp1_note");
      if (!el) {
        el = document.createElement("div");
        el.id = "__exp1_note";
        el.style.cssText =
          "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:1100px;padding:10px 16px;border-radius:12px;background:rgba(10,12,20,.92);color:#fff;font:600 17px/1.35 system-ui,sans-serif;border:2px solid #f2a33a;pointer-events:none;box-shadow:0 6px 24px rgba(0,0,0,.5)";
        document.body.appendChild(el);
      }
      el.textContent = `#${n} ${text}`;
      let hl = document.getElementById("__exp1_hl");
      if (!hl) {
        hl = document.createElement("div");
        hl.id = "__exp1_hl";
        hl.style.cssText = "position:fixed;z-index:2147483646;border:3px solid #ff3d7f;border-radius:6px;pointer-events:none;box-shadow:0 0 0 4px rgba(255,61,127,.25)";
        document.body.appendChild(hl);
      }
      if (box) {
        hl.style.display = "block";
        hl.style.left = `${box.x - 4}px`;
        hl.style.top = `${box.y - 4}px`;
        hl.style.width = `${box.width + 8}px`;
        hl.style.height = `${box.height + 8}px`;
      } else hl.style.display = "none";
    },
    { text, box, n },
  );
}

async function hideNote() {
  await page.evaluate(() => {
    document.getElementById("__exp1_note")?.remove();
    document.getElementById("__exp1_hl")?.remove();
  });
}

/**
 * One user action: the note (what and why), the control outlined, a
 * screenshot, the timeline entry, then the action itself.
 */
async function step(text, target, action) {
  n++;
  if (n > STOP) throw new Error(`stopped after step ${STOP}`);
  let box = null;
  let selector = null;
  if (target && typeof target === "object" && "box" in target) box = target.box;
  else if (target) {
    selector = String(target);
    const loc = typeof target === "string" ? page.locator(target).first() : target.first();
    await loc.scrollIntoViewIfNeeded().catch(() => undefined);
    box = await loc.boundingBox().catch(() => null);
  }
  await showNote(text, box);
  await page.waitForTimeout(NOTE_MS);
  const shot = `shots/${String(n).padStart(3, "0")}.png`;
  await page.screenshot({ path: join(OUT, shot) });
  timeline.push({ n, t: Date.now() - t0, at: new Date().toISOString(), text, selector, box, screenshot: shot });
  await hideNote();
  if (action) await action();
  await page.waitForTimeout(150);
}

/** A screenshot without an action (a result to keep). */
async function snap(name, text) {
  const shot = `shots/${name}.png`;
  await page.screenshot({ path: join(OUT, shot) });
  timeline.push({ n: null, t: Date.now() - t0, at: new Date().toISOString(), text, screenshot: shot });
}

// ---------------------------------------------------------------- canvas

const CELL = 16;
const cal = { vx: 0, vy: 0, zoom: 1, left: 0, top: 0, w: 0, h: 0 };

const canvas = () => page.locator("canvas.wm-canvas");

async function readZoom() {
  const txt = await page.locator(".wm-zoom").innerText();
  return Number(txt.replace(/[^\d]/g, "")) / 100;
}

async function inspectorCell() {
  const txt = await page.locator(".wm-inspector").first().innerText();
  const m = /cell (-?\d+),(-?\d+)/i.exec(txt);
  return m ? { c: Number(m[1]), r: Number(m[2]) } : null;
}

async function clickAt(x, y) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(40);
}

/**
 * Where the view is: with the select tool, clicks on empty cells and reads
 * the cell the Inspector names, searching for the pixel where the cell
 * changes (as a user would line up the grid by eye).
 */
async function calibrate(probeY = 120, probeX = 80) {
  await page.locator(`button[aria-label="Select and move (V)"]`).click();
  const r = await canvas().boundingBox();
  cal.left = r.x;
  cal.top = r.y;
  cal.w = r.width;
  cal.h = r.height;
  cal.zoom = await readZoom();
  const z = cal.zoom;
  // x
  const sy = Math.round(r.y + probeY);
  let a = Math.round(r.x + probeX);
  await clickAt(a, sy);
  const c0 = (await inspectorCell())?.c;
  if (c0 === undefined) throw new Error("calibrate: no cell under the probe");
  let lo = a;
  let hi = a + Math.ceil(CELL * z) + 2;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    await clickAt(mid, sy);
    if ((await inspectorCell()).c > c0) hi = mid;
    else lo = mid;
  }
  cal.vx = CELL * (c0 + 1) - (hi - r.x) / z;
  // y
  const sx = Math.round(r.x + probeX);
  let b = Math.round(r.y + probeY);
  await clickAt(sx, b);
  const r0 = (await inspectorCell()).r;
  lo = b;
  hi = b + Math.ceil(CELL * z) + 2;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    await clickAt(sx, mid);
    if ((await inspectorCell()).r > r0) hi = mid;
    else lo = mid;
  }
  cal.vy = CELL * (r0 + 1) - (hi - r.y) / z;
  return { ...cal };
}

/** Screen point of a world point. */
function sxy(wx, wy) {
  return { x: cal.left + (wx - cal.vx) * cal.zoom, y: cal.top + (wy - cal.vy) * cal.zoom };
}
/** Screen point at the middle of a cell. */
function cellXY(c, r) {
  return sxy(c * CELL + CELL / 2, r * CELL + CELL / 2);
}
function cellsBox(c0, r0, c1, r1) {
  const a = sxy(c0 * CELL, r0 * CELL);
  const b = sxy((c1 + 1) * CELL, (r1 + 1) * CELL);
  return { box: { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y } };
}

async function dragCells(c0, r0, c1, r1) {
  const a = cellXY(c0, r0);
  const b = cellXY(c1, r1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(80);
}

// ---------------------------------------------------------------- UI bits

const btn = (name) => page.getByRole("button", { name, exact: true });
const tab = (name) => page.locator(".wm-tabs button", { hasText: name });

async function pickTagChip(label) {
  await page.locator(".wm-toolbar .wm-chips button", { hasText: label }).click();
}

async function pickPart(group, label) {
  await page.locator(".wm-parts [role=tab]", { hasText: group }).click();
  await page.locator(".wm-parts .wm-part", { has: page.locator(".wm-part-label", { hasText: new RegExp(`^${label}$`) }) }).click();
}

async function setNumber(label, value) {
  const input = page.locator(`.wm-inspector input[aria-label="${label}"]`);
  await input.fill(String(value));
  await input.press("Tab");
}

async function setName(value) {
  const input = page.locator(".wm-inspector input.wm-input.wm-mono").first();
  await input.fill(value);
  await input.press("Enter");
}

// ---------------------------------------------------------------- the level
//
// Game Spec v1, Section 1 (docs/experiments/README.md#game-spec-v1), on the
// 16 px grid: 96 × 28 cells, the dock floor on rows 26-27 (top y 416).
// Decisions: docs/experiments/case-b/decisions.md (D-005 onwards).

const FLOOR = 416;
const LEVEL = {
  starts: [32, 48, 64, 80], // P1-P4, inside the spec's x 32-96
  crates: [
    [12, 24], // the 32 px crate (x 192)
    [14, 24], // the 64 px stack (x 224): two crates
    [14, 22],
  ],
  ledge: { c0: 20, c1: 27, r: 22 }, // one-way, top y 352 = 64 px up, x 320-447
  dock: { c0: 37, c1: 71, r: 16 }, // the upper dock, top y 256 = 160 px up, x 592-1151
  ladder: { c: 36, r0: 16, r1: 25 }, // x 576, from the floor to the upper dock
  troopers: [
    { name: "trooper_lower", x: 720, y: FLOOR, why: "the lower dock, under the upper one" },
    { name: "trooper_upper", x: 864, y: 256, why: "the upper dock" },
    { name: "trooper_exit", x: 1344, y: FLOOR, why: "guarding the exit" },
  ],
  civilians: [
    { name: "civ_ledge", kind: "Woman", x: 400, y: 352, why: "on the one-way ledge" },
    { name: "civ_upper", kind: "Child", x: 1088, y: 256, why: "at the end of the upper dock" },
  ],
  exitX: 1440,
};

/** Selects the object whose feet are at (x, y) with the select tool. */
async function selectObject(wx, wy, label) {
  await page.locator(`button[aria-label="Select and move (V)"]`).click();
  const p = sxy(wx + 4, wy - 20);
  await step(`Select ${label}`, { box: { x: p.x - 10, y: p.y - 10, width: 20, height: 20 } }, () => clickAt(p.x, p.y));
}

async function placeObject(group, label, wx, wy, why) {
  await step(`Parts › ${group} › ${label}: pick the stamp`, page.locator(".wm-parts [role=tab]", { hasText: group }), () => pickPart(group, label));
  // picking a stamp keeps the Fill tool when it was on, and Fill does not place objects (journal, finding F-03)
  await step("Pencil tool (B): stamps are placed with the pencil", page.locator(`button[aria-label="Pencil: paint the part (B)"]`), () =>
    page.locator(`button[aria-label="Pencil: paint the part (B)"]`).click(),
  );
  const p = sxy(wx, wy - 4);
  await step(`Place the ${label} ${why} (x ${wx}, feet y ${wy})`, { box: { x: p.x - 12, y: p.y - 30, width: 24, height: 30 } }, () => clickAt(p.x, p.y));
}

async function buildLevel() {
  // starts: the wizard put them at x 32, 56, 80, 104; the spec wants x 32-96
  const from = [32, 56, 80, 104];
  for (let i = 1; i < 4; i++) {
    await selectObject(from[i], FLOOR, `player ${i + 1}'s start`);
    await step(`Player ${i + 1}'s start: X = ${LEVEL.starts[i]} so every start is inside x 32-96`, page.locator(`.wm-inspector input[aria-label="X"]`), () => setNumber("X", LEVEL.starts[i]));
  }
  // the exit
  await selectObject(1488, FLOOR, "the exit (the wizard put it at x 1488)");
  await step(`Exit: X = ${LEVEL.exitX}, the left end of the spec's exit zone x 1440-1504`, page.locator(`.wm-inspector input[aria-label="X"]`), () => setNumber("X", LEVEL.exitX));
  await snap("030-starts-exit", "Starts at x 32-80 and the exit at x 1440");

  // crates
  await step("Parts › Terrain › Crate: a 32 px crate, climbed by pushing", page.locator(".wm-parts [role=tab]", { hasText: "Terrain" }), () => pickPart("Terrain", "Crate"));
  await page.locator(`button[aria-label="Pencil: paint the part (B)"]`).click();
  const crateWhy = ["the first 32 px crate (x 192)", "the stack's lower crate (x 224)", "the stack's upper crate: 64 px in all"];
  for (let i = 0; i < LEVEL.crates.length; i++) {
    const [c, r] = LEVEL.crates[i];
    await step(`Click to place ${crateWhy[i]}`, cellsBox(c, r, c + 1, r + 1), async () => {
      const p = cellXY(c, r);
      await clickAt(p.x, p.y);
    });
    const crateName = ["crate_single", "crate_stack_low", "crate_stack_top"][i];
    await step(`Name it ${crateName}, so the AI pack says what each crate is for`, page.locator(".wm-inspector input.wm-mono").first(), () => setName(crateName));
  }
  await snap("040-crates", "The crates: 32 px, then a 64 px stack");

  // the one-way ledge
  await step("Toolbar: the Platform tag (one-way: stand on it, jump through from below, down + jump drops)", page.locator(".wm-toolbar .wm-chips button", { hasText: "Platform" }), () => pickTagChip("Platform"));
  await step("Fill tool (G): drag a rectangle", page.locator(`button[aria-label="Fill a rectangle (G)"]`), () => page.locator(`button[aria-label="Fill a rectangle (G)"]`).click());
  {
    const { c0, c1, r } = LEVEL.ledge;
    await step("Drag the one-way ledge: 64 px above the dock, x 320-447", cellsBox(c0, r, c1, r), () => dragCells(c0, r, c1, r));
  }
  // the upper dock
  {
    const { c0, c1, r } = LEVEL.dock;
    await step("Drag the upper dock (the second floor): a one-way floor 160 px up, x 592-1151", cellsBox(c0, r, c1, r), () => dragCells(c0, r, c1, r));
  }
  // the ladder
  await step("Toolbar: the Ladder tag", page.locator(".wm-toolbar .wm-chips button", { hasText: "Ladder" }), () => pickTagChip("Ladder"));
  await page.locator(`button[aria-label="Fill a rectangle (G)"]`).click();
  {
    const { c, r0, r1 } = LEVEL.ladder;
    await step("Drag the ladder from the dock floor up to the upper dock (x 576)", cellsBox(c, r0, c, r1), () => dragCells(c, r0, c, r1));
  }
  await snap("050-terrain", "Terrain: crates, the one-way ledge, the ladder and the upper dock");

  // enemies
  for (const tr of LEVEL.troopers) {
    await placeObject("Enemies", "Trooper", tr.x, tr.y, tr.why);
    await step(`Name it ${tr.name} (the AI pack and the warnings use the reference name)`, page.locator(".wm-inspector input.wm-mono").first(), () => setName(tr.name));
    await step(`X = ${tr.x}`, page.locator(`.wm-inspector input[aria-label="X"]`), () => setNumber("X", tr.x));
    await step(`Y = ${tr.y} (feet on the floor)`, page.locator(`.wm-inspector input[aria-label="Y"]`), () => setNumber("Y", tr.y));
    await step("Patrol: 96 px, as the spec asks", page.locator(`.wm-inspector input[aria-label="Patrol (px)"]`), () => setNumber("Patrol (px)", 96));
  }
  // civilians
  for (const cv of LEVEL.civilians) {
    await placeObject("Civilians", cv.kind, cv.x, cv.y, cv.why);
    await step(`Name it ${cv.name}`, page.locator(".wm-inspector input.wm-mono").first(), () => setName(cv.name));
    await step(`X = ${cv.x}`, page.locator(`.wm-inspector input[aria-label="X"]`), () => setNumber("X", cv.x));
    await step(`Y = ${cv.y}`, page.locator(`.wm-inspector input[aria-label="Y"]`), () => setNumber("Y", cv.y));
  }
  await page.locator(`button[aria-label="Select and move (V)"]`).click();
  await snap("060-objects", "Three Troopers, two civilians, the exit");

  // the night sky on the far layer
  await step("Layers: make Far background the active layer, to paint the night sky", page.locator(".wm-layers li", { hasText: "Far background" }), () =>
    page.locator(".wm-layers button.wm-layer-name", { hasText: "Far background" }).click(),
  );
  await step("Parts › Tiles: the sky tileset's tiles", page.locator(".wm-parts [role=tab]", { hasText: "Tiles" }), () => page.locator(".wm-parts [role=tab]", { hasText: "Tiles" }).click());
  await snap("070-sky-tiles", "The sky tileset");
  const sky = [
    { tile: 1, r0: 0, r1: 3, why: "the darkest sky at the top" },
    { tile: 2, r0: 4, r1: 7, why: "night sky" },
    { tile: 3, r0: 8, r1: 11, why: "night sky, lower" },
    { tile: 4, r0: 12, r1: 15, why: "the haze over the city" },
    { tile: 10, r0: 16, r1: 17, why: "the skyline's roofs" },
    { tile: 12, r0: 18, r1: 27, why: "dark buildings behind the docks" },
  ];
  for (const s of sky) {
    await step(`Tile ${s.tile}: ${s.why}`, page.getByRole("button", { name: `Tile ${s.tile}`, exact: true }), async () => {
      await page.getByRole("button", { name: `Tile ${s.tile}`, exact: true }).click();
      await page.locator(`button[aria-label="Fill a rectangle (G)"]`).click();
    });
    await step(`Fill rows ${s.r0 * 16}-${s.r1 * 16 + 15} px across the level`, cellsBox(0, s.r0, 95, s.r1), () => dragCells(0, s.r0, 95, s.r1));
  }
  await step("Layers: back to Collision", page.locator(".wm-layers li", { hasText: "Collision" }), () =>
    page.locator(".wm-layers button.wm-layer-name", { hasText: /^Collision$/ }).click(),
  );
  await page.locator(`button[aria-label="Select and move (V)"]`).click();
  await page.waitForTimeout(500);
  await snap("080-level", "The level, done: night sky, dock, crates, ledge, ladder, upper dock, enemies, civilians, exit");
}

/** The play-test: the level with the ROM's rules, from the keyboard (arrows, Z jump, X fire, Enter start). */
async function playTest() {
  await step("Play (P): test the level with the ROM's rules while building", page.locator(".wm-top button.is-play"), () =>
    page.locator(".wm-top button.is-play").click(),
  );
  await page.waitForTimeout(2000);
  const status = async () => (await page.locator(".wm-play-layer").innerText().catch(() => "")).split("\n").filter((l) => /^P\d/.test(l)).join(" | ");
  await snap("090-play-start", `Play mode: ${await status()}`);
  const hold = async (keys, ms) => {
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(ms);
    for (const k of keys) await page.keyboard.up(k);
  };
  await step("Walk right to the first crate and push against it (a 32 px crate is climbed by pushing)", page.locator(".wm-play-layer canvas").first(), () => hold(["ArrowRight"], 2600));
  await snap("091-play-crate", `After pushing: ${await status()}`);
  await step("Keep pushing right: up onto the 64 px stack", page.locator(".wm-play-layer canvas").first(), () => hold(["ArrowRight"], 1500));
  await snap("092-play-stack", `On the stack: ${await status()}`);
  await step("Jump right (Z) from the stack toward the one-way ledge", page.locator(".wm-play-layer canvas").first(), () => hold(["ArrowRight", "z"], 700));
  await page.waitForTimeout(600);
  await snap("093-play-ledge", `After the jump: ${await status()}`);
  await step("Down + jump: drop through the one-way ledge", page.locator(".wm-play-layer canvas").first(), async () => {
    await page.keyboard.down("ArrowDown");
    await page.keyboard.press("z");
    await page.waitForTimeout(300);
    await page.keyboard.up("ArrowDown");
  });
  await page.waitForTimeout(800);
  await snap("094-play-drop", `After dropping: ${await status()}`);
  await step("Walk right to the ladder and fire (X) at the lower Trooper", page.locator(".wm-play-layer canvas").first(), async () => {
    await hold(["ArrowRight"], 1800);
    for (let i = 0; i < 12; i++) await hold(["x"], 120);
  });
  await snap("095-play-fire", `Firing: ${await status()}`);
  await step("Back to building", page.getByRole("button", { name: "Back to building" }).first(), () => page.getByRole("button", { name: "Back to building" }).first().click());
  await page.waitForTimeout(600);
}

async function menuField(id, value, why) {
  const input = page.locator(`#wm-menu-field-${id}`);
  await step(why, input, async () => {
    await input.fill(value);
    await input.press("Tab");
  });
}

async function gameAndMenus() {
  await step("Game tab: players, actions, each player's character and the DIP switches", tab("Game"), () => tab("Game").click());
  await page.waitForTimeout(800);
  await snap("100-game", "The Game tab: 4 players, B1 jump, B2 fire, B3 special, run 250 ms, P1 Willy, P2-P4 recruit shirts (all as the spec asks)");
  await page.screenshot({ path: join(OUT, "shots/100-game-full.png"), fullPage: true });

  await step("Menus tab: the title and the other screens", tab("Menus"), () => tab("Menus").click());
  await page.waitForTimeout(800);
  await snap("110-menus", "The Menus tab: the title screen");
  await menuField("subtitle", "THE LAG PROTOCOL", "Title screen subtitle: THE LAG PROTOCOL");
  await menuField("prompt", "PUSH START", "Title screen prompt: PUSH START");
  await menuField("credits", "(C) 2026 GO-LINK", "Credits line: (C) 2026 GO-LINK (every screen)");
  await snap("111-title", "The title screen: WILLY GORKLINGO, THE LAG PROTOCOL, PUSH START, (C) 2026 GO-LINK. There is no field for CREDITS n.");
  await page.screenshot({ path: join(OUT, "shots/111-title-full.png"), fullPage: true });

  await step("HUD screen", page.getByRole("tab", { name: "HUD" }), () => page.getByRole("tab", { name: "HUD" }).click());
  await menuField("cleared", "SECTION CLEAR", "HUD › Level clear: SECTION CLEAR, as the spec asks");
  await snap("112-hud", "The HUD screen");
  await page.screenshot({ path: join(OUT, "shots/112-hud-full.png"), fullPage: true });

  await step("Game over screen: the heading stays GAME OVER", page.getByRole("tab", { name: "Game over" }), () => page.getByRole("tab", { name: "Game over" }).click());
  await snap("113-gameover", "The Game over screen");
}

async function exportPack() {
  await step("Export tab: the review before exporting", tab("Export"), () => tab("Export").click());
  // the picture checks start 250 ms after the last change
  await page.waitForFunction(() => !document.querySelector(".wm-review-sum[aria-busy]"), null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  await snap("200-export", `The Export review: ${await page.locator(".wm-review-sum").innerText()}`);
  await page.screenshot({ path: join(OUT, "shots/200-export-full.png"), fullPage: true });
  const checks = await page.locator(".wm-checks li").evaluateAll((els) => els.map((e) => ({ cls: e.className, text: e.innerText.replace(/\s+/g, " ").trim() })));
  writeFileSync(join(OUT, "review-ui.json"), JSON.stringify({ summary: await page.locator(".wm-review-sum").innerText(), checks }, null, 2));

  // fix what the review reports: Fix where offered; a note or warning with only Go is looked at
  for (let round = 0; round < 10; round++) {
    const fix = page.locator(".wm-checks li").filter({ has: page.getByRole("button", { name: "Fix", exact: true }) }).first();
    if (!(await fix.count())) break;
    const text = (await fix.innerText()).replace(/\s+/g, " ");
    await step(`Review: ${text} → Fix`, fix, () => fix.getByRole("button", { name: "Fix", exact: true }).click());
    await page.waitForTimeout(1200);
  }
  const notes = await page.locator(".wm-checks li:not(.is-ok)").evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
  console.log("not ok:", JSON.stringify(notes));
  for (const note of notes) {
    const li = page.locator(".wm-checks li:not(.is-ok)", { hasText: note.replace(/ Go$/, "").slice(0, 30) }).first();
    if (!(await li.getByRole("button", { name: "Go", exact: true }).count())) continue;
    await step(`Review: “${note.replace(/ Go$/, "")}” → Go, to see what it points at`, li, () => li.getByRole("button", { name: "Go", exact: true }).click());
    await page.waitForTimeout(1200);
    await snap(`210-go-${notes.indexOf(note)}`, `Where “${note.replace(/ Go$/, "")}” leads`);
    await step("Back to Export", tab("Export"), () => tab("Export").click());
    await page.waitForFunction(() => !document.querySelector(".wm-review-sum[aria-busy]"), null, { timeout: 30000 });
  }
  await page.waitForTimeout(800);
  await snap("220-export-final", `The final review: ${await page.locator(".wm-review-sum").innerText()}`);

  // the project .zip (a backup and the source of the AI pack) and the AI pack
  for (const [label, file] of [
    ["Download project (.zip)", "project"],
    ["Download AI pack", "ai-pack"],
  ]) {
    const b = page.getByRole("button", { name: label });
    await step(`${label}`, b, async () => {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), b.click()]);
      const name = dl.suggestedFilename();
      await dl.saveAs(join(OUT, "downloads", name));
      timeline.push({ n: null, t: Date.now() - t0, at: new Date().toISOString(), text: `downloaded ${name} (${file})`, download: `downloads/${name}` });
    });
    await page.waitForTimeout(800);
  }
  await snap("230-downloaded", "Both files downloaded");
  const promptBtn = page.getByRole("button", { name: "Copy prompt" });
  await step("Copy prompt (the pack's PROMPT.md)", promptBtn, () => promptBtn.click());
  const prompt = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  if (prompt) writeFileSync(join(OUT, "prompt-copied.md"), prompt);
}

// ---------------------------------------------------------------- the session

const result = { ok: false, error: null };
try {
  await page.goto(URL);
  await page.waitForSelector("#splash", { state: "detached", timeout: 15000 }).catch(() => undefined);
  await page.waitForSelector("text=Which board is your game for?");
  await snap("000-home", "Willy Maker's home: no games yet, the New game wizard open");

  // ---- New game wizard
  await step("New game, step 1: the board is CPS-1 (the only one offered)", ".wm-wizard .wm-choice.is-on >> nth=0", null);
  await step("Layout: 4 players × 3 buttons (slammast), as Game Spec v1 asks", page.getByRole("radio", { name: /4 players · 3 buttons/ }), () =>
    page.getByRole("radio", { name: /4 players · 3 buttons/ }).click(),
  );
  await step("Start from Empty: the spec's level is 1536 × 448, not the 8192 × 672 template", page.getByRole("radio", { name: /^Empty/ }), () =>
    page.getByRole("radio", { name: /^Empty/ }).click(),
  );
  await step("Next: name and players", btn("Next: name and players →"), () => btn("Next: name and players →").click());
  await step("Game title: WILLY GORKLINGO (the spec's title line)", page.getByLabel("Game title"), () => page.getByLabel("Game title").fill("Willy Gorklingo"));
  await step("Author: go-link (the spec's (C) 2026 GO-LINK)", page.getByLabel("Author (optional)"), () => page.getByLabel("Author (optional)").fill("go-link"));
  await step("Players: 4, so P3 and P4 can join later on the 4-port board", page.getByRole("radio", { name: "4 players" }), () =>
    page.getByRole("radio", { name: "4 players" }).click(),
  );
  await step("Next: the first level", btn("Next: the first level →"), () => btn("Next: the first level →").click());
  await step("Level name: Puerto Madero docks (Section 1 of Mission 1)", page.getByLabel("Level name"), () => page.getByLabel("Level name").fill("Puerto Madero docks"));
  await step("Length: 4 screens = 1536 px wide", page.getByRole("radio", { name: "4 screens" }), () => page.getByRole("radio", { name: "4 screens" }).click());
  await step("Height: 448 px = 2 screens tall", page.getByRole("radio", { name: /^448 px/ }), () => page.getByRole("radio", { name: /^448 px/ }).click());
  await step("Create the game", btn("Create the game"), () => btn("Create the game").click());
  await page.waitForSelector("canvas.wm-canvas");
  await page.waitForTimeout(800);
  await snap("010-ide", "The IDE opened on the new level");

  // ---- the whole level on screen
  for (let i = 0; i < 4; i++)
    await step(`Zoom out (${i + 1}/4) until the whole 1536 px level fits the canvas`, page.getByRole("button", { name: "Zoom out (−)" }), () =>
      page.getByRole("button", { name: "Zoom out (−)" }).click(),
    );
  await step("Line the grid up: click empty cells with the select tool and read the cell the Inspector names", page.locator(".wm-inspector").first(), () => calibrate());
  console.log("calibration", JSON.stringify(cal));
  await snap("020-calibrated", `View at ${Math.round(cal.zoom * 100)} %`);

  await buildLevel();
  await playTest();
  await gameAndMenus();
  await exportPack();

  result.ok = true;
} catch (e) {
  result.error = String(e?.stack ?? e);
  console.error(e);
  await page.screenshot({ path: join(OUT, "shots/error.png") }).catch(() => undefined);
} finally {
  writeFileSync(join(OUT, "timeline.json"), JSON.stringify({ started: new Date(t0).toISOString(), view: VIEW, result, steps: timeline }, null, 2));
  writeFileSync(join(OUT, "console.json"), JSON.stringify(consoleLog, null, 2));
  await context.close();
  await browser.close();
  const vids = readdirSync(join(OUT, "video")).filter((f) => f.endsWith(".webm"));
  if (vids.length) renameSync(join(OUT, "video", vids[0]), join(OUT, "video", "session.webm"));
  console.log(JSON.stringify({ ok: result.ok, steps: n, ms: Date.now() - t0 }));
}
