# Case B, step 1: lab journal

Times are local (-03), 2026-10-01, from `date` and the files' times. Decisions: [decisions.md](decisions.md). The findings for Willy Maker are at the end.

## 18:06 Start

- `date` → 18:06:21. The worktree was on `76cd798`, without `docs/experiments/`. Branched `exp1/case-b` from `main` (`23806b8`) (D-001).
- The main checkout's `docs/experiments/README.md` has one uncommitted line: the `HOWTO.md` record. Read that version as the contract (D-020).
- Read the contract, `docs/willy-maker/README.md`, `file-format.md`, `validation.md`, and the parts of Willy Maker that a user touches (the wizard, the IDE, the canvas, the Inspector, the Export tab) to know the labels, not to change them.
- Noted before starting, from `engine/rules.ts` and `engine/game.ts`: enemies take 4 hits (`ENEMY_HP`), score 100 crate / 500 enemy / 1000 rescue, lives with 120 frames without harm, and the exit clears the level on touch. The spec says 3 hits, 100 and 500 points, 3 energy with a 1 s blink, and the exit only with all enemies down. Willy Maker gives a user no way to set them (F-01, F-02).

## 18:07 The server

- `source ~/.nvm/nvm.sh` and `cd` to the main checkout were refused by the sandbox. Dead end. Ran `npm ci` in the worktree's `frontend/` (129 packages, 4 s) and the dev server there on port 5301, with Node 22.23.2 on `PATH` through a small wrapper (D-002).
- The site's header tries `wss://signal.go-link.org/ws` and gets 403 (the origin `localhost:5301` is not allowed by the production signaling). It does not touch Willy Maker; 18 such console errors in the final run, no page error.

## 18:09 First look

- `explore/look.mjs`: the first screenshot is the go-link splash ("INSERT COIN"), which stays at least 3 s. The driver waits for `#splash` to go.
- The page's text shows the wizard open on the home page (New game, step 1 of 3).

## 18:10 Run r1: the wizard works, calibration fails

- The wizard steps (board, layout, Empty, title, author, players, level name, 4 screens, 448 px, Create) all worked at the first try.
- `calibrate()` found no cell: the Inspector's title is uppercased by CSS (`INSPECTOR · AIR · CELL 0,9`) and `innerText` returns it uppercased. Fixed the pattern (case-insensitive). Evidence: `evidence/dead-ends/r1-calibrate-uppercase.png`.

## 18:13 Run r2: negative cells, then the Fill tool trap

- First try: the probe click at 82 % landed outside the level and the Inspector said `CELL -3,-1` (F-09). Allowed negative numbers and moved the probe into the level.
- Second try: the whole terrain was right, but the first Trooper was never placed. Picking Parts › Enemies › Trooper while the Fill tool was on kept the Fill tool; a click with Fill and an object part does nothing, with no message. The next steps (name, X, Y) then edited the object still selected, the last crate: it was renamed `trooper_lower` and moved to (720, 416). F-03. Evidence: `evidence/dead-ends/r2-fill-tool-kept.png` (the Inspector says "Crate", name `trooper_lower`, Hits 2). The driver now presses the pencil after picking a stamp.

## 18:16 Run r3: the sky works, a locator does not

- The level was complete and the night sky painted (six fills on the far layer). The step back to the Collision layer failed: the row's text matched both the layer's name and its kind (`collision · 16`). A driver bug; used the name button. Evidence: `evidence/dead-ends/r3-layer-locator.png`.

## 18:17 Run r4: the first full review

- Game tab: the defaults are already the spec's (B1 jump, B2 fire, B3 special, double tap 250 ms, P1 Willy in his colors, P2-P4 recruit shirts, lives 3).
- Menus tab: the title shows `WILLY GORKLINGO`, `PUSH START` and `(C) 2026 GO-LINK` by default; no subtitle; no `CREDITS n` (F-05).
- Export review: "Ready to export", no errors, no warnings, one note (no hero of your own; Go opens Characters). Reachability, traps, camera, names, palettes, tiles and budgets all pass.

