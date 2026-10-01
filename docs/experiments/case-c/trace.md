# Case C: traceability

Every file case C added or changed, the commits that touched it (branch `exp1/case-c`, from `main` at `23806b8`) and the decisions behind it ([decisions.md](decisions.md)). `git log --format=%B <commit>` ends with the same `Decision:` lines; `git blame <file>` leads from a line to its commit.

## The engine (68000)

| File | Commits | Decisions | What |
|---|---|---|---|
| `rom/engine/engine.c` | `825fed6`, `5167fbb` | D-002, D-004, D-005, D-006, D-015, D-016 | the data-driven engine |
| `rom/engine/wmdata.h` | `825fed6` | D-003 | the data block's layout, offsets pinned at compile time |
| `rom/tools/engine.mjs` | `825fed6` | D-002, D-016 | builds the engine once; `--check` |
| `rom/tools/art.mjs` | `c4febdd` | D-004, D-008 | `level: false`, `recruits` |
| `frontend/apps/web/public/willy-maker/engine/engine.bin`, `engine.json` | `825fed6` | D-002, D-016 | the shipped engine and its symbol map |

## Create ROM (browser)

| File | Commits | Decisions | What |
|---|---|---|---|
| `frontend/apps/web/src/willy-maker/rom/pack.ts` | `b0745ad` | D-003, D-004, D-006, D-009 | the packer |
| `…/rom/createRom.ts` | `b0745ad` | D-002, D-009, D-012 | engine loader, pictures, zip |
| `…/rom/specFixture.ts` | `b0745ad` | D-015 | Game Spec v1's level built with the editor's operations |
| `…/rom/rom.test.tsx` | `b0745ad` | D-003, D-009 | offsets, files, determinism, level 3 |
| `frontend/packages/cps1/src/sets.ts` | `b0745ad` | D-002 | `splitProgram` |
| `…/ui/organisms/CreateRomCard.tsx`, `.test.tsx` | `35573e7` | D-011, D-012 | the Create ROM card |
| `…/ui/organisms/ExportView.tsx`, `.test.tsx` | `35573e7` | D-012 | the card in the Export tab |
| `…/ui/organisms/PowerOnCard.tsx` | `35573e7` | D-011 | `DeviceRomTest` exported for Play on my go-link |
| `…/i18n/export.{en,es,pt}.ts` | `35573e7` | D-012, D-019 | the card's texts |
| `…/ui/willy-maker.css` | `35573e7` | D-012 | step states, notes |

## Rules, inspector and fixes found by using it

| File | Commits | Decisions | What |
|---|---|---|---|
| `…/engine/rules.ts` | `72b08b2`, `9985e6e` | D-007, D-021 | `GameRules`, `DEFAULT_RULES`, `rulesWith` |
| `…/engine/game.ts` | `72b08b2` | D-007 | play mode reads the rules |
| `…/engine/game.test.tsx` | `72b08b2`, `4cd6830` | D-007, D-021 | the spec's rules; how high a jump reaches |
| `…/model/types.ts` | `72b08b2` | D-007 | `settings.rules` |
| `…/play/PlayView.tsx`, `…/ui/organisms/Ide.tsx` | `72b08b2` | D-007 | the rules into play mode |
| `…/game/GameScreen.tsx`, `settings.ts`, `game.test.tsx` | `35573e7` | D-007 | the Rules card |
| `…/i18n/game.{en,es,pt}.ts` | `35573e7` | D-007, D-019 | its texts |
| `…/ui/organisms/Panels.tsx` | `35573e7`, `bda1433` | D-013, D-017 | enemy hits, exit width; number fields |
| `…/ui/organisms/Panels.test.tsx` | `bda1433` | D-017 | 64 typed into a 16 px minimum |
| `…/ui/organisms/LevelCanvas.tsx` | `bda1433` | D-014 | `data-view` |
| `…/editor/reach.ts`, `editor.test.tsx` | `4cd6830` | D-021 | jumps reach 48 px ledges |
| `…/templates/buenosAires.ts` | `4cd6830`, `9985e6e` | D-021 | the lobby platform at 48 px |
| `…/io/aiPack.ts`, `…/i18n/play.{en,es,pt}.ts` | `9985e6e` | D-021 | the jump's height in the prompt and play mode's note |

## Documentation

| File | Commits | Decisions |
|---|---|---|
| `docs/willy-maker/engine.md` (new) | `528e392` | D-002 to D-007, D-011, D-019 |
| `docs/willy-maker/README.md`, `architecture.md`, `validation.md` | `528e392`, `9985e6e` | D-019, D-021 |
| `docs/willy-maker/file-format.md` | `528e392` | D-007 |
| `docs/rom/art-spec.md` | `9985e6e` | D-021 |
| `frontend/apps/web/src/i18n/docs-{en,es,pt}.ts` (user guide) | `528e392`, `9985e6e` | D-019, D-021 |
| `rom/README.md`, `docs/status.md`, `CHANGELOG.md` | `528e392` (and the records commit) | D-019 |

## The case's own files

| File | Commits | Decisions | What |
|---|---|---|---|
| `docs/experiments/case-c/build/slammast.zip`, `slammast.symbols.json`, `symbols.json` | `a6de8c3` | D-018 | the ROM the recorded session downloaded, unmodified |
| `docs/experiments/case-c/runs/clear.json` (and `harness/runs/clear.json`) | `a6de8c3` | D-010 | the clear script |
| `…/runs/route-player.mjs`, `make-clear.mjs` | `a6de8c3` | D-010 | how it was recorded |
| `…/runs/damage.json`, `touch-player.mjs`, `make-damage.mjs`, `odd-inputs.json` | `a6de8c3` | D-015, D-018 | the checklist scripts |
| `…/session/session.mjs`, `publish.mjs` | `a6de8c3` | D-014, D-020 | the recorded session and its MP4 and guide |
| `…/evidence/` | the records commit | D-020 | screenshots, guide, timeline, reports |
| `decisions.md`, `journal.md`, `trace.md`, `metrics.json`, `checklist.md`, `HOWTO.md` | the records commit | — | the records |

The shared folder of the experiment (`exp1/case-c/`) also holds what is not in git: `session.mp4`, the session's full-size screenshots and WebM, the acceptance run (`acceptance/`), the checklist runs (`checks/`) and the parallel Laya games.
