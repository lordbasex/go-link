# Patches for the mame2003-plus core

go-link uses the [mame2003-plus](https://github.com/libretro/mame2003-plus-libretro) core (MAME 0.78). Some parts of that MAME are not stored in a save state, so those games cannot resume where they stopped:

| Patch | What it fixes |
|---|---|
| `0001-konami-cpu-save-state.patch` | The Konami CPU had its save code disabled (`#if 0`) and an empty `konami_init()`: after loading a save the CPU kept garbage registers and the game crashed. It registers its registers the way the M6809 does. |
| `0002-qsound-save-state.patch` | The QSound sound chip did not register its state. It registers the 16 channels and the data latch. |
| `0003-cps-qsound-z80-bank-save-state.patch` | The sound Z80 of QSound games (CPS1 and CPS2) switches ROM banks, and the bank was not saved. It saves it and restores it on load. |
| `0004-simpsons-save-state.patch` | The Simpsons driver: saves the CPU ROM bank (set through `konami_cpu_setlines_callback`), the video banks (`simpsons_video_banking`), the FIRQ enable, the sound Z80 bank, the banked RAM at `0x88000-0x8afff` (palette, extra RAM, sprite RAM) and the EEPROM start-up counter, and maps the banks again in a `postload`. It also saves the K053260 sound chip (registers, including the latches the two CPUs talk through, and its 4 channels; the channel fields become `UINT32`). |
| `0005-cpu-suspend-save-state.patch` | Generic (`cpuexec.c`): saves the lasting suspend state of every CPU (held in reset, halted, disabled). CPS2 holds its sound Z80 in reset at boot; a board that loads a save a moment after booting still had the Z80 in reset, so when the game wrote its "Z80 running" bit the Z80 was reset, restarted its program and waited forever for the boot handshake. That was the silent CPS2 sound. |
| `0006-ym2151-timers-save-state.patch` | Generic (`ym2151.c`): the YM2151 timers are MAME timers, which 0.78 does not save. It saves the time left to each overflow and starts them again on load. Without it a sound CPU that polls the timer flag (The Simpsons) or takes its interrupt from the timer (Street Fighter II) stops after loading. |
| `0007-aliens-save-state.patch` | Aliens driver: saves the CPU ROM bank, the work RAM / palette switch and the palette RAM, and maps the bank again on load. Also saves the K051960 sprite chip (RAM, registers, ROM bank, the 051937 pulse counter) and the K007232 sound chip (channels and registers). |
| `0008-soundlatch-save-state.patch` | Generic (`sndintrf.c`): saves the four sound latches, so a command the main CPU wrote and the sound CPU has not read yet survives a load. |
| `0009-namco-sound-save-state.patch` | The Namco wave sound chip (`namco.c`: Pac-Man, Pengo, Galaga and the other Namco boards) registered nothing: it saves every voice (frequency, counter, volumes, waveform, noise) and the sound enable, which Pac-Man writes once at boot, so a save loaded later kept the sound off. |
| `0010-ym3812-registers-save-state.patch` | The YM3812 (OPL2, `3812intf.c`: Snow Bros. and many Toaplan, Tecmo and Kaneko boards) saved nothing: its emulation keeps no save code. The interface keeps a copy of every register written and the address register, saves them, and writes them all back on load (the timers last), which restores the channels and starts the timers again; the sound CPU that waited for the timer goes on. |

Every patch touches its own files, so they can be sent upstream one by one. Every file the patches use `state_save_*` in includes `state.h` (without it newer compilers stop on the implicit declaration).

### Verified results

Two measurements, both on this Mac (Intel, macOS) with the user's own sets:

1. **The device's save probe** (`device roms saves --json`, the same code that decides per game whether a room resumes), run over the whole ROM folder (34 sets that pass `romcheck`) once with the official buildbot core and once with the core built from these 8 patches, each with its own temporary `HOME` so the real `~/go-link` was not touched.
2. **A stricter check** (a throwaway harness, not in the repository): boot the game, play it with the probe's coin/start pattern, save at frame 900, 2400 and 4200, and record the next 600 frames. Then boot a second board, load the save after one frame and record 600 frames. It counts frames whose picture is identical and compares the sound level second by second. A game saved whole gives 600/600 identical frames and the same sound level (the samples are never bit-exact: the sound stream's position inside a frame is not saved, so events start a few samples apart).

