# Case C: decisions

Experiment 1, case C ([README](../README.md)): build Willy Maker's stage 2 (a data-driven engine and **Create ROM**), then make Game Spec v1 as a user would, in the browser, recorded. Every decision has an id; commit messages end with `Decision: D-NNN` lines ([trace.md](trace.md) maps files to commits and decisions).

## D-001: the case branch starts from `main` with the harness

- **Context:** the worktree given to the case was at `76cd798`, before the harness commits (`d2fcb2b`, `3a0b738`, `23806b8`): no `lab_state.h`, no `rom/tools/lab/`, no `docs/experiments/`.
- **Options:** work on the worktree's base and merge the harness later; branch `exp1/case-c` from `main` (`23806b8`).
- **Choice:** branch from `main`.
- **Why:** the contract, the lab state the ROM must keep and the tools that judge it are all in those commits; building without them would be building blind.
- **Evidence:** `git log --oneline main -4` at 18:06 (journal); every case-C commit has `23806b8` as an ancestor.

## D-002: the engine is the prototype's program, generalized, prebuilt once and shipped as a file

- **Context:** stage 2 must turn a project into a ROM in the browser. The prototype (`rom/src/main.c`) already plays a level like the spec's on the real core.
- **Options:** (a) compile C in the browser (a 68000 gcc in WebAssembly); (b) write a new engine from scratch; (c) generalize `main.c` into an engine that reads its game from a data block at a fixed address, build it once with the existing toolchain and ship the binary.
- **Choice:** (c): `rom/engine/engine.c`, built by `rom/tools/engine.mjs` into `public/willy-maker/engine/engine.bin` (program, the engine's sprite tiles, the plain Z80 program) and `engine.json` (sizes, SHA-256, the symbol map).
- **Why:** packing is pure data work that fits in TypeScript; the prototype's physics are the ones the spec names and the ones play mode already copies; a 24 KB program needs no compiler on the user's side.
- **Evidence:** the engine built clean on its first compile (journal 18:25); the spec ROM matches the core pixel for pixel ([evidence](evidence/README.md)).

## D-003: the data format is a big-endian block with absolute pointers, checked on both sides

- **Context:** the C engine and the TypeScript packer must agree on every byte.
- **Options:** a tagged chunk format (flexible, more code on the 68000); a fixed header with absolute pointers to arrays.
- **Choice:** `struct wm_data` (0x70 bytes) at 0x100000 with absolute pointers to the tags, the tile maps, the palettes, 12-byte objects and a text-line table (`rom/engine/wmdata.h`).
- **Why:** the 68000 reads it with plain struct access and no parsing; `_Static_assert` pins every offset in C, and `rom/rom.test.tsx` reads the same offsets back out of a packed set.
- **Evidence:** `rom.test.tsx` "packs the spec level…" (header, rules bytes, tags at the ladder and dock).

## D-004: the engine carries the prototype's characters; a project's own characters are a noted gap

- **Context:** the spec says "the prototype's characters and street tiles (no new art is required)". Converting a user's sprite sheet in the browser is a bigger job (frames to 16 × 16 tiles, palettes, frame tables the engine can read).
- **Options:** convert characters in the browser now; ship the prototype's characters inside the engine file and note the gap.
- **Choice:** the engine file carries Willy, three recruit shirts (green, red, blue), the woman, the child, the Lag android, the bullet and the rocket (`art.mjs` with `level: false`, `recruits`); Create ROM notes "your own characters are drawn as Willy" and "every enemy kind is drawn as the Lag android".
- **Why:** it meets the spec without new art, and the notes keep the limit visible to the user instead of hiding it.
- **Evidence:** `pack.ts` notes `characters`, `enemyArt`; [engine.md, what the ROM leaves out](../../willy-maker/engine.md#what-the-rom-leaves-out-for-now).

## D-005: tile columns are streamed into the board's 64-column tilemaps

- **Context:** the prototype's level was exactly 1024 px, the width of scroll2's tilemap; the spec's is 1536 px and Willy Maker's levels go to 8192 px.
- **Options:** cap levels at 1024 px; stream columns around the camera.
- **Choice:** stream: every frame the engine writes the play and far columns around the camera that are not on the board yet (a broken crate's column is rebuilt from the collision map in RAM).
- **Why:** it costs a few dozen word writes per new column and lifts the width limit to the RAM collision map (24 576 cells).
- **Evidence:** the clear script walks the whole 1536 px; the core frames at 1348, 1682 and 1883 (past 1024 px) match the simulator.

## D-006: the texts come from the Menus tab's own layout

- **Context:** the title, HUD, clear, continue and game over texts are edited in the Menus tab with a live preview.
- **Choice:** the packer writes `screenLines()` (the preview's own positions, sizes and inks) as a line table; the double-size font's quarters are generated by the packer; the engine adds only the moving parts (scores, energy, credits, the rescued count, the countdown).
- **Why:** what the user sees in the preview is what the board draws.
- **Evidence:** the title frame of the power-on test (session step 78) and the core's GAME OVER frame (`checks/damage/core/f001393.png`).

## D-007: rules are data, with the prototype's as defaults, read by play mode and the ROM

- **Context:** the spec's numbers differ from the prototype's (3 hits, 100 points per enemy, 500 per rescue, touch damage, no chasing or shooting, the exit only with every enemy down, a 1 s blink in place). Play mode had them as constants.
- **Options:** hard-code the spec's numbers in the engine; make them settings.
- **Choice:** `GameRules` (`engine/rules.ts`) stored as `settings.rules` (only what changed), a **Rules** card in the Game tab, the same values packed into `wm_rules`, and play mode's `Game` reading them.
- **Why:** a maker's job is to let users set such rules; changing the spec's numbers by hand would hide them in code; keeping the prototype's defaults leaves existing games unchanged.
- **Evidence:** `engine/game.test.tsx` "the Rules card (Game Spec v1's numbers)"; session steps 56-65.

## D-008: `art.mjs` gains options without changing the prototype's bytes

- **Context:** the engine needs the prototype's characters without its level and with three recruit shirts.
- **Choice:** `addArt(gfx, defs, dir, { level, recruits })`; the level part moved to `addLevelArt`.
- **Why:** one converter for both, no copy of the art code.
- **Evidence:** the 28 files of `rom/build/slammast.zip` have the same CRC-32 before and after (journal 18:27).

## D-009: the same game gives the same zip

- **Context:** the experiment compares runs and the device identifies sets by hashes.
- **Choice:** sorted entries and a fixed date in the zip; the packer has no clock or randomness.
- **Evidence:** `rom.test.tsx` "gives the same .zip for the same game"; the three session runs with the first engine made the same `slammast.zip` (SHA-256 `4b315b28…`); the final recording, with the engine of D-022, made `b1742aac…`.

## D-010: the clear script is a recorded route player, with expectations at the spec's moments

- **Context:** the route bot clears the level (frame 1260) but rescues only one of the two civilians; writing 1900 frames of inputs by hand is error-prone.
- **Choice:** `runs/route-player.mjs` follows the spec's route goal by goal from the lab state; `make-clear.mjs` turns its recorded inputs into `runs/clear.json` with checkpoints and 18 expectations (on the stack, both rescues, each Trooper down with its points, the upper dock, the exit with 1300 points and full energy). A copy sits at `harness/runs/clear.json`, the path the harness doc names.
- **Evidence:** the scripted run clears at frame 1883 with every expectation; the core replay is identical at all 11 checkpoints.

## D-011: "Play on my go-link" powers the created set on with the device's real core

- **Context:** the device tests a set without touching the ROM folder (`rom_test`, validation level 4); opening a room needs the set in the ROM folder, where a `slammast.zip` may already be, and the device names sets by hash.
- **Options:** upload into the ROM folder and open a room; reuse the level 4 test.
- **Choice:** the button opens the level 4 test on the created zip (`DeviceRomTest`); a room with a user's own set is noted as next.
- **Why:** it never overwrites the user's ROMs and needs no device change; the gap is written down.
- **Evidence:** session step 81 (no device linked: the card says how to link one); [engine.md](../../willy-maker/engine.md#what-the-rom-leaves-out-for-now).

## D-012: Create ROM shows its steps, powers the result on by itself and then offers the files

- **Choice:** steps (engine, pictures, pack, zip, power-on test), the level 3 checklist and picture, the size and a one-line summary, then **Download ROM**, **Symbol map** and **Play on my go-link**; review errors block it, like the AI pack.
- **Evidence:** `CreateRomCard.test.tsx`; session steps 77-81.

## D-013: the inspector edits an enemy's hits and the exit's width

- **Context:** the spec's exit is x 1440-1504 (64 px); the inspector had no width for an exit and no hits for an enemy.
- **Evidence:** session step 52; `Panels.tsx`.

## D-014: the session is a Playwright script with a note card before every action

- **Context:** the contract asks for a recording of the browser (never the screen), a note before every action, a timeline, a chaptered MP4 and a guide.
- **Choice:** `session/session.mjs` (Chromium 1920 × 1080, `recordVideo`): for each step a card (step, what, why) and an outline around the control are injected, 1.5 s pass, a screenshot is taken, the note is removed and the action runs; `timeline.json` keeps the time, text, why, selector and screenshot. The canvas tells its view (`data-view`), so clicks land on exact world pixels. `session/publish.mjs` makes the MP4 (one chapter per step, ffmpeg) and `evidence/session/guide.html`.
- **Evidence:** 82 steps, no errors; `session.mp4` (203 s, 82 chapters).

## D-015: reading the spec where the engine's numbers decide

- **Context:** (1) "a one-way ledge 64 px up, reached by jumping": the jump peaks at 61.9 px (−112 + 6 per frame, in 1/16 px), so a ledge 64 px above the dock is out of reach from the dock; (2) "GAME OVER when every player has no energy and no credit"; (3) "loses 1 of 3 energy".
- **Choice:** (1) the ledge is 64 px up and is reached by a jump from the 64 px crate stack across a 2-cell gap (the crates' "then jump"), and down + B1 drops from it; (2) with no credit the game is over at once; with a credit a 10 s continue countdown runs; (3) energy is the DIP switch "lives" (3), each hit costs 1.
- **Why:** the spec is frozen and the engine's numbers are the prototype's; the level is built so every item holds with them. Point (1) is also recorded as a finding for Willy Maker (its texts say "a 64 px jump").
- **Evidence:** `clear.json` expectation "on the stack, y 352" then the ledge rescue; `damage.json` (game over at the third hit, frame 1273).

## D-016: the committed engine must be the build of its source

- **Context:** after the engine was built and committed, a small source edit (the countdown in double size) was made without rebuilding; the session's ROMs were made with the committed binary.
- **Options:** rebuild and redo the recording and acceptance; put the source back to what was built.
- **Choice:** put the source back; `engine.mjs --check` rebuilds and compares, and it now passes.
- **Why:** the judged ROM, the recording and the source stay one consistent thing; the countdown size is cosmetic.
- **Evidence:** `--check` failed at 19:00 and passed at 19:01 (journal); commit `5167fbb`.

## D-017: number fields keep what is typed until it is in range

- **Context:** in the second session trial, typing 64 into the exit's width (minimum 16) gave 164: the field clamped the first digit, 6, to 16.
- **Choice:** `NumberInput` keeps the typed text while it is out of range and clamps when the field is left (or on Enter).
- **Why:** any user typing a number would hit it; it is a Willy Maker bug found by using it, not a session problem.
- **Evidence:** `Panels.test.tsx`; trial 2's screenshot 54 (`Width 164`) in the journal.

## D-018: the judged ROM is the session's download, unmodified, plus checklist scripts

- **Choice:** `build/slammast.zip` is the file the recorded session downloaded (with `slammast.symbols.json`, the engine's symbol map); `runs/damage.json` (touch damage, blinking in place, game over) and `runs/odd-inputs.json` (P2 joins, P3/P4 Coin and Start, B3 on every port, Start mid-game, B4-B6) cover the spec items the clear does not.
- **Evidence:** both scripts pass their expectations in the simulator and match the core at every checkpoint.

## D-019: the stage is documented where users and developers look

- **Choice:** a new [engine.md](../../willy-maker/engine.md); the Willy Maker README, architecture, file format and validation docs; the user guide in English, Spanish and Portuguese; `rom/README.md`; the CHANGELOG and status.

## D-020: the session's screenshots are committed small; the video stays outside git

- **Choice:** `evidence/session/shots/` keeps 1024 px JPEG copies (4.7 MB for 82 steps); the 1920 × 1080 originals, the WebM and `session.mp4` (10 MB) are in the experiment's shared folder (`exp1/case-c/`).
- **Why:** the repository stays small while the guide still works from the repository.

## D-021: a jump reaches ledges up to 48 px, and Willy Maker now says so

- **Context:** D-015 measured the jump: it peaks at 61.9 px. Willy Maker's reach check (`editor/reach.ts`) let a jump climb 4 rows (64 px), its texts and the art spec said "a 64 px jump", and the Buenos Aires template put a civilian on a platform 64 px up (`civ_lobby_1`) that nobody can reach in play mode or in the ROM, while the reach check said everything was reachable.
- **Options:** make the jump higher (changes the prototype's rules and the spec's numbers); make the check and the texts tell the truth.
- **Choice:** the reach check climbs 3 rows (48 px); a test in `engine/game.test.tsx` lands on a 48 px ledge and not on a 64 px one; the template's lobby platform moves to 48 px; the art spec, the Willy Maker docs, the AI pack's prompt, play mode's note and the user guide say "ledges up to 48 px". The frozen spec text is left as it is.
- **Why:** the engine's numbers are the prototype's and the spec's; the tool must warn about what the engine really does.
- **Evidence:** `editor.test.tsx` ("warns about a ledge 64 px up"), the template test (no warnings again after the move), commit `4cd6830`.

## D-022: a title glitch found while checking the frames: fix the engine and record again

- **Context:** the core's frame 150 of the clear script showed a stray "I" under the title: with a credit, the blinking PUSH START (10 letters) replaced INSERT COIN (11 letters) on the same row, and the engine cleared only the shorter one.
- **Options:** keep the judged ROM and note the glitch; fix the engine and redo the recording, the scripts and the acceptance run.
- **Choice:** fix (`draw_line(&coin, 0)` always), rebuild the engine (`091cc4c`), record the session again (82 steps, no errors, 227 s), take its ROM (`b1742aac…`), regenerate `clear.json` and `damage.json` from it (the same frames: 1883 and 1273) and run the whole acceptance again. The earlier acceptance and Laya runs on the first ROM were stopped.
- **Why:** the branch's Willy Maker must make the judged ROM byte for byte, and the fix is cheap next to a visible bug on the title.
- **Evidence:** `exp1/case-c/checks/odd-inputs/core/f000150.png` (clean title), `engine.mjs --check` passes.
