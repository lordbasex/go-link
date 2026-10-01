# Willy Maker

**Willy Maker** is a tool on go-link's website (**Tools › Willy Maker**, at `/tools/willy-maker`) for making arcade games for go-link visually: draw a level, drop in characters, test-play it in the browser at once, and turn it into a ROM that runs in MAME and in a go-link room.

It takes the idea of a game maker, where you build and play at the same time with instant tries, and applies it to real arcade hardware. The design, names, art, icons and sounds are all go-link's own. Nothing is taken from any other game maker.

This page is the source of truth before any code is written. More detail lives in:

- [architecture.md](architecture.md): the module, its layers and what it shares with `rom/`.
- [file-format.md](file-format.md): the project file, the `.zip` layout, the AI pack and its prompt.

Willy Maker builds on the ROM project:

- [docs/rom/README.md](../rom/README.md): why CPS-1 and how the core runs our sets.
- [art-spec.md](../rom/art-spec.md): sizes, colors, grid, collision tags and objects.
- [hardware.md](../rom/hardware.md): the board's real limits.
- [journal.md](../rom/journal.md): the prototype in `rom/`, which already proved every rule below in the core and in a go-link room.

## Who it is for

- People who want to make their own arcade game and play it with friends in a go-link room. They need no assembly, no 68000 and no knowledge of how a board stores graphics.
- Artists and level designers who deliver to the ROM project: Willy Maker checks their work against [art-spec.md](../rom/art-spec.md) while they work, not after.
- go-link itself: the missions of *Willy Gorklingo: The Lag Protocol* ([story.md](../rom/story.md)) are built with it.

## Platforms

| Board | Screen | Layout it uses | Players × buttons | Status |
|---|---|---|---|---|
| **Capcom CPS-1** | 384 × 224, 60 Hz | `slammast` | 4 × 3 | Phase 1 |
| Capcom CPS-1 | 384 × 224 | `captcomm` | 4 × 2 (special = both buttons) | Phase 1, as an option |
| Other boards | — | — | — | Phase 3 |

A project picks its board when it is created. Every limit, meter, check and converter comes from that board's **profile** (see [architecture.md](architecture.md#board-profiles)). Adding a board means adding a profile, not changing the editor.

## Phases

### Phase 1: build, play and export

1. Build a game in the browser: characters, backgrounds, levels, game settings.
2. Play-test it in the browser, with the same rules as the ROM engine, while building.
3. Export:
   - **Project `.zip`**: everything, to continue in another browser or keep a backup.
   - **AI pack `.zip`**: the levels as Tiled maps, the graphics as PNGs, and a generated prompt that includes our ROM docs. An AI (or a person) uses it to produce the ROM with the tools in `rom/`.

### Phase 2: "Create ROM" in the browser

The prototype's 68000 program is turned into a **data-driven engine**: levels, characters, menus and settings become data that the engine reads. Building a game is then **packing**, not compiling:

- Convert the graphics to the board's format. `rom/tools/cps1gfx.mjs`, `sprites.mjs` and `color.mjs` are JavaScript already.
- Pack the maps and data next to the prebuilt engine.
- Encrypt the sound program the way the board expects. `rom/tools/kabuki.mjs` is JavaScript too.
- Lay everything out as the set's files and zip it.

All of it can run in the browser (WebAssembly where it helps, for example a fast zip or quantizer). A **Create and play** button then sends the `.zip` to the user's go-link device over the existing `files` channel (as ROM uploads already do) and opens a room with it.

### Phase 3: more boards

Profiles for other boards the mame2003-plus core runs, chosen for their limits and how well they are documented. The editor, the play mode and the export stay the same.

## Features

### Projects

