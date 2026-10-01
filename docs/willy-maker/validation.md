# Willy Maker: validation

Willy Maker must not let a user export or play a game that is broken. A broken game would fail to load, show a black screen, freeze, or show the core's "wrong checksums" warning in a go-link room. The rule is simple: **if Willy Maker says a game is ready, it boots in the mame2003-plus core the same way it boots on the board.**

A browser cannot prove that alone. The checks are split into four levels. Each level is slower than the one before and closer to the real machine. A project moves to the next level only when the current one passes.

| Level | Where it runs | When | What it proves | Time |
|---|---|---|---|---|
| 1. Live rules | browser, `editor/validate/` (pure TS) | on every change | the project fits the board and the engine: budgets, colors, reachability, required pieces | < 50 ms |
| 2. Build checks | browser, `@go-link/cps1` + `io/` | on Export, Create ROM | the produced files are exactly what the set's loader expects, byte by byte | < 2 s |
| 3. Power-on in the browser | browser, a Web Worker with a 68000 in WebAssembly | on Create ROM | the 68000 program starts, draws and keeps running on a model of the board | ~1 s for 10 s of game |
| 4. Power-on on the device | the user's linked go-link device, the exact core | on **Create and play**, or **Test on my device** | the real core loads the set without warnings, shows a picture, plays sound and reacts to inputs | ~15 s |

Levels 1 and 2 are needed for Phase 1, because the AI pack must already be correct. Levels 3 and 4 come with Phase 2, when there is a ROM to start. Level 4 is the ground truth. When level 4 disagrees with level 3, level 4 wins, and the case is added to level 3 or level 2 as a new rule.

## Level 1: live rules

These run in `editor/validate/` on every project change. They are pure functions (`(project, board) => Issue[]`) and are tested with fixtures. Each issue has:

- an `id`;
- a severity:
  - **error**: blocks Export and Create ROM;
  - **warning**: the user can export, and the AI pack prompt lists every warning;
  - **info**: shown, never blocks;
- a message key in the module's i18n;
- a target: the layer, object, frame or tile that the **Go to** button opens.

Messages are listed here in English, as in `en.ts`. `es.ts` and `pt.ts` translate them.

