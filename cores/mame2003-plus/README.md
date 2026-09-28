# Patches for the mame2003-plus core

go-link uses the [mame2003-plus](https://github.com/libretro/mame2003-plus-libretro) core (MAME 0.78). Some parts of that MAME are not stored in a save state, so those games cannot resume where they stopped:

| Patch | What it fixes |
|---|---|
| `0001-konami-cpu-save-state.patch` | The Konami CPU had its save code disabled (`#if 0`) and an empty `konami_init()`: after loading a save the CPU kept garbage registers and the game crashed. It registers its registers the way the M6809 does. |
| `0002-qsound-save-state.patch` | The QSound sound chip did not register its state. It registers the 16 channels and the data latch. |
| `0003-cps-qsound-z80-bank-save-state.patch` | The sound Z80 of QSound games (CPS1 and CPS2) switches ROM banks, and the bank was not saved. It saves it and restores it on load. |

### Verified results (with `device roms saves` and 20 s before/after loading)

| Game | Official core | With the patches |
|---|---|---|
| Aliens (Konami CPU) | crashes and resets | ✅ resumes: picture and sound continue as if never loaded |
| Cadillacs and Dinosaurs (CPS1 + QSound) | stays silent | ✅ resumes with sound |
| The Simpsons (Konami CPU) | loops in its RAM/ROM check | ⚠️ sometimes resumes, sometimes freezes: the driver also switches banks (CPU ROM, video, sound) that MAME 0.78 does not save. Needs a patch to the `simpsons` driver. |
| X-Men vs. SF, Marvel Super Heroes, D&D (CPS2 + QSound) | stays silent | ⚠️ resumes almost silent: CPS2 misses something else on its sound path |
| Marvel vs. Capcom (CPS2 + QSound) | intermittent sound | ⚠️ intermittent sound |

The device does not rely on this table: its save probe (`services.ProbeSaves`) decides per game and per core version. With the official core, all these games are marked as "cannot be saved".

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

None of this is used yet: the device downloads the official core from the buildbot, and these patches were only built for testing.

1. **Pull request upstream** with `0001`, `0002` and `0003` (what is verified: Aliens and the CPS1 QSound games).
2. **The Simpsons:** besides the CPU, the `simpsons` driver (`src/machine/simpsons_machine.c`) switches banks that are not saved: `simpsons_banking` (CPU ROM, through `konami_cpu_setlines_callback`), `simpsons_video_banking` and the sound bank. Those values must be saved and reapplied in a `postload`, as `0003` does for the QSound Z80. The K053260 chip should be checked too.
3. **CPS2 (X-Men vs. SF, Marvel Super Heroes, D&D, Marvel vs. Capcom):** with `0002` and `0003` the sound is still almost silent after loading. The Z80 RAM (`c000-ffff`) and its bank are already saved; something else on the 68000 → Z80 → QSound path is left out (timers, sound driver state).
4. **Other games that cannot be saved**, found by the probe: Midway (Mortal Kombat 1-3, NBA Jam, Cruis'n USA: the core refuses to save them), Pac-Man, Street Fighter II, Snow Bros., Hammerin' Harry (they lose their sound). One by one, if worth it.
5. **Distributing the patched core** (if the pull request stalls): build it in CI for macOS, Linux and Windows, publish it in go-link's releases with its SHA-256, and have the device download it from there. This needs changing the "the core only comes from the buildbot" rule and reviewing the MAME license (non-commercial use).

How to measure: `device roms saves` (the whole library), or `emulate --probe save|load` with `--core` pointing at the patched core.
