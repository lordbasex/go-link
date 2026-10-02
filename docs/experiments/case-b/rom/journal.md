# Case B, step 2: lab journal

Times are local (-03), from `date`. Decisions are in [decisions.md](decisions.md); the pack's gaps are collected at the end, in [What the pack did not say](#what-the-pack-did-not-say).

## 2026-10-01

**18:33** Start (`date`: 18:33:49). Unzipped the pack into the shared folder (`exp1/case-b/pack/`): `PROMPT.md`, `project.json`, `review.json`, `levels/level-1.tmj` with its three 1536 × 448 pictures, two tilesets, five docs. No `characters/` folder (the game uses the built-in Willy).

**18:34** The worktree is at `76cd798`, without `docs/experiments` or `rom/tools/lab`. `exp1/case-b` exists and is checked out in another worktree: branched `exp1/case-b-rom` from it (D-101).

**18:35** `node rom/tools/build.mjs`: the prototype builds (24100-byte program, 28 files). Toolchain proven (PROMPT step 2).

**18:36** `rom/tools/lab/validate.mjs` fails here: `Cannot find package '@go-link/cps1'` (no `frontend/node_modules` in the worktree). The same tool from the main checkout passes all 10 steps on this worktree's zip (D-102).

**18:37** Read the pack. The level, decoded from `level-1.tmj` (96 × 28 cells of 16 px; `.` air, `#` solid, `=` one-way, `H` ladder, `C` crate):

```
16 ....................................H===================================........................
17-21                                  H  (the ladder, x 576)
22 ..............CC....========........H...........................................................
23 ..............CC....................H...........................................................
24 ............CCCC....................H...........................................................
25 ............CCCC....................H...........................................................
26 ################################################################################################
27 ################################################################################################
```

Objects: four starts (x 32-80, feet 416), three crates (`hp` 2 each: one at 192, a stack of two at 224), three troopers (x 720 and 1344 on the street, 864 on the upper dock; `patrol` 96, facing left), two civilians (a woman on the ledge at 400, a child on the dock at 1088), the exit at x 1440 on the street. `play.png` has 9 colors and `far.png` 8 (plus transparency), so each fits one 15-color palette.

First reading of the gaps (details in the last section): the level is 96 columns wide but scroll2's tilemap is 64 (1024 px, `hardware.md`), so the program must stream columns; the table says crates take 3 hits but every crate object says `hp` 2; nothing says what clears the level; "lives" but the lab state has "energy"; no trooper art; no grenade numbers; P3 and P4 shirt colors; DIP switches in an EEPROM the prototype never reads; music names with no music.

**18:38** Read `rom/src/main.c` (the prototype: 2 players, no damage, no exit, clears when both civilians are rescued), `art.mjs`, `level.mjs`, `build.mjs`, `lab_state.h`, `hardware.md` of the pack. Plan: a pack reader, a pack mode in `build.mjs` and `art.mjs`, and a game file of its own so the prototype keeps its bytes (D-103).

