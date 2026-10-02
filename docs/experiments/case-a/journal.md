# Case A: lab journal

Times are the Mac's local time (UTC−3), from `date`, on 2026-10-01. Paths under `$EXP` are in the experiment's shared folder (`exp1/case-a/` in the session's scratchpad); `rom/` and `docs/` are in the repository.

## 18:06 Start

- Read the contract (`docs/experiments/README.md`), the harness (`docs/experiments/harness.md`), `rom/src/lab_state.h`, `rom/src/main.c`, `rom/tools/{build,level,art}.mjs`, `docs/rom/art-spec.md` section 5 and the story's level 1.
- The worktree started on `76cd798`, before the harness commits; branch `exp1/case-a` was created from `main` (`23806b8`), which has them.
- The worktree has no `frontend/node_modules`: `rom/tools/build.mjs` works (it imports `frontend/packages/cps1` by path), but `rom/tools/lab/validate.mjs` failed with `ERR_MODULE_NOT_FOUND: @go-link/cps1` (imported by `cps1-sim/src/powerOn.ts`). Fixed with a symlink to the main checkout's `frontend/node_modules` (not committed). A stranger needs `(cd frontend && npm ci)` instead.
- The prototype builds unchanged (`own set list ... unchanged`): the toolchain works.

## 18:09 Plan

What the prototype has and the spec wants differently:

| Spec item | Prototype | To do |
|---|---|---|
| Level 1536 × 448 | 1024 × 448 (64 columns, the whole scroll2 tilemap) | stream columns (D-003) |
| Crates 32 then 64 px, a 64 px one-way ledge, a ladder 160 px, an upper dock | a street with two buildings | new map (D-002) |
| 3 Troopers, 96 px patrol, 3 shots, damage, 100 points | 3 robots that chase, 4 hits, no damage, 500 points | D-005, D-007, D-008 |
| 2 civilians, 500 points | 2, 1000 points | |
| Exit at x 1440-1504, SECTION CLEAR with all enemies down | clears when both civilians are rescued | `at_exit` |
| Energy 3, blink 1 s, GAME OVER | none | D-008 |
| Title lines | `THE LAG PROTOCOL - DEMO`, `PRESS 1P START` | D-009 |
| B3 does nothing | bazooka pickup | D-006 |

## 18:12 First build of the new level and engine

- `level.mjs`: the docks map (96 × 28), crates, objects (start, civilians, robots, exit). `art.mjs`: the `PICKUP_*` defines replaced by `START_*` and `EXIT_*`.
- `main.c` rewritten from the prototype: column streaming, patrol-only Troopers, touch damage, energy, continues, game over, the exit, the spec's title, P3/P4 "coming soon", the lab state with `flags` = exit + damage.
- First build: no warnings, 28498 bytes of 68000 code. Level 3 (`validate.mjs`): all 10 steps pass.

## 18:13 Walk test (t1)

Coin at 120, Start at 150, right held from 160 to 800. State every 50 frames:

- frame 300: pushed onto the 32 px crate (y 368); 350: onto the stack (y 336); then walked off the stack's right side (no jump) and fell to the floor (y 400) under the ledge;
- frame 650: energy 3 → 2 after walking into the first Trooper (touch damage works);
- frame 800: stopped at x 687 under the upper dock, camera x 559: the camera follows and the level past x 1024 streams in.

## 18:14 Jump test (t2): the 64 px ledge

The first worry: is a ledge 64 px up reachable? With the prototype's order (gravity, then move) the peak is 61.9 px: no. With move-then-gravity (D-004), from the floor the jump peaks at y 331 and lands on the ledge at 336 (frames 610-640); from the stack top (x 250, y 336) a jump with right held clears the 16 px gap and lands on the ledge at x 295. Down + B1 on the ledge drops to the floor (frames 500-520).

## 18:15 Route bot, first look

`run.mjs --player "node rom/tools/lab/bot.mjs"`: **cleared at frame 1183**, no energy lost. It shot the first Trooper from the floor, climbed the ladder, shot the second, rescued the civilian on the upper dock, dropped, shot the guard and stood in the exit. It never went up to the ledge's civilian (the bot's goal order is civilians first, so its route model did not find the ledge reachable; not a game fault, the scripted run reaches it).

## 18:15 Art: back to the prototype's tiles

The first pass drew new dock tiles (planks over water, a steel deck, pillars, bollards). The task says "new art only if unavoidable", and the spec says the prototype's street tiles: reverted to the street, the one-way platform and the street props before any commit. The exit gate stays: the prototype has no exit to reuse (D-011). The first screenshot also showed `2UP INSERT COIN` touching `ENEMY 3`: `2UP` moved to x 20 (D-010).

## 18:18 The clear script, written by hand

Written as a plan of segments (`runs/plans/clear.plan.json`, turned into `runs/clear.json` by `tools/gen.mjs`), each segment checked against the lab state of a trial run (`tools/dump.mjs`, `tools/events.mjs`):

