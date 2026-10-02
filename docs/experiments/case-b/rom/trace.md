# Case B, step 2: traceability

Each file of the result, the commits that made it and the decisions behind them. `git log --format='%h %s%n%b' exp1/case-b-rom -- FILE` lists a file's commits with their `Decision:` lines; `git blame FILE` leads from a line to its commit.

## Reproduce the result

```sh
cd /Volumes/HD12TB/github/MAME-WEBRTC          # or this branch's worktree
# the pack: ai-pack.zip (SHA-256 23cdc296bc8a61879d5efbb4fe8e5ce60fa192327f61660f4f7f93698ea5d0fa), unzipped
unzip -q ai-pack.zip -d /tmp/pack
~/.nvm/versions/node/v22.23.2/bin/node rom/tools/build.mjs slammast --pack /tmp/pack --out docs/experiments/case-b/build
# acceptance, from a checkout with frontend/node_modules (harness.md)
node rom/tools/lab/acceptance.mjs docs/experiments/case-b/build/slammast.zip \
    --script docs/experiments/case-b/runs/clear.json --out OUT --bot-games 5 --laya-games 3
```

The zip's file contents are the same on every build (the zip itself differs only in its timestamps).

## Source and data files

| File | What it is | Commits | Decisions |
|---|---|---|---|
| `rom/tools/pack.mjs` | Reads the AI pack: map, collision tags, objects, settings; cuts the layer pictures into tiles | `293db49` | D-103, D-104 |
| `rom/tools/art.mjs` | Pack mode: four shirts, the troopers' shot, grenade and blast tiles, the pack's level and texts as defines (`addPackLevel`, `cString`, `writeArt`) | `293db49` | D-104, D-110, D-111 |
| `rom/tools/build.mjs` | `--pack`, `--out`, `game_pack.c` instead of `main.c`, the device's set list left alone for packs | `293db49` | D-103, D-114 |
| `rom/src/game_pack.c` | The pack's game: four players, column streaming, troopers that fire, lives, grenades, exit, screens, `lab_update()` | `293db49` | D-105 to D-112 |
| `docs/experiments/case-b/build/slammast.zip` | The set (28 files, 52 KB) | `1253723` | D-114 |
| `docs/experiments/case-b/build/symbols.json`, `slammast.symbols.json`, `program.map` | The symbol map (`lab_state` at 0xff0000, 200 bytes) and the linker map | `1253723` | D-114 |
| `docs/experiments/case-b/runs/clear.json` | The clear script: 2100 frames, 11 checkpoints, 18 expectations | `1253723` | D-113 |
| `docs/experiments/case-b/runs/damage.json` | Three hits, continue, game over, title | `1253723` | D-108 |
| `docs/experiments/case-b/runs/four-players.json` | Four coins and four Starts, the select screen, four players | see `git log` | D-111 |
| `docs/experiments/case-b/rom/tools/trace.mjs`, `colors.mjs` | Helpers for the evidence (a state trace, the pictures' colors) | `1253723` | D-104, D-113 |

`main.c`, `level.mjs`, `lab_state.h`, `link.ld` and the harness (`rom/tools/lab/`) are not changed.

## The pack's content, to the ROM

| Pack item | Where it ends up |
|---|---|
| `levels/level-1.tmj` collision layer (gids 32-35: solid, oneway, ladder, crate) | `level_col` in `gen/art_data.c` (96 × 28), copied to `col_map` in RAM |
| `levels/level-1/play.png` | 10 tiles of 16 px from code 0x4000, `level_map`, `pal_level` (9 colors) |
| `levels/level-1/far.png` (parallax 0.5) | 7 tiles of 32 px from code 0x0800, `sky_map`, `pal_sky` (8 colors), scroll3 at half speed |
| `p1_start`…`p4_start` | `start_pos` |
| `crate_single`, `crate_stack_low`, `crate_stack_top` (`hp` 2) | `crate_cells` (col, row, hits) |
| `trooper_lower`, `trooper_upper`, `trooper_exit` (`facing`, `patrol` 96) | `robot_spawn` (x, feet y, x - 48, x + 48, facing) |
| `civ_ledge` (woman), `civ_upper` (child) | `civ_spawn` |
| `exit` (1440, 416) | `EXIT_X0` 1440, `EXIT_X1` 1471, `EXIT_Y` 416 |
| `title`, `settings.credits`, `menus.title.texts.subtitle`, `menus.hud.texts.cleared`, level name | `TXT_TITLE`, `TXT_CREDITS_LINE`, `TXT_SUBTITLE`, `TXT_CLEARED`, `TXT_LEVEL_NAME` |
| `settings.dip`, `settings.players` | `DIP_*`, `GAME_PLAYERS` |
| `camera.backtrack` 48 | `BACKTRACK` |
| PROMPT's rules table | the `#define`s of `game_pack.c`'s rules section |
| `playerSlots` (builtin Willy, variants 0-3) | `pl[k].palofs = k * RECRUIT_PAL_OFFSET` |
| `menus.*.music`, `menus.*.blocks` (empty) | nothing (no sound engine; plain screens) |