## 18:19 Run r5: play-test and download

- The Play button's name matched the "Play" layer's name button too (both are "Play"): a driver bug, used the top bar's button.
- Play mode: P1 pushed up the single crate (x 186) and onto the stack (x 260, y 352). The jump right from the stack landed at x 302, short of the ledge (x 320): too short a hold of the jump. Down + jump then did nothing visible (P1 was on the floor). P2 starts at P1's x 32, not at its own start x 48 (F-11).
- Both zips downloaded. Read the pack: `PROMPT.md` tells the builder 4 hits, 500/1000 points and lives (F-01), nothing about the exit condition (F-02), the symbol map or the lab state the harness reads (F-07). `project.json` carries the menus' texts and the objects with their names. The crates were `crate`, `crate_2`, `crate_3`: renamed in the next run to say what they are.
- The pack is 76 KB; the three level pictures are 1536 × 448 RGBA PNGs of 2.75 MB each, deflated to 5-9 KB inside the zip.

## 18:22 Run r6: crate names

- `crate_single`, `crate_stack_low`, `crate_stack_top`. Same review, same pack layout.

## 18:23 The recorded run

- Committed the driver (`44d121b`), then the final run with 900 ms notes: 107 actions in 163 s, `ok: true`, from 18:23:29 to 18:26:12.
- `make-mp4.mjs`: `builder.mp4`, 163 s, 8.2 MB, 24 chapters. Checked a frame at 70 s: the note "#53 Parts › Enemies › Trooper: pick the stamp" and the outline on the Enemies tab are visible.
- After each Patrol edit the driver's Tab moves focus to the Inspector's Delete button (it shows a focus ring in the video). Nothing pressed it; noted because an Enter there would delete the enemy.

## 18:28 Delivery

- `ai-pack.zip` (SHA-256 `23cdc296bc8a61879d5efbb4fe8e5ce60fa192327f61660f4f7f93698ea5d0fa`) and `builder.mp4` (`530866000f2d2c9274e351a9e0bcb1736ce74e91c2d97bb1c7215d48cdbf7eb0`) copied to the shared folder, with the project zip, the full-size screenshots and the WebM.
- No ROM and no symbol map in step 1: they are step 2's (a second agent, blind, with only the pack).

## Findings for Willy Maker

Each one is a limitation hit while building the spec's level, with its evidence. Severity: **high** = the pack carries a wrong or missing rule the spec needs; **medium** = a user can get it wrong or cannot express it; **low** = friction.

