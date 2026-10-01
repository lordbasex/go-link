# rom/: go-link's own CPS-1 arcade ROM (prototype)

A feasibility prototype for [Willy Gorklingo: The Lag Protocol](../docs/rom/README.md): our own 68000 program, graphics and Z80 stub, laid out as the files of the `slammast` CPS-1 set (4 players × 3 buttons, QSound board; `captcomm` also builds) so the stock mame2003-plus core (MAME 0.78) runs it. Every byte is ours. Only the public driver source was used to learn the file names, sizes and memory map.

```sh
brew install m68k-elf-binutils m68k-elf-gcc z80asm
node rom/tools/build.mjs           # -> rom/build/slammast.zip  (or: build.mjs captcomm)
node rom/tools/quality.mjs         # sprite before/after pictures -> rom/build/quality/
node rom/tools/room-test.mjs       # plays it in a real go-link room (own signalhub + headless device)
```

- `src/`: `crt0.s` (vectors, vblank), `link.ld`, `hw.h` (board registers per set), `main.c` (the two-player level), `sound.z80` (captcomm), `sound-qsound.z80` (slammast).
- `tools/`: `build.mjs` (one command build, set layouts), `art.mjs` (characters, the backdrop), `level.mjs` (the Metal Slug-style level: map, tiles, collision, objects), `sprites.mjs` (sprite conversion: dominant-color downscale, per-tile palettes), `color.mjs` (OKLab, the CPS-1's real colors, k-means), `kabuki.mjs` (encrypts our Z80 code for QSound boards), `cps1gfx.mjs` (graphics format), `font.mjs`, `png.mjs`, `quality.mjs`, `room-test.mjs`.

Everything else is in the docs:
- [docs/rom/journal.md](../docs/rom/journal.md): the step-by-step lab journal, how to reproduce from zero, and the verdict.
- [docs/rom/hardware.md](../docs/rom/hardware.md): the CPS-1 facts, each with its source in the driver.
