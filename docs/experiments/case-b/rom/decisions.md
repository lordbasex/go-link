# Case B, step 2: decisions

Case B, step 2 of [experiment 1](../../README.md): an agent that works blind builds the ROM from the AI pack Willy Maker exported in step 1 (`ai-pack.zip`, SHA-256 `23cdc296…d0fa`, 15 entries), with the tools in `rom/`. The pack's `PROMPT.md` is the spec; of the experiment's README only "Acceptance", "Records" and "The harness" were read, plus `docs/experiments/harness.md`. Step 1's records (one folder up) were not read.

Each decision has its context, the options, the choice, why, and the evidence. "The pack" is the unzipped `ai-pack.zip`; "the shared folder" is `exp1/case-b/` in the session's scratchpad. Step 1 already uses D-001 to D-020 in the same case folder, so step 2 numbers its decisions from **D-101**, and commit messages say `Decision: D-1NN`.

## D-101: the branch is `exp1/case-b-rom`, on top of step 1's `exp1/case-b`

- **Context:** the task says to work on `exp1/case-b`. That branch exists (step 1's eight commits on `main`'s `23806b8`) and is checked out in another worktree, so git refuses to check it out here; this worktree was created at `76cd798`, without the harness.
- **Options:** commit on `76cd798` (no harness, no contract); create `exp1/case-b` again (impossible, it exists); a new branch that continues step 1's.
- **Choice:** `git checkout -b exp1/case-b-rom exp1/case-b`. Merging it into `exp1/case-b` is a fast-forward, left to whoever owns that worktree.
- **Why:** it keeps one line of history for case B (step 1 then step 2), it has the harness (`rom/tools/lab`, `lab_state.h`) and it never touches another agent's worktree.
- **Evidence:** `git worktree list` (journal 18:34): `exp1/case-b` is checked out at `.claude/worktrees/wf_216c9ab5-365-3`; `git merge-base exp1/case-b main` = `23806b8`.

## D-102: the harness tools run from the main checkout; the build runs here

- **Context:** `rom/tools/lab/*.mjs` import `@go-link/cps1-sim`, which needs `frontend/node_modules`; this worktree has none (`ERR_MODULE_NOT_FOUND`). The sandbox also refuses `source ~/.nvm/nvm.sh` and computed arguments, so Node is called by its full path (`~/.nvm/versions/node/v22.23.2/bin/node`).
- **Options:** `npm ci` in this worktree's `frontend/`; run the lab tools from the main checkout, which has `node_modules` and the same `rom/tools/lab` (both at `23806b8`; this branch does not change the harness).
- **Choice:** the build (`rom/tools/build.mjs`, which only needs the TypeScript sources) runs in this worktree; level 3, the runner, the bot, Laya and `acceptance.mjs` run as `node /Volumes/HD12TB/github/MAME-WEBRTC/rom/tools/lab/<tool>.mjs` on this worktree's zip.
- **Why:** no network install, and the jury runs exactly those tools from the main checkout.
- **Evidence:** the prototype passes level 3 that way (journal 18:37, `evidence/prototype-level3.txt`).

## D-103: the pack's game is its own source file, chosen by `build.mjs --pack`

- **Context:** PROMPT.md step 3 says to extend `build.mjs`, `art.mjs`, `level.mjs` and `main.c` to read the pack "instead of the prototype's level". The harness's results on the prototype (`rom/build/slammast.zip`, `prototype-clear.json`) must stay valid, and the pack's game differs a lot (four players, lives, enemy fire, an exit, more screens).
- **Options:** `#ifdef` blocks through `main.c`; replace `main.c`; a second game file that starts as a copy of `main.c`.
- **Choice:** `rom/src/game_pack.c` (started from `main.c`, same engine code and constants) and `rom/tools/pack.mjs` (the pack reader). `node rom/tools/build.mjs slammast --pack DIR --out DIR` compiles `game_pack.c` instead of `main.c`, puts the zip, `program.map` and the symbol maps in `--out`, and does not rewrite the device's list of go-link sets (`backend-device/pkg/ownsets/sets.json`, the prototype's hashes). Without `--pack` the build is the same as before.
- **Why:** the prototype keeps its bytes (and the harness its baseline); `diff main.c game_pack.c` shows exactly what the pack added; no `#ifdef` maze.
- **Evidence:** after the change the prototype's `mbe_23e.rom` still has SHA-256 `ed497719…3c0a`, the same as the main checkout's build (journal 18:45); `own set list … unchanged`.

