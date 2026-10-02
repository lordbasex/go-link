# Case B, step 1: decisions

Case B, step 1 of [experiment 1](../README.md): a user builds [Game Spec v1](../README.md#game-spec-v1)'s level in Willy Maker and downloads the AI pack. Willy Maker's code is not changed. Every limitation is a finding: they are listed in [journal.md](journal.md#findings-for-willy-maker) as F-01…F-14, and the decisions below point at them.

Each decision has its context, the options, the choice, why, and the evidence. Paths under `evidence/` are in this folder; "the shared folder" is `exp1/case-b/` in the session's scratchpad (the full-size screenshots, the video and the pack as delivered).

## D-001: the branch starts from `main`, not from the worktree's commit

- **Context:** the worktree was created at `76cd798`, four commits behind `main` (`23806b8`). `76cd798` has no `docs/experiments/` (the contract) and no harness (`rom/tools/lab`).
- **Options:** work on `76cd798`; branch from `main`.
- **Choice:** `git checkout -b exp1/case-b main`.
- **Why:** the contract and the harness the jury uses are on `main`; Willy Maker's code is the same in both (the four commits are `rom/` and docs).
- **Evidence:** `git log --oneline -5` at the start (journal 18:06); the branch's first parent is `23806b8`.

## D-002: Willy Maker runs from the worktree, on port 5301

- **Context:** the task said to start the dev server from the main checkout's `frontend/`. The session's sandbox refuses commands that `cd` out of the worktree (and `source`), so that command could not run.
- **Options:** ask for a change of the sandbox; run the same command in the worktree's `frontend/` after `npm ci`.
- **Choice:** `npm ci` in the worktree's `frontend/` (129 packages, 4 s), then `npm run dev -w apps/web -- --port 5301 --strictPort` there, with Node 22.23.2 first on `PATH`.
- **Why:** the worktree is on `main`'s commit (`23806b8`) and the main checkout only differs in `docs/experiments/README.md` (one line, the `HOWTO.md` record), so the served code is the same. Port 5301 is the one assigned to this case.
- **Evidence:** the dev server's log (`VITE v8.3.1 ready`, `Local: http://localhost:5301/`); `git rev-parse HEAD` = `23806b8…` in both.

## D-003: the user is a Playwright script that narrates itself

- **Context:** the session must be recorded as video with a timeline of actions and screenshots, and must be reproducible by a second agent from the records (the `HOWTO.md` record).
- **Options:** drive Chrome by hand through the browser extension (not reproducible, and it would use the user's browser); a Playwright script.
- **Choice:** `tools/build-level.mjs`. Before every action it injects a note into the page (what it will do and why, numbered) and outlines the control it will press, waits, takes a screenshot, appends the step to `timeline.json`, then acts. Milestone screenshots are taken without an action. `recordVideo` records the whole context (1920 × 1080). This is case C's recording rule, applied to B so that B and C can be compared.
- **Why:** a script is the most faithful "user" that can be replayed exactly; the notes make the video readable without the script.
- **Evidence:** `evidence/timeline.json` (133 entries, 107 actions), `evidence/shots/`, `builder.mp4` in the shared folder; commit `44d121b`.

## D-004: placing things on the canvas: line up the grid as a user would

- **Context:** the canvas takes clicks in screen pixels; the view's offset is internal state. Reading it from React or the store would not be using the UI.
- **Options:** read the editor's state from the page (not a user action); use the minimap (clamped near the edges, so not exact); click empty cells with the select tool and read the cell the Inspector names ("Inspector · Air · cell 12,5").
- **Choice:** the last one. `calibrate()` zooms out to 82 % (the whole 1536 px level in the 1320 px canvas), clicks an empty cell, and searches for the screen pixel where the Inspector's cell number changes, once horizontally and once vertically. From then on every cell is clicked at its middle. Objects are placed by a click and then given their exact X and Y in the Inspector, which is what a careful user does.
- **Why:** it only uses what the UI shows. The cell size at 82 % is 13 px, so clicking cell middles has a margin of 6 px.
- **Evidence:** `calibration {"vx":-64.2,"vy":-65.0,"zoom":0.82,…}` in every run's log; the first two runs failed here and taught two things (journal 18:10 and 18:13): the Inspector's text is uppercased by CSS, and cells outside the level have negative numbers (F-09).

## D-005: the Empty template with 4 screens × 448 px

- **Context:** the spec's level is 1536 × 448 px. The wizard offers the Buenos Aires template (8192 × 672, its own five sections), Empty (2-21 screens wide, 224/448/672 tall) and a Tiled map.
- **Options:** Buenos Aires and cut it down (there is no crop or resize tool); Empty at 4 × 448; a Tiled map made outside Willy Maker (not "a user of Willy Maker").
- **Choice:** Empty, 4 screens, 448 px. Level name "Puerto Madero docks".
- **Why:** it is exactly the spec's size, with the dock floor (two solid rows, top at y 416) already painted with the street art.
- **Evidence:** steps 3 and 9-12 (`evidence/shots/003.jpg`, `010.jpg`, `011.jpg`); `project.json` `size: {w: 1536, h: 448}`.

## D-006: 4 players in the game settings, starts at x 32, 48, 64, 80

- **Context:** the spec: 2 players at once (P1 Willy, P2 a recruit with another shirt); P3 and P4 may join later; their ports must not crash. The wizard's players count is what the game accepts; it puts the starts at x 32, 56, 80 and 104.
- **Options:** 2 players (P3/P4 ports would be ignored, which the spec allows); 4 players.
- **Choice:** 4 players, and the starts of P2-P4 moved to x 48, 64 and 80 in the Inspector, so every start is inside the spec's x 32-96.
- **Why:** 4 lets P3 and P4 join with Start (the spec's "may join later"), and the board is 4 × 3 anyway; the Game tab gives P1 Willy in his own colors and P2-P4 the recruit shirts, as the spec asks. Play mode starts with 2 players.
- **Evidence:** steps 7 and 18-23; `shots/100-game.png`; `project.json` starts. Play mode ignores the P2-P4 starts (F-11).

## D-007: the crates: one 32 px crate at x 192, a 64 px stack at x 224

- **Context:** spec item 2: a stack of crates (32 then 64 px) to climb by pushing, then jump. Willy Maker's crate is a 32 × 32 object with its collision cells (`crate`), climbed by pushing.
- **Options:** solid blocks painted as crates (not crates); crate objects.
- **Choice:** Parts › Terrain › Crate with the pencil: `crate_single` at (192, 384), `crate_stack_low` at (224, 384) and `crate_stack_top` at (224, 352). Named so the AI pack says what each is.
- **Why:** pushing onto the single crate (32 px), then onto the stack's top (32 px more) is the spec's "32 then 64". The play-test climbed them: P1 at x 186 after pushing, then on the stack at x 260, y 352 (`shots/091-play-crate.png`, `092-play-stack.png`).
- **Evidence:** steps 26-32; `shots/040-crates.png`.

## D-008: the one-way ledge at y 352, x 320-447

- **Context:** spec item 3: a one-way ledge 64 px up, reached by jumping, with a way down (down + B1).
- **Choice:** the Platform tag (one-way) filled across cells 20-27 of row 22: top y 352 = 64 px above the dock floor (y 416), 64 px to the right of the stack, at the stack's height. Auto art draws the platform tiles.
- **Why:** it can be reached by a jump from the floor (the jump is about 65 px) or from the stack's top, and down + jump drops through it. The review's reachability rule passes it ("The whole path can be walked…", no `level.ledge` warning).
- **Evidence:** steps 33-35; `shots/050-terrain.png`; the review (`evidence/review-ui.json`).

## D-009: the ladder at x 576 and the upper dock as a one-way floor at y 256

- **Context:** spec item 4: a ladder to the upper dock (the second floor), 160 px up.
- **Options:** the upper dock solid (blocks from below, needs a thicker block to look right) or one-way (the template's crane arm is one-way).
- **Choice:** the upper dock is the Platform tag across cells 37-71 of row 16 (x 592-1151, top y 256 = 160 px up); the ladder is the Ladder tag on column 36 from row 16 to row 25, against the dock's left end, as the Buenos Aires template builds its ladders.
- **Why:** one-way gives a second way down (down + jump) besides walking off its right end. The lower dock stays open underneath (128 px clearance for a 40 px body).
- **Evidence:** steps 36-38; `shots/050-terrain.png`; the review passes reachability, traps and camera.

## D-010: the three Troopers

- **Context:** spec item 5: one on the lower dock, one on the upper dock, one guarding the exit; patrol 96 px; 3 shots; hurt on touch; 100 points.
- **Choice:** Parts › Enemies › Trooper, then in the Inspector: `trooper_lower` (720, 416), `trooper_upper` (864, 256), `trooper_exit` (1344, 416), facing left, patrol 96.
- **Why:** the lower one walks under the upper dock, the upper one in the middle of the upper dock, the third 96 px before the exit.
- **Gaps:** the number of hits, the points, the energy model and the touch damage are engine rules that Willy Maker does not let a user set; its play mode and the AI pack's PROMPT.md say 4 hits, 500 points and lives (F-01). Not worked around (D-014).
- **Evidence:** steps 39-59; `shots/060-objects.png`; `project.json` objects.

## D-011: the two civilians

- **Context:** spec item 6: 2 civilians to rescue by touching them (500 points each).
- **Choice:** Parts › Civilians › Woman `civ_ledge` at (400, 352) on the one-way ledge, and Child `civ_upper` at (1088, 256) at the end of the upper dock.
- **Why:** each one rewards one of the spec's climbing pieces (the ledge, the ladder and upper dock).
- **Gaps:** the points (F-01).
- **Evidence:** steps 60-71; `shots/060-objects.png`.

## D-012: the exit at x 1440

- **Context:** spec item 7: the exit at x 1440-1504 on the lower dock; reaching it with all enemies down shows "SECTION CLEAR". The exit object has no width in the Inspector; the engine makes it 32 px wide (`game.ts`: `w` defaults to 2 cells) and the whole level tall.
- **Options:** x 1440 (left edge of the zone, trigger 1440-1472); x 1456 (trigger centered in the zone).
- **Choice:** x 1440, y 416.
- **Why:** the spec names x 1440 as where the exit starts; a builder reading the pack sees that number.
- **Gaps:** the 64 px width (F-04) and the "all enemies down" condition (F-02).
- **Evidence:** steps 24-25; `project.json` `{"name":"exit","x":1440,"y":416}`.

## D-013: the night sky on the far layer

- **Context:** art: the prototype's tiles, night palette, dark sky. The Empty template's far layer has the sky tileset but no tiles (black).
- **Choice:** Layers › Far background, Parts › Tiles, and six Fill rectangles across the level: tiles 1, 2, 3 and 4 (the sky's darkest four steps) from the top, tile 10 (the skyline's roofs) and tile 12 (dark buildings) down to the floor.
- **Why:** it uses the template's own sky tileset (`ts-sky`, the prototype's art), only its darkest colors.
- **Gaps:** there is no "night" palette choice; the look is painted by hand (F-12).
- **Evidence:** steps 72-86; `shots/070-sky-tiles.png`, `080-level.png`, `092-play-stack.png`.

## D-014: nothing is written by hand: what Willy Maker cannot say is recorded as a gap

- **Context:** some spec items cannot be expressed in Willy Maker: the enemies' 3 hits (the engine reads an enemy's `hp`, but the Inspector has no field), the points (100 and 500), the energy model (3 energy, 1 s blink), the exit only with all enemies down, "CREDITS n" on the title, the exit's width, the section, and the harness's lab state and symbol map. A user could export the project `.zip`, edit `project.json` and import it.
- **Options:** edit `project.json` (or the pack's PROMPT.md) to carry them; leave the pack as Willy Maker made it and record each gap.
- **Choice:** the pack is unmodified (`ai-pack.zip` is byte for byte the download, SHA-256 `23cdc296…d0fa`); every gap is a finding (F-01, F-02, F-04…F-08).
- **Why:** the experiment measures what Willy Maker carries to the second agent. Hand edits would hide exactly what it should learn. The consequence is expected: unless step 2 is given the spec, it will build the engine's numbers (4 hits, 500/1000 points, lives) and no lab state.
- **Evidence:** `evidence/pack-extract/PROMPT.md` ("Enemies | 4 hits…", "Score | crate 100, enemy 500, rescued civilian 1000", no mention of `symbols.json` or the lab state).

## D-015: where the evidence lives

- **Context:** 107 full-size step screenshots are 25 MB; the video is 8 MB (MP4) and 19 MB (WebM).
- **Choice:** the repository keeps the step screenshots as 960 px JPEG (`evidence/shots/NNN.jpg`), the milestones as full PNG, `timeline.json`, the console log, the review, both zips as downloaded and the dead ends' screenshots. The shared folder keeps the full-size PNGs (`evidence/shots-full/`), the WebM and `builder.mp4`.
- **Why:** the repository stays light enough to clone; nothing is lost, and the timeline names both copies.
- **Evidence:** `evidence/timeline.json` (`screenshot` and `fullSize` per step).

## D-016: the MP4 has a chapter per milestone

- **Context:** the comparison page plays the videos side by side and needs to jump to moments.
- **Choice:** `tools/make-mp4.mjs` converts the WebM to H.264 (CRF 23, faststart) with one chapter per milestone screenshot, each chapter being the work that ends with it.
- **Evidence:** `builder.mp4`: 163 s, 24 chapters (`evidence/video-chapters.txt`).

## D-017: the menus: the spec's texts

- **Context:** spec screens: a title (`WILLY GORKLINGO`, `THE LAG PROTOCOL`, `PUSH START`, `CREDITS n`, `(C) 2026 GO-LINK`), the HUD, "SECTION CLEAR", "GAME OVER".
- **Choice:** the title comes from the game title (folded to uppercase); subtitle `THE LAG PROTOCOL`; prompt `PUSH START` (the default, so Willy Maker stores nothing for it); credits line `(C) 2026 GO-LINK`; HUD › Level clear `SECTION CLEAR`; Game over keeps `GAME OVER`.
- **Gaps:** no field or automatic line for `CREDITS n` (F-05); the HUD's score, energy and credits layout is fixed by the engine.
- **Evidence:** steps 95-101; `shots/111-title-full.png`, `112-hud-full.png`; `project.json` `settings.menus`.

## D-018: the Export review: nothing to fix, one note kept

- **Context:** the review said "Ready to export" with no errors, no warnings and one note: "No hero of your own yet: the game uses the built-in Willy." (Go, no Fix). The task asks to fix everything it reports.
- **Options:** import a hero sheet (new art, outside the spec); keep the built-in Willy.
- **Choice:** Go was pressed to see where it leads (the Characters tab), then the note was kept.
- **Why:** the spec asks for the prototype's characters and no new art; the built-in Willy is exactly that. The pack's build check (level 2) passed, since the download happened (a failure blocks it).
- **Evidence:** `shots/200-export-full.png`, `210-go-0.png`, `220-export-final.png`; `evidence/review-ui.json`; `pack-extract/review.json`.

## D-019: a short play-test before exporting

- **Context:** not asked by the task, but Willy Maker's point is to play while building.
- **Choice:** Play, walk right and push up the crates, jump toward the ledge, drop, walk on and fire; then Back to building. It changes nothing in the project.
- **Why:** it checks the crates and the stack with the ROM's rules before handing the level over. The jump from the stack fell short of the ledge (x 302, the ledge starts at 320): a player's timing, not the level (the review's reachability passes).
- **Evidence:** `shots/090-play-start.png` to `095-play-fire.png`, with each status line in `timeline.json`.

## D-020: HOWTO.md for step 1

- **Context:** the contract (on `main`'s working copy, not yet committed) adds `HOWTO.md`: a copy-and-paste guide a second agent follows in a fresh worktree.
- **Choice:** `HOWTO.md` covers step 1: the server, the script, what each phase should show (with the screenshots), how to check the pack, and every click as the timeline lists it.
- **Evidence:** [HOWTO.md](HOWTO.md).
