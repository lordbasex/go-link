# Case C: evidence

All for the ROM Willy Maker created in the recorded session, unmodified: [`../build/slammast.zip`](../build/slammast.zip), SHA-256 `b1742aac038263f5f8323bdb64a99ce2c579c98192c699abab2f87c94f45d990`, 55 KB, the 28 files of `slammast`.

## Acceptance (`acceptance/`)

`acceptance/acceptance.json` is `rom/tools/lab/acceptance.mjs --bot-games 5 --laya-games 3` on that zip; Laya games 2 and 3 ran in parallel with the same runner command (`--seed 1`, `--seed 2`) and were merged into it (the machine was at load 45-70 with other cases' Laya players).

| Test | Result |
|---|---|
| 1. Validator level 3 (`level3.json`, `level3.png`) | **passes**: files, program, vectors, run, vblank, palette, layers, picture, alive, inputs |
| 2. Validator level 4 (`level4.json`, `device romtest`) | **passes**: zip, set, identity, core loaded, files, picture, alive, audio, input reacts, real time |
| 3. Scripted run (`../runs/clear.json`, `scripted-summary.json`) | **clears at frame 1883**, 18 of 18 expectations; 1300 points, 2 of 2 rescued, 3 of 3 Troopers, full energy |
| 4. Same picture on the real core (`compare.json`, `core-replay.json`, `../frames/clear-pair-*.png`) | **0 % of the pixels differ at all 11 checkpoints** |
| 5a. Route bot, 5 games | **5 of 5 clear** at frames 1260, 1428, 1478, 1298, 1354 (median 1354); no energy lost, no falls; it rescues only the child (it never takes the jump from the crate stack to the ledge) |
| 5b. Laya, 3 games | **0 of 3 clear**: game 1 pressed fire 574 of 574 times and never moved; games 2 and 3 (sampling) mixed in run_right and jump, reached x 186 and broke two crates (200 points); 1.6-2.0 s per decision |
| 6. Spec checklist | [../checklist.md](../checklist.md): 30 items, all met; notes on the Trooper's art, the jump's height and the room |

## The checklist scripts (`checks/`)

| Script | Result |
|---|---|
| [`../runs/damage.json`](../runs/damage.json) | energy 3 → 2 at frame 888 (blinks 60 frames, same x), → 1 at 1096, out at 1273 with no credit: GAME OVER at once; every expectation passes; **core identical at all 6 checkpoints** (`damage-compare.json`, `../frames/damage-pair-*.png`) |
| [`../runs/odd-inputs.json`](../runs/odd-inputs.json) | P2 joins, P3/P4 Coin and Start ignored, B3 on every port, Start mid-game, B4-B6: still playing at 900; every expectation passes; **core identical at all 5 checkpoints** |

## The recorded session (`session/`)

- [`session/guide.html`](session/guide.html): the 82 steps with what, why, the selector and the screenshot (1024 px copies; the originals are in the shared folder).
- `session/timeline.json`: time, step, text, why, selector and screenshot of every step.
- `session.mp4` (shared folder `exp1/case-c/`, 11.4 MB, 227 s, 1920 × 1080, 82 chapters): the browser's own recording.

## Frames (`frames/`)

`*-pair-NNNNNN.png` are simulator | core | difference at the same frame: the title (150), the ledge rescue (444), the upper dock (864), the child's rescue (1348), SECTION CLEAR (1883), the first hit (888), GAME OVER (1393) and two players (210).
