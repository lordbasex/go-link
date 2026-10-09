# Patches for the mame2003-plus core

go-link uses the [mame2003-plus](https://github.com/libretro/mame2003-plus-libretro) core (MAME 0.78). Some parts of that MAME are not stored in a save state, so those games cannot resume where they stopped:

| Patch | What it fixes |
|---|---|
| `0004-simpsons-save-state.patch` | The Simpsons driver: saves the CPU ROM bank (set through `konami_cpu_setlines_callback`), the video banks (`simpsons_video_banking`), the FIRQ enable, the sound Z80 bank, the banked RAM at `0x88000-0x8afff` (palette, extra RAM, sprite RAM) and the EEPROM start-up counter, and maps the banks again in a `postload`. It also saves the K053260 sound chip (registers, including the latches the two CPUs talk through, and its 4 channels; the channel fields become `UINT32`). |
| `0007-aliens-save-state.patch` | Aliens driver: saves the CPU ROM bank, the work RAM / palette switch and the palette RAM, and maps the bank again on load. Also saves the K051960 sprite chip (RAM, registers, ROM bank, the 051937 pulse counter) and the K007232 sound chip (channels and registers). |
| `0008-soundlatch-save-state.patch` | Generic (`sndintrf.c`): saves the four sound latches, so a command the main CPU wrote and the sound CPU has not read yet survives a load. |
| `0011-irq-event-queue-save-state.patch` | Generic (`cpuint.c`): an interrupt is queued and handed to the CPU by a timer "now", and a save made at the end of a frame finds the VBLANK interrupt still in that queue. The queue was not saved, so the loaded CPU missed that interrupt: a game that does its work every other frame (X-Men and Aliens update their sprites at 30 Hz) then ran one frame late forever, which showed as half the frames differing. It saves the queue and sets its timer again on load. |
| `0012-cpu-local-time-save-state.patch` | Generic (`cpuexec.c`): saves each CPU's local time (how far it ran past the timer system's time) and cycle count, so a loaded CPU starts from the same few cycles of offset. |
| `0013-mixer-save-state.patch` | Generic (`mixer.c`): the sound mixer keeps, per channel, the samples ready but not played yet, the resample phase and the filter history, plus its accumulators. None was saved, so a loaded game's sound chips rendered a few samples more or less in their first frame and stayed that far off. It saves them (non-streamed sample playback, which keeps data pointers, is not saved). |
| `0015-k054539-channels-save-state.patch` | The K054539 (X-Men and later Konami boards) saved its registers and RAM but not where each of its 8 channels plays nor the echo buffer's position. It saves them. |
| `0016-galaga-stars-save-state.patch` | Galaga's star field scroll (and the graphics bank), so the stars do not jump on load. |
| `0017-namco-io-save-state.patch` | The Namco custom I/O chips (`namcoio_machine.c`: Galaga, Dig Dug, Bosconian, Pole Position): each chip's coins, credits and counters, the 50XX's scores, and each 06XX's command with the time to its next NMI. |
| `0018-namco54-save-state.patch` | The Namco 54XX explosion sound generator (`namco54.c`): its envelopes, noise generator and filters. Without it Galaga's explosions after loading were much quieter. |
Most patches touch their own files, so they can be sent upstream one by one; `0013` changes the same file as `0008` and applies after it. These are upstream already: `0014` (the YM2151 swapped its channel and algorithm when it rebuilt each channel's connections on load; [#2041](https://github.com/libretro/mame2003-plus-libretro/pull/2041), merged 2026-10-07 as `b52156e`) and `0006` (the YM2151 timers are MAME timers, which 0.78 does not save: a sound CPU that polls the timer flag or takes its interrupt from the timer stopped after loading; [#2042](https://github.com/libretro/mame2003-plus-libretro/pull/2042), merged 2026-10-08 as `10315f7`) and the QSound games' sound after loading (`0002`, `0003` and `0005`: the QSound chip, its Z80's ROM bank and each CPU's lasting suspend state; [#2043](https://github.com/libretro/mame2003-plus-libretro/pull/2043), merged 2026-10-08 as `21c9f8f`) the Namco wave sound chip (`0009`; [#2044](https://github.com/libretro/mame2003-plus-libretro/pull/2044), merged 2026-10-08 as `1104e22`) the YM3812 (`0010`; [#2045](https://github.com/libretro/mame2003-plus-libretro/pull/2045), merged 2026-10-08 as `64de9b2`) and the Konami CPU (`0001`; [#2046](https://github.com/libretro/mame2003-plus-libretro/pull/2046), merged 2026-10-09 as `d73ba22`), so `UPSTREAM` is that commit. Every file the patches use `state_save_*` in includes `state.h` (without it newer compilers stop on the implicit declaration).

### Checking a save state: `tools/savecheck`

`tools/savecheck` is a small C program, independent of go-link, that loads any libretro core and plays a game twice with the same buttons: once without stopping, and once loading a state saved at frame N into a freshly started board. It counts the identical frames (picture and sound) and shows the sound level second by second (see its [README](tools/savecheck/README.md)). It is the evidence for the pull requests: anyone with the same set repeats the check with one command. With the core at `64de9b2` and every patch here, saved at frame 2400 and comparing 600 frames:

| Game | `64de9b2` | with the patches |
|---|---|---|
| Aliens, The Simpsons, Teenage Mutant Ninja Turtles | 0/600 picture, 0/600 sound | 600/600, 600/600 |
| Street Fighter II | 160/600, 0/600 | 599/600, 600/600 |
| Galaga | 0/600, 0/600 | 501/600, 589/600 (600/600 and 596/600 loaded at the same running time) |

X-Men and Snow Bros. still differ even when loaded at the same running time, so something else is not saved yet.

It was offered to libretro, here or in another of its repositories, in [#2047](https://github.com/libretro/mame2003-plus-libretro/issues/2047) (2026-10-09).

### Verified results

Two measurements, both on this Mac (Intel, macOS) with the user's own sets:

1. **The device's save probe** (`device roms saves --json`, the same code that decides per game whether a room resumes), run over the whole ROM folder (34 sets that pass `romcheck`) once with the official buildbot core and once with the core built from these 8 patches, each with its own temporary `HOME` so the real `~/go-link` was not touched.
2. **A stricter check** (a throwaway harness, not in the repository): boot the game, play it with the probe's coin/start pattern, save at frame 900, 2400 and 4200, and record the next 600 frames. Then boot a second board, load the save after one or two frames and record 600 frames. It counts frames whose picture is identical, frames whose sound is identical (the sum of the samples' sizes), and compares the sound level second by second. A game saved whole gives 600/600 identical frames and the same sound level.

| Game | Official core (probe) | With the patches (probe) | Stricter check with the patches |
|---|---|---|---|
| The Simpsons (Konami CPU, K053260) | ❌ does not resume | ✅ resumes | ✅ 600/600 identical frames at all three save points, same sound level. Before 0004/0006: the picture was wrong for seconds and the sound Z80 hung waiting for the YM2151 timer B flag (music gone, sound at ~15%). |
| X-Men vs. Street Fighter (CPS2) | ❌ | ✅ | ✅ 598/600 frames, same sound level (before 0005: silent after 3000 samples) |
| Marvel Super Heroes (CPS2) | ❌ | ✅ | ✅ 598-599/600 frames, same sound level |
| Dungeons & Dragons: Shadow over Mystara (CPS2) | ❌ | ✅ | ✅ 598-600/600 frames, same sound level |
| Marvel vs. Capcom (CPS2) | ❌ | ✅ | ✅ 599-600/600 frames, same sound level |
| Cadillacs and Dinosaurs (CPS1 + QSound) | ❌ | ✅ | ✅ 599-600/600 frames, same sound level |
| Aliens (Konami CPU, K007232) | ❌ | ✅ | ✅ exact: 600/600 identical pictures **and** 600/600 identical sound frames at frames 900 and 4200 (with `0011`-`0014`). Before them half the frames were one frame late and the sound ~10% louder; before 0007/0008 the sound went silent a few seconds after loading. |
| X-Men (68000, K054539) | ⚠️ passes, broken | ✅ | ✅ 600/600 identical pictures at frames 900, 2400 and 4200, same sound level (with `0011`-`0015`); before them 122-274/600 and a hum instead of the music. |
| Galaga (Namco: three Z80s, custom I/O, 54XX) | ⚠️ passes, silent | ✅ | ✅ 600/600 identical pictures, the same sound level every second (569/600 identical sound frames), with `0009` and `0016`-`0018`. The official core resumes it silent and with the stars and I/O off. |
| Street Fighter II (CPS1, YM2151) | ❌ | ✅ | ✅ at frame 2400: 599/600 pictures (only the first frame after loading differs) and 600/600 identical sound frames. Before `0011`-`0014` the attract fight took another course there (105/600). Before 0006: the sound died (the Z80 takes its interrupt from the YM2151 timer). |
| Pac-Man (Namco wave chip) | ❌ | ✅ (0009) | ✅ 600/600 pictures, same sound level. |
| Snow Bros. (YM3812) | ❌ | ✅ (0010) | ✅ 600/600 pictures, same sound level. |
| Other games checked at frame 2400 | | | Ghosts'n Goblins 600/600 pictures; Cadillacs and Dinosaurs and X-Men vs. Street Fighter 598-599/600 (the first frame after loading); all with the same sound level. |
| Teenage Mutant Ninja Turtles, Ghouls'n Ghosts, The Simpsons | ✅ (probe) | ✅ | ✅ exact (checked at frame 2400): 600/600 (Ghouls'n Ghosts 599/600) pictures and 600/600 identical sound frames. With the official core TMNT's sound fades to nothing after loading and Ghouls'n Ghosts' sound level is off. |

The probe is weaker than the stricter check: it only fails a game whose sound drops to exactly zero or whose picture freezes. With the official core X-Men (`xmen`) and Galaga pass the probe but do not really resume (X-Men: a steady hum instead of the music; Galaga: silent).

How the last causes were found (2026-10-05): the harness also saved the game again a few frames after loading, in both runs, and compared the two saves item by item (a temporary map of each item's offset in the save, never committed). One frame after loading only sound items differed; sprite RAM then lagged one frame behind every other frame while the CPUs matched, which pointed to a lost interrupt (`0011`); the YM2151 counters that advance once per sample (envelope, LFO, noise) pointed to the mixer (`0013`); the operators' last outputs pointed to the swapped connections (`0014`).

**What is left is MAME 0.78's time base:** it keeps time as `double` seconds relative to an offset that grows, so a board that loaded a save at second 0.05 rounds differently from the one that saved it at second 70. A YM2151 timer then fires a few nanoseconds apart and a sound CPU can take its interrupt one instruction earlier or later: X-Men's and Pac-Man's sound frames are not all bit-identical, though the level is the same every second. Loaded at the same running time (the harness boots the second board for as many frames as the first one ran), X-Men is exact in picture and sound too. Making it exact otherwise means saving every MAME timer, whose callbacks are function pointers that change between processes.

The device does not rely on this table: its save probe (`services.ProbeSaves`) decides per game and per core version. With the official core, the games marked ❌ above are marked as "cannot be saved".

**The original code is never modified.** `build.sh` clones the official repository at the `UPSTREAM` commit, applies the patches and builds with the core's own Makefile:

```bash
./build.sh            # this machine's platform
./build.sh unix       # Linux (also inside Docker)
```

The core ends up in `out/`. To try it with the device: `go-link-device --core cores/mame2003-plus/out/mame2003_plus_libretro.dylib`, and `device roms saves` to see which games now resume.

## Life cycle

1. The patches are proposed to the official repository as a pull request.
2. **If accepted**, the libretro buildbot publishes the fixed core: this folder is removed and the device keeps downloading the official core. The device's save probe detects by itself that those games now save.
3. **If there is no answer**, the patches stay: when `UPSTREAM` moves to a new commit, `build.sh` says if one no longer applies. Distributing the patched core is a separate decision (today the device only downloads the official core).

License: mame2003-plus uses the MAME license (non-commercial use); these patches change its code and fall under the same license.

## Pending

None of this is used yet: the device downloads the official core from the buildbot, and these patches were only built for testing. A save state made with one core build does not load in another (the saved items differ), so a device that changes cores must not reuse old saves (the probe cache is already keyed by the core's SHA-256).

1. **Pull request upstream**, one patch at a time: `0014`, a plain bug fix, went first ([libretro/mame2003-plus-libretro#2041](https://github.com/libretro/mame2003-plus-libretro/pull/2041), opened 2026-10-05, **merged 2026-10-07** by the maintainer without changes; the buildbot's next nightly cores carry it). `0006` (the YM2151 timers) went next as [#2042](https://github.com/libretro/mame2003-plus-libretro/pull/2042) on 2026-10-07, with its timer code inside `#ifdef USE_MAME_TIMERS`, and was **merged 2026-10-08** without changes. Then `0002`, `0003` and `0005` together as [#2043](https://github.com/libretro/mame2003-plus-libretro/pull/2043) (2026-10-08, **merged** the same day without changes), because they only work together: on master `10315f7` the CPS2 games' sound after loading is 0 (D&D Shadow over Mystara, Marvel Super Heroes, X-Men vs. Street Fighter), with `0002`+`0003` it plays a few milliseconds and stops (the sound Z80 is reset, `0005`), and with the three it is whole (about 482,000 against 480,000 before saving); the save probe over 39 sets goes from 20 to 26 games that resume, none lost. Then `0009` (the Namco wave sound chip) as [#2044](https://github.com/libretro/mame2003-plus-libretro/pull/2044) (2026-10-08, **merged** the same day): on master `21c9f8f` Pac-Man is silent after loading (0 against 434,104 before saving) and with it the sound is whole (434,692); 26 to 27 of 39 sets resume, none lost. Then `0010` (the YM3812) as [#2045](https://github.com/libretro/mame2003-plus-libretro/pull/2045) (2026-10-08, **merged** the same day): on master `1104e22` Snow Bros. is silent after loading (0 against 500,814) and with it the sound is whole (497,560); 27 to 28 of 39, none lost. Then `0001` (the Konami CPU) as [#2046](https://github.com/libretro/mame2003-plus-libretro/pull/2046) (2026-10-08, **merged** 2026-10-09): on master `64de9b2` The Simpsons and Aliens save incomplete and freeze after loading (16 and 30 picture changes against 290 and 150), and with it alone both resume with picture and sound (`0004` or `0007` on top change nothing the probe sees); 28 to 30 of 39, none lost. Then `0011` (the interrupt event queue) as [#2048](https://github.com/libretro/mame2003-plus-libretro/pull/2048) (2026-10-09), the first with `tools/savecheck` as evidence: on master `d73ba22`, Street Fighter II 160 to 599 identical pictures out of 600 and Pac-Man 262 to 599, Snow Bros. 0 to 357; none of the 33 sets the core runs got worse. What `savecheck` showed for the rest, on `d73ba22`: `0008`+`0011`-`0013` together make the sound identical (Street Fighter II 0 to 600 sound frames, Aliens 585, TMNT 592); `0004` gives The Simpsons 600 identical pictures; `0007` gives TMNT 600 (its K051960 sprite chip) and Aliens needs `0011` too. Next `0012`+`0013` (with `0008`), then `0004`, `0007`, `0015` and `0016`-`0018`. Each merged patch moves `UPSTREAM` past it and leaves this folder.
2. ~~Aliens is not exact~~: fixed by `0011`-`0014` (2026-10-05).
3. ~~X-Men does not resume from later saves~~: fixed by `0011`-`0015` (2026-10-05); its sound is the same level but not bit-identical (the time base, above).
4. **The general cause is MAME 0.78's timers:** a pending MAME timer is not saved (0.78 has no timer save support). `0006` handles the YM2151 ones; other chips with MAME timers (YM2203/YM2608/YM2610 through `fm.c`, the 50 µs NMI kludge of The Simpsons' Z80, one-shot timers of many drivers) can lose an event if the save falls just before it fires.
5. **Other drivers with the same `init_eeprom_count` pattern** as The Simpsons (Konami boards with an EEPROM): a board that boots without NVRAM and loads a save within its first reads goes into the service mode. The device keeps the NVRAM, so this only matters for a first run.
6. **Other games that cannot be saved**, found by the probe: Midway (Mortal Kombat 1-3, NBA Jam, Cruis'n USA: the core refuses to save them) and Hammerin' Harry (Irem M72: its driver does not declare save support, so the probe sees an incomplete save), Shadow Dancer (they lose their sound). Pac-Man and Snow Bros. are fixed by `0009` and `0010` (2026-10-05). One by one, if worth it.
7. **Distributing the patched core** (if the pull request stalls): build it in CI for macOS, Linux and Windows, publish it in go-link's releases with its SHA-256, and have the device download it from there. This needs changing the "the core only comes from the buildbot" rule and reviewing the MAME license (non-commercial use).

How to measure: `device roms saves` (the whole library; it caches its verdicts per core in `go-link/cores/saves.json`, keyed by the hash in `mame2003_plus_libretro.dylib.sha256`: after copying a new core over by hand, delete both or it reports the old core's results), or `emulate --probe save|load` with `--core` pointing at the patched core. To keep the real `~/go-link` untouched, run `device roms saves` with a temporary `HOME` holding `go-link/cores/` (the patched core plus a copy of `mame2003_plus.romcheck`) and a temporary `--config`.