| Game | Official core (probe) | With the patches (probe) | Stricter check with the patches |
|---|---|---|---|
| The Simpsons (Konami CPU, K053260) | ❌ does not resume | ✅ resumes | ✅ 600/600 identical frames at all three save points, same sound level. Before 0004/0006: the picture was wrong for seconds and the sound Z80 hung waiting for the YM2151 timer B flag (music gone, sound at ~15%). |
| X-Men vs. Street Fighter (CPS2) | ❌ | ✅ | ✅ 598/600 frames, same sound level (before 0005: silent after 3000 samples) |
| Marvel Super Heroes (CPS2) | ❌ | ✅ | ✅ 598-599/600 frames, same sound level |
| Dungeons & Dragons: Shadow over Mystara (CPS2) | ❌ | ✅ | ✅ 598-600/600 frames, same sound level |
| Marvel vs. Capcom (CPS2) | ❌ | ✅ | ✅ 599-600/600 frames, same sound level |
| Cadillacs and Dinosaurs (CPS1 + QSound) | ❌ | ✅ | ✅ 599-600/600 frames, same sound level |
| Aliens (Konami CPU, K007232) | ❌ | ✅ | ⚠️ resumes with sound, but not exact: at 2 of 3 save points 150-190 of the 600 frames differ (every other frame: one sprite and a text line are one step off) and the sound is ~10% louder for 3 s. Before 0007/0008 the sound went silent a few seconds after loading. |
| Street Fighter II (CPS1, YM2151) | ❌ | ✅ | ⚠️ at frame 900: 591/600 frames, same sound level. At frame 2400 the sound is right but the attract fight takes another course (105/600 frames). Before 0006: the sound died (the Z80 takes its interrupt from the YM2151 timer). |
| Pac-Man (Namco wave chip) | ❌ | ✅ (0009) | Not run yet. |
| Snow Bros. (YM3812) | ❌ | ✅ (0010) | Not run yet. |
| Teenage Mutant Ninja Turtles, Ghouls'n Ghosts | ✅ (probe) | ✅ | Improved (checked at frame 2400): with the official core TMNT's sound fades to nothing after loading and Ghouls'n Ghosts' sound level is off; now 600/599 identical frames and the same sound level. |

The probe is weaker than the stricter check: it only fails a game whose sound drops to exactly zero or whose picture freezes. With the official core X-Men (`xmen`) passes the probe but does not really resume (0/600 identical frames at frame 2400, a steady hum instead of the music); with the patches it still passes the probe and is still broken at frame 2400 (silent instead of the hum), while a save at frame 900 is exact.

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

1. **Pull request upstream**, one patch at a time: the generic ones first (`0005`, `0006`, `0008`), then the drivers and chips (`0001`-`0004`, `0007`).
2. **Aliens is not exact yet.** After one frame the only differences are the sound CPU's registers and RAM, the YM2151 oscillator phases and a few bytes of main CPU RAM: something about *when* things happen inside a frame is lost (candidates: each CPU's local time and cycle count in `cpuexec.c`, the sound stream positions). The game plays on with sound, so the probe accepts it.
3. **X-Men (`xmen`)** does not resume from later saves (K054539 sound chip, 68000 + Z80); a save early in the attract mode is exact. Not investigated.
4. **The general cause is MAME 0.78's timers:** a pending MAME timer is not saved (0.78 has no timer save support). `0006` handles the YM2151 ones; other chips with MAME timers (YM2203/YM2608/YM2610 through `fm.c`, the 50 µs NMI kludge of The Simpsons' Z80, one-shot timers of many drivers) can lose an event if the save falls just before it fires.
5. **Other drivers with the same `init_eeprom_count` pattern** as The Simpsons (Konami boards with an EEPROM): a board that boots without NVRAM and loads a save within its first reads goes into the service mode. The device keeps the NVRAM, so this only matters for a first run.
6. **Other games that cannot be saved**, found by the probe: Midway (Mortal Kombat 1-3, NBA Jam, Cruis'n USA: the core refuses to save them) and Hammerin' Harry (Irem M72: its driver does not declare save support, so the probe sees an incomplete save), Shadow Dancer (they lose their sound). Pac-Man and Snow Bros. are fixed by `0009` and `0010` (2026-10-05). One by one, if worth it.
7. **Distributing the patched core** (if the pull request stalls): build it in CI for macOS, Linux and Windows, publish it in go-link's releases with its SHA-256, and have the device download it from there. This needs changing the "the core only comes from the buildbot" rule and reviewing the MAME license (non-commercial use).

How to measure: `device roms saves` (the whole library; it caches its verdicts per core in `go-link/cores/saves.json`, keyed by the hash in `mame2003_plus_libretro.dylib.sha256`: after copying a new core over by hand, delete both or it reports the old core's results), or `emulate --probe save|load` with `--core` pointing at the patched core. To keep the real `~/go-link` untouched, run `device roms saves` with a temporary `HOME` holding `go-link/cores/` (the patched core plus a copy of `mame2003_plus.romcheck`) and a temporary `--config`.