| Id | Severity | Finding | Evidence | Suggested change |
|---|---|---|---|---|
| F-01 | high | The game's numbers are fixed: enemy hits (4; the engine already reads an enemy's `hp`, but the Inspector has no field), points (crate 100, enemy 500, rescue 1000), and lives instead of energy (spec: 3 energy, lose 1 on touch, 1 s blink). `PROMPT.md` then tells the builder the engine's numbers as "rules the engine keeps". | `engine/rules.ts`; `evidence/pack-extract/PROMPT.md`, table "Rules the engine keeps"; Inspector of an enemy (`shots/046.jpg`-`052.jpg`): Kind, Facing, Patrol only | A **Rules** card in the Game tab (enemy hits per kind, points per thing, lives or energy, hurt time) saved in `project.json` and used by play mode, the review and `PROMPT.md`; an `hp` field for each enemy in the Inspector. |
| F-02 | high | The exit clears the level on touch; the spec wants it only with every enemy down, then "SECTION CLEAR". No option. | `engine/game.ts` (the exits loop sets `cleared` on touch); `PROMPT.md` says nothing about the exit | An exit property "needs: all enemies down / nothing", shown in the Inspector, kept by play mode and written in `PROMPT.md`. |
| F-03 | medium | Picking an object stamp while the Fill tool is on keeps Fill; clicking then places nothing and says nothing. The Inspector still shows the previous selection, so the next edits change the wrong object. | `evidence/dead-ends/r2-fill-tool-kept.png`; `Ide.tsx` `pickPart` keeps Fill | Picking a stamp switches to the pencil (Fill cannot place objects), or Fill with a stamp says so in the status line. |
| F-04 | medium | The exit's size cannot be set: the Inspector shows width and height only for camera locks and bosses; the engine's exit is 32 px wide and the whole level tall. The spec's exit zone is 64 px. | `Panels.tsx` Inspector; `game.ts` (exit `w` defaults to 2 cells) | Width and height for exits (and checkpoints) in the Inspector, drawn as the zone on the canvas. |
| F-05 | medium | No `CREDITS n` on the title screen: no field and no automatic credits line in the menu preview (the HUD has no credits either). | `shots/111-title-full.png` (fields: Title, Subtitle, Prompt; the credits line is the copyright) | An automatic "credits" line on the title, continue and HUD screens (`CREDITS {n}`, its row and text editable), and in `PROMPT.md`. |
| F-06 | low | Sections cannot be added or named: the Inspector only counts them. The level is Section 1 of Mission 1; the pack says `sections: []`. | `Panels.tsx` Inspector › Level (a count only); `project.json` `sections: []` | Add, name and resize sections on the canvas (they already exist in the format and the minimap). |
| F-07 | high | The pack does not ask for what the experiment's harness reads: the symbol map next to the zip (`symbols.json`) and the lab state (`lab_state.h` at 0xff0000), nor the acceptance (`device romtest`, the scripted run). A blind builder will likely skip them, and the harness then records the case as "no state". | `PROMPT.md` sections "Build it" and "Task" | `PROMPT.md` (and the docs bundled in the pack) include `docs/experiments/harness.md`'s lab state contract and ask for `symbols.json`; later, an "Acceptance" section generated from the project. |
| F-08 | medium | There is no place for designer notes that travel with the pack (intent, rules that differ, "sound not required"). A user who knows what the engine cannot do has no way to tell the builder. | Export tab: the prompt is generated only | A "Notes for the builder" text field (Game tab or Export), copied into `PROMPT.md` under its own heading. |
| F-09 | low | Clicking outside the level with the select tool selects a cell outside it ("cell -3,-1") and shows its Inspector. | run r2's first try (its screenshot was replaced by the rerun; the journal at 18:13) | Clicking outside the level clears the selection. |
| F-10 | low | Objects close together are hard to read and pick at a zoom that shows the level: the four starts' labels overlap ("S S S Start · p4_start") and a click picks the topmost box. | `shots/080-level.png`, `060-objects.png` | Shorter labels when they collide (or labels on hover), and an object list in the Inspector or Project panel to select by name. |
| F-11 | low | Play mode ignores the starts of P2-P4: a player who joins appears at the leading player's x (`join()` uses the start only when nobody is playing). | `shots/090-play-start.png` (P2 x 32, its start is x 48); `engine/game.ts` `join` | Use each player's start when the game begins with several players; keep "next to the leader" for late joins. |
| F-12 | low | There is no palette or mood choice ("night"): a dark sky is painted by hand with six fills on the far layer, and the Empty template starts with an empty far layer. | steps 72-86 | The Empty template paints the far layer with the sky gradient (as Buenos Aires does), or a "Sky" fill with presets (night, dusk, day) from the sky tileset. |
| F-13 | low | The wizard puts four starts 24 px apart from x 32 (the fourth at x 104); there is no "players start area". | step 18-23 (three moves by hand) | Starts 16 px apart, or a start zone object. |
| F-14 | low | Typing a menu text equal to its default stores nothing (the field stays "default"); the pack then relies on Willy Maker's defaults, which `PROMPT.md` does not list. | `project.json` `menus.title.texts` has only `subtitle`; `PUSH START` was typed | Store what the user typed, or list every screen's final texts in `PROMPT.md`. |