**Built so far** (Export tab, 2026-10-01): level 1 is complete. `editor/validate/index.ts` (`reviewProject(project, { extra })`) runs every rule in the tables below; only the sound rules are **not applicable** yet, because a project has no sound data before Phase 2 (menus keep music references only), so they report nothing. Each rule gives one list entry: an `ok` line when it passes (for example "Sprite palettes: 13 of 32"), or an error, warning or info with **Go** (the level and place, the object selected; the Characters tab opened on the character; the Game or Menus tab) and, when the change is safe, **Fix**. Fixes run as one undoable edit (`applyFix`): `snap-colors` (palette and shirt colors to the board), `buttons` (the layout's default buttons), `players` (clamped), `level-order` (the play order rebuilt), `title` (accents dropped, letters the font lacks removed, cut to 24), `names` (repeated or invalid object names renamed), `tile-range` (cells past the end of their tileset cleared) and `pivots` (feet points moved inside their frames). Messages are in `i18n/export.{en,es,pt}.ts`, keyed by check. The Game and Menus tabs' rules (`editor/validate/game.ts`) join the same list through `editor/validate/extra.ts`.

Where each rule lives and how it decides:

- **Cheap rules run on every change**, synchronously: `index.ts` (game, levels, names, graphics, animations) and `art.ts`:
  - `level.trap`, `level.camera` and `level.timer` use `routes()` in `editor/reach.ts`: the same moves as the reachability flood, kept as a graph. A trap is a reached place from which no move sequence gets back to the exit. The camera search follows `engine/game.ts`: the camera aims a third of a screen ahead of the players, never goes back more than the level's `camera.backtrack` (48 px) from its farthest point, and players stay 12 px inside the screen, so a player may walk back about 164 px from the farthest x reached; a level whose only way to the exit goes back farther fails (only with `camera.forwardOnly`). The timer rule only speaks when a level has a `timer`: the shortest walk to the exit at walking speed (1 px per frame, ladders 1.5), plus half again for fights.
  - `gfx.tile-grid`: every tile layer on its board layer's grid (text 8, play 16, far and mid 32), with a tileset that exists and has tiles of that size, and no cell past the tileset's last tile (Fix: clear those cells). A tileset picture that is not cut into whole tiles fails in the picture checks.
  - `anim.pivot`: the feet point inside its frame (Fix: move it in); the feet line of ground animations (not jump, fall, climb, hurt…) is checked on the pixels.
  - `anim.size`: the idle frames' height (or the character's height) against the art spec's table by role: heroes 40-48 px, enemies 16-64, civilians 20-44, bosses 64-160.
  - `sprite.wrap`: the engine draws a sprite while its feet point is within 64 px of the screen, and sprite X wraps at 512, so any frame reaching more than 64 px left or right of its feet point shows up on the other side of the screen. Go opens the first object that uses the character (players' starts for heroes; enemies, civilians and bosses whose `kind` is the character's id), or the character.
  - `game.size`: the engine (64 KB, the prototype's program rounded up) plus the data the ROM carries (2 bytes per tile cell, 1 per collision cell, objects, palettes, frame tables, menu texts) against the set's program ROM.
- **Picture rules** (`pictures.ts`) read pixels in board colors, so they need the pictures from IndexedDB: `useReview` starts them 250 ms after the last change, on a copy of the project, in steps of about 8 ms between macrotasks (a Web Worker was not needed: the Buenos Aires template takes about 10 ms once its pictures are decoded, and decoded pictures are cached by hash). Until they finish, the review says "Checking the pictures…" and the AI pack waits; findings of the last run stay on the list meanwhile, and a failing picture rule replaces its rule's `ok` line (`mergeReview`). They are:
  - `gfx.colors-per-zone` per pixel: each background tile, with the far and middle layers drawn into one scroll3 tile as the AI pack does, and each 16 × 16 cell of every sprite frame, at most 15 colors plus transparency;
  - `gfx.unique-tiles`: different tiles per board layer over all levels, by their pixels (no flips), against the layer's budget: its tile codes and what the 6 MB graphics ROM holds at that size (scroll1 65,536, scroll2 49,152, scroll3 12,288). Warning from 85 %, error over the budget;
  - `gfx.tile-grid` for tileset pictures (whole tiles, enough of them for `count`);
  - `anim.pivot` for the feet line: in a ground animation, the lowest solid row of every frame, measured from its feet point, may differ by 2 px at most.

Rules added by the implementation, beyond the tables: `level.start` also warns when players 2-4 have no start (they join next to player 1) and refuses two starts for one player; `level.exit` warns about more than one exit; `level.object-reach` (warning) for civilians, pickups and checkpoints nobody reaches; `names.objects` / `names.ids` (error) for repeated or invalid reference names (letters, digits and `_`, up to 32) and repeated level, character or palette ids; `game.level-order` (error) when the play order does not match the levels; `game.hero` (info) when the game has no hero of its own; `anim.frames` (error) for an animation that lists a missing frame; `anim.sheet` (warning) for a character with frames and no picture. `level.width` also refuses a level smaller than the screen; `gfx.unique-tiles` is an error, not a warning, over the budget. Tests: `editor/validate/validate.test.tsx` and `rules.test.tsx`; the latter reads this file's level 1 tables and fails when a rule id has no fixture that makes it report (the sound rules are listed as not applicable there).

### Project and game

| id | Severity | Rule | Message |
|---|---|---|---|
| `game.no-levels` | error | at least one level | "Your game has no levels yet." |
| `game.players` | error | players are between 1 and the board's maximum (4) | "This board takes 1 to {max} players." |
| `game.buttons` | error | every action has a button, the board has enough buttons (3 for `slammast`, 2 for `captcomm`), and no two actions share one unless they are a combination | "{action} has no button." / "{a} and {b} use the same button." |
| `game.title` | error | the title is 1 to 24 characters in the 8×8 font's character set | "The title uses a letter the board's font does not have: {char}." |
| `game.menus` | warning | the title, game over and continue screens exist | "The {screen} screen is empty." |
| `game.size` | error | the program and data fit in the set's program space (2 MB for `slammast`) | "The game needs {used} of {max} for its program and levels." |

### Levels

| id | Severity | Rule | Message |
|---|---|---|---|
| `level.start` | error | there is exactly one P1 start, and starts for P2-P4 when the game has those players | "Level {n} has no start for player {p}." |
| `level.exit` | error | there is one exit | "Level {n} has no exit." |
| `level.reachable` | error | the exit can be reached from the start with the engine's moves: walk, jump of 64 px, push-climb of up to 32 px (`STEP_UP`), ladders, drop-through platforms. This is a flood fill over the collision grid using the same constants as `engine/`. | "Players cannot reach the exit from the start. The path stops at x {x}." |
| `level.ledge` | warning | every tagged platform can be reached (same search) | "Nobody can reach the ledge at x {x}: it is {h} px high." |
| `level.trap` | warning | no reachable spot lets the player fall out of the map or get stuck with no way forward | "A player can get stuck at x {x}." |
| `level.camera` | error | the camera can scroll through the level: no wall that blocks the screen, and a 48 px back margin | "The camera cannot pass x {x}." |
| `level.width` | error | the width is a multiple of the tile size and fits the scroll layer's map | "Level {n} is {w} px wide. The board's map allows up to {max}." |
| `level.objects` | error | every object has a known type and its required fields: enemy kind, civilian, weapon and ammunition | "This {type} needs a {field}." |
| `level.enemies-per-screen` | warning | no screen has more sprites than the board can show at once (the 256-entry sprite table, minus the HUD and players) | "Around x {x} there are {n} sprites on one screen. Some would flicker or vanish." |
| `level.timer` | info | the timer is long enough for the path length at walking speed | "The timer may be too short for this level." |

### Characters and graphics

| id | Severity | Rule | Message |
|---|---|---|---|
| `gfx.colors-per-zone` | error | each palette zone uses at most 15 colors plus transparency | "{zone} of {character} uses {n} colors. The maximum is 15." |
| `gfx.palettes` | error | sprite palettes ≤ 32, and background palettes ≤ 32 for each layer | "Sprites use {n} of 32 palettes." |
| `gfx.board-colors` | info | colors are snapped to the board's 12-bit colors (multiples of 17), with the average difference shown | "Colors were adjusted to the board. Average difference: {d}." |
| `gfx.tile-grid` | error | backgrounds line up with their layer's tile size (8, 16 or 32 px) | "{layer} is not on the {size} px grid." |
| `gfx.rom-space` | error | the converted graphics fit in the set's GFX ROM (6 MB for `slammast`) | "Graphics need {used} of {max}." |
| `gfx.unique-tiles` | warning | close to the tile budget of a layer | "{layer} uses {n} different tiles. It is close to the limit." |
| `anim.required` | error | every character has the animations its actions use: idle, walk, jump, and climb when the level has ladders | "{character} has no {anim} animation." |
| `anim.pivot` | warning | the feet line is the same in every frame of an animation | "{character}'s {anim} frames do not stand on the same line." |
| `anim.size` | warning | the frame height is within the scale table of [art-spec.md](../rom/art-spec.md) | "{character} is {h} px tall. The spec asks for {min} to {max}." |
| `sprite.wrap` | error | no sprite crosses the 512 px sprite space at the positions the engine can place it (a prototype bug) | "This object would wrap around the screen at x {x}." |

### Sound

Not applicable yet: a project has no sound data before Phase 2 (menus and levels keep music references only), so these rules report nothing.

| id | Severity | Rule | Message |
|---|---|---|---|
| `sound.size` | error | the sound program and its samples fit in their ROMs | "Sounds need {used} of {max}." |
| `sound.format` | error | imported samples convert to the board's format | "{file} cannot be used: {reason}." |

## Level 2: build checks

**Built so far** (2026-10-01): the AI pack's build check (below). The ROM checks in the table come with Create ROM (Phase 2).

### The AI pack (built)

`io/packCheck.ts` (`checkAiPack`) runs inside `buildAiPack` on the finished pack, read back from its own zip, before the download. It is pure (files in, problems out) and checks:

| id | Check |
|---|---|
| `pack.files` | `PROMPT.md`, `project.json`, `review.json` and the collision tileset are there; every pack path `PROMPT.md` names (`levels/…`, `characters/…/`, `tilesets/…`, `docs/<name>.md`) exists; every level has its `.tmj` and `collision.png`, every character its `sheet.json` |
| `pack.json` | `project.json` is a project (`migrateProject`), `review.json`, the maps and the sheets are valid JSON |
| `pack.maps` | each `.tmj`'s image layer and tileset pictures exist, with the sizes the map says; tile layers have width × height cells and use only tiles their tilesets have |
| `pack.png` | every PNG decodes, every solid pixel is a board color (each channel a multiple of 17), and alpha is 0 or 255 |
| `pack.sizes` | level pictures have the level's size, tileset pictures are cut into whole tiles of their size, the collision tileset is one row of 16 px tiles |
| `pack.sheets` | every animation strip exists and every `sheet.json` frame box lies inside its strip |

A failure is a Willy Maker bug: nothing is downloaded, and the Export tab shows "Something went wrong while building your AI pack…" with the report (`packReport`: the problems, the project id, board, format and browser) and **Copy the report**. The first run of this check found such a bug: a tileset whose picture was missing from the browser left its map pointing at a file that was not in the pack; a missing tileset is now a transparent picture of the right size, and `PROMPT.md` lists it as missing. Tests: `io/packCheck.test.tsx` (the sample and both templates pass; each check fails on a broken pack).

### The ROM (Phase 2)

These run after the set's files are produced, on the bytes themselves, in the same Worker that built them. Every check compares the output with the layout table in `@go-link/cps1` (the same table `rom/tools/build.mjs` uses). Any failure here is a Willy Maker bug, never a user error, so the message is "Something went wrong while building your ROM. It was not exported." and a report the user can copy into a bug.

| id | Check |
|---|---|
| `build.files` | the zip has exactly the set's file names, each with its exact size. No other files are allowed: the loader would ignore them, but they hide mistakes. |
| `build.crc` | each entry's CRC-32 in the zip matches its bytes |
| `build.vectors` | the program's reset vector points inside ROM and its stack pointer points to work RAM (`0xff0000`-`0xffffff`). The level 2 interrupt (vector 26) points to the vblank handler. |
| `build.swap` | the program files are stored word-swapped (`ROM_LOAD16_WORD_SWAP`). After un-swapping, the bytes equal the linked program. |
| `build.pitfall` | a static scan of the program finds no `move.w (aN)+,(d,aN,dN)` form that the core's 68000 runs wrongly (journal, steps 2 and 4). `build.mjs` already refuses it. The data-driven engine of Phase 2 is prebuilt, so this check protects engine releases. |
| `build.gfx` | decoding the GFX ROMs back with `cps1gfx` gives the same tiles that were encoded (round trip) |
| `build.kabuki` | decrypting the Z80 program with the set's Kabuki keys gives the plain sound program (round trip) |
| `build.palette` | every palette the data refers to exists, and index 15 of each palette is transparent where the engine expects it |
| `build.identity` | SHA-256 of **each inner file** is recorded. A zip's own hash changes with entry timestamps, so zips are compared by their inner files, never by the zip's hash. |

## Hard inputs (built)

A user can give Willy Maker any file, so every reader turns a bad one into a translated sentence, never a crash or a half-saved project:

- **Errors with codes** (`model/inputError.ts`): the zip reader, the project import, the Tiled import and the sprite sheet checks throw an `InputError` (`zip.not-zip`, `zip.damaged`, `project.newer` with both format numbers, `project.hash`, `tiled.grid`, `image.too-big`, `image.empty`, `file.too-big`…). The UI shows `inputErrors` from `i18n/core.*.ts` in the user's language; anything else reads "the file could not be read".
- **Projects**: `migrateProject` refuses more than 64 levels or a level beyond 65536 × 8192 px, and repairs or drops layers, objects, frames, animations, palettes and tilesets with wrong fields, so whatever loads works in the review, the exports and the engine. Format 1 projects are migrated. A `.zip` over 256 MB is refused before it is read.
- **Sprite sheets** (`sprites/sheetInput.ts`): over 32 MB, not a picture, wider or taller than 8192 px or over 16 million pixels (read from the PNG, GIF, JPEG or WebP header, before decoding), smaller than 8 px, or with nothing on it but background, each with its own message.
- **Tiled maps**: anything that is not a map of the right grid and size is `tiled.not-map`, `tiled.grid` or `tiled.too-big`; odd object names and properties are cleaned; files over 16 MB are refused.
- **Storage**: a full `localStorage` keeps the last good save and shows an alert in the editor (download the `.zip`, free space); an import or a new game that cannot be saved is not opened. IndexedDB writes are confirmed when they commit, and a failed one turns on the Characters screen's "pictures are not kept" warning.

Tests: `io/fuzz.test.tsx`, with a seeded generator (mulberry32) so a failure replays: 150 randomly damaged project zips, 300 random mutations of a `project.json` (each loaded project must pass through the review, the prompt, the Tiled export and 5 engine frames), a forged picture, huge sizes, a newer format, format 1, 400 damaged Tiled maps, sheet headers (huge, 1 × 1, transparent, flat color, random bytes), titles and object names with odd Unicode, five seeds of 120 random editor commands (strokes, stamps, moves, deletes, settings, fixes, undo and redo) undone back to the exact start, a full `localStorage` and an IndexedDB whose commits fail.

## Level 3: power-on in the browser

**Status (2026-10-01): not built.** It needs a ROM to start, so it comes with Create ROM in Phase 2. Option B below is the recommended design; its experiment ran outside the repository, and nothing of it is in go-link yet.

### Option A: the mame2003-plus core compiled to WebAssembly (rejected)

What we found (2026-10-01):

- The core's Makefile has a `platform=emscripten` target. libretro's web player serves a current build: `mame2003_plus_libretro.wasm` is **21.8 MB** (plus its JS glue), built as part of RetroArch's web player, not as a standalone core.
- That server sends no `Access-Control-Allow-Origin` header, so go-link's pages cannot load it from there. go-link's CSP (`script-src 'self'`) forbids third-party scripts anyway.
- **License.** mame2003-plus is under the MAME 0.78 non-commercial license:
  - binaries may be given out only with their source or a link to it;
  - the code "cannot be used in a commercial product";
  - derivative works must have a different name.

  go-link is MIT. Putting that code in go-link's repository, or serving a build from go-link.org, would add a non-commercial piece to an MIT project and make go-link a MAME distributor. The device avoids this today: it **downloads the core from libretro's buildbot** at the user's request and never bundles it. A web build would need the same arrangement, and nobody serves one with CORS.
- Even if allowed, 21.8 MB per visit is too heavy for a check that runs before every play.

**Decision: go-link does not host or load the MAME core in the browser.** The exact core runs only on the device (level 4), where the user downloaded it.

### Option B: our own board model with Musashi (recommended)

[Musashi](https://github.com/kstenerud/Musashi) is the 68000 emulator by Karl Stenerud, under the **MIT license**. MAME 0.78 itself uses an older version of it for this CPU (`src/cpu/m68000/m68kcpu.c`, version 3.4 in the core). Willy Maker can ship it in its own WebAssembly file next to a **minimal CPS-1 model** written for this purpose. The model has:

- the 68000 memory map of the chosen set: program ROM, work RAM `0xff0000`, graphics RAM `0x900000`-`0x92ffff`, CPS-A/CPS-B registers at `0x800100`, inputs and the sound latch. Any other address counts as an **unmapped access**.
- a frame loop: 10 MHz / 60 cycles per frame, then the level 2 interrupt (vblank).
- inputs from a script: press Coin and Start, hold right, press each button.
- no Z80, no QSound and no picture pipeline. The sound program is checked at level 2 (round trip) and at level 4 (real audio).

Experiment, in a scratch folder outside the repo: Musashi with this model in C, running `rom/build/obj/program.bin` from the prototype:

```
program 23168 bytes, 600 frames
pc=0004c6 sp=ffefb4 (stack in work RAM: yes)
palette writes 626 (first frame 9), sprite table writes 67768 (first frame 9), board regs 4734
unmapped accesses 0, ROM writes 0, frames since last sprite write 0
```

10 s of game took **0.13 s** of CPU. Three broken programs were made from it, and every one was caught:

| Fault | What the model reported |
|---|---|
| `ILLEGAL` at the reset entry | PC stuck in `default_handler` (the error vector), no palette or sprite writes |
| `jmp` to an unmapped address | 741,838 unmapped accesses, no video |
| an endless loop before video starts | no palette or sprite writes in 120 frames |

The native build has about 520 KB of code, including the disassembler and a soft-float library that a 68000 does not need. A trimmed WebAssembly build is expected around 200-300 KB (about 100 KB compressed). It runs in a Worker, so the page never freezes.

The model can also **draw the frame**: graphics RAM, palettes and the sprite table go through the same `@go-link/cps1` decoders that build the ROM. The Export screen shows "what the board drew at second 3" next to play mode's picture of the same moment, which catches wrong palettes or tiles before the device is involved.

### Level 3 checks (the "boots" criteria)

All of them run with the inputs script, over 600 frames (10 s):

| id | Pass when |
|---|---|
| `boot.no-exception` | PC never enters the error handler. No illegal opcode, address error or bus error. |
| `boot.mapped` | zero unmapped accesses and zero writes to ROM |
| `boot.stack` | SP stays inside work RAM for all frames, and never comes within 256 bytes of the program's own variables (`_bss_end` in the map) |
| `boot.video-starts` | palettes and the sprite table are written before frame 60 (the prototype does it at frame 9) |
| `boot.alive` | the sprite table changes at least once every 30 frames until the end (the game loop keeps running, nothing hangs) |
| `boot.vblank` | the vblank handler runs once per frame. It returns before the next interrupt in at least 99 % of frames (no slowdown). |
| `boot.inputs` | after Coin and Start, the program reaches the game state: the engine's state byte, read from the map, changes. Holding right moves P1's x. |
| `boot.sound-cmd` | the program writes the sound latch at least once (title music) |

## Level 4: power-on on the device

**Status (2026-10-01): not built**, Phase 2. The protocol below is a proposal; nothing of it exists in the device yet. **Open decision:** the device's allow-list of go-link-made sets by the SHA-256 of their inner files (see Safety), needed before a Willy Maker game can open a room for guests.

This is the only level that uses the exact core, so it is the only one that proves a game boots in go-link. It reuses what exists:

- the `files` DataChannel, to send the zip;
- the `device emulate` worker, which already runs a set at its own fps in a child process;
- the framelab capture logic (`cmd/framelab`: frames and the core's log with `-log`), to collect evidence.

### Protocol (proposal)

Only the **linked owner** may use it, the same peers that may upload ROMs (`StreamService.SetLinkGate`). Room guests never can.

1. The web uploads the zip on `files` with a purpose:

   ```
   text   {"type":"begin","id":"t1","name":"slammast.zip","size":2215330,"purpose":"rom_test"}
   binary chunks
   text   {"type":"end","id":"t1"}
   ```

   With `purpose: "rom_test"` the device does **not** import the file into the library. It writes it to `~/go-link/tmp/romtest/t1/slammast.zip` (0600) instead, with a 16 MB cap. It answers `upload_result` as usual. A test set therefore never collides with a real `slammast.zip` in the user's ROM folder, and never shows up in the game list.

2. The web asks for the test on `control`:

   ```json
   {"type":"rom_test","id":"t1","frames":900,
    "expect":{"files":{"mbe_23e.rom":"<sha256>","...":"..."}},
    "script":[{"at":300,"press":["coin1"]},{"at":330,"press":["start1"]},
              {"at":420,"hold":["right"],"for":60},{"at":500,"press":["b1"]}],
    "snapshots":[120,450,880]}
   ```

3. The device runs it in a child process, `device romtest` (the same core loading as `device emulate`, with no streaming and no room). It uses the test folder as the only ROM path, a separate empty system and save folder, a 60 s wall-clock limit, and one test at a time per device. It replies:

   ```json
   {"type":"rom_test_result","id":"t1","ok":true,
    "checks":[{"id":"core.loaded","ok":true},
              {"id":"core.no-warnings","ok":true},
              {"id":"files.identity","ok":true},
              {"id":"video.picture","ok":true,"detail":"first non-black frame 11"},
              {"id":"video.alive","ok":true},
              {"id":"audio.signal","ok":true,"detail":"rms -18 dBFS from frame 300"},
              {"id":"input.reacts","ok":true},
              {"id":"time.realtime","ok":true,"detail":"900 frames in 3.1 s"}],
    "snapshots":["data:image/png;base64,...","...","..."],
    "log":"(the last 4 KB of the core's log)"}
   ```

4. The device deletes `~/go-link/tmp/romtest/t1/` when the test ends, and also at startup.

`rom_test` / `rom_test_result` are added to `docs/protocol.md`, and the `upload` `purpose` field to its files section, when this is built. The CLI gets the same feature for a headless device: `device rom test <zip> [--frames N] [--out DIR]`.

### Level 4 checks

| id | Pass when |
|---|---|
| `core.loaded` | the core loads the set (`retro_load_game` returns true) |
| `core.no-warnings` | the core's log has no "WRONG CHECKSUMS", "NOT FOUND" or "INCORRECT LENGTH" for any file. The 0.78 loader accepts a matching name with a wrong CRC, but it then shows a 180-frame warning on screen, which players would see. |
| `files.identity` | the SHA-256 of every inner file the device received equals `expect.files`. Hashes are compared per inner file, never per zip. |
| `video.picture` | a non-black frame before frame 120, at the set's resolution (384×224) |
| `video.alive` | at least 20 distinct frames in each 300-frame window (no freeze) |
| `audio.signal` | after the title starts, audio is not pure silence. Audio packets of about 3 bytes mean the core is feeding silence. |
| `input.reacts` | the frames after each scripted press differ from a run without it. The device runs the script twice, with and without inputs, both from power-on. |
| `time.realtime` | the core runs faster than real time on this device, so a room will not slow down |

The result appears in Willy Maker's Export screen as the same checklist, with the three snapshots. **Create and play** opens a room only when every check passes.

### Safety

- Only the linked owner, proven by the link token, can send `rom_test`. It runs a ROM the owner made on the owner's own device, which is the same trust as uploading a ROM today.
- The old core is not a sandbox. A crafted set could try to exploit it, which is why tests run in a **child process** with a time limit, a separate folder, and no access to the room's sockets. The child already exists for every game room (`device emulate`).
- The test folder is never the library: no import, no overwrite, no game list entry, and it is deleted after the test.
- Production sets: before Willy Maker games can open rooms for guests, the device needs an allow-list of go-link-made sets by the SHA-256 of their inner files. These sets reuse a real set's file names, so `romcheck` would otherwise see them as a broken real set. This is an open decision, tracked with Phase 2.

## Testing the validator itself

| Layer | Tool | What |
|---|---|---|
| Level 1 rules | Vitest, `editor/validate/*.test.tsx` | one passing and one failing fixture per rule id. `rules.test.tsx` lists every rule id of this file's level 1 tables and fails if any has no fixture (sound: not applicable yet); the i18n shape tests fail when a message is missing in `en`, `es` or `pt`. (Built.) |
| Level 1 reachability | Vitest + `engine/` | the reachability search agrees with play mode: a bot replays the found path in the engine and reaches the exit |
| Level 2, AI pack | Vitest | `io/packCheck.test.tsx`: the sample and both templates pass, each check fails on a broken pack, and the Export tab refuses the download with the report. (Built.) |
| Hard inputs | Vitest | `io/fuzz.test.tsx`: seeded damaged zips, project files, Tiled maps, sheets, names and editor command sequences. (Built.) |
| Level 2 | Vitest + Node | the template project builds byte-identical inner files to `rom/tools/build.mjs`, compared per inner file, plus every round trip (gfx, Kabuki, swap) |
| Level 3 | Vitest + Node (the same WebAssembly) | the prototype program passes every `boot.*` check, and the three fault programs above fail the expected check |
| Level 4 | Go tests in `backend-device` | the protocol and the folder rules use a fake core. A test with the real core runs only when `~/go-link/cores/mame2003_plus_libretro.*` exists, because CI does not download the core. |
| End to end, the editor | Playwright, `e2e/tests/willy-maker.spec.ts` | creates a Buenos Aires game, paints, places an object, plays until the clock moves, undoes, reloads (autosave) and downloads both zips, checking their files. It needs only the website: run alone (`cd e2e && npx playwright test tests/willy-maker.spec.ts`) it starts no signalhub or device. (Built.) |
| End to end | Playwright (`e2e/`) | open Willy Maker, break a project (17-color torso, unreachable ledge, no exit) and check that Export is blocked with **Go to** working. Fix it, export, and run **Test on my device** against the e2e device stack. That step is skipped when the core is missing. |

## Open questions

- **Open decision:** the allow-list for go-link-made sets on the device, by the SHA-256 of their inner files (see Safety), and whether those games use their own set name in a future core build.
- Whether level 3 also models the Z80 to check that the sound program answers the latch. Level 4 covers it today.
