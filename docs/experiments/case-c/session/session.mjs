// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Case C's recorded user session (experiment 1): Willy Maker in a real
// browser, driven by Playwright, builds Game Spec v1's level from "New
// game", sets the rules and texts, creates the ROM and downloads it. Before
// every action a note card is injected into the page (the step, what will
// happen, why, and an outline around the control about to be used); the
// action follows 1.5 s later. Playwright records the browser's own video
// (never the screen). Every step goes to timeline.json with its screenshot.
//
//   (cd frontend && npm run dev -w apps/web -- --port 5302 --strictPort)
//   node docs/experiments/case-c/session/session.mjs OUT_DIR
//
// OUT_DIR gets video/*.webm, shots/NN.jpg, timeline.json, slammast.zip,
// symbols.json. Playwright comes from e2e/node_modules (PLAYWRIGHT=... to
// use another copy).

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUT = path.resolve(process.argv[2] || "session-out");
const BASE = process.env.WM_URL || "http://localhost:5302";
const PW = process.env.PLAYWRIGHT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../e2e/node_modules/playwright/index.mjs");
const { chromium } = await import(pathToFileURL(PW).href);
const PAUSE = Number(process.env.NOTE_MS || 1500);

fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });
fs.mkdirSync(path.join(OUT, "video"), { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: path.join(OUT, "video"), size: { width: 1920, height: 1080 } },
  acceptDownloads: true,
  locale: "en-US",
});
const page = await context.newPage();
const t0 = Date.now();
const timeline = [];
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// ------------------------------------------------------------ the note card

