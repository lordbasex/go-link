# Case A: decisions

Case A of [experiment 1](../README.md): the Game Spec v1 ROM made by hand, in C for the 68000, with `node rom/tools/build.mjs`, as the prototype was made. Every decision has an id that commit messages end with (`Decision: D-NNN`). Evidence paths are relative to this folder unless they start with `rom/` or `docs/`.

## D-001: evolve the prototype in place, on its own branch

- **Context:** the spec asks for the same engine numbers, characters and tiles as the prototype; the harness and `build.mjs` work on `rom/` directly.
- **Options:** (a) a new folder (`rom-case-a/`) with copies of `rom/src` and `rom/tools`; (b) change `rom/src/main.c` and `rom/tools/level.mjs` in place, on branch `exp1/case-a`.
- **Choice:** (b).
- **Why:** the case is "as the prototype was made", so it is the prototype's next step; copies would double every tool and hide what changed. The branch keeps the prototype intact on `main`, and `git diff main -- rom/` shows exactly what case A wrote.
- **Evidence:** `git diff main --stat -- rom/`; the build output in `evidence/build.log`.

## D-002: the level layout, item by item

- **Context:** the spec lists seven items left to right on a 1536 × 448 level (96 × 28 cells of 16 px) and the prototype's rules.
- **Options:** many placements; constraints: a 64 px jump, 32 px pushes, a 96 px patrol, the exit at x 1440-1504.
- **Choice** (`rom/tools/level.mjs`, `buildMap`, `CRATES`, `OBJECTS`):
  1. the lower dock: solid, top at y 400, the whole width (rows 25-27); P1 starts at x 64 and P2 joins 24 px behind (x 40);
  2. crates: a 32 px step at cells 12-13 and a 64 px stack (two crates) at cells 14-15 (x 192-255);
  3. a one-way ledge at y 336 (64 px up), cells 17-24 (x 272-399), one cell after the stack, so it is reached with a jump from the stack top or from the floor; down + B1 drops from it;
  4. a ladder at cell 40 (x 640-655) from y 400 to y 240, and the upper dock: a one-way deck at y 240 (160 px up), cells 41-71 (x 656-1151), whose right end drops to the lower dock;
  5. Troopers: lower dock x 496-592, upper dock x 848-944, the exit guard x 1344-1440 (each patrol 96 px);
  6. civilians: on the ledge (x 352, y 336) and at the far end of the upper dock (x 1088, y 240);
  7. the exit zone x 1440-1504 on the lower dock (y 400), drawn as a gate.
- **Why:** each item is placed in the order the spec lists it, and each one needs the move the spec ties to it: the crates need pushes, the ledge needs a jump, the upper dock needs the ladder, the exit needs the guard to be beaten. The civilians sit on the two raised routes so rescuing them uses the ledge and the ladder.
- **Evidence:** `evidence/level-map.txt` (the map as text), the walk test (`journal.md`, 18:13), the scripted run.

## D-003: stream the 96-column level into the 64-column tilemap

- **Context:** the CPS-1's scroll2 tilemap is 64 × 64 cells of 16 px: 1024 px wide, wrapping. The spec's level is 1536 px wide. The prototype's level was 1024 px, so it loaded the whole map once.
- **Options:** (a) a 1024 px level (breaks the spec); (b) the second half on another layer (scroll3 is the backdrop, scroll1 is text: no); (c) write level columns into the tilemap as the camera moves, each tilemap column holding level column `c` at slot `c & 63`.
- **Choice:** (c): `slot_col[64]` remembers which level column each slot shows; every frame the columns from 2 left of the screen to 4 right of it are written when their slot holds another column (`stream_level` in `main.c`).
- **Why:** the screen shows 25 columns at most, so 31 columns are needed, well under 64: no slot is ever needed twice. A frame writes 28 cells per new column (a jump of the attract camera from the right end back to x 0 rewrites 31 columns once, about 870 words, well inside a frame). Crates never break (D-006), so a column is always the same.
- **Evidence:** the same-picture test (the scripted run on the real core matches the simulator at every checkpoint, the exit area included), `evidence/` frames past x 1024.

