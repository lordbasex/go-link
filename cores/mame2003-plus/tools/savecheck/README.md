# savecheck

Does a libretro core save a game whole? `savecheck` plays the same game twice, with the same buttons at the same frames, each run in its own process (a fresh board):

1. **Uninterrupted:** power on, play to frame N, save the state, play M more frames.
2. **Resumed:** power on, run K frames, load that state, play the same M frames.

When the save state keeps everything, both runs give the same picture and the same sound, frame by frame. `savecheck` counts the identical frames, prints the sound level second by second in both runs and the frames that differ, and can write the first different frame of each run as a picture.

It works with any libretro core and needs only a C compiler: one file, the libretro API header and the C library (POSIX: `fork`, `dlopen`). It was written to show the save state fixes sent to [mame2003-plus](https://github.com/libretro/mame2003-plus-libretro), so anyone with the same game can repeat the check.

## Build

```bash
make            # macOS or Linux; gives ./savecheck
```

## Use

```bash
./savecheck [options] CORE GAME
```

| Option | Meaning |
|---|---|
| `--save-at N` | frame the first run saves at (default 2400, 40 seconds at 60 fps) |
| `--frames M` | frames compared after the save (default 600) |
| `--load-after K` | frames the second board runs before loading (default 1) |
| `--option KEY=VALUE` | sets a core option, repeatable; every other option keeps its default |
| `--system DIR` | a system directory (BIOS files) copied for each run |
| `--json FILE` | also writes the result as JSON |
| `--diff DIR` | writes the first different frame of both runs as PPM pictures |
| `--quiet` | prints only the summary line |

Exit status: `0` identical, `1` different, `2` error.

For mame2003-plus pass `--option mame2003-plus_skip_disclaimer=enabled --option mame2003-plus_skip_warnings=enabled`. Otherwise the freshly started board draws its startup messages over the loaded game for a few frames, and those frames differ for a reason that has nothing to do with the save state.

Example, The Simpsons with the core at `64de9b2` and with every fix in this folder:

```
$ ./savecheck --quiet --option mame2003-plus_skip_disclaimer=enabled \
    --option mame2003-plus_skip_warnings=enabled mame2003_plus_libretro.so simpsons.zip
DIFFERENT: simpsons.zip picture 0/600, sound 0/600        (64de9b2)
IDENTICAL: simpsons.zip picture 600/600, sound 600/600    (with the fixes)
```

Without `--quiet` it also prints the sound level per second (RMS) in both runs, the first different frame and every range of different frames, marked `P` (picture) or `S` (sound).

## Many games at once

`batch.sh` runs `savecheck` over every zip in a folder, several at a time, and writes one line per game to `OUTDIR/results.txt` (and each game's JSON next to it):

```bash
./batch.sh CORE ROMDIR OUTDIR --option mame2003-plus_skip_disclaimer=enabled \
    --option mame2003-plus_skip_warnings=enabled
```

```
ERROR: 1941.zip the core does not load it
ERROR: mk.zip the core saves nothing for this game (retro_serialize_size is 0)
DIFFERENT: pacman.zip picture 599/600, sound 261/600
IDENTICAL: simpsons.zip picture 600/600, sound 600/600
```

Options after `OUTDIR` go to every `savecheck` run. `JOBS` sets how many games run at once (default: half the CPUs), and a game that runs longer than five minutes is stopped. Run it once with `--load-after` equal to `--save-at` too: the games that pass only then lose state through the time base, not through a part of the board.

## How it plays

The buttons depend only on the frame number, so both runs press the same ones. Player 1 and player 2 insert a coin and press Start every 8 seconds, then use the joystick and the first three buttons in a fixed pattern, different for each player. During the second board's warm-up frames nothing is pressed.

Each run gets its own empty system and save directories, so a file one run writes (NVRAM, configuration) never reaches the other. Every core option keeps the default the core declares, unless `--option` sets it.

## Reading the result

- **Identical picture and sound:** the state keeps everything the game needs.
- **The picture differs from the first frames and never comes back, or the sound is silent:** part of the board is not in the state (a CPU, a ROM bank, a sound chip).
- **The same picture but a slightly different sound, with the same level every second:** often a time base that rounds differently at another running time, not a missing item. In MAME 0.78 the time is a `double` relative to a growing offset, so a board that loads at second 0.02 and one that saved at second 40 can fire a timer a few nanoseconds apart. Loading at the same running time (`--load-after` equal to `--save-at`) shows whether that is the cause.

The ROMs are not part of this tool. Use your own sets.

License: MIT. `libretro.h` is the libretro API header (MIT, the RetroArch team).
