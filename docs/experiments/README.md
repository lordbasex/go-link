# Experiment 1: three ways to make a ROM

go-link can reach an arcade ROM in three ways. This experiment builds **the same game three times**, once per way, records everything, has a jury play and judge the three results blind, and turns what it learns into Willy Maker improvements.

| Case | Who makes the ROM | Folder |
|---|---|---|
| **A. By hand** | An agent writes the game in `rom/` (C, 68000, `node rom/tools/build.mjs`), as the prototype was made | [case-a/](case-a/) |
| **B. AI pack** | One agent builds the level in Willy Maker and exports the AI pack; a second agent, blind, gets only the pack and the `rom/` tools and builds the ROM | [case-b/](case-b/) |
| **C. Create ROM** | An agent builds Willy Maker's stage 2 (a data-driven engine and Create ROM), then makes the level as a user would, in the browser, recorded | [case-c/](case-c/) |

Every case gets the same [Game Spec v1](#game-spec-v1), the same [acceptance tests](#acceptance) and the same [records](#records). The [jury](#the-jury) judges them blind and the verdict is given by the user and Claude together on the [comparison page](#the-comparison-page).

## Game Spec v1

Frozen: no case may change it. Anything a case cannot do is recorded as a gap, not worked around by changing the spec.

**Section 1 of Mission 1, "Dead Air": the Puerto Madero docks at night** ([story](../rom/story.md#level-1-dead-air--buenos-aires-puerto-madero), [art spec](../rom/art-spec.md#5-level-size-and-mission-1-buenos-aires)).

- **Board and set:** CPS-1, laid out as `slammast` (4 ports × 3 buttons), runs on the stock mame2003-plus core and in a go-link room.
- **Screen and size:** 384 × 224 at 60 Hz. The level is **1536 × 448 px** (4 screens wide, 2 tall), on the 16 px grid.
- **Players:** 2 at once (P1 Willy, P2 a recruit with another shirt). P3 and P4 may join later or show "coming soon"; their ports must not crash the game.
- **Controls (the prototype's):** left/right walk, double-tap to run (250 ms), B1 jump (64 px high), down + B1 drops through a one-way ledge, up/down on ladders, B2 fire (the knife when an enemy is adjacent), B3 special (unused in this section: it does nothing and must not crash), Start joins, Coin adds a credit.
- **Rules (the prototype's engine numbers):** gravity 6/16 px per frame², jump −7 px/frame, a 32 px crate is climbed by pushing, climbing at 1.5 px per frame, the camera only moves forward with a 48 px back margin.
- **The level, left to right:**
  1. Start: both players on the dock floor at x 32–96.
  2. A stack of crates (32 then 64 px) to climb by pushing, then jump.
  3. A **one-way ledge** 64 px up, reached by jumping, with a way down (down + B1).
  4. A **ladder** to the upper dock (the second floor), 160 px up.
  5. **3 enemies ("Trooper")**: one on the lower dock, one on the upper dock, one guarding the exit. They walk a patrol (96 px), turn at its ends, take 3 shots, hurt a player on touch (the player blinks 1 s, loses 1 of 3 energy), and give 100 points.
  6. **2 civilians** to rescue by touching them (500 points each).
  7. The **exit** at x 1440–1504 on the lower dock. Reaching it with all enemies down shows "SECTION CLEAR".
- **Screens:** a title (`WILLY GORKLINGO`, `THE LAG PROTOCOL`, `PUSH START`, `CREDITS n`, `(C) 2026 GO-LINK`), the HUD (score per player, energy, credits), "SECTION CLEAR", "GAME OVER" when every player has no energy and no credit.
- **Art:** the prototype's characters and street tiles (no new art is required). Night palette, dark sky.
- **Sound:** not required (silence passes).

## Acceptance

The same for every case, run by the harness and again by each juror:

1. **Validator level 3** (browser power-on, `@go-link/cps1-sim`) passes all steps.
2. **Validator level 4** (`device romtest ZIP` with the real core) passes all steps.
3. **Scripted run:** a fixed input script (`harness/runs/clear.json`, frame → buttons) inserts a coin, presses Start, walks the route and reaches the exit with all enemies down. The game state at the checkpoints matches the spec (see [the harness](#the-harness)).
4. **Same picture on the real core:** the scripted run replayed on the real core gives the same frames as in the simulator at the checkpoints (the core is deterministic from power on).
5. **Automatic players:** a route bot and a [Laya](https://huggingface.co/convaiinnovations/laya-multilingual) decision model play N games each; their clear rate, deaths and time are recorded.
6. **Spec checklist:** every item of the spec, ticked or recorded as a gap with evidence.

## Records

Every case keeps, in its folder:

| File | What it is |
|---|---|
| `decisions.md` | Every decision as `D-001`, `D-002`…: context, options, the choice, why, and the evidence (a test, a frame, a log line). |
| `journal.md` | The lab journal: time, what was tried, what failed and how it was solved, dead ends included. |
| `metrics.json` | Wall time, tool calls, attempts, build failures, validator results, ROM size, tokens when known. |
| `trace.md` | The traceability index: each source file of the result, its commits, and the decisions behind them. |
| `evidence/` | Screenshots, logs, the validator reports, the scripted run's frames and state. |

**Commits:** small, on the case's own branch (`exp1/case-a`, `exp1/case-b`, `exp1/case-c`), each message ending with a `Decision: D-014` line (several allowed). `git log --format=%B` plus `git blame` lead from any line to its commit and from the commit to the decision.

**Case C is also recorded on video:** Playwright records the browser (no screen capture, it never takes the user's screen). Before every action a note is injected into the page (what it will do, why, and the control it will press, outlined), then the action happens. Each step also goes to `evidence/timeline.json` (time, text, selector, screenshot), from which an MP4 with chapters and a step-by-step HTML guide are made.

## The harness

Shared by every case and every juror (`harness/`):

- **Game state from RAM:** our ROM's build exports a symbol map (the linker knows the address of every variable: each player's x, y, state and energy, enemies, camera, score, credits). The harness reads those addresses from the simulator's work RAM every frame and gives the state as JSON. Cases B and C must export the same map (or the harness records the case as "no state").
- **Simulator runner (Node):** `@go-link/cps1-sim` powers the ROM on, applies an input script or asks a player for the next input, pauses while the player thinks, records state and frames.
- **Real core replay:** `device romtest` with an input script, comparing frames at checkpoints.
- **Players:** a route bot (follows the level's walkable route) and Laya (Python, local: the state as JSON plus one typed question, "next action?", over a closed list: right, left, jump, run, fire, climb up, climb down, drop, wait).

## The jury

Four jurors, each a separate agent on the same model, judge cases **X, Y and Z** (the cases renamed at random; the mapping is sealed until the verdict). Each one plays every ROM through the harness, reads every record, and fills the [rubric](#rubric) alone, with evidence for every score.

| Juror | Looks at |
|---|---|
| **QA tester** | Bugs: falling out of the map, getting stuck, broken enemies, collisions, crashes on odd inputs (P3/P4, B3, Start mid-game) |
| **Game designer** | Fidelity to the spec, how it plays, rhythm, difficulty |
| **Technical reviewer** | The code and data, the traceability from decision to line, reproducibility from zero |
| **Player experience** | Controls, screens, readability; for C, how clear the process in Willy Maker is |

A **foreman** gathers the four, takes the median per criterion, lists the disagreements and writes the jury's report. The jury's report is advice: the **verdict** is given by the user and Claude together.

### Rubric

Each criterion from 0 to 5, with the evidence that justifies it:

| Criterion | 0 | 5 |
|---|---|---|
| Works (acceptance 1–4) | Does not power on | Every acceptance test passes |
| Fidelity to the spec | Most items missing | Every item, as written |
| Playability (acceptance 5) | Bots never clear it | Bots clear it reliably, no stuck states |
| Robustness | Crashes or soft-locks | Survives odd inputs and long runs |
| Effort | Days, many failures | Short, few failures |
| Traceability | No records | Every line reaches a decision |
| Reproducibility | Cannot be redone | A stranger redoes it from the records |
| Lessons for Willy Maker | None | Clear, concrete improvements |

## The comparison page

One HTML page for the verdict, published as a private artifact, to look at together:

- the three cases side by side, named X, Y, Z until the reveal;
- the videos (case C's recording, every scripted run, the bots' best and worst games) with synced playback;
- the screenshots at each checkpoint, side by side and as a difference;
- the data: acceptance results, metrics, bot clear rates, the jurors' scores, their disagreements;
- links from every score to its evidence and from every decision to its commit;
- a verdict form for the user and Claude, then the reveal of which case is which.

## Afterwards

The verdict and the jury's notes become concrete Willy Maker changes (new checks, better exports, the stage 2 engine), each linked back to the evidence that asked for it, and the experiment is summarized in [docs/willy-maker](../willy-maker/README.md).