## D-004: move first, then add gravity, so a jump reaches a ledge 64 px up

- **Context:** the spec says "B1 jump (64 px high)", "gravity 6/16 px per frame², jump −7 px/frame" and "a one-way ledge 64 px up, reached by jumping". The prototype adds gravity before it moves: the first frame rises 106/16 px and the jump peaks at 990/16 = **61.9 px**, so a ledge 64 px up cannot be reached from the floor.
- **Options:** (a) put the ledge 48 px up (breaks the spec); (b) a stronger jump or weaker gravity (breaks the spec's numbers); (c) keep both numbers and change the order: move by the current speed, then add gravity. The first frame rises the full 7 px and the jump peaks at 1102/16 = **68.9 px**.
- **Choice:** (c), in `update_player` (the air block). A player standing still with no speed (a fresh spawn) lands without moving.
- **Why:** the numbers stay the spec's; "jump −7 px/frame" now means a first frame of 7 px; the 64 px item works as written.
- **Evidence:** test run t2 (`journal.md`, 18:14): from the floor at y 400 the jump peaks at y 331 and lands on the ledge at y 336; from the stack top (y 336) it peaks at y 271 and crosses the 16 px gap to the ledge.
- **Lesson for Willy Maker:** a level checker should compute the real jump peak from the engine's integration order, not from v²/2g (65.3 px), and refuse a ledge the jump cannot reach.

## D-005: Troopers patrol, turn at the ends, and do not chase

- **Context:** the prototype's robots chase a player on their floor within 170 px; the spec says "They walk a patrol (96 px), turn at its ends".
- **Options:** keep the chase; patrol only.
- **Choice:** patrol only, at the prototype's 0.5 px per frame, turning at `min` and `max` (`update_robots`).
- **Why:** the spec describes a patrol and nothing else; a chase would be an unasked rule.
- **Evidence:** the lab state's enemy x always stays within its 96 px (`state.jsonl` of every run).

## D-006: crates never break; the collision map stays in ROM

- **Context:** in the prototype shots break crates (3 hits) and a crate held a bazooka pickup. The spec only says "a 32 px crate is climbed by pushing" and B3 "special (unused in this section: it does nothing and must not crash)".
- **Options:** keep breakable crates and the pickup; remove both.
- **Choice:** remove both: shots stop on crates, crates stay, no pickup, B3 does nothing. The collision map is the ROM table `level_col` (the lab state's `col_map` points into ROM).
- **Why:** breaking the stack would remove the spec's climb; the pickup would give B3 a use the spec forbids in this section. A fixed map also makes the column streaming of D-003 exact.
- **Evidence:** the B3 and odd-input test (`journal.md`), `col_map` in `summary.json`.

## D-007: a knife hit counts as one shot

- **Context:** the prototype's knife takes 2 hit points; the spec says Troopers "take 3 shots" and B2 is "fire (the knife when an enemy is adjacent)".
- **Options:** 2 per knife (a Trooper falls to knife + shot); 1 per knife.
- **Choice:** 1: every B2 press that lands, shot or knife, is one of the 3 hits.
- **Why:** "3 shots" reads as three B2 hits; one rule is easier to test and to explain.
- **Evidence:** `robot_damage` in `main.c`; the scripted run's enemy `hp` drops 3, 2, 1, 0.

## D-008: energy, the 1 s blink, continues and GAME OVER

- **Context:** the spec: a Trooper "hurt[s] a player on touch (the player blinks 1 s, loses 1 of 3 energy)"; "GAME OVER when every player has no energy and no credit"; "Coin adds a credit"; "Start joins".
- **Choice:** a touch is a body overlap (|dx| < 16 px, feet between the Trooper's head and 4 px below its feet). It costs 1 energy and starts 60 frames of blinking with no further damage. At 0 energy the player leaves the game; with a credit, that player's Start brings them back with 3 energy (next to the partner, or on the dock in view). When no player is left: with credits the game waits ("CONTINUE? PUSH START"); with none it is GAME OVER (5 s, then the title).
- **Why:** it is the spec's sentence, as written: GAME OVER only when there is neither energy nor credit. The wait with credits has no timer, since the spec has none (recorded, not a gap).
- **Evidence:** the damage test (`journal.md`), the scripted game-over run.

## D-009: the title, the starts and players 3 and 4

- **Context:** the spec's title lines: `WILLY GORKLINGO`, `THE LAG PROTOCOL`, `PUSH START`, `CREDITS n`, `(C) 2026 GO-LINK`; "P3 and P4 may join later or show 'coming soon'; their ports must not crash the game".
- **Choice:** the five lines, as written, over the attract camera; `PUSH START` blinks when there is a credit, `INSERT COIN` blinks when there is none. Either 1P or 2P Start begins (that player plays). 3P/4P Start shows "3P COMING SOON" / "4P COMING SOON" for 2 s on any screen; 3P/4P Coin adds a credit. The pad bytes are masked to 7 bits, because slammast wires P3/P4's button 3 into bit 7 of P1/P2's bytes.
- **Why:** the spec's strings verbatim; "coming soon" is the spec's own option; a coin from any port is a coin.
- **Evidence:** the title checkpoint, the odd-input test.

## D-010: the HUD

- **Context:** the spec's HUD: "score per player, energy, credits".
- **Choice:** row 1: `1UP` + 6-digit score (x 1), `2UP` + score (x 20), `SAVED n/2` (x 38); row 2: `ENERGY ###` (red `#` per energy, `-` per lost one) per player, or `INSERT COIN` / `PUSH START` / `GAME OVER` for a player who is not in; `ENEMY n` (Troopers left, x 38); bottom row: `CREDITS n`.
- **Why:** the three required items plus two counters that tell a player what the exit needs; `2UP` moved from x 26 to x 20 so `INSERT COIN` no longer touches `ENEMY` (first screenshot, frame 180).
- **Evidence:** checkpoint frames.

## D-011: the prototype's tiles; the exit gate is the only new art

- **Context:** the spec: "the prototype's characters and street tiles (no new art is required)"; the task: "new art only if unavoidable". A first pass drew dock planks, a steel deck, pillars and bollards.
- **Options:** dock-themed tiles; the prototype's tiles.
- **Choice:** the prototype's tiles: the street for the lower dock, the one-way platform for both the ledge and the upper deck, its lamps, hydrants, bins and fence as props. The only new tiles are the exit gate's (the prototype has no exit, and an exit nobody can see is not an exit).
- **Why:** the spec and the task both say so; the first pass was reverted before any commit.
- **Evidence:** `journal.md` (18:15), `evidence/` frames.

## D-012: commit the device's go-link set list with the ROM

- **Context:** every build rewrites `backend-device/pkg/ownsets/sets.json` (the SHA-256 of each file in our set); `rom/tools/ownsets.mjs` says to commit it with the ROM that ships.
- **Choice:** commit it on this branch with the final ROM.
- **Why:** the list must match the set this branch builds; on `main` it still matches the prototype.
- **Evidence:** `git log -- backend-device/pkg/ownsets/sets.json`.

## D-013: opposite directions held together cancel out

- **Context:** the odd-input script (every button of port 1 at once, then left + right together, frames 900-1300) gave different pictures in the simulator and on the real core at frames 1100 and 1300 (1.65 % and 1.76 % of the pixels; every other checkpoint of every script was identical). The simulator's board model passes both direction bits; the real core delivers neither (the player stood still on the core and walked left in the simulator, which read left first).
- **Options:** (a) leave it (the ROM's behavior then depends on who delivers the input); (b) cancel opposite directions in the ROM, so both give the same; (c) change the harness's board model (not this case's code, and the spec is the ROM's).
- **Choice:** (b): in `read_inputs`, left + right together count as neither, and so do up + down.
- **Why:** a ROM must not depend on what a joystick cannot do; with (b) the five scripts give the same pixels on both machines at every checkpoint (41 frames, tolerance 0).
- **Evidence:** `evidence/runs/odd-inputs/compare.json` before (journal, 18:35) and after; `evidence/runs/replay-all.json`.
- **Lesson for the harness:** the board model could cancel opposite directions like the core does (a difference found only by an odd-input test).
