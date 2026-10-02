# Case C: Game Spec v1 checklist (acceptance 6)

Every item of [Game Spec v1](../README.md#game-spec-v1) for the ROM Willy Maker created in the recorded session ([`build/slammast.zip`](build/slammast.zip), SHA-256 `b1742aac038263f5f8323bdb64a99ce2c579c98192c699abab2f87c94f45d990`). "Sim" is the board model with the lab state; "core" is `device romtest --input` on mame2003-plus, compared with the simulator's frames (0 % of the pixels differ at every checkpoint of every script). The runs are in the experiment's shared folder (`exp1/case-c/acceptance/`, `exp1/case-c/checks/`), summarized in [evidence/README.md](evidence/README.md).

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | CPS-1, laid out as `slammast` (4 ports × 3 buttons), stock mame2003-plus core | ✓ | level 4: all 10 device steps pass (zip, set, identity, core loaded, files, picture, alive, audio, input reacts, real time) |
| 2 | Runs in a go-link room | ✓ partly | level 4 is the device's room core in a worker; a room was not opened (no device linked to the recording; D-011) |
| 3 | 384 × 224 at 60 Hz | ✓ | level 4 (`fps` 60, 384 × 224) |
| 4 | Level 1536 × 448 px on the 16 px grid | ✓ | `lab_state.level` 1536 × 448; data block `cols` 96, `rows` 28 (`rom.test.tsx`) |
| 5 | 2 players at once, P1 Willy, P2 a recruit | ✓ | `odd-inputs.json`: 2P Start joins player 2 (energy 3) at frame 210; the recruit's green shirt (look 1) in its frames |
| 6 | P3 and P4 must not crash the game | ✓ | `odd-inputs.json`: P3/P4 Coin, Start, B1-B3 and directions: they never join (2-player game), the run goes on to frame 900, core identical |
| 7 | Left/right walk, double-tap run (250 ms) | ✓ | the run window is 15 frames (`wm_rules.run_tap`); the bot's `run_right` moves 2 px per frame |
| 8 | B1 jump (64 px high) | ✓ with a note | the prototype's jump (−7 px per frame, gravity 6/16) peaks at **61.9 px**; ledges up to 48 px are reachable (D-015, D-021) |
| 9 | Down + B1 drops through a one-way ledge | ✓ | `clear.json`: the drop from the ledge (frames ~444-468) back to the dock, y 352 → 416 |
| 10 | Up/down on ladders | ✓ | `clear.json`: up the 160 px ladder, the upper dock reached at frame 864 (expectation `players.0.y` = 256) |
| 11 | B2 fire (the knife when an enemy is adjacent) | ✓ | three Troopers shot (frames 718, 1088, 1682); the knife is the prototype's code path (`enemy_at` within 18 px) |
| 12 | B3 special: nothing, no crash | ✓ | `odd-inputs.json`: B3 on all four ports at frames 270-275 |
| 13 | Start joins, Coin adds a credit | ✓ | `odd-inputs.json`: credits 2 after two coins (frame 145), 1 after 1P Start, 0 after 2P Start |
| 14 | Gravity 6/16, jump −7, 32 px crates by pushing, ladders 1.5 px/frame, camera forward only with a 48 px back margin | ✓ | the engine's constants (`engine.c`), `wm_data.backtrack` 48; `clear.json` pushes onto the 32 px crate and the 64 px stack (frame 330, y 352) |
| 15 | Start: both players on the dock floor at x 32-96 | ✓ | starts at x 32 and 56, y 416 (the template's), `lab_state` at frame 156 |
| 16 | Crates 32 then 64 px, climbed by pushing, then jump | ✓ | crates at x 160 (32 px) and x 192 (a 64 px stack); `clear.json` expectation on the stack |
| 17 | One-way ledge 64 px up, reached by jumping, with a way down | ✓ | the ledge at y 352 (64 px above the dock), x 256-367, reached by a jump from the stack; down + B1 leaves it |
| 18 | A ladder to the upper dock, 160 px up | ✓ | the ladder at x 480, y 256-415; the upper dock at y 256 (x 496-1023) |
| 19 | 3 Troopers: lower dock, upper dock, exit guard | ✓ | x 640 (y 416), x 800 (y 256), x 1360 (y 416); `n_enemies` 3 |
| 20 | They walk a 96 px patrol and turn at its ends | ✓ | patrol `min`/`max` = x ∓ 48; play mode's test "keep their 96 px patrol" ([152, 248]); rules: no chasing |
| 21 | They take 3 shots | ✓ | rules `enemyHp` 3; `clear.json`: each Trooper down after its burst |
| 22 | They hurt on touch: the player blinks 1 s and loses 1 of 3 energy | ✓ | `damage.json`: energy 3 → 2 at frame 888 with `hurt` 60 and the same x, 2 → 1 at 1096, core identical |
| 23 | 100 points per Trooper | ✓ | `clear.json`: 500 after the first rescue, 600 after the first Trooper |
| 24 | 2 civilians rescued by touch, 500 points each | ✓ | `clear.json`: frames 444 and 1348; the final score 1300 = 2 × 500 + 3 × 100 |
| 25 | Exit at x 1440-1504 on the lower dock; with all enemies down it shows SECTION CLEAR | ✓ | `lab_state.exit` 1440-1504, y 416; `exitNeedsEnemies`; cleared at frame 1883 with the text (core frame 1883) |
| 26 | Title: WILLY GORKLINGO, THE LAG PROTOCOL, PUSH START, CREDITS n, (C) 2026 GO-LINK | ✓ | core frame 150 of `clear.json`; level 3's picture. The prompt blinks; with no credit it alternates with INSERT COIN |
| 27 | HUD: score per player, energy, credits | ✓ | `1P 000000` and `2P`, `+++` energy, `CREDITS n`, `RESCUED n/2` (core frames) |
| 28 | GAME OVER when every player has no energy and no credit | ✓ | `damage.json`: mode `game_over` at frame 1273 with credits 0, the GAME OVER screen (core), then the title |
| 29 | The prototype's characters and street tiles, night palette, dark sky | ✓ | Willy, a recruit, the Lag android as the Trooper, the woman and the child; the starter street tiles; a banded night sky on the far layer |
| 30 | Sound not required | ✓ | silence (the prototype's Z80 program); level 4's audio step passes |

## Gaps and notes

- **Trooper art:** the spec names the enemy "Trooper"; the engine draws every enemy kind as the prototype's Lag android (D-004). Its behaviour is the spec's.
- **The jump's height:** see item 8 and D-015/D-021; the level is built so every route works with the prototype's numbers.
- **A go-link room:** the set was powered on with the device's room core (level 4), not opened in a room (item 2).
- **Continue:** with a credit left when every player is out, a 10 s continue countdown runs before GAME OVER (an addition; the spec's condition, no energy and no credit, gives GAME OVER at once).
