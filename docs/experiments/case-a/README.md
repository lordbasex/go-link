# Case A: the ROM by hand

Case A of [experiment 1](../README.md): Game Spec v1 ("Dead Air", section 1 of Mission 1, the Puerto Madero docks at night) written by hand in C for the 68000, built with `node rom/tools/build.mjs` as the prototype was, on branch `exp1/case-a`.

| | |
|---|---|
| Result | `rom/build/slammast.zip` (28 files, 68000 program 28694 bytes), lab state at 0xff0000, `rom/build/symbols.json` |
| Spec | every item met, no gaps ([checklist.md](checklist.md)) |
| Scripted clear | [runs/clear.json](runs/clear.json): SECTION CLEAR at frame 1376, both civilians, all three Troopers, player 2 joins; 20 of 20 expectations |
| Same picture on the core | 5 scripts, 41 checkpoints, all identical (tolerance 0) |
| Records | [decisions.md](decisions.md) (D-001 to D-013), [journal.md](journal.md), [metrics.json](metrics.json), [trace.md](trace.md), [HOWTO.md](HOWTO.md), [evidence/](evidence/) |

## What changed from the prototype

- a 1536 px level streamed column by column into the board's 1024 px tilemap (D-003);
- the docks: crates, a 64 px one-way ledge, a ladder to an upper dock, three Troopers, two civilians, an exit gate (D-002, D-011);
- a jump that really reaches 64 px: move first, then add gravity (D-004);
- Troopers that patrol and turn (D-005), 3 hits (D-007), touch damage with energy, continues and GAME OVER (D-008);
- no breakable crates, no pickup, B3 does nothing (D-006);
- the spec's title, "coming soon" for 3P/4P, the HUD (D-009, D-010);
- opposite directions cancel out, as on the real core (D-013).

## Lessons for Willy Maker

Each one comes from something that went wrong or nearly did, with its evidence:

1. **Check jumps with the engine's own arithmetic.** The spec's numbers (−7 px/frame, 6/16 gravity) suggest a 65 px jump (v²/2g), but the prototype's order of operations gave 61.9 px, too low for the spec's own 64 px ledge (D-004). A level checker should step the real integration and refuse ledges the jump cannot reach.
2. **Wide levels need column streaming.** The CPS-1's scroll2 map is 1024 px; anything wider must be streamed (D-003). The stage 2 engine and Create ROM should do it from the start and test it on the core past x 1024.
3. **Reachability is not what a simple bot can do.** The route bot never took the ledge (it does not jump straight up onto a ledge above a floor, nor across a gap at the same height): every bot game skipped a civilian. A level checker that says "reachable" should model the same moves the engine allows, and the bot should learn those two jumps (journal, 18:24).
4. **Test impossible inputs on the real core.** Left + right together behaved differently in the board model and on the core (D-013). Willy Maker's validator (and the harness's board model) should cancel opposite directions like the core, and its play mode should send the same.
5. **Bullets die 32 px past the screen.** An enemy farther than the screen cannot be shot; trial runs had to walk closer. A level hint (or the checker) should flag enemies placed where the camera cannot show them from the place a player must shoot.
6. **Say the open rules.** The spec left open whether a knife is one of the "3 shots" and whether the continue screen has a timer (D-007, D-008). Willy Maker's templates should state such rules as settings, so a level carries them.
7. **Write scripts from plans and events.** The clear script took three trial runs because of a plan (segments of buttons) plus an event list (hits, rescues, modes) read from the lab state (`tools/gen.mjs`, `tools/events.mjs`). Willy Maker's play mode could record a route the same way and export it as the harness's `clear.json`.
