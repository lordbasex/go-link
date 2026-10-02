# rom/: go-link's own CPS-1 arcade ROM (prototype)

A feasibility prototype for [Willy Gorklingo: The Lag Protocol](../docs/rom/README.md): our own 68000 program, graphics and Z80 stub, laid out as the files of the `slammast` CPS-1 set (4 players × 3 buttons, QSound board; `captcomm` also builds) so the stock mame2003-plus core (MAME 0.78) runs it. Every byte is ours. Only the public driver source was used to learn the file names, sizes and memory map.

```sh
brew install m68k-elf-binutils m68k-elf-gcc z80asm
# Node 22.18 or newer (frontend/.nvmrc): the tools import TypeScript from frontend/packages/cps1
node rom/tools/build.mjs           # -> rom/build/slammast.zip  (or: build.mjs captcomm)
node rom/tools/quality.mjs         # sprite before/after pictures -> rom/build/quality/
node rom/tools/room-test.mjs       # plays it in a real go-link room (own signalhub + headless device)
node rom/tools/engine.mjs          # Willy Maker's engine -> frontend/apps/web/public/willy-maker/engine/ (--check)
```

- `src/`: `crt0.s` (vectors, vblank), `link.ld`, `hw.h` (board registers per set), `main.c` (the two-player level), `sound.z80` (captcomm), `sound-qsound.z80` (slammast).
- `engine/`: Willy Maker's data-driven engine ([docs/willy-maker/engine.md](../docs/willy-maker/engine.md)): `engine.c` (the prototype's rules reading the game from a data block at 0x100000) and `wmdata.h` (the block's layout). `node rom/tools/engine.mjs` builds it once into `frontend/apps/web/public/willy-maker/engine/` for the browser's Create ROM (`--check` compares the committed build with the source).
- `tools/lab/`: experiment 1's harness ([docs/experiments/harness.md](../docs/experiments/harness.md)): `run.mjs` (plays a set in the board simulator with an input script or a player, records the lab state of every frame, PNG and MP4), `validate.mjs` (validation level 3), `compare.mjs` (simulator vs real core frames), `bot.mjs` (route bot), `laya_player.py` (the Laya decision model as a player), `acceptance.mjs` (every automatic test in one command) and `runs/prototype-clear.json`. `src/lab_state.h` is the state every frame leaves in work RAM; the build writes `build/symbols.json`.
- `tools/`: `build.mjs` (one command build, set layouts), `art.mjs` (characters, the backdrop), `level.mjs` (the Metal Slug-style level: map, tiles, collision, objects), `font.mjs`, `png.mjs`, `quality.mjs`, `room-test.mjs`.
- The CPS-1 conversion code lives in [`frontend/packages/cps1`](../frontend/packages/cps1) (`@go-link/cps1`, TypeScript with tests, no DOM and no Node APIs), shared with Willy Maker in the browser: `color.ts` (OKLab, the CPS-1's real colors, k-means), `sprites.ts` (sprite conversion: dominant-color downscale, per-tile palettes), `gfx.ts` (graphics format) and `kabuki.ts` (encrypts our Z80 code for QSound boards). The tools import it by path, which is why they need a Node that runs TypeScript (type stripping, on by default since 22.18). Moving the code changed no byte of the set: the 28 files of `slammast.zip` were compared one by one before and after.

Everything else is in the docs:
- [docs/rom/journal.md](../docs/rom/journal.md): the step-by-step lab journal, how to reproduce from zero, and the verdict.
- [docs/rom/hardware.md](../docs/rom/hardware.md): the CPS-1 facts, each with its source in the driver.