## D-104: the level's tiles are cut from the layer pictures with each picture's own colors

- **Context:** the pack gives the play layer twice (the `play` tile layer of `level-1.tmj` over `tilesets/ts-city.png`, and `levels/level-1/play.png`) and the far layer only as a picture (`far.png`, an image layer with `parallaxx` 0.5). PROMPT step 3: "the tiles cut from the layer pictures (deduplicated, 15 colors per tile)". The project's palettes (`pal-city` 15 colors with `#222233` twice, `pal-sky` 12) are not the pictures' colors in the same order.
- **Options:** the tilesets and gids; quantize the pictures like the prototype's backdrop (median cut); use the pictures' exact colors.
- **Choice:** `pack.mjs cutTiles`: each picture's exact colors (play 9, far 8, most used first) become one 15-color palette; every 16 × 16 (play) or 32 × 32 (far) cell is cut, deduplicated, and an empty tile is reserved first (broken crates turn into it). The build fails if a picture has more than 15 colors or a color that is not a board color (a multiple of 17).
- **Why:** Willy Maker exports in board colors, so no quantization is needed and the result is pixel exact; the pictures already merge the middle layer into the far one.
- **Evidence:** build log `art: pack level 96x28 cells, play 10 tiles (9 colors), far 7 tiles (8 colors)` (Willy Maker's review said 9 and 6 tiles: ours adds the empty tile to each); `evidence/colors.txt`.

## D-105: the 96-column level is streamed into scroll2's 64-column map

- **Context:** the level is 1536 px wide (96 cells); scroll2's tilemap is 64 × 64 cells of 16 px and wraps at 1024 px (`hardware.md`). The prototype's level is exactly 1024 px, so its program writes the whole map once. The pack says nothing about this.
- **Options:** shrink the level; split it; stream columns.
- **Choice:** `game_pack.c` keeps the level's tile codes in RAM (`tile_map`, crates change it) and, each frame, writes the columns from 4 left of the camera to 4 right of the screen into slot `column & 63` when that slot holds another column (`stream_level`, `slot_col`). The scroll register needs no change: the map's wrap does the rest. The far layer (48 × 14 cells of 32 px) fits scroll3's map as it is.
- **Why:** it is how the board is meant to be used for long levels, it costs at most a few 28-cell columns per frame, and it keeps any level width.
- **Evidence:** the scripted run reaches x 1451 with the right pictures (checkpoint 1856 in the simulator and on the core, `evidence/`).

## D-106: the rules are the pack's table, and each object's own properties win over it

- **Context:** the pack's table says enemies take 4 hits, see 170 px and fire every 90 frames at 3 px per frame; crates take 3 hits; 3 lives with 120 frames without harm; crate 100, enemy 500, civilian 1000. Every crate object says `hp: 2`.
- **Options:** the table for everything; the objects' properties where they exist.
- **Choice:** the table, except the crates' hits, which come from each object's `hp` (2). These numbers are `#define`s at the top of `game_pack.c`'s rules section.
- **Why:** the pack is the only spec of this case; an object's property is the more specific statement (and Willy Maker shows it in the Inspector).
- **Evidence:** `crate_cells` in `gen/art_data.c` (`col, row, 2`); the conflict is listed in the journal's gaps.

## D-107: the section clears when a player stands in the exit zone

- **Context:** the pack has an `exit` object (a point, x 1440, y 416) and no rule for what clears the level or how wide the exit is. The harness's rule for the clear script is "reach the exit with every enemy down"; the lab state has `exit_x0`, `exit_x1`, `exit_y`.
- **Options:** clear on touching the exit; clear on the exit only when every enemy is down; clear when every civilian is rescued (the prototype).
- **Choice:** a player on the ground at the exit's floor (`y` 416) with its x in 1440…1471 (32 px from the point, like the crates' points are their top-left) clears the section. Enemies do not have to be down. `lab_state.flags` = `EXIT | DAMAGE`.
- **Why:** an exit that does nothing until a hidden condition holds is a rule the pack would have to state; touching the exit is what an exit object means as the pack describes it ("there is a player 1 start and an exit"). The clear script still downs all three troopers, as the harness asks.
- **Evidence:** `at_exit()`; the scripted run clears at frame 1856 at x 1444 with every enemy down; the bot clears at frame 1297 with all three down and one civilian (journal 18:45).

