# Case A: traceability

Every file of case A's result, the commits that made it (branch `exp1/case-a`, from `main` at `23806b8`), and the decisions behind them ([decisions.md](decisions.md)). `git log --format='%h %s%n%b' main..exp1/case-a` lists every commit with its `Decision:` lines; `git blame <file>` leads from a line to its commit.

## The ROM

| File | What it is | Commits | Decisions |
|---|---|---|---|
| `rom/src/main.c` | the game: engine, level streaming, Troopers, damage, exit, screens, lab state | `209bc95` (the Game Spec v1 engine), `bc71dba` (opposite directions cancel) | D-001, D-003 to D-010, D-013 |
| `rom/tools/level.mjs` | the level: map, crates, objects, tiles, exit gate | `52480aa` | D-001, D-002, D-011 |
| `rom/tools/art.mjs` | `START_*` and `EXIT_*` defines instead of the prototype's pickup | `52480aa` | D-006 |
| `backend-device/pkg/ownsets/sets.json` | the SHA-256 of each file of case A's set | `2833d04`, `bc71dba` | D-012 |
| `rom/src/{crt0.s,hw.h,link.ld,lab_state.h,sound*.z80}`, `rom/tools/{build,font,png,ownsets}.mjs` | unchanged from `main` | — | D-001 |

Line-level map of `main.c` (function → decision):

| Function / lines | Decision |
|---|---|
| `slot_col`, `load_column`, `stream_level`, `video_init`, `set_scroll` | D-003 |
| `read_inputs` (pad masks, P3/P4 coin and start, opposite directions) | D-009, D-013 |
| `update_player`, the air block (move, then gravity) | D-004 |
| `update_player`, fire and knife; `robot_damage` | D-006, D-007 |
| `update_robots` | D-005 |
| `touch_damage`, `player_hit`, `player_enter`, the continue and game-over branches of `play` | D-008 |
| `at_exit`, the clear branch of `play` | D-002 (item 7) |
| `attract`, `soon_message` | D-009 |
| `hud` | D-010 |
| `lab_update` (flags exit + damage, `col_map` in ROM, dead players) | D-006, D-008 |

## Scripts, tools and records

| File | Commits | Decisions |
|---|---|---|
| `runs/clear.json`, `runs/plans/clear.plan.json` | `65e4f4c`, `4f5527f` | D-002 |
| `runs/game-over.json`, `runs/plans/game-over.plan.json` | `65e4f4c`, `4f5527f` | D-008 |
| `runs/odd-inputs.json`, `runs/plans/odd-inputs.plan.json` | `65e4f4c`, `4f5527f` | D-009, D-013 |
| `runs/moves.json`, `runs/plans/moves.plan.json`, `runs/long-run.json` | `bc71dba` | D-003, D-005, D-007, D-008 |
| `tools/gen.mjs`, `tools/events.mjs`, `tools/dump.mjs`, `tools/levelmap.mjs` | `4f5527f` | D-002 |
| `tools/replay-all.mjs` | `bc71dba` | D-013 |
| `tools/collect-evidence.mjs`, `tools/rules-check.mjs` | the records commit | — |
| `decisions.md`, `journal.md` | `65e4f4c`, the records commits | all |
| `checklist.md`, `trace.md`, `metrics.json`, `HOWTO.md`, `README.md`, `evidence/` | the records commits | all |

## Evidence index

| Path | What |
|---|---|
| `evidence/build.log` | the final build's output |
| `evidence/level-map.txt` | the level as text (`tools/levelmap.mjs`) |
| `evidence/rules-check.json` | the measured rules (camera, jump, climb, patrols, blink) |
| `evidence/runs/<script>/` | per script: `pair-NNNNNN.png` (simulator, core, difference), `compare.json`, `sim-summary.json`, `core-replay.json`, `events.txt` |
| `evidence/runs/replay-all.json` | the five scripts on both machines, one line each |
| `evidence/acceptance/` | `acceptance.json`, level 3 and 4 reports, every bot and Laya game's summary and inputs |

Videos (MP4s, too big for the repository) are in the experiment's shared folder, `exp1/case-a/`: `runs/<script>/sim/run.mp4` and `runs/<script>/core/run.mp4`, and the acceptance's `scripted/{sim,core}/run.mp4`, `bot/game-NN/run.mp4`, `laya/game-NN/run.mp4`.
