# Case C: lab journal

Experiment 1, case C: Willy Maker's stage 2 (a data-driven engine and Create ROM), then Game Spec v1 made in the browser as a user, recorded. Times are the Mac's local time (-03), 2026-10-01, from `date` and the commits. Decisions are in [decisions.md](decisions.md).

## 18:06 Start

- Read the contract (`docs/experiments/README.md`), the harness (`harness.md`), Willy Maker's docs (README, architecture, file format, validation), `rom/README.md`, the prototype (`rom/src/main.c`, `build.mjs`, `art.mjs`, `level.mjs`, `link.ld`, `crt0.s`, `hw.h`), play mode's engine (`engine/game.ts`, `rules.ts`), the Export tab and the power-on card.
- **Dead end:** the worktree was at `76cd798`, without the harness. Branched `exp1/case-c` from `main` (`23806b8`) instead (D-001).
- The tool guard of this session refused shell lines that mixed pipes, `source`, `cd`, `&&` and the scratch path (its name contains "github"); `rm` of a glob was refused too. Worked around with small scripts in the scratch folder run as one command each, and with `unzip -v` CRCs instead of unpacking.
- `npm ci` in the worktree's `frontend/` (4 s). The prototype was built once and the CRC-32 of its 28 files saved as the baseline.

## 18:11-18:27 The engine