/** Shows the note card and outlines a box (page px); returns when it is on screen. */
async function showNote(n, what, why, box) {
  await page.evaluate(
    ({ n, what, why, box }) => {
      document.getElementById("cc-note")?.remove();
      document.getElementById("cc-outline")?.remove();
      const card = document.createElement("div");
      card.id = "cc-note";
      const right = !box || box.x + box.width / 2 < window.innerWidth / 2;
      const bottom = !box || box.y + box.height / 2 < window.innerHeight / 2;
      Object.assign(card.style, {
        position: "fixed",
        zIndex: "2147483647",
        [right ? "right" : "left"]: "24px",
        [bottom ? "bottom" : "top"]: "24px",
        width: "460px",
        padding: "16px 18px",
        borderRadius: "14px",
        background: "rgba(14, 12, 24, 0.94)",
        border: "2px solid #f2a33a",
        boxShadow: "0 10px 40px rgba(0,0,0,0.55)",
        color: "#f4f1fa",
        font: "15px/1.45 system-ui, -apple-system, Segoe UI, sans-serif",
        pointerEvents: "none",
      });
      const head = document.createElement("div");
      Object.assign(head.style, { display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" });
      const badge = document.createElement("span");
      badge.textContent = `STEP ${n}`;
      Object.assign(badge.style, { background: "#f2a33a", color: "#141018", fontWeight: "800", borderRadius: "999px", padding: "2px 10px", fontSize: "13px", letterSpacing: "0.04em" });
      const tag = document.createElement("span");
      tag.textContent = "Case C · Willy Maker session";
      Object.assign(tag.style, { color: "#b9b2c9", fontSize: "12px" });
      head.append(badge, tag);
      const w = document.createElement("div");
      w.textContent = what;
      Object.assign(w.style, { fontWeight: "700", fontSize: "17px", marginBottom: "6px" });
      const y = document.createElement("div");
      y.textContent = `Why: ${why}`;
      Object.assign(y.style, { color: "#d6cfe6" });
      card.append(head, w, y);
      document.body.appendChild(card);
      if (box) {
        const o = document.createElement("div");
        o.id = "cc-outline";
        Object.assign(o.style, {
          position: "fixed",
          zIndex: "2147483646",
          left: `${box.x - 5}px`,
          top: `${box.y - 5}px`,
          width: `${box.width + 10}px`,
          height: `${box.height + 10}px`,
          border: "3px solid #ffd23f",
          borderRadius: "10px",
          boxShadow: "0 0 0 4px rgba(255,210,63,0.25), 0 0 24px rgba(255,210,63,0.6)",
          pointerEvents: "none",
        });
        document.body.appendChild(o);
      }
    },
    { n, what, why, box },
  );
}

async function hideNote() {
  await page.evaluate(() => {
    document.getElementById("cc-note")?.remove();
    document.getElementById("cc-outline")?.remove();
  });
}

let stepNo = 0;
/**
 * One step: note (with the outline of `target`, a locator or a page box),
 * a pause, a screenshot, the action, and a line in the timeline.
 */
async function step(what, why, target, action, selector = "") {
  stepNo++;
  let box = null;
  if (target && typeof target.boundingBox === "function") {
    await target.scrollIntoViewIfNeeded().catch(() => {});
    box = await target.boundingBox();
  } else if (target) box = target;
  await showNote(stepNo, what, why, box);
  await page.waitForTimeout(PAUSE);
  const shot = `shots/${String(stepNo).padStart(2, "0")}.jpg`;
  await page.screenshot({ path: path.join(OUT, shot), type: "jpeg", quality: 72 });
  const entry = { step: stepNo, t: (Date.now() - t0) / 1000, text: what, why, selector, screenshot: shot };
  timeline.push(entry);
  process.stdout.write(`step ${stepNo} @${entry.t.toFixed(1)}s ${what}\n`);
  await hideNote();
  if (action) await action();
  await page.waitForTimeout(450);
  entry.after = (Date.now() - t0) / 1000;
}

// ---------------------------------------------------------- the level canvas

const canvas = () => page.locator("canvas.wm-canvas");
async function view() {
  const [x, y, zoom] = (await canvas().getAttribute("data-view")).split(",").map(Number);
  const box = await canvas().boundingBox();
  return { x, y, zoom, box };
}
/** World px to page px. */
async function at(wx, wy) {
  const v = await view();
  return { x: v.box.x + (wx - v.x) * v.zoom, y: v.box.y + (wy - v.y) * v.zoom };
}
/** The page box of world cells c0..c1, r0..r1 on a grid. */
async function cellsBox(c0, r0, c1, r1, grid = 16) {
  const a = await at(c0 * grid, r0 * grid);
  const b = await at((c1 + 1) * grid, (r1 + 1) * grid);
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}
async function drag(c0, r0, c1, r1, grid = 16) {
  const a = await at(c0 * grid + grid / 2, r0 * grid + grid / 2);
  const b = await at(c1 * grid + grid / 2, r1 * grid + grid / 2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 24 });
  await page.mouse.up();
}
async function clickWorld(wx, wy) {
  const p = await at(wx, wy);
  await page.mouse.click(p.x, p.y);
}
async function pointBox(wx, wy, r = 14) {
  const p = await at(wx, wy);
  return { x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r };
}

const part = (name) => page.locator(".wm-part", { hasText: new RegExp(`^${name}$`, "i") }).first();
const tileBtn = (n) => page.getByRole("button", { name: `Tile ${n}`, exact: true });
const group = (name) => page.locator("button", { hasText: new RegExp(`^${name}$`) }).first();
const tool = (label) => page.getByRole("button", { name: label, exact: true });
const typeInto = async (loc, text) => {
  await loc.click();
  await loc.press("ControlOrMeta+a");
  await loc.pressSequentially(text, { delay: 35 });
};

// ------------------------------------------------------------------ session

try {
  await page.goto(`${BASE}/tools/willy-maker`);
  await page.getByRole("button", { name: "New game" }).first().waitFor();
  await page.waitForTimeout(800);

  await step("Open Willy Maker and start a new game", "Game Spec v1 is built from \"New game\", the way any user starts.", page.getByRole("button", { name: "New game" }).first(), () => page.getByRole("button", { name: "New game" }).first().click(), 'role=button[name="New game"]');
  await step("Keep the CPS-1 board with the slammast layout (4 players × 3 buttons)", "The spec's set is slammast: B1 jump, B2 fire, B3 special.", page.getByRole("radio", { name: /4 players · 3 buttons/ }), () => page.getByRole("radio", { name: /4 players · 3 buttons/ }).click(), 'role=radio[name~="4 players · 3 buttons"]');
  await step("Start from the Empty template", "The spec's level is small (4 screens × 2) and its own; the Buenos Aires template is the whole mission.", page.getByRole("radio", { name: /Empty/ }), () => page.getByRole("radio", { name: /Empty/ }).click(), 'role=radio[name~="Empty"]');
  await step("Next: name and players", "The wizard's second step.", page.getByRole("button", { name: /Next: name and players/ }), () => page.getByRole("button", { name: /Next: name and players/ }).click(), 'role=button[name~="Next: name and players"]');
  await step("Type the game's title: Willy Gorklingo", "The title screen shows it (WILLY GORKLINGO, the board's font is uppercase).", page.getByLabel("Game title"), () => typeInto(page.getByLabel("Game title"), "Willy Gorklingo"), 'label="Game title"');
  await step("Type the author", "Recorded with the project.", page.getByLabel("Author (optional)"), () => typeInto(page.getByLabel("Author (optional)"), "go-link · experiment 1, case C"), 'label="Author (optional)"');
  await step("Choose 2 players", "The spec: P1 Willy and P2 a recruit play at once.", page.getByRole("radio", { name: "2 players" }), () => page.getByRole("radio", { name: "2 players" }).click(), 'role=radio[name="2 players"]');
  await step("Next: the first level", "Its name and size come next.", page.getByRole("button", { name: /Next: the first level/ }), () => page.getByRole("button", { name: /Next: the first level/ }).click(), 'role=button[name~="Next: the first level"]');
  await step("Name the level Dead Air", "Mission 1, section 1: the Puerto Madero docks.", page.getByLabel("Level name"), () => typeInto(page.getByLabel("Level name"), "Dead Air"), 'label="Level name"');
  await step("Length: 4 screens (1536 px)", "The spec's level is 1536 px wide.", page.getByRole("radio", { name: "4 screens" }), () => page.getByRole("radio", { name: "4 screens" }).click(), 'role=radio[name="4 screens"]');
  await step("Height: 448 px (2 screens)", "The spec's level is 448 px tall, for the upper dock.", page.getByRole("radio", { name: /448 px/ }), () => page.getByRole("radio", { name: /448 px/ }).click(), 'role=radio[name~="448 px"]');
  await step("Create the game", "Willy Maker makes the level with its dock floor, the two players' starts and an exit.", page.getByRole("button", { name: "Create the game" }), () => page.getByRole("button", { name: "Create the game" }).click(), 'role=button[name="Create the game"]');
  await canvas().waitFor();
  await page.waitForTimeout(800);

  // the whole level in view
  for (let i = 0; i < 4; i++) {
    if (i === 0) await step("Zoom out to see the whole level", "The 1536 × 448 level fits the canvas at about 80 %.", tool("Zoom out (−)"), () => tool("Zoom out (−)").click(), 'role=button[name="Zoom out (−)"]');
    else await tool("Zoom out (−)").click();
    await page.waitForTimeout(150);
  }
  const mm = page.getByRole("slider", { name: /Level map/ });
  await step("Center the view on the level with the map strip", "So every cell of the level is on the canvas.", mm, async () => {
    const b = await mm.boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  }, 'role=slider[name~="Level map"]');

  // 1. the night sky on the far layer
  const far = page.locator(".wm-layer-name", { hasText: "Far background" });
  await step("Select the Far background layer", "The spec's night palette and dark sky go on the far layer (scroll3, 32 px tiles).", far, () => far.click(), '.wm-layer-name:has-text("Far background")');
  await step("Open the Tiles parts", "The far layer's tileset is the starter night sky.", group("Tiles"), () => group("Tiles").click(), 'button:has-text("Tiles")');
  await step("Pick the Fill tool", "A rectangle of tiles in one stroke.", tool("Fill a rectangle (G)"), () => tool("Fill a rectangle (G)").click(), 'role=button[name="Fill a rectangle (G)"]');
  const bands = [
    [1, 0, 4, "the darkest sky at the top"],
    [3, 5, 9, "a lighter band in the middle"],
    [5, 10, 13, "the city glow near the horizon"],
  ];
  for (const [tile, r0, r1, why] of bands) {
    await step(`Pick sky tile ${tile}`, `Tile ${tile} of the night sky: ${why}.`, tileBtn(tile), () => tileBtn(tile).click(), `role=button[name="Tile ${tile}"]`);
    await step(`Fill the far layer's rows ${r0}-${r1} with it`, "A banded night sky, like the prototype's.", await cellsBox(0, r0, 47, r1, 32), () => drag(0, r0, 47, r1, 32), `canvas cells 32px (0,${r0})-(47,${r1})`);
  }
  const collision = page.locator(".wm-layer-name", { hasText: "Collision" });
  await step("Back to the Collision layer", "The level's shape is painted as collision tags; the street art follows them (Auto art).", collision, () => collision.click(), '.wm-layer-name:has-text("Collision")');
  await step("Open the Terrain parts", "Solid, platform, ladder and crate.", group("Terrain"), () => group("Terrain").click(), 'button:has-text("Terrain")');

  // 2. crates: 32 then 64 px
  await step("Pick the Pencil", "Crates are placed with one click each.", tool("Pencil: paint the part (B)"), () => tool("Pencil: paint the part (B)").click(), 'role=button[name="Pencil: paint the part (B)"]');
  await step("Pick the Crate part", "32 px crates, climbed by pushing.", part("Crate"), () => part("Crate").click(), '.wm-part:has-text("Crate")');
  await step("Place a crate on the dock at x 160", "The first step of the stack: 32 px.", await cellsBox(10, 24, 11, 25), () => clickWorld(10 * 16 + 4, 24 * 16 + 4), "canvas cell (10,24)");
  await step("Place a crate next to it at x 192", "The bottom of the 64 px stack.", await cellsBox(12, 24, 13, 25), () => clickWorld(12 * 16 + 4, 24 * 16 + 4), "canvas cell (12,24)");
  await step("Stack a crate on top of it", "The stack is now 64 px: pushed up from the 32 px crate, then a jump.", await cellsBox(12, 22, 13, 23), () => clickWorld(12 * 16 + 4, 22 * 16 + 4), "canvas cell (12,22)");

  // 3. the one-way ledge, 4. the ladder and the upper dock
  await step("Pick the Fill tool again", "Ledges, ladders and docks are rectangles of tags.", tool("Fill a rectangle (G)"), () => tool("Fill a rectangle (G)").click(), 'role=button[name="Fill a rectangle (G)"]');
  await step("Pick the Platform part (one-way)", "Stood on, jumped up through, and down + B1 drops through it.", part("Platform"), () => part("Platform").click(), '.wm-part:has-text("Platform")');
  await step("Draw the one-way ledge 64 px up, x 256-367", "Reached by a jump from the crate stack; down + B1 is its way down.", await cellsBox(16, 22, 22, 22), () => drag(16, 22, 22, 22), "canvas cells (16,22)-(22,22)");
  await step("Pick the Ladder part", "The way up to the upper dock.", part("Ladder"), () => part("Ladder").click(), '.wm-part:has-text("Ladder")');
  await step("Draw the ladder at x 480, 160 px tall", "From the dock floor (y 416) up to the upper dock (y 256).", await cellsBox(30, 16, 30, 25), () => drag(30, 16, 30, 25), "canvas cells (30,16)-(30,25)");
  await step("Pick the Solid part", "The upper dock is a solid floor.", part("Solid"), () => part("Solid").click(), '.wm-part:has-text("Solid")');
  await step("Draw the upper dock, x 496-1023 at y 256", "The second floor; its right end is open, so players drop back to the lower dock.", await cellsBox(31, 16, 63, 16), () => drag(31, 16, 63, 16), "canvas cells (31,16)-(63,16)");

  // 5. enemies, 6. civilians, 7. the exit
  await step("Pick the Pencil", "Enemies, civilians and the exit are placed by clicking.", tool("Pencil: paint the part (B)"), () => tool("Pencil: paint the part (B)").click(), 'role=button[name="Pencil: paint the part (B)"]');
  await step("Open the Enemies parts", "The spec's enemy is the Trooper.", group("Enemies"), () => group("Enemies").click(), 'button:has-text("Enemies")');
  await step("Pick the Trooper", "Each Trooper walks a 96 px patrol and turns at its ends.", part("Trooper"), () => part("Trooper").click(), '.wm-part:has-text("Trooper")');
  const troopers = [
    [640, 416, "on the lower dock, under the upper dock"],
    [800, 256, "on the upper dock"],
    [1360, 416, "guarding the exit"],
  ];
  for (const [x, y, where] of troopers) {
    await step(`Place a Trooper at x ${x}, ${where}`, "The spec's three enemies: lower dock, upper dock, exit.", await pointBox(x, y - 20, 22), () => clickWorld(x, y - 4), `canvas world (${x},${y})`);
    const xIn = page.getByRole("spinbutton", { name: "X", exact: true });
    const placed = Number(await xIn.inputValue());
    if (placed !== x) await step(`Set its X to exactly ${x} in the inspector`, "The click landed a few pixels off; the inspector takes exact numbers.", xIn, () => typeInto(xIn, String(x)), 'role=spinbutton[name="X"]');
  }
  await step("Open the Civilians parts", "Two civilians to rescue by touching them.", group("Civilians"), () => group("Civilians").click(), 'button:has-text("Civilians")');
  await step("Pick the Woman", "The first civilian waits on the one-way ledge.", part("Woman"), () => part("Woman").click(), '.wm-part:has-text("Woman")');
  await step("Place her on the ledge at x 320", "Rescued after the jump from the crates.", await pointBox(320, 332, 22), () => clickWorld(320, 348), "canvas world (320,352)");
  await step("Pick the Child", "The second civilian waits on the upper dock.", part("Child"), () => part("Child").click(), '.wm-part:has-text("Child")');
  await step("Place the child on the upper dock at x 960", "Past the upper dock's Trooper.", await pointBox(960, 236, 22), () => clickWorld(960, 252), "canvas world (960,256)");
  await step("Open the Helpers parts", "Starts, checkpoints, camera locks and the exit.", group("Helpers"), () => group("Helpers").click(), 'button:has-text("Helpers")');
  await step("Pick the Exit", "The spec's exit is at x 1440-1504 on the lower dock.", part("exit"), () => part("exit").click(), '.wm-part:has-text("exit")');
  await step("Place the exit at x 1440 on the lower dock", "A new exit replaces the one the template made at x 1488.", await pointBox(1440, 400, 22), () => clickWorld(1440, 412), "canvas world (1440,416)");
  const wIn = page.getByRole("spinbutton", { name: "Width", exact: true });
  await step("Make the exit 64 px wide in the inspector", "x 1440 to 1504, as the spec says.", wIn, () => typeInto(wIn, "64"), 'role=spinbutton[name="Width"]');
  await step("Check the level with Reach", "Willy Maker shades what players cannot get to; nothing should be left out.", tool("Reach"), () => tool("Reach").click(), 'role=button[name="Reach"]');
  await page.waitForTimeout(600);
  await step("Turn Reach off again", "The level reads better without the shading.", tool("Reach"), () => tool("Reach").click(), 'role=button[name="Reach"]');

  // the rules
  const tabs = (name) => page.locator(".wm-ide-tabs button, [role=tablist] button, button").filter({ hasText: new RegExp(`^${name}$`) }).first();
  await step("Open the Game tab", "The spec's rules are set in the Rules card.", tabs("Game"), () => tabs("Game").click(), 'button:has-text("Game")');
  const num = (label) => page.getByRole("spinbutton", { name: label, exact: true });
  const seg = (group, option) => page.getByRole("radiogroup", { name: group, exact: true }).getByRole("radio", { name: option, exact: true });
  await step("Enemies take 3 hits", "The spec: a Trooper takes 3 shots.", num("Hits an enemy takes"), () => typeInto(num("Hits an enemy takes"), "3"), 'role=spinbutton[name="Hits an enemy takes"]');
  await step("100 points per enemy", "The spec: each Trooper gives 100 points.", num("Points per enemy"), () => typeInto(num("Points per enemy"), "100"), 'role=spinbutton[name="Points per enemy"]');
  await step("500 points per rescue", "The spec: each civilian gives 500 points.", num("Points per rescue"), () => typeInto(num("Points per rescue"), "500"), 'role=spinbutton[name="Points per rescue"]');
  await step("Touching an enemy hurts: Yes", "The spec: they hurt a player on touch.", seg("Touching an enemy hurts", "Yes"), () => seg("Touching an enemy hurts", "Yes").click(), 'radiogroup "Touching an enemy hurts" > radio "Yes"');
  await step("Enemies chase players: No", "The spec's Troopers walk their patrol and turn at its ends.", seg("Enemies chase players", "No"), () => seg("Enemies chase players", "No").click(), 'radiogroup "Enemies chase players" > radio "No"');
  await step("Enemies shoot: No", "The spec gives them touch damage only.", seg("Enemies shoot", "No"), () => seg("Enemies shoot", "No").click(), 'radiogroup "Enemies shoot" > radio "No"');
  await step("The exit needs every enemy down: Yes", "The spec: reaching the exit with all enemies down shows SECTION CLEAR.", seg("The exit needs every enemy down", "Yes"), () => seg("The exit needs every enemy down", "Yes").click(), 'radiogroup "The exit needs every enemy down" > radio "Yes"');
  await step("After a hit: blink in place", "The spec: the player blinks and loses 1 of 3 energy.", seg("After a hit", "Blink in place"), () => seg("After a hit", "Blink in place").click(), 'radiogroup "After a hit" > radio "Blink in place"');
  const blink = page.getByRole("slider", { name: "Blinking after a hit", exact: true });
  await step("Blink for 1 s (60 frames)", "The spec: the player blinks 1 s.", blink, async () => {
    await blink.focus();
    for (let i = 0; i < 6; i++) await blink.press("ArrowLeft");
  }, 'role=slider[name="Blinking after a hit"]');
  await step("Keep 3 lives (energy 3)", "The spec: 1 of 3 energy per hit.", seg("Lives", "3"), () => seg("Lives", "3").click(), 'radiogroup "Lives" > radio "3"');

  // play while building
  const play = page.getByRole("button", { name: "Play", exact: true });
  await step("Try it at once: Play", "Willy Maker runs the level in the browser with the same rules the ROM gets.", play, () => play.click(), 'role=button[name="Play"]');
  await page.waitForTimeout(1200);
  const stage = page.locator(".wm-play-layer canvas").first();
  await step("Walk right toward the crates (arrow key)", "A quick feel of the start before making the ROM.", stage, async () => {
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(2200);
    await page.keyboard.up("ArrowRight");
  }, "keyboard ArrowRight");
  const back = page.getByRole("button", { name: "Back to building", exact: true });
  await step("Back to building", "The texts are next.", back, () => back.click(), 'role=button[name="Back to building"]');

  // the texts
  await step("Open the Menus tab", "The title screen and the clear text come from here.", tabs("Menus"), () => tabs("Menus").click(), 'button:has-text("Menus")');
  await step("Title: WILLY GORKLINGO", "The spec's title screen.", page.locator("#wm-menu-field-title"), () => typeInto(page.locator("#wm-menu-field-title"), "WILLY GORKLINGO"), "#wm-menu-field-title");
  await step("Subtitle: THE LAG PROTOCOL", "The spec's second line.", page.locator("#wm-menu-field-subtitle"), () => typeInto(page.locator("#wm-menu-field-subtitle"), "THE LAG PROTOCOL"), "#wm-menu-field-subtitle");
  await step("Check the prompt says PUSH START", "The spec's prompt; the credits line (C) 2026 GO-LINK is on by default.", page.locator("#wm-menu-field-prompt"), () => page.locator("#wm-menu-field-prompt").focus(), "#wm-menu-field-prompt");
  const hudTab = page.getByRole("tab", { name: "HUD", exact: true });
  await step("Open the HUD screen", "Its Level clear text is what the section shows at the exit.", hudTab, () => hudTab.click(), 'role=tab[name="HUD"]');
  await step("Level clear: SECTION CLEAR", "The spec's text at the exit.", page.locator("#wm-menu-field-cleared"), () => typeInto(page.locator("#wm-menu-field-cleared"), "SECTION CLEAR"), "#wm-menu-field-cleared");
  const goTab = page.getByRole("tab", { name: "Game over", exact: true });
  await step("Look at the Game over screen", "GAME OVER shows when every player is out of energy and there is no credit.", goTab, () => goTab.click(), 'role=tab[name="Game over"]');

  // create the ROM
  await step("Open the Export tab", "The review, then Create ROM.", tabs("Export"), () => tabs("Export").click(), 'button:has-text("Export")');
  const create = page.getByRole("button", { name: "Create ROM", exact: true });
  await create.waitFor();
  await page.waitForTimeout(1500);
  await step("Create ROM", "Stage 2: the game is packed as data next to the prebuilt engine, as slammast's files, then powered on in the board model.", create, () => create.click(), 'role=button[name="Create ROM"]');
  await page.getByText("It boots", { exact: true }).or(page.getByText("It does not boot", { exact: true })).first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(800);
  const card = page.locator(".wm-rom-card");
  await step("Read the result: every power-on step and the picture", "Validation level 3 ran by itself on the new ROM.", card, () => card.locator("figure").scrollIntoViewIfNeeded(), ".wm-rom-card");
  const dl = page.getByRole("button", { name: /Download ROM/ });
  await step("Download the ROM", "slammast.zip: the set the mame2003-plus core and a go-link room run.", dl, async () => {
    const [d] = await Promise.all([page.waitForEvent("download"), dl.click()]);
    await d.saveAs(path.join(OUT, d.suggestedFilename()));
  }, 'role=button[name~="Download ROM"]');
  const sym = page.getByRole("button", { name: /Symbol map/ });
  await step("Download the symbol map", "symbols.json: where the game keeps its state, for the experiment's harness.", sym, async () => {
    const [d] = await Promise.all([page.waitForEvent("download"), sym.click()]);
    await d.saveAs(path.join(OUT, "symbols.json"));
  }, 'role=button[name~="Symbol map"]');
  const playBtn = page.getByRole("button", { name: "Play on my go-link", exact: true });
  await step("Play on my go-link", "It sends the ROM to the linked go-link; this recording has no device linked, so it says how to link one.", playBtn, () => playBtn.click(), 'role=button[name="Play on my go-link"]');
  await page.waitForTimeout(1200);
  await step("Done: the level is built, the ROM created, powered on and downloaded", "Next: the harness checks this exact zip (levels 3 and 4, the clear script, the real core).", card, null, ".wm-rom-card");
  await page.waitForTimeout(1500);
} catch (e) {
  errors.push(String(e && e.stack ? e.stack : e));
  await page.screenshot({ path: path.join(OUT, "failure.png") });
  console.error(e);
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  const videoPath = video ? await video.path() : null;
  fs.writeFileSync(
    path.join(OUT, "timeline.json"),
    JSON.stringify({ started: new Date(t0).toISOString(), base: BASE, viewport: "1920x1080", noteMs: PAUSE, video: videoPath ? path.relative(OUT, videoPath) : null, errors, steps: timeline }, null, 1) + "\n",
  );
  console.log(`${timeline.length} steps, ${errors.length} errors; video ${videoPath}`);
  if (errors.length) process.exitCode = 1;
}