- A list of projects, each with its board, title, thumbnail and last change.
- **New project** from a template:
  - empty;
  - "Mission 1: Buenos Aires": the 8192 × 672 canvas of [art-spec.md](../rom/art-spec.md#5-level-size-and-mission-1-buenos-aires), with its five sections;
  - "Prototype street": the Step 4 level of the prototype.
- **Autosave** as you work:
  - the project's JSON goes to `localStorage`, one record per project, like the skin editor's **My skins**;
  - pictures (sprite sheets, background layers, PNG tiles) go to **IndexedDB**, because they outgrow `localStorage` (about 5 MB per site). The JSON refers to them by hash.
  - If the browser refuses to save, a visible warning says so, and leaving the page asks first.
- **Export** the project as a `.zip`, and **import** a `.zip` to continue in another browser or machine.
- Nothing is sent anywhere in Phase 1.

### The board profile and budget meters

Live meters in the top bar, from the board profile, always visible while building:

| Meter | CPS-1 limit |
|---|---|
| Sprite palettes | 32 (shared by every character) |
| Play layer palettes / far layer palettes | 32 / 32 |
| Colors per tile or per sprite zone | 15 + transparent |
| Colors | CPS-1 12-bit: every channel a multiple of 17 |
| Unique tiles and sprite cells vs graphics ROM | 6 MB |
| Sprites on screen | 256 entries |
| Program and data size | 2 MB (68000 program ROM) |

A meter turns amber near its limit and red over it. Clicking a meter lists what uses the budget and what to merge or remove.

### Characters

1. **Drop a sprite sheet** (PNG or WebP, or several files).
2. **Automatic frame detection**, like `scripts/destroy-atlas.mjs` and the prototype's converter:
   - the background is keyed from the border of the sheet: only background connected to the border becomes transparent, so a black shirt survives;
   - the grid (a fixed cell size) is detected when there is one, otherwise each figure is found on its own;
   - merged poses are split at empty columns;
   - the pivot is placed on the feet.
3. **Assign frames to animations** by dragging them onto the list of [art-spec.md](../rom/art-spec.md#frame-list) (`idle`, `walk`, `run`, `jump`, `climb`…), with the frame rate and loop flag, and the special points (`muzzle`, `hand`).
4. **Size**: the character's height in pixels, with the art-spec sizes as presets (44 px heroes, 32 px child…). Drawn 1:1 art is the best; shrinking a big sheet works but shows a quality warning.
5. **Palette zones**:
   - the character is split into zones of 16 px rows (head, torso, legs, weapon), with at most 15 colors per zone;
   - colors are snapped to the board's colors, perceptually, with the error shown;
   - the shirt colors are marked for palette swaps (players 2 to 4).
6. **Preview at 1x and 2x**, on the level's background, with the animation playing.

### Backgrounds and layers

Layers like an image editor's, each with a name, visibility, lock, opacity (editor only) and order:

| Layer | Grid | What it is |
|---|---|---|
| `far` | 32 px | sky and skyline (the board's slow scroll layer) |
| `mid` | 32 px | a second far picture, merged into `far` at export (the board has one far layer) |
| `play` | 16 px | what players walk on and in front of |
| `collision` | 16 px | invisible tags (below) |
| `objects` | free (snaps to 8 px) | everything that is not a tile |
| `text` | 8 px | HUD and menus (game settings) |

Background art can be painted with tiles from a palette, stamped from ready-made tiles (the prototype's city, crates and ladders), or imported as a full PNG that the tool cuts into tiles, deduplicates and checks.

### The pencil: collision tags

A pencil, rectangle, fill and eraser that paint **tags** on the `collision` layer:

| Tag | Meaning |
|---|---|
| `solid` | blocks and can be stood on |
| `oneway` | stood on; jumped through from below; dropped through with down + jump |
| `ladder` | climbed with up and down |
| `crate` | climbed by pushing (32 px), breakable (`hp`) |
| `breakable` | solid until destroyed (`hp`, the tile it turns into) |
| `hazard` | hurts (`damage`) |
| `water` | slows down, no jetpack |

Each tag has its own color and pattern, so it reads without relying on color alone. A toggle shows the tags over the art, under it, or hides them.

### Objects

Stamps placed on the `objects` layer, each with a **reference name** (for example `crate_dock_3`) and its properties:

| Object | Properties |
|---|---|
| Player start | player 1–4 |
| Enemy | kind, facing, patrol distance |
| Civilian | kind (woman, child, baby, elder), trapped in (a crate or wall) |
| Crate | size (16 or 32), hp, contents (nothing, weapon, health, civilian) |
| Pickup | bazooka, flamethrower, spread, grenades, health, Lattenza page |
| Camera lock | a rectangle where the camera stops until its enemies are beaten |
| Checkpoint | where players come back after losing a life |
| Boss | kind, arena rectangle |
| Exit | the end of the level |

The names are references: the AI pack, the warnings and the play mode's debug overlay use them.

### Helpers

- Grids (8, 16 and 32 px), rulers, guides and snapping, like the skin editor.
- A **minimap** of the whole canvas, with the visible screen (384 × 224) and the sections.
- **Reachability check** with the engine's rules (jump about 64 px, push-climb 32 px, ladders, drop through one-way ledges): it shades what a player cannot reach and points at the gap.
- **Warnings** while working:
  - no exit;
  - a civilian behind an unbreakable wall;
  - a camera lock with no enemies;
  - a tile over its colors;
  - a budget over its limit.
- Undo and redo for every change; copy and paste of regions and objects across levels.

### Game settings: the game's "IDE"

- **Players**: 1 to 4, and which characters they can choose.
- **Buttons**: how many the board's layout has (3 on `slammast`) and their actions:
  - jump;
  - fire, with the automatic knife when an enemy is adjacent;
  - special: the weapon that was picked up;
  - run: a double tap of the stick;
  - with 2 buttons, special = both together.
- **Controller mapping**: the detected controller drawn with its own button names, reusing `src/controllers`, as in the Destroy briefing. Pressing a button lights its action.
- **Menus** built from blocks on the `text` layer and sprites:
  - title screen;
  - attract mode (demo play and story panels);
  - player select;
  - HUD (score, lives, rescued, weapon);
  - continue;
  - game over;
  - high scores.
- **DIP switches**: difficulty, lives, free play, demo sound.
- **Levels**: their order and their music and sound references (sound is Phase 2 and later).

### Play mode: building and playing at once

- **Play** runs the current level in the browser at the board's resolution (384 × 224), shown at 2×. It uses the same physics, camera, collision and object rules as the ROM engine, written once in the module's `engine/` (see [architecture.md](architecture.md)).
- **Input**: controllers (Gamepad API, the site's button map), keyboard, and a touch pad on phones. Up to 4 local players.
- **Debug overlays**: collision tags, hitboxes, the camera window and its locks, object names, frame time.
- **Edit while playing**:
  - **Pause** freezes the game; you edit tiles, tags or objects;
  - **Resume** continues from the same moment with the change in place;
  - **Restart here** puts the players at the cursor.
- What the browser cannot promise is the board's exact timing and sprite-per-line limits; the meters and the core (Phase 2) settle those.

### Validation and export

Before any export, a checklist runs and links each problem to where it is:

- budgets;
- colors;
- grid alignment;
- missing animations;
- unreachable areas;
- objects without required properties.

Errors block the AI pack; warnings do not.

## UI overview

The screens match the mocks being designed on the go-link design canvas:

| Screen | What is on it |
|---|---|
| **Home / New project** | the project list; New project with board (CPS-1 card with its limits, future boards greyed out), layout (`slammast` 4 × 3, `captcomm` 4 × 2) and template |
| **IDE** | top bar (project, board badge, budget meters, Play, Export); left: the project tree (characters, enemies, civilians, backgrounds, levels, menus, settings); center: the level canvas with grids and the minimap; right: the inspector of the selection; bottom: the layers panel; the tool bar (select, pencil, rectangle, fill, eraser, stamp, hand, zoom) |
| **Sprite import** | the dropped sheet with detected frames, animation slots, pivot editor, palette zones with their 15-color meters, CPS-1 snap preview, 1x and 2x preview |
| **Play test** | the 2× game view with HUD, debug overlay switches, the controller panel with live buttons, Pause / Edit / Resume / Restart here |
| **Game settings** | players, buttons and actions, controller mapping, menus, DIP switches, level order |
| **Export / Build** | validation checklist, Export project, Export AI pack (with a preview of the prompt), Create ROM (Phase 2, shown as coming), Create and play (Phase 2) |

### Keyboard shortcuts

| Key | Action |
|---|---|
| V / H / Space (held) | select / hand / hand while held |
| B / R / G / E | pencil / rectangle / fill / eraser |
| 1–7 | the collision tags, in table order |
| O | object stamp |
| P | play / back to editing |
| Esc | pause while playing |
| ⌘Z / ⇧⌘Z | undo / redo |
| ⌘C / ⌘V / ⌘D / ⌫ | copy / paste / duplicate / delete |
| ⌘S | export the project `.zip` |
| ⌘+ / ⌘− / ⌘0 | zoom in / out / fit |
| [ / ] | previous / next layer |

### Accessibility and languages

- Real buttons and labels, keyboard reachable tools and panels, visible focus, tooltips on icon buttons, and 44 px targets on touch screens.
- Collision tags use pattern and color.
- Meters announce their state in text, not only in color.
- `prefers-reduced-motion` is respected.
- English, Spanish and Portuguese, in the site's i18n (a `willyMaker` section); the reference names users type are free text.
- Willy Maker needs a computer-size screen to build. On phones it opens projects in play mode only, with a note.

## Milestones

1. **Docs** (this folder) and the canvas mocks, approved.
2. **The module's skeleton**: route, Tools card, projects with autosave and `.zip` export and import.
3. **The level editor**: layers, tiles, the pencil and tags, objects, minimap, undo.
4. **Play mode** with the engine rules ported from `rom/src/main.c`, and edit while playing.
5. **Characters**: sheet import, frame detection, animations, palette zones.
6. **Game settings**: players, buttons, controller mapping, menus, DIP switches.
7. **Validation and the AI pack.** This completes Phase 1.
8. **The data-driven ROM engine and Create ROM** (Phase 2), then Create and play over the `files` channel.
9. **More boards** (Phase 3).

## Open questions

- **The engine's data format** for Phase 2: designed with Phase 1's project format so that export is a translation, not a rewrite.
- **Sound** in the maker: QSound samples on `slammast` need a sound driver first (journal: pending). Phase 1 only stores references.
- **Our sets' identity**: the device's allow-list of go-link-owned sets by hash, so the library shows the user's title and art instead of the original set's ([docs/rom/README.md](../rom/README.md#how-the-core-finds-the-game)). It is needed before Create and play.
- **Sharing projects between users**: Phase 1 is files only. A gallery would need storage, which go-link does not have by choice.
- **Where the shared CPS-1 code lives** (see [architecture.md](architecture.md#shared-code-with-rom)).
