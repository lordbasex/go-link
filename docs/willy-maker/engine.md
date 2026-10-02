# Willy Maker: the engine and Create ROM (stage 2)

Stage 2 of [Willy Maker](README.md#phase-2-create-rom-in-the-browser): a game made in the browser becomes a ROM set without compiling anything. The ROM prototype's 68000 program (`rom/src/main.c`) was turned into a **data-driven engine** that is built once and shipped with the site; **Create ROM** packs the game as data next to it, lays out the `slammast` set's files and powers the result on at once.

It was built in [experiment 1, case C](../experiments/README.md) (records in [`docs/experiments/case-c/`](../experiments/case-c/)), and the Game Spec v1 level made with it in a recorded browser session passes every automatic test of the experiment (validation levels 3 and 4, the scripted clear, the same pixels on the real core).

| Piece | Where | What it does |
|---|---|---|
| The engine | [`rom/engine/engine.c`](../../rom/engine/engine.c) | The prototype's rules reading the game from a data block |
| The data format | [`rom/engine/wmdata.h`](../../rom/engine/wmdata.h) | `struct wm_data` at 0x100000, checked at compile time |
| The engine build | [`rom/tools/engine.mjs`](../../rom/tools/engine.mjs) | Builds it once into `frontend/apps/web/public/willy-maker/engine/` (`engine.bin`, `engine.json`); `--check` rebuilds and compares |
| The packer | `frontend/apps/web/src/willy-maker/rom/pack.ts` | The project to the set's files (pure, tested) |
| The players' looks | `rom/looks.ts` | The game's own heroes cut into the engine's sprite records |
| Create ROM | `rom/createRom.ts`, `ui/organisms/CreateRomCard.tsx` | Loads the engine, the tile pictures and the heroes' pictures, packs, zips, runs the power-on test |
| The rules | `engine/rules.ts` (`GameRules`), the Game tab's **Rules** card | The numbers play mode and the ROM share |

## How a ROM is made

```
 project (levels, tiles, objects, heroes, texts, rules) engine.bin (prebuilt)
                │                                       │       │        │
            pack.ts ──► wm_data (data block)        program  sprites   Z80
                │            │                          │       │        │
                │            ▼                          ▼       │        │
                │   68000 space: engine at 0, data at 0x100000  │        │
                │            │  splitProgram                    │        │
                ▼            ▼                                  ▼        ▼
   font + level tiles   ──► graphics region (GfxRegion) ◄── sprite tiles   Kabuki (encodeOpcodes)
   + the heroes' tiles
                             │ split                                     │
                             ▼                                           ▼
                 mbe_*.rom, mb_gfx*.rom, mb_*.bin, mb_qa.rom, mb_q1-8.bin ──► slammast.zip (fixed dates)
                                                                              │
                                                       power-on test (level 3), Download, Play on my go-link (level 4)
```

1. **The engine** (`engine.bin`, fetched once, its SHA-256 checked against `engine.json`): the 68000 program, the engine's own sprite tiles (Willy, three recruit shirts, the woman and the child, the Lag android, the bullet and the rocket) and the plain Z80 sound program.
2. **The pictures**: each tileset's PNG and the saved picture of each hero a player uses, from the browser's asset store, decoded in JavaScript (`io/png.ts`).
3. **Pack** (`packGame`): the data block, the font and its double size, the sprites, the players' own heroes ([looks](#the-players-looks)), the play layer's 16 px tiles and the far layer's 32 px tiles in the board's graphics format (`@go-link/cps1` `GfxRegion`), the program space split into the program files (`splitProgram`), the Z80 program encrypted for the QSound board (`encodeOpcodes`, the `slammast` keys), silent samples.
4. **Zip** (`zipSet`): every file with a fixed date, sorted: the same game always gives the same `.zip` byte for byte (the recorded session made three identical zips).
5. **Power-on test** (validation level 3) runs on it at once in its Worker, with its picture. Then **Download ROM**, **Symbol map** (`symbols.json`, the engine's symbols: the harness reads the game's state through it) and **Play on my go-link** (the same zip on the linked device's real core, validation level 4).

Nothing is uploaded except by **Play on my go-link**, and only to the user's own device.

## The data block (`wm_data`)

Big-endian (the 68000's order), at **0x100000**, the second half of the 2 MB program space; the engine ends well before it (about 26 KB). Pointers are absolute 68000 addresses. `wmdata.h` checks every offset at compile time and `rom/rom.test.tsx` checks the same offsets in a packed game.

| Offset | Field | Meaning |
|---|---|---|
| 00 | `magic`, `version`, `size` | `WMD1`, 4, 0x84 |
| 08 | `players`, `flags` | the most players at once (1-4); `0x0001` free play, `0x0002` crates climbed by pushing (else by jumping), `0x0004` Start on a port past the players shows "nP COMING SOON", `0x0008` the double jump, `0x0010` the jet pack ([moves.md](moves.md)) |
| 0c | `level_w`, `level_h`, `cols`, `rows` | px, and 16 px cells |
| 14 | `far_cols`, `far_rows` | 32 px cells |
| 18 | `tags` | `u8[cols × rows]`: Willy Maker's collision tags (0 air, 1 solid, 2 one-way, 3 ladder, 4 crate, 5 breakable, 6 hazard, 7 water) |
| 1c | `play` | `u16[cols × rows]`: the play layer's tile codes |
| 20 | `far` | `u16[far_cols × far_rows]`: the far layer's tile codes |
| 24 | `palettes` | `u16[16 × (n_play_pals + n_far_pals)]`: the play layer's palettes, then the far layer's (CPS-1 words, 15 colors and a pad word each) |
| 28 | `objects` | 12-byte objects: the enemies, then the civilians, the crates, the pickups |
| 2c | `texts` | the screens' text lines (below) |
| 30 | `n_enemies`, `n_civs`, `n_crates`, `n_pickups` | at most 16, 8, 32, 16 |
| 38 | `start_x[4]`, `start_y[4]` | each player's start (-1 for none) |
| 48 | `exit_x`, `exit_y`, `exit_w`, `exit_h` | the exit zone; `exit_w` 0 = no exit |
| 50 | `slots[4]` | Willy's shirt for each player drawn as Willy: 0 his own, 1-3 a recruit's |
| 58 | `bg_color`, `backtrack` | the color behind every layer; how far the camera may go back |
| 5c | `rules` | 16 bytes: energy, enemy hits, touch hurts, chase, shoot, exit needs every enemy down, respawn on hurt, the run window; blink frames, enemy, rescue and crate points |
| 6c | `title` | the game's title (for the record) |
| 70 | `looks` | `u32[4]`, one per player: 0 = Willy with that player's shirt, else a `wm_look` ([below](#the-players-looks)); `looks` itself is 0 when every player is Willy |
| 74 | `n_play_pals`, `n_far_pals` | palettes loaded into each layer's bank (1-32): scroll2's palettes 64-95 for the play layer, scroll3's 96-127 for the far layer |
| 78 | `play_pal` | `u8[n_play_codes]`: the palette (within the play layer's bank) of play tile code 0x4000 + i ([below](#layer-palettes)); 0 when no tile is used |
| 7c | `far_pal` | `u8[n_far_codes]`: the same for far tile code 0x0800 + i |
| 80 | `n_play_codes`, `n_far_codes` | the tables' lengths: codes past them (the empty tiles, the exit door) use palette 0 |

### Layer palettes

A layer may use **up to 32 palettes of 15 colors, chosen per tile**, as the CPS-1's own games do (task T-28: a picture imported as a background spreads its colors over them). A tileset lists its palettes (`palettes`) and each tile's one (`tilePalettes`, [file-format.md](file-format.md)). Create ROM loads, per layer, the tileset's first palette (always: slot 0, the exit door's colors and the far layer's backdrop color) and every other palette a tile used by the level names, each once, in the tileset's order; at power-on the engine copies them into the layer's bank. Since a tile number always has the same palette, the palette of each tile code goes in a per-layer table (`play_pal`, `far_pal`, one byte per code) instead of an attribute per cell: the engine writes it into the attribute word's low 5 bits as it streams each column (`load_col2`, `load_col3`). A layer that needs more than 32 palettes gets a Create ROM note (`layerPalettes`): the tiles of the palettes past 32 take the kept palette closest to their colors.

**Objects** (`x, y, a, b, c, d`, s16): an enemy is `x, feet y, patrol min, patrol max, hits (0 = the rules'), facing`; a civilian `x, feet y, child`; a crate `col, row, size in cells, hits (0 = never breaks from shots), contents (1 bazooka, 2 health)`; a pickup `x, feet y, item`.

**Text lines**: `screen, row, col, attr, length`, the characters, padded to an even length; `0xff` ends the table. Screens: 0 title, 1 HUD, 2 clear, 3 continue, 4 game over, 5 the HUD's join prompt, 6 the ammo label, 7 the insert-coin prompt. `attr`: ink (0 accent, 1 white, 2 cyan, 3 red), `0x10` double size, `0x20` a count follows (rescued), `0x40` blinks (the title's prompt). The lines come from the Menus tab (`game/menus.ts` `screenLines`), so the ROM puts each text where the preview shows it.

## The graphics region

| Codes | Size | What |
|---|---|---|
| 0x21-0x5f | 8 × 8 | the board font (`@go-link/cps1` `font.ts`), tile code = ASCII |
| 0x80 + 4 × (char − 0x21) + q | 8 × 8 | the double-size font: each glyph's four quarters |
| 0x0200 | 32 × 32 | empty (pen 15) |
| 0x0400 | 16 × 16 | empty (pen 15) |
| 0x0800 + n − 1 | 32 × 32 | the far layer's tileset, tile n |
| 0x1000 … | 16 × 16 | the engine's sprites (`engine.json` `sprites`, 290 tiles today: up to 0x1121) |
| after them … 0x1fff | 16 × 16 | the players' own heroes' tiles, deduplicated (about 3800 tiles of room) |
| 0x4000 + n − 1 | 16 × 16 | the play layer's tileset, tile n |

Only the tiles a level uses are written. A tile's pixels become pens of its own palette (`tilePalettes`, [above](#layer-palettes); the tileset's first when it has none), exact colors, the nearest otherwise; transparent pixels pen 15.

## The engine

The prototype's code, generalized: the same physics (gravity 6/16 px per frame², a −7 px per frame jump, 32 px crates jumped onto or, with the push rule, pushed up, ladders at 1.5 px per frame, down + jump through one-way ledges, the double-tap run), the machine gun and the automatic knife, the bazooka from pickups and crates, the forward-only camera with its back margin. What changed:

- **Everything is read from `wm_data`**: the level, its tiles and palettes, the objects, each player's look (Willy or one of the game's own heroes), the texts and the rules. Without a valid block it shows "NO GAME DATA" instead of crashing.
- **Tile columns are streamed**: the board's tilemaps are 64 columns wide (1024 px of 16 px tiles, 2048 px of 32 px tiles), so the engine writes the columns around the camera as it moves (and a broken crate's columns from the collision map in RAM). Levels up to 24 576 cells of 16 px and 1024 px tall fit (the 8192 × 672 Buenos Aires canvas does).
- **Up to 4 players** on the ports `slammast` wires (P3 and P4 at 0xf1c000/2, their button 3 in the P1/P2 word). Start on a port past the game's players shows "3P COMING SOON" (or 4P) for 2 s, or nothing with that rule; it never takes a credit.
- **Opposite directions cancel**: left with right, and up with down, held together count as neither, as the mame2003-plus core delivers them, so the board model and the core give the same frames (experiment 1, J-17).
- **Crates**: a crate breaks after its hits, and the crates resting on it with nothing else under them break too, so none is left hanging over the floor (experiment 1, J-03). A crate whose object is not breakable stops shots and never breaks from them.
- **Energy and game over**: a player takes as many hits as the board's lives; a hit blinks the player (and, with the rule, brings them back near the camera's left); at no energy a credit and Start bring them back, and with every player out and no credit the game shows the Game over screen and returns to the title. With a credit left, the Continue screen counts down from 9.
- **The exit** clears the section when a player stands in its zone (and, with the rule, every enemy is down); the HUD's Level clear text shows, then the title. Create ROM draws a door on it (`engine/door.ts`, in the play layer's own colors, over empty cells), as play mode does. With the rule, the HUD shows `ENEMY n` (the enemies left) and reaching the exit early shows "DEFEAT EVERY ENEMY" (experiment 1, J-11 and J-13).
- **The lab state** (`rom/src/lab_state.h`) is filled every frame, as in the prototype, so experiment 1's harness and its players read any Willy Maker game.