1. right 205 frames: pushes onto the step (frame 300, y 368) and the stack (y 336); a jump with right at x 250 crosses the gap to the ledge (lands at frame ~410); right to the civilian: **rescued at frame 448**;
2. down + B1: drops to the dock; B2 held 45 frames: the first Trooper takes 3 shots (frames 523, 530, 537);
3. double tap right (run) to the ladder (x 642), up 108 frames: on the upper dock at frame 800 (1.5 px per frame);
4. right 100, B2 50: the second Trooper falls at frame 938; run right: **second civilian at frame 1118**, off the deck's end to the dock;
5. B2 60: the guard falls at frame 1245; meanwhile player 2 inserts a coin (port 2) and presses 2P Start: joins at x 1146 at frame 1227 (green shirt);
6. both walk right; player 1 enters the exit at x 1440: **SECTION CLEAR at frame 1376**, no energy lost, 1300 points (3 × 100 + 2 × 500).

Three trial runs were needed (the shots first ran out of range: bullets vanish 32 px past the screen's edge, so the script walks closer before firing). The script ended with 20 expectations; all pass. The same script on the core (`device romtest --input`) gave **identical pixels at all 10 checkpoints** (tolerance 0), past x 1024 included: the column streaming (D-003) works on the real board too.

## 18:22 More scripts: game over, odd inputs

- `runs/game-over.json`: two coins, stand in the first Trooper's patrol: hits at frames 608, 702, 762 (60 frames of blinking each time), out at 762, the game waits with a credit, 1P Start continues at 902 with 3 energy, out again: **GAME OVER at frame 1218**, the title at 1521. My first expectation list had the coin count wrong (my error, not the game's).
- `runs/odd-inputs.json`: 3P Coin and 4P Coin add credits, 3P/4P Start show "3P/4P COMING SOON", B3 and b4-b6 on every port, every button at once, left + right together, 2P Start without a credit (nothing), with one (joins). The first version expected 2P Start with no credit but I had given two coins; fixed by taking one coin away.

## 18:24 The bot never takes the ledge

The route bot (5 games) cleared every time but rescued only the upper dock's civilian. Its code (`rom/tools/lab/bot.mjs`, `edges`) only jumps onto a ledge whose column has no standing spot at the starting row, so it cannot jump straight up from the dock onto a ledge above it, and it has no level jump across a gap (stack to ledge). The ledge is reachable (the scripted run takes it both ways in trials t2 and the clear script); this is a limit of the bot's route model, recorded for the jury and for Willy Maker's reachability checks.

## 18:26 Moves and long run

- `runs/moves.json`: the knife (one B2 press when the Trooper turns at x 496, 30 px away: hit at frame 632, 16 frames of attack with B2 released), run, ladder up, **ladder down**, up again, **down + B1 through the upper deck**, and the **locked exit**: running through the guard (energy 3 → 2) into the exit zone with two Troopers up does not clear; DEFEAT EVERY TROOPER shows.
- `runs/long-run.json`: 50 s of title (the attract camera wraps four times, so the streamed columns are rewritten) and 5 minutes standing in the game: still running, Troopers still inside their patrols.

## 18:28 A difference with the core (D-013)

`tools/replay-all.mjs` replays every script on both machines. Four matched exactly; **odd-inputs differed at frames 1100 and 1300** (1.65 % and 1.76 %). The pair pictures showed player 1 standing still on the core and walking left in the simulator while left and right were held together: the core delivers neither direction, the board model both. Fixed in the ROM (opposite directions cancel), rebuilt (28694 bytes): all five scripts identical at all 41 checkpoints. The acceptance run that had started on the old build was stopped during its first Laya game and started again on the new build.

## 18:30 The rules, measured

`tools/rules-check.mjs` over the five runs (`evidence/rules-check.json`): the camera went back at most **48 px** from its farthest point; the highest jump rose **69 px**; climbing moved **1.498 px per frame** on average (24/16 with whole-pixel rounding); each Trooper stayed within exactly **96 px**; every hit started **60 frames** of blinking.

## 18:45 The acceptance run on the final build

`rom/tools/lab/acceptance.mjs` with 5 bot games and 3 Laya games (`evidence/acceptance/acceptance.json`, about 14 minutes, most of it Laya):

- level 3, level 4, the scripted run (cleared at 1376, 20 of 20 expectations) and the same picture on the core (10 of 10 checkpoints at 0 %): **pass**;
- route bot: **5 of 5 cleared**, at frames 1183 (plain), 1265, 1399, 1230 and 1286 (seeds 1-4); median 1265; no energy lost, no falls. Four games rescued the upper dock's civilian (800 points); seed 3 went straight for the Troopers and the exit (300 points). None took the ledge (18:24);
- Laya: **0 of 3**: 575 decisions per game, 1719 of the 1725 decisions were `fire` (the others: 4 `jump`, 1 `right`, 1 `climb_up`), never past x 82, 0 points, no energy lost (the first Trooper's patrol starts at x 496). About 345 ms per decision on the CPU. The same zero-shot behavior the harness recorded on the prototype.
