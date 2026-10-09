# statescan

Which parts of each game does a mame2003-plus save state leave out? `statescan` reads the core's source (no build, no ROMs) and answers per game and per part, so fixes can go where they cover the most games.

MAME saves state part by part: each CPU, each sound chip, each video chip and each driver registers its own variables with `state_save_register_*`. For every game, `statescan` collects the parts of its board: the driver file, the machine, video and sound hardware files the driver calls, its CPUs (`MDRV_CPU_ADD`) and its sound chips (`MDRV_SOUND_ADD`), following `MDRV_IMPORT_FROM`. In each part it lists the file-scope variables that can change while the game runs and that nothing saves.

A variable counts as saved when it is named in a `state_save_register_*` call, when its address is taken (`&name`) in a function that registers state (a table of addresses), or when a function registered with `state_save_register_func_postload` writes it (it is rebuilt from saved state after a load). It counts as state only when a function other than a start, init, reset or setup function writes it: a table filled once at start is the same in every run.

## Use

```bash
./statescan.py SRC                        # rank the parts by the games that use them
./statescan.py SRC --games xmen,galaga    # the suspect parts of some games
./statescan.py SRC --json FILE            # also write the result as JSON
```

`SRC` is the core's `src/` folder. A full ranking reads every file of the core and takes about a minute and a half.

```
5372 games, 1033 parts with unsaved state
 3249  cpu:Z80                     z80_ICount, _PC
 1051  driver:machine/eeprom.c     sending
  872  sound:YM2151                lastreg0, lastreg1, lastreg2, LFO_AM, LFO_PM (+12)
  728  sound:DAC                   output, UnsignedVolTable, SignedVolTable
```

## Reading the result

It is a reading of the source, not a proof, so use it to choose where to look and check a game with [savecheck](../savecheck/README.md):

- A variable that the game sets again every frame before using it (a priority or a color base read from a chip's saved registers) is listed but does no harm.
- Work variables (`ICount`, the current `_PC`, an effective address) are listed but are rebuilt by the next instruction.
- A part saved some other way (a chip that saves a whole structure, a memory region the CPU core saves) can look unsaved.
- The timers of `timer.c` are not variables of a part: they are not in any save state of this core, and `statescan` does not list them.

Python 3, no packages. License: MIT.