## The players' looks

A player whose slot (the Game tab's players, `settings.playerSlots`) is one of the game's own heroes is drawn with that hero's art instead of Willy's. Only the slots of the game's players count (a 2-player game packs slots 1 and 2), and each hero is packed once however many players use it.

- **The picture**: the hero's saved picture (`sheet`), the 1:1 atlas the Characters screen made with its colors already fitted to the zone palettes ([file-format.md](file-format.md)). Nothing is converted again.
- **The tiles**: each frame is cut into 16 × 16 sprite tiles from the feet up (the last tile row ends on the frame's bottom row, as `rom/tools/art.mjs` cuts Willy), so each tile row is one palette zone and each tile gets that zone's palette. A pixel takes its zone palette's pen (the exact color, else the nearest); transparent pixels are pen 15. Empty tiles and frames with no pixels are left out, and identical tiles are written once. They go after the engine's own sprites, up to 0x1fff, where the far layer's tiles start.
- **The palettes**: every zone palette of the hero, loaded at power-on into free sprite palettes, one run per hero. The engine's art takes palettes 0-24 (`engine.json` `spritePalettes`): Willy's 4, three recruit shirts of 4 each, the civilians, the android, the bullet and the rocket. Free are 25-31 (7) and the 4 of each recruit shirt no Willy of the game wears.
- **The animations**: the engine's six, each from the hero's first animation that has frames: idle ← `idle` (else `walk`, `run` or any); run ← `run`, `walk`, idle; jump ← `jump`, idle; knife ← `knife`, `melee`, `shoot`, `fire`, idle; gun ← `shoot` (the Characters tab's name), `fire`, `machine_gun`, idle; bazooka ← `bazooka`, `special`, `shoot`, `fire`, idle. The engine picks frames as for Willy: the jump frame by the vertical speed (and its second frame while climbing), the knife frame by the stab's time, the others at the animation's own fps (1-60).

The data: `looks` points to four `u32`, one per player. A look is the engine's own records, written by the packer in the 68000's layout (big-endian, 2-byte alignment, checked with `_Static_assert` in `wmdata.h`):

| Record | Bytes | Fields |
|---|---|---|
| `Tile` | 6 | `code` (u16), `dx`, `dy`, `pal` (u8, relative to the look's first palette), one pad byte |
| `Frame` | 10 | `tiles` (pointer), `count`, `w` (u8, the box's width), `ax`, `ay` (s16, the feet from the box's top left) |
| `Anim` | 8 | `frames` (pointer), `count`, `fps` (u16) |
| `wm_look` | 68 (0x44) | `idle`, `run`, `jump`, `knife`, `gun`, `bazooka`, then the moves of [moves.md](moves.md) `crouch`, `crawl`, `land`, `turn`, `kick`, `thumbs`, `victory`, `yawn`, `double_jump`, `jetpack` (pointers to `Anim`, each from the hero's animation of that name or its fallback), `pal` (the first sprite palette), `npal`; then `npal` × 16 palette words. Willy's built-in look has `turn`, `jump_kick`, `crouch`, `crawl`, `yawn` and `thumbs_up` from his sprite sheet (idle stands in for land, thumbs up for victory, the jump for the air moves) |

**Limits**, each with a Create ROM note when a hero does not fit (that player is then drawn as Willy): a picture is needed; a frame takes at most 32 tiles and 15 across (240 px); every zone needs its palette; the hero's palettes must fit one free run; the tiles must fit the room left. A shirt variant on a player who uses an own hero is noted too: every player using that hero wears its own colors.

## Rules (the Game tab)

`settings.rules` holds only what a game changed; the defaults are the prototype's, except how crates are climbed (by jumping since experiment 1's verdict, T-07; a game that wants the prototype's push picks it). Play mode reads the same rules (`Game` option `rules`), so what is tried while building is what the ROM does.

| Rule | Default | Game Spec v1 |
|---|---|---|
| Hits an enemy takes | 4 | 3 |
| Points per enemy / rescue / crate | 500 / 1000 / 100 | 100 / 500 / 100 |
| Touching an enemy hurts | no | yes |
| Enemies chase players | yes | no (they keep their patrol) |
| Enemies shoot | yes | no |
| The exit needs every enemy down | no | yes |
| After a hit | back near the camera | blink in place |
| Blinking after a hit | 120 frames | 60 frames (1 s) |
| Climbing a 32 px crate | by jumping | by walking into it (push) |
| Start on a port with no player | shows "coming soon" | shows "coming soon" |

## What the ROM leaves out for now

Create ROM lists these as notes under its result; none of them stops it.

- Only the **first level** in play order goes into the ROM.
- Every **enemy kind** is drawn as the Lag android, and the civilians as the prototype's woman and child: the engine carries the prototype's art for them. The players' own heroes are drawn ([looks](#the-players-looks)); a hero's **shirt variants** are not (every player using it wears its own colors).
- **Bosses, camera locks and checkpoints** are left out; **water** plays as air; civilians trapped in crates start free; crates and pickups give only the bazooka and health.
- The **mid layer** and extra tile layers are left out (the board has one far layer); each layer loads the palettes its tiles use, up to 32 ([layer palettes](#layer-palettes)).
- **Sound**: the Z80 program is the prototype's silent one.
- The ROM is always laid out as `slammast` (a `captcomm` game is noted).
- **Play on my go-link** powers the set on with the real core of the linked device (validation level 4); opening a room with it needs the device to accept a user's own set under its own identity, which is not built yet.

## Building and checking the engine

```sh
brew install m68k-elf-binutils m68k-elf-gcc z80asm   # rom/README.md
node rom/tools/engine.mjs           # after changing rom/engine or the art: rewrites public/willy-maker/engine/
node rom/tools/engine.mjs --check   # fails when the committed engine is not this source's build
cd frontend && npx vitest run apps/web/src/willy-maker/rom   # packs Game Spec v1, powers it on
WM_ROM_OUT=/tmp/wm npx vitest run apps/web/src/willy-maker/rom/rom.test.tsx   # also writes the zip and symbols.json (and hero/, palettes/)
```

`rom/tools/art.mjs` gained two options for it (`level: false`, `recruits`); the prototype's 28 files stay byte for byte the same.