## D-108: lives are reported as the lab state's energy

- **Context:** the lab state has `energy` (0-3), `hurt` (blink frames) and the `hurt`/`dead` player states; the pack's damage model is lives (3) and 120 frames without harm. It names no energy.
- **Choice:** one enemy shot costs one life; `energy` = lives left (at most 3), `hurt` = the frames without harm left (also after joining), state `hurt` for the first 30 frames after a hit, `dead` (and `active` 0) when a player has no lives; the continue and game over screens are mode 4 (`game over`).
- **Why:** with 3 lives and 3 energy the harness's counters ("energy lost") mean the same thing; nothing in the pack asks for energy.
- **Evidence:** `runs/damage.json`: three hits about 180 frames apart (energy 3 → 2 → 1 → 0), continue, game over, title at frame 2040 (`evidence/damage-trace.txt`).

## D-109: troopers are drawn with the prototype's Lag android

- **Context:** the enemies are `kind: trooper` with `facing` and `patrol` 96. The pack has no characters (`characters/` is absent) and the prototype has no trooper art, only the robot sheet.
- **Choice:** troopers use the robot's walk, hit and defeated animations; they start facing the object's `facing` and patrol from x - 48 to x + 48 (96 px around the point), chasing a player on their floor within that range.
- **Why:** drawing new art is out of a pack build's scope; the patrol's anchor is not stated, centered is the neutral reading.
- **Evidence:** `robot_spawn` in `gen/art_data.c` (x, y, min, max, facing).

## D-110: the special button throws a grenade, 10 per life

- **Context:** "Button 3: special: the picked-up weapon, with limited ammo (a grenade when there is none)". The pack places no weapon to pick up, and gives no number for grenades: count, arc, reach or damage.
- **Choice:** 10 grenades per life, thrown 3 px per frame forward and 4 px per frame up with the game's gravity; they explode on a wall, a floor, an enemy or off screen, with 24 px of reach, and count 9 like a rocket (an enemy goes down, a crate breaks). The HUD shows `BOMB nn`.
- **Why:** the smallest thing that makes button 3 do what the brief says; every number is a guess and is listed as a gap.
- **Evidence:** `update_grenade`, `blast` in `game_pack.c`.

## D-111: four players with their own shirts and their own Start

- **Context:** players 4, P1 to P4 at x 32-80; "a different shirt per player"; only player 2's color is known (green, the prototype).
- **Choice:** Willy's palettes, then three copies with the shirt color swapped: green (40,132,84), blue (51,102,204), red (204,51,51) (`PACK_RECRUIT_SHIRTS` in `art.mjs`, 27 sprite palettes of 32). Each port's Start with a credit joins that player (P3/P4 Start and Coin are in their own input bytes, button 3 in 0x800000); in the game a new player appears next to the leader; the start points are used at the beginning.
- **Why:** follows the board's wiring as the harness documents it and the story's palette swaps.
- **Evidence:** the select screen and the HUD (`evidence/`), `read_inputs()`.

## D-112: the screens, the DIP settings and what has no data

- **Context:** the pack lists seven menus with empty `blocks` ("an empty screen gets a plain default with the 8 × 8 font"), texts for two (subtitle, cleared), `credits: true` on three, music names, and DIP settings "kept in EEPROM".
- **Choice:** title (8 s: title, subtitle, PUSH START or INSERT COIN, credits counter, the credits line), attract demo (12 s: the camera tours level 1 with DEMO and the level's name), high scores (6 s, a 5-line table in RAM), select (1 s: who plays, all as Willy), the HUD (score, lives and grenades for 4 players, SAVED n), continue (10 s countdown), game over (4 s). A credit keeps the title on screen. The DIP settings are compile-time constants from `project.json` (`DIP_LIVES` 3, free play off, demo sound on, difficulty normal); the EEPROM is neither read nor written. No music (the Z80 program is the prototype's silent one).
- **Why:** reading and writing the slammast EEPROM is a project of its own and the pack does not ask for a settings screen; the prototype has no sound engine.
- **Evidence:** `attract()`, `select_screen()`, `continue_screen()`, `game_over_screen()`; the title frame of the scripted run (`evidence/`).