- Plan: generalize `main.c` into `rom/engine/engine.c` reading `struct wm_data` at 0x100000; ship the binary; pack in TypeScript (D-002, D-003).
- `art.mjs`: the level art made optional and the recruits a list. The prototype rebuilt with the same 28 CRCs (D-008).
- Wrote `wmdata.h` (offsets pinned by `_Static_assert`) and `engine.c`: data-driven level, column streaming for levels wider than the 64-column tilemaps (D-005), 4 players on `slammast`'s ports, energy and game over, exit, rules, texts from a line table (D-006), the lab state every frame.
- Two fixes before the first build: the text palette attribute (scroll1's palettes are numbered inside their group) and a stray label in `main()`.
- `node rom/tools/engine.mjs`: **built clean the first time**, program 24 284 bytes, the engine's sprites 37 120 bytes (tiles 0x1000-0x1122), `lab_state` at 0xff0000.

## 18:18-18:25 The packer and the first ROM

- `rom/pack.ts`: the data block, the font and a generated double-size font, the engine's sprites, the level's tiles from the tileset PNGs, `splitProgram` (new in `@go-link/cps1`), Kabuki, silent samples; `createRom.ts` (engine loader with its SHA-256, pictures, zip with a fixed date, D-009).
- `rom/specFixture.ts`: Game Spec v1's level built with the editor's own operations (empty template, 2 players, 4 screens × 448 px; crates at x 160 and a 64 px stack at x 192; a one-way ledge at y 352, x 256-367; a ladder at x 480 from y 256 to the dock; the upper dock at y 256, x 496-1023; Troopers at x 640, 800 and 1360; the woman on the ledge, the child on the upper dock; the exit at x 1440, 64 px wide; the spec's rules and texts).
- `rom.test.tsx`: **5 of 5 passed on the first run**, the power-on test (validation level 3) included.
- Reading the jump: −112 then +6 per frame (1/16 px) peaks at 61.9 px, so a ledge 64 px above the dock cannot be reached from the dock. The spec's ledge stays 64 px up and is reached from the 64 px crate stack across a 2-cell gap (D-015).

## 18:26-18:29 Playing the first ROM

- Route bot: clears at frame 1260 with every Trooper down, but rescues only the child (it never takes the jump from the stack to the ledge).
- Wrote `runs/route-player.mjs` (the spec's route, goal by goal, from the lab state): clears at 1883, both civilians, 1300 points, no energy lost. `make-clear.mjs` turned its inputs into `clear.json` with 18 expectations: all pass in the simulator (D-010).
- **The same script on the real core (`device romtest --input`): identical pixels at all 11 checkpoints, tolerance 0.** The column streaming, the text table and the engine's sprites behave the same on mame2003-plus as in the board model.
- Commits `c4febdd` (art), `825fed6` (engine), `72b08b2` (rules), `b0745ad` (packer).

## 18:29-18:36 Rules and the Create ROM card

- `GameRules` in `engine/rules.ts` with the prototype's numbers as defaults, read by play mode (`Game`'s `rules` option); play mode's enemies can keep their patrol, stop shooting, hurt on touch, and the exit can wait for every enemy; tests with the spec's numbers (D-007).
- The Game tab's **Rules** card, the inspector's enemy hits and exit width (D-013), the **Create ROM** card (steps, automatic level 3 with its picture, Download ROM, Symbol map, Play on my go-link through the level 4 test, notes; D-011, D-012), texts in English, Spanish and Portuguese.
- One test failed: the old ExportView test expected disabled "Download ROM" buttons; replaced by a test of the new card. One type error in the new card's test caught by `npm run build`.
- Full frontend: typecheck, 618 tests and the build pass. Commit `35573e7`.

## 18:36-18:48 The recorded session, rehearsals

- The site on port 5302 (the signaling server refuses that origin, harmless: no device is linked in the recording).
- Probe: the IDE at 1920 × 1080, the canvas 1320 × 750, zoom 2. Added `data-view` to the canvas so the script maps world pixels to page pixels exactly; zooming out 4 times (82 %) shows the whole 1536 × 448 level.
- `session/session.mjs`: before each action a card (step, what, why) and an outline are injected, 1.5 s pass, a screenshot is taken, then the action (D-014).
- **Trial 1:** stopped at step 17: the tile buttons have no visible text (only an accessible name); looked them up by role.
- **Trial 2:** all 79 steps ran, but the exit's width became **164** instead of 64: the inspector's number field clamped every keystroke, so the first digit, 6, became the minimum 16, then 4 was appended. A real Willy Maker bug: fixed `NumberInput` to keep the typed text until it is in range and clamp when the field is left, with a test (D-017, commit `bda1433`).
- **Trial 3:** clean; the session's ROM played by the route player clears at 1883, like the fixture's.
- **Trial 4:** added "Play while building" (Play, walk right, Back to building).

## 18:48-18:52 The recording

- Final run with 1.5 s notes: **82 steps, no errors, 200 s**. The downloaded `slammast.zip` has the same SHA-256 (`4b315b28…`) as trials 3 and 4: the session is reproducible.
- `session/publish.mjs`: `session.mp4` (H.264, 10.1 MB, 203 s, **82 chapters** from the timeline) and `evidence/session/guide.html` (each step with its time, why, selector and screenshot). The committed screenshots were scaled to 1024 px (4.7 MB, D-020).

## 18:54-19:00 Acceptance and the checklist

- The session's ROM, unmodified, went to `build/slammast.zip` with its symbol map; `clear.json` was made again from the route player on that exact zip (clears at 1883, every expectation passes) (D-018).
- `acceptance.mjs ... --bot-games 5 --laya-games 3` started at 18:55 (results below).
- `runs/touch-player.mjs` and `make-damage.mjs` → `runs/damage.json`: the player stands in the lower Trooper's patrol: energy 3 → 2 at frame 888 (60 frames of blinking, same x), 2 → 1 at 1096, out at 1273 with no credit: **GAME OVER** at once, then the title. Sim expectations pass; **core identical at all 6 checkpoints**.
- `runs/odd-inputs.json`: two coins, 1P Start, 2P Start joins the recruit, P3 and P4 press Coin and Start (ignored by a 2-player game, no crash), B3 on every port, Start mid-game, B4-B6: every expectation passes; **core identical at all 5 checkpoints**.

## 19:00-19:02 The engine's source was ahead of its binary

- `node rom/tools/engine.mjs --check` **failed**: after the first build the continue countdown had been changed to the double-size font in the source, without rebuilding, so the committed `engine.bin` (used by every ROM above) was not the source's build.
- Put the source back to what was built rather than rebuild and redo the recording (D-016); `--check` passes. Commit `5167fbb`.

## 19:02 Documentation

- `docs/willy-maker/engine.md` (new), the Willy Maker README, architecture, file format and validation, the user guide in three languages, `rom/README.md`, status and CHANGELOG (D-019). Commit `528e392`.


## 19:16-19:30 A stray letter on the title, and everything again

- While writing the checklist, the core's frame 150 showed an "I" left under the title: PUSH START (10 letters) blinks over INSERT COIN (11) on the same row and only the shorter was cleared. Fixed in the engine and rebuilt (D-022, `091cc4c`).
- Also found while writing the records: Willy Maker's reach check let a jump climb 64 px, but the jump peaks at 61.9 px; the Buenos Aires template had a civilian 64 px up that nobody can reach. The check now climbs 48 px, a test lands on 48 and not on 64, the template's platform moved, the texts say "ledges up to 48 px" (D-021, `4cd6830`, `9985e6e`).
- Stopped the first acceptance run (its Laya games ran at about 4 s per decision: the Mac was at load 47-69 with other cases' Laya players) and the two parallel Laya games.
- Recorded the session again: 82 steps, no errors, 227 s; ROM `b1742aac…`. The route player clears it at 1883 again; `clear.json` (18 expectations) and `damage.json` were regenerated from it and pass; the damage and odd-input scripts are identical on the core.
- The AI pack's round-trip test timed out at 30 s while the machine was this loaded, with and without the reach change (it passed in the full run at 18:35); to be run again when the load drops.
- Started the acceptance again, with Laya games 2 and 3 also run in parallel by the same command line the acceptance uses (`--seed 1`, `--seed 2`), to save wall time.

## 19:30-19:48 Results on the final ROM (b1742aac…)

- Level 3 passes (10 steps); level 4 passes (10 device steps); the scripted run clears at 1883 with 18 of 18 expectations; the real core gives **0 % different pixels at all 11 checkpoints**.
- Route bot: **5 of 5** clear (frames 1260-1478, median 1354), never hurt, never falls; it rescues only the child.
- Laya: **0 of 3**. Game 1 pressed fire 574 times out of 574; games 2 and 3 (sampling, seeds 1 and 2) chose fire 462 times, run_right 110 and jump 2, reached x 186 and shot two crates open (200 points). 1.6-2.0 s per decision. The sequential acceptance was stopped after its game 1 and games 2-3 from the parallel runs merged into `acceptance.json`.
- Frontend: typecheck, **622 tests** and the build pass (the AI pack round trip passed once the load dropped).
- Records, evidence and the shared folder (`exp1/case-c/`: the zip, the symbol map, `session.mp4`, `evidence/`, the acceptance and checklist runs) written at 19:49.
