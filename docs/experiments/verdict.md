# Experiment 1: the verdict

Given on 2026-10-02 by the user and Claude together, after the [comparison page](README.md#the-comparison-page), the jury's report and the reveal. The experiment is closed.

## The decision

| | Winner | Why |
|---|---|---|
| **Best ROM** | **Y, made by case A (by hand)** | The only ROM with every rule of [Game Spec v1](README.md#game-spec-v1) as written, the exit drawn as a door, `ENEMY n` in the HUD and "3P COMING SOON"; one high bug (the ladder soft-lock, J-01), shared with X |
| **Best process for the future** | **C (Willy Maker's Create ROM)** | The only case that left something every later game uses: the data-driven engine, Create ROM, rules as data, three Willy Maker bugs fixed while using it; its HOWTO gave the same zip byte for byte |

By the rubric, A also leads the process (17.5 against C's 16.5): it was the shortest and cleanest. The verdict keeps C as the way forward because the experiment's question was how Willy Maker should make ROMs, and A's work has to be redone by hand for every game. **The gap between X (what Create ROM makes today) and Y (what a careful hand made) is the task list below:** when the engine does by default what A did by hand, Create ROM makes Y-class ROMs for any game.

B's ROM, Z, came last because it built a different game: 4 hits, 500 and 1000 points, lives, shooting troopers, a bomb on B3 and a clear with an enemy alive. That is what the AI pack said: Willy Maker exported its own engine's numbers, not the user's game. The blind builder did what it was told; the pack failed (P-01 to P-26).

## The mapping

| Case | How | ROM | Part 1 (ROM, of 20) | Part 2 (process, of 20) |
|---|---|---|---|---|
| A | By hand, C for the 68000 | **Y** | 17.25 (1st) | 17.5 (1st) |
| B | AI pack, then a blind ROM build | **Z** | 13.5 (3rd) | 15.5 (3rd) |
| C | Willy Maker, Create ROM | **X** | 15 (2nd) | 16.5 (2nd) |

Sealed until the verdict; the jury never knew it.

## The scores

The jury's medians (the [foreman's report](#the-jury)) and Claude's own scores, each 0 to 5.

| Criterion | X jury | X Claude | Y jury | Y Claude | Z jury | Z Claude |
|---|---|---|---|---|---|---|
| Works | 5 | 5 | 5 | 5 | 5 | 5 |
| Fidelity to the spec | 4 | 4 | 5 | 5 | 2 | 2 |
| Playability | 3 | 3 | 4 | 4 | 3 | 3.5 |
| Robustness | 3 | 3 | 3.25 | 3.5 | 3.5 | 3.5 |
| **Total** | **15** | **15** | **17.25** | **17.5** | **13.5** | **14** |

| Criterion | A jury | A Claude | B jury | B Claude | C jury | C Claude |
|---|---|---|---|---|---|---|
| Effort | 5 | 5 | 3 | 3 | 3 | 3 |
| Traceability | 4.5 | 4.5 | 4 | 4 | 4 | 4 |
| Reproducibility | 4 | 4.5 | 3.5 | 4 | 4.5 | 5 |
| Lessons for Willy Maker | 4 | 4 | 5 | 5 | 5 | 5 |
| **Total** | **17.5** | **18** | **15.5** | **16** | **16.5** | **17** |

Claude's reproducibility scores are higher than the jury's because the HOWTOs were reproduced after the jury met (below). **The user's view:** the three looked even while playing; the user accepted Claude's reading of the scores (Y the best ROM, C the way forward), asked to keep the lessons and the external evidence in the work that follows, and closed the experiment.

## Reproduction of the HOWTOs

After the jury, one agent per case (none had taken part) followed each case's `HOWTO.md` literally in a fresh worktree from `main` at `23806b8`. All three reproduced **in the first round**:

| Case | Guide | Result |
|---|---|---|
| A | `exp1/case-a` `docs/experiments/case-a/HOWTO.md` (two patches, SHA-256 `35d48253…`, `70faf849…`) | Build printed `unchanged`; the 28 files match the final zip by SHA-256; the scripted clear at frame 1376 and the core at 0 % on all 10 checkpoints; the acceptance gave the case's exact frames and scores |
| B | `exp1/case-b-rom` `docs/experiments/case-b/HOWTO.md` (pack, then the blind ROM) | The 107-step session gave the same project (`project.json` equal without its id and times); the ROM's 28 files equal Z's by SHA-256; only the zip container's timestamps differ |
| C | `exp1/case-c` `docs/experiments/case-c/HOWTO.md` (15 commits, then the 82-step session) | The session made `slammast.zip` **byte for byte identical** (`b1742aac…`), which settles the jury's one open question (Reproducibility, C: tech 3 against qa and ux 5) |

## What surprised

- **No case found the ladder soft-lock** (J-01), the one bug a casual pair of players walks into: the spec itself combines a forward-only camera, an enemy on a branch and an exit that needs every enemy down. Bots, scripted runs and Laya never left the route; a 60 s "naive player" and a seeded fuzz did.
- **The same numbers gave different jumps:** 62 px in X and Z, 69 px in Y, depending on whether gravity is added before or after moving (A's D-004).
- **Laya is not a player:** asked "next action?" with no training, it answered `fire` in about 99 % of states, in every ROM.
- **The simulator and the core disagree only on impossible inputs** (left and right together): everything else matched pixel for pixel, millions of frames.

## External evidence

On 2026-10-01 an AI outside this project, with only a browser, was asked to "create a game using go-link.org/tools/willy-maker" ([external-ai.md](external-ai.md)). It is an independent run of case B's first half by a real outside user. It did not reach a ROM, so it scores nothing, but it confirms the verdict: with the AI pack alone there is no way to a ROM (the tools, the 68000 compiler and an engine that reads projects were missing), which is what case C built. Its own lessons join the tasks (E-02 to E-05).

## The user's playtest notes (2026-10-02)

- **Crates climb themselves:** walking into a 32 px crate lifts the player on top of it (the prototype's "climbed by pushing" rule, which the spec kept). The user expects to jump over it, as in Super Mario Bros.
- **No visible choice of one or two players**, and no way to give the game a hero other than Willy.
- **Willy Maker still feels tied to Willy's game:** a game of another genre cannot be made from zero.
- **A full sprite sheet** (12 moves: idle, walk and run, turn, jump, jump kick combo, crouch, crawl, machine gun, knife, bazooka, a yawn, a thumbs up): Characters imports and animates all of it, but the engine plays six moves (idle, walk or run, jump, shoot, knife, bazooka) (U-05).
- **The CPS-1 can do much more:** Street Fighter II and Final Fight run on the same board; the 44 px hero, the six moves and the silent sound are go-link's choices so far, not the board's limits (U-06).
- **A meter of the board's use** in plain sight, to grow the game (levels, detail, sound) without going over (U-07).
- **Own backgrounds:** use a picture of their own (a screen, many, or a long strip, like a night city with neon and docks), and draw on it with the pencil what is floor, a crate, a ladder (U-08).

## Tasks

Each task comes from the evidence that asked for it: the jury's lessons (L-01 to L-16, [foreman's report](#the-jury)), the external AI (E-02 to E-05) and the user's notes (U-01 to U-04). **This round** was done right after the verdict (2026-10-02, see the CHANGELOG); the rest stays in [status.md](../status.md) in this order.

**Checked on the spec level after this round:** Create ROM's ROM still clears the scripted run at frame 1883 and matches the real core at all 11 checkpoints; the jury's `crate-trap` script no longer stops the player (x 186 before, x 1232 now: the crate on top breaks with the one shot under it), its `opposites` script now matches the core at 0 % (1.80 % before), `p34-title` shows "3P COMING SOON", and the HUD shows `ENEMY n` and the door. The new point of no return check warns about the upper trooper (J-01) and also about the **lower trooper**: players can climb the ladder, walk the upper dock and drop back to the street past it, a second soft-lock in the spec's level that no juror found.

| Id | Task | From | When |
|---|---|---|---|
| T-01 | **Point of no return check** in the validator: walk the route graph with the forward-only camera and warn when something the exit needs (or a civilian) can be left behind; offer fixes (a camera lock until the branch is done, a door, more backtrack, or "every enemy you can still reach") | L-01, J-01 | done |
| T-02 | **The exit rule as a setting** carried by the project, the play mode, the ROM and the AI pack (every enemy down or touch), with a message when the exit is touched too early and `ENEMY n` in the HUD | L-02, L-07, J-02, J-11 | done |
| T-03 | **Crates:** unsupported crates fall; breakable is a per-crate setting, off on climbing stacks | L-04, J-03 | done |
| T-04 | **Cancel opposite directions** (left with right, up with down) in the ROM engine, the board model and play mode, as the core does | L-05, J-17 | done |
| T-05 | **The exit is drawn** as a door by default | L-07, J-13 | done |
| T-06 | **P3 and P4 behaviour** as a setting (join, coming soon, ignore), "coming soon" by default and no credit taken | L-08, J-14 | done |
| T-07 | **How crates are climbed** as a rule: by jumping (default, as in Super Mario Bros.) or by pushing (the prototype's) | U-01 | done |
| T-08 | QA run in the acceptance: per-frame invariants, a seeded 4-port fuzz, adversarial players (skipper, newcomer, shooter, masher) and a ddmin minimizer | L-03 | done |
| T-09 | Camera, ladder and join rules: leaving the ladder column ends the climb, the camera never pushes a player into solid cells, join points checked, every active player kept in the picture vertically | L-06, J-04, J-05, J-06, J-12, J-16 | done |
| T-10 | Every rule the engine does not decide goes into the project and the AI pack as a setting; P-01 to P-26 are the checklist | L-08, J-07, J-10 | done |
| T-11 | Screen text: whole fields cleared, overlays never erase the HUD, prompts follow credits, an HUD safe zone, an automatic on-screen text check | L-09, J-15, J-10, J-16 | done |
| T-12 | Freeze the world on SECTION CLEAR, then a short tally | L-10, J-08 | done |
| T-13 | Show the jump's measured peak and check ledges against it | L-11 | done |
| T-14 | A headless, one-command project-to-ROM rebuild, the project file kept next to the ROM | L-12 | done |
| T-15 | Difficulty settings, and the acceptance reports the energy a naive player lost | L-13 | next |
| T-16 | Engine test: an enemy touching a still player keeps patrolling and hurting | L-14, J-09 | next |
| T-17 | Recordings: fixed numbered captions with "Why" cards away from the control, chapters linked to the MP4 | L-15 | next |
| T-18 | The jury process (case names out of the arena files, ROM hashes out of what jurors read before part 1, the second-agent HOWTO run required, newcomer and run-past scripts for every juror) | L-16, J-18 | done in the `experiment-jury` skill |
| T-19 | The AI pack's `PROMPT.md` states its limits first: the tools it needs and that `build.mjs` builds only the prototype | E-02 | next |
| T-20 | A lighter AI pack: level pictures cut into the board's tiles instead of 22 MB pictures | E-03 | next |
| T-21 | A project or AI pack is not a ROM: the export page says so, and a `.willy.zip` dropped on the device gets a message | E-04 | next |
| T-22 | Other genres, in the order of [genres.md](../willy-maker/genres.md) | E-05, U-04 | roadmap |
| T-23 | The number of players in plain sight (one or two, up to four) in the wizard and the Game tab | U-02 | done |
| T-24 | Own heroes: a project's characters drawn by play mode and by the ROM engine instead of Willy | U-03 | done |
| T-25 | The moves of a full sprite sheet, in play mode and in the ROM: crouch and crawl on down, landing, turning, a victory or thumbs up on a rescue and at the clear, a yawn after a long idle, a jump kick, and a double jump and a jet pack as optional rules; effects (muzzle flash, smoke) as their own sprites instead of inside the hero's frames | U-05 | done (effects as their own sprites: with T-26) |
| T-26 | Toward the CPS-1's real limits (Street Fighter II and Final Fight run on it): heroes taller than 44 px (Final Fight scale is about 2 to 2.5 times taller) with the body, jump and reach checks scaled to the character, more sprite tiles per frame and per screen, the third background layer and row scroll for parallax, and QSound music and effects | U-06 | roadmap |
| T-27 | A board usage meter: how much of the CPS-1 the game uses (graphics and program memory, sprite and layer palettes with the engine's own, sprites on screen, colors, layers, animations, sound), measured from Create ROM's real result when there is one and estimated live while building, always in sight, warning before a change goes over | U-07 | done |
| T-28 | Own backgrounds: import a picture (one screen, several, or one long strip) into the far or the play layer; find its pixel size and scale it to board pixels, fit its colors to the board (up to 32 palettes of 15 colors per layer, chosen per tile), cut and deduplicate the tiles, show the cost on the board usage meter; then trace the collision tags over it with the pencil (floor, one-way, ladder, crate, hazard), with the picture under the tags. Later, tags suggested from the picture | U-08 | done (tags suggested from the picture: later) |
| T-29 | Prompt for image AI: a dialog, opened from Build › Layers, Parts › Objects and Tiles, Characters and Export with the kind already chosen, that writes prompts for an image AI for any art the game needs (backgrounds far, play, panorama, static or boss arena; characters; objects; effects; tiles): the user's description, checkboxes with help, place, time, weather, a style reference used only as a style, palette and quality; Willy Maker fills in what the CPS-1 needs (sizes at exactly 4 times the board's pixels, 384 × 224 → 1536 × 896, 4-screen stretches of 6144 px, the far layer half the level plus a screen, character sheets in a grid on #FF00FF with a row per animation and its preset frames, 12-bit color, 15 colors per tile, no gradients or anti-aliasing), one prompt per parallax layer and stretch with the level's sections, a negative prompt, Copy buttons, how to bring each result in, and the choices kept with the game; prompts in English, interface in en/es/pt. Puerto Madero at night is the preloaded example. From the user's brief (2026-10-02) | user | done |
| T-30 | From the image AI tests: split a box twice as wide as its row's others (two figures touching), a display filter for play mode and rooms (sharp, smooth, CRT), a picture narrower than the level warned about (the far layer showed in a 32 px strip), own enemies and objects drawn by the engine instead of the prototype's | user tests (2026-10-02) | next |
| T-31 | go-link HD, an own 2D "chip" beyond the CPS-1's 384 × 224 (the user's vision: CPS-1, bigger MAME boards, then an own Switch-class 2D engine): first an experiment, an HD test scene (an image AI background and hero at 1920 × 1080, 60 fps) streamed from the device to a room, measuring fps, device CPU, encode time per frame and bitrate at 720p, 1080p and 4K, with the software encoder (libvpx) and then the Mac's hardware one; then a decision with numbers | user (2026-10-02) | last |

## Records

- The cases: [case-a/](case-a/), [case-b/](case-b/) (step 2 in [case-b/rom/](case-b/rom/)), [case-c/](case-c/), each with its decisions, journal, metrics, trace, evidence and HOWTO. Their branches (`exp1/case-a`, `exp1/case-b`, `exp1/case-b-rom`, `exp1/case-c`) keep the code each case wrote; case C's is merged into `main`.
- The harness: [harness.md](harness.md). The external evidence: [external-ai.md](external-ai.md).
- The arena reports, the jury's reports, the foreman's report, the comparison page and the videos stay in the experiment's shared folder (`exp1/`); they are large and partly in other languages, so they are summarized here and on the page.

### The jury

Four jurors (QA tester, game designer, technical reviewer, player experience), each alone, then a foreman who took the medians, merged 18 bugs (J-01 to J-18) and ranked 16 lessons (L-01 to L-16, in the foreman's order of priority). The report was advice; this page is the verdict.