## D-113: the clear script is written by hand, with a running jump to the ledge

- **Context:** the level's first civilian stands on a one-way ledge 64 px above the street. The pack says the jump is "about 64 px high"; with the engine's numbers (start speed -112/16, gravity 6/16 added before the first move) the feet rise 62 px, so a jump from the street does not reach the ledge (tried: frame 570, peak y 354 for a ledge at 352). The crate stack's top is level with the ledge, 64 px to its left.
- **Options:** generate the script from a bot game (`inputs.json`); write it by hand.
- **Choice:** by hand (`runs/clear.json`): walk, push up the single crate and the stack, double-tap right on the stack's top and jump while running (2 px per frame), rescue the woman, drop to the street, shoot the first trooper, climb the ladder, shoot the second, rescue the child, drop off the dock, shoot the third, walk into the exit. 18 expectations on the lab state, 11 checkpoints.
- **Why:** each step is readable and explains the level; the bot does not rescue the first civilian.
- **Evidence:** the simulator run: cleared at frame 1856, all 18 expectations pass, score 3500, no life lost.

## D-114: the result lives in `docs/experiments/case-b/build/`, committed

- **Context:** the acceptance command takes `<case>/build/slammast.zip`; `rom/build/` is ignored by git and belongs to the prototype.
- **Choice:** `build.mjs --out docs/experiments/case-b/build`; the zip (52 KB), `symbols.json`, `slammast.symbols.json` and `program.map` are committed; `obj/` and `gen/` are ignored there (`gen/gfx.h` is copied to `evidence/`). The pack itself is not committed (8 MB of pictures): it is in the shared folder with its SHA-256.
- **Why:** a juror can run the acceptance on exactly the judged bytes without building; the build is reproducible from the pack with one command (trace.md).
- **Evidence:** `git show --stat` of this decision's commit.

## D-115: no go-link room test (PROMPT step 5)

- **Context:** PROMPT step 5 asks for `node rom/tools/room-test.mjs`. It starts its own signalhub and device on the fixed ports 8192 and 7392 and needs `e2e/node_modules` and the signalhub repository. This run was given no port, and other cases may be running the same test at the same time.
- **Options:** run it anyway; change its ports; skip it and rely on level 4 and the core replay (the same core the room uses).
- **Choice:** skipped, recorded as a gap of this run (not of the pack).
- **Why:** the task allows only an assigned port; the core replay already plays the whole clear script on mame2003-plus, which is what a room runs.
- **Evidence:** `rom/tools/room-test.mjs` lines 25 and 50-72.

## D-116: the Laya games of the final acceptance run are 900 frames long

- **Context:** the first acceptance run (18:50) used the default 3600 frames per Laya game. With other cases running Laya on the same Intel Mac, Laya answered in about 4.4 s per decision (prototype: 0.32 s): game 1 took 43 minutes (565 decisions), so three games would have taken over two hours.
- **Options:** wait; fewer Laya games; shorter Laya games.
- **Choice:** the first run was stopped during Laya game 2 and kept as `acceptance-run1-stopped/` in the shared folder (its level 3, level 4, scripted run, core comparison, 5 bot games and the full 3600-frame Laya game 1 are complete). The final run (`acceptance/`) is the same command with `--laya-frames 900` (3 games, about 115 decisions each).
- **Why:** three games are what the task asks; Laya game 1 at full length already shows its behavior on this set (every decision `fire`, never leaves x 32), so short games lose nothing measurable.
- **Evidence:** `acceptance-run1-stopped/laya/game-01/summary.json` (3600 frames, 565 decisions, mean 4406 ms, not cleared); `decisions.jsonl` (all `fire`, probability about 0.99).