**18:40** `rom/tools/pack.mjs`: reads `project.json` and `level-1.tmj` (collision tags by the tag tileset's `type`, objects by `type` with their properties), refuses what the engine lacks (other tags, crates that are not 32 px or hold something, more than one exit or level), cuts `play.png` and `far.png` into tiles with their own colors (D-104).

**18:41** `art.mjs`: `addArt(gfx, defs, gen, pack)`; with a pack, three recruit shirts instead of one, the troopers' shot palette, a grenade tile and a 32 × 32 blast, then the pack's level and texts as `#define`s (`TXT_TITLE`, `DIP_LIVES`, `EXIT_X0`…). `build.mjs`: `--pack`, `--out`, the source switch and no `writeOwnSets` for packs.

**18:42** `rom/src/game_pack.c` written from `main.c`: four players and their inputs, column streaming (D-105), troopers that fire, lives, grenades, the exit, title/demo/high scores, select, continue, game over (D-106 to D-112).

**18:44** First pack build: compiles with no warning, 31194-byte program, 27 sprite palettes, play 10 tiles and far 7. Level 3 passes all 10 steps; the shot after Coin and Start shows Willy on the docks with the crates, the dock and the night sky, the 4-player HUD.

**18:45** The prototype rebuilt after the change: `mbe_23e.rom` SHA-256 `ed497719…3c0a`, the same as the main checkout's. Unchanged.

**18:45** The route bot (`bot.mjs`, plain) plays the pack set: **cleared at frame 1297**, 3 of 3 enemies down, 1 of 2 civilians, no life lost (`evidence/bot-first-game-trace.txt`). It skips the woman on the ledge.

**18:46** First clear script draft (all walking): reaches the end, but at frame 550 the jump from the street toward the ledge peaks at y 354 and falls back (the ledge is at 352). Dead end: the engine's jump is **62 px**, not "about 64" (`evidence/straight-jump-trace.txt`). Willy Maker's export said "the whole path can be walked with jumps": only through the crates.

**18:47** Second draft: on the stack's top (level with the ledge, 64 px left of it) a double tap and a running jump (2 px per frame, 37 frames in the air) lands at x 327 on the ledge; the woman is rescued at frame 525 (`evidence/ledge-jump-trace.txt`).

**18:48** Full script: the three troopers shot from a distance (each down in about 30 frames, before their first shot at 90), the ladder climbed in 107 frames, the child rescued at 1428, the dock left at its end, the exit reached: **cleared at frame 1856**, score 3500, no life lost. First expectations run: the one at frame 700 failed (trooper 1 still had 3 hits left; it is down at 705): moved to 720. Then 18 of 18 pass.

**18:48** `runs/damage.json` (the clear script's first part, then standing 70 px from trooper 1): hit at about 811, 991 and 1171 (180 frames apart: the shot fired during the 120 safe frames is ignored), continue countdown, game over, the title again at 2040 (`evidence/damage-trace.txt`).

**18:49** Commit of the code (D-103 to D-112). **18:50** commit of the set, the scripts and the first evidence (D-113 to D-115).

**18:50** `acceptance.mjs` started in the background (5 bot games, 3 Laya games). Level 3 and level 4 pass; the scripted run on the core gives **identical pixels at all 11 checkpoints** (worst difference 0 %). Level 4 says the set is "not a go-link set: it shows as the core's original game", a consequence of not touching the device's list (D-103): the device binary would have to be rebuilt with the new hashes.

**18:51** PROMPT step 4 with `framelab capture` (built into the scratchpad, 23 s): the core runs the set, and its log has **28 `WRONG CHECKSUMS` lines, one per file**, and no `NOT FOUND` or `INCORRECT LENGTH`. The pack's rule "no WRONG CHECKSUMS line" cannot hold for any set of our own bytes (`evidence/framelab-core-log.txt`).

**18:52** `runs/four-players.json`: a coin on each port, then 1P, 2P, 3P and 4P Start: the select screen lists four Willys in white, green, blue and red ink, the four join at the start points, 6 expectations pass. Seen in the picture: when player 1 shoots the low crate of the stack, the top crate stays in the air (the prototype's crates do not fall either).

## What the pack did not say

The main finding of case B: every place where the AI pack (`PROMPT.md`, `project.json`, `review.json`, the level files) was not enough, was wrong, or could be read two ways, and what this build did about it. "Wrong" means the pack states something the tools or the board contradict; "missing" means the build had to invent it; "ambiguous" means two readings were possible.

| # | Kind | What the pack says or lacks | What happened | Decision |
|---|---|---|---|---|
| P-01 | wrong | The jump is "about 64 px high" and Willy Maker's review says "the whole path can be walked with jumps, crates and ladders". With the pack's own numbers (-112/16, gravity 6/16 added before the first move) the feet rise **62 px**. | The woman's ledge, 64 px above the street, cannot be reached by jumping from the street; only by a running jump from the crate stack's top. A player who does not know that never rescues her (the bot never does). | D-113 |
| P-02 | wrong | Review: "Every level fits the board's map (up to 16384 × 2048 px)". The prototype that the pack says to start from writes its 1024-px level once; scroll2's map is 1024 px wide (`hardware.md`). | A 1536-px level needs column streaming, which no doc of the pack mentions; written for this build. | D-105 |
| P-03 | wrong | PROMPT step 4: "the core's log must have no WRONG CHECKSUMS … line". | Any set of our own bytes gives one `WRONG CHECKSUMS` line per file (28 here); the core runs it anyway and level 4 accepts it. The rule can only be "no NOT FOUND or INCORRECT LENGTH". | (evidence) |
| P-04 | conflict | The rules table: crates take 3 hits. Every crate object: `hp: 2`. | The objects win. | D-106 |
| P-05 | missing | What clears the level. There is an `exit` object; nothing says whether enemies must be down, civilians rescued, or only the exit touched. | Touching the exit zone clears. The harness's own rule ("with every enemy down") is not in the pack at all. | D-107 |
| P-06 | missing | The exit's size. It is a point (x 1440, y 416). | A 32-px zone from the point, on its floor. | D-107 |
| P-07 | missing | Coordinate conventions of points: a crate's (192, 384) is its top-left cell, an enemy's or civilian's y is its feet, a start's x could be the left edge or the middle. | Read from the collision layer (crate cells) and the floors (feet); starts and enemies as the body's middle. | D-109 |
| P-08 | missing | The damage model beyond "lives 3, 120 frames without harm": what hurts (shots, contact, falls), the bullet's height and size, whether a hit knocks back, where a player comes back. | Only enemy shots and falls cost a life; no contact damage; the player stays where it was and blinks. | D-108 |
| P-09 | mismatch | The pack speaks of lives; the experiment's harness reads `energy` (0-3) and `hurt`. | Lives are reported as energy. | D-108 |
| P-10 | missing | Enemies: where the 96-px patrol starts (from x, around x?), whether they chase, how far "see 170 px" reaches across floors, when the first shot comes, how the shot travels. | Patrol x ± 48, chase on their own floor within the patrol, see only their own floor, first shot after 90 frames of seeing, a horizontal shot at chest height. | D-106, D-109 |
| P-11 | missing | Art for `kind: trooper`. The pack has no characters and says to use "the prototype's Willy"; the prototype has a robot, not a trooper. | Troopers wear the robot's frames. | D-109 |
| P-12 | missing | The special: "the picked-up weapon … (a grenade when there is none)". No weapon to pick up is placed, and grenades have no count, arc, reach or damage. | 10 per life, an arc, 24 px of reach, 9 damage. | D-110 |
| P-13 | missing | "A different shirt per player": only player 2's color exists (green, in the prototype). | Green, blue and red. | D-111 |
| P-14 | missing | Seven menus with empty `blocks`; only the subtitle and the clear text are given. No durations, no order, no high score contents, no select screen content (`characters: []`), no continue length. The step 1 builder says the title had PUSH START: it is not in `project.json`. | Plain screens with invented timings (title 8 s, demo 12 s, high scores 6 s, select 1 s, continue 10 s, game over 4 s) and an invented table. | D-112 |
| P-15 | ambiguous | `credits: true` on the title, attract and high score screens: the credits line ("(C) 2026 GO-LINK"), the credits counter, or both. | Both on the title; the counter on all three. | D-112 |
| P-16 | missing | Music: `title`, `select`, `stage`, `continue`, `game-over`, `high-scores` are names with no data, and the prototype has no sound engine. | Silent. | D-112 |
| P-17 | missing | "DIP switches (the slammast board keeps them in EEPROM)": no EEPROM layout or protocol; what "difficulty normal" changes. | Compile-time constants; the EEPROM is not touched; difficulty has no effect. | D-112 |
| P-18 | missing | Credits with four coin slots: shared or per player; what a 2P/3P/4P Start costs during the game. | One shared pool; each Start costs one credit; any port may join at any time. | D-111 |
| P-19 | missing | The lab state and the symbol map that the experiment's harness reads (the step 1 builder flagged this as F-level gap). | Kept because `rom/` already has `lab_state.h` and `build.mjs` writes the map; a builder without the harness would not have known. | D-108 |
| P-20 | missing | Whether the new set must be added to the device's list of go-link sets. | Not added (it would replace the prototype's hashes and needs a device rebuild); the device shows the set as the core's original game. | D-103 |
| P-21 | broken reference | `project.json`'s format is "in docs/willy-maker/file-format.md of the repository", which is not in the pack; a reader outside the repository has no format spec. | Read by inspection. | D-104 |
| P-22 | redundant | The play layer comes twice (tile layer over `ts-city.png`, and `play.png`), with a project palette (`pal-city`) that repeats `#222233` and is not in the pictures' order. | Used the pictures. | D-104 |
| P-23 | missing | Sections: `sections: []` and no names. | One section, the whole level. | D-107 |
| P-24 | missing | The 4-player HUD layout, and what a player who has not joined sees. | 12 cells per player: score, lives, grenades; COIN or START blinking. | D-111 |
| P-25 | wrong (minor) | Review: "scroll3: 6 different 32 px tiles", "scroll2: 9 different 16 px tiles". | 7 and 10 once the empty tile is counted (it is needed for transparent cells and broken crates). | D-104 |
| P-26 | not testable here | PROMPT step 5, a real go-link room (`room-test.mjs`, fixed ports 8192 and 7392). | Skipped: no port was assigned to this run; the core replay covers the core. | D-115 |

Engine findings that are not the pack's fault but showed up while building it:

- A crate under another crate can be shot away and the top one stays in the air (the prototype's crates do not fall; `evidence/four-players-play.png`).
- The route bot follows the prototype's goals and skips the civilian it cannot reach by its own moves; it still clears, because this build clears on the exit (P-05).

## 2026-10-01, the acceptance runs

**18:52-19:35** The first acceptance run: 5 bot games, all cleared (frames 1297, 1414, 1491, 1727, 1393; no life lost). Laya game 1 ran at about 4.4 s per decision (the prototype's run: 0.32 s; other cases were running Laya on the same Mac): 43 minutes for 3600 frames, 565 decisions, **every one `fire`**, never left x 32, score 200 (its shots broke the single crate and the low crate of the stack). Stopped during Laya game 2 and kept as `acceptance-run1-stopped/` (D-116).

**19:35-19:47** The final run, `--laya-frames 900`, 11 min 21 s. `acceptance.json`:

| Test | Result |
|---|---|
| Level 3 | ok, all steps |
| Level 4 (`device romtest`, real core) | ok, all steps (the set shows as the core's original game, D-103) |
| Scripted run (simulator) | cleared at frame 1856, 18 of 18 expectations |
| Same picture on the core | 11 checkpoints, worst difference **0 %** |
| Route bot, 5 games | 5 of 5 cleared: best 1297, median 1414, worst 1727; 0 lives lost, 0 falls |
| Laya, 3 games of 900 frames | 0 of 3: 115 decisions each (about 1.2 s each in game 1), 342 of 345 `fire` (the seeded games sampled two `jump` and one `climb_up`), score 200 |

The MP4s (scripted run in the simulator and on the core, each bot and Laya game) are in the shared folder's `acceptance/`. A copy of the verdicts, the core comparison's pairs and the level 3 picture is in `evidence/acceptance/`.

**19:48** The ROM, the symbol map, the scripts and the records copied to the shared folder (`exp1/case-b/slammast.zip`, `symbols.json`, `rom/`). End of step 2 (last action: see `metrics.json`).
