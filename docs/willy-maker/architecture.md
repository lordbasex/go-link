# Willy Maker: architecture

Willy Maker is a **self-contained module** of the website, built like the Destroy game (`src/destroy/`), so it can be moved out later (into its own package, app or repository) without untangling it from the site. Overview and features: [README.md](README.md).

## Where it lives

```
frontend/apps/web/src/willy-maker/
  index.ts          the one public entry: <WillyMakerApp lang projectId onProjectId/> and its types
  model/            the project types (file-format.md), cell run-length encoding, factories, migration
  board/            board profiles: limits, meters, converters (cps1.ts first)
  templates/        "Buenos Aires" (Mission 1's five sections) and "Empty"; the starter tile numbers
  editor/           the store (commands, undo/redo), operations (strokes, stamps, moves), the parts
                    palette, auto art, reachability
  engine/           the game rules, pure TypeScript, no DOM
  play/             play mode (entry play/index.ts), edit while playing
  io/               storage (localStorage + IndexedDB), project .zip, Tiled import, starter pictures
  sprites/          the Characters screen (entry sprites/index.ts): frame detection,
                    animations, palette zones, preview
  game/             the Game and Menus tabs (entry game/index.ts): actions, players, your controller,
                    DIP switches, the menu screens with their previews and fit checks
  i18n/             the module's own texts: <part>.<lang>.ts (core, sprites, play, game, menus)
  ui/               atomic design: atoms.tsx, molecules.tsx, organisms/, WillyMakerApp.tsx, render.ts
frontend/apps/web/public/willy-maker/
  tiles/            city16.png and sky32.png (+ .json): the starter tilesets
frontend/apps/web/scripts/willy-maker-tiles.mjs   builds them from the ROM prototype's art
```

- The site only adds the route `/tools/willy-maker`, a card on `/tools`, and a lazy `import()` of the entry, the same way `destroyLauncher.ts` loads Destroy. The module is loaded only when the page opens.
- The module imports **only** `@go-link/shared`, `@go-link/cps1` (the board conversion code, shared with `rom/tools`) and `src/controllers` (the controller drawings and model recognition). It never imports from `pages/`, `components/` or landing code, and nothing outside imports its internals.
- **Its texts are its own**, so it can move out: each part keeps `i18n/<part>.<lang>.ts` (`core` for the shell, `sprites`, `play`, `game`, `menus`), English being the reference shape that Spanish and Portuguese must match (a test checks it); these es/pt files are the only non-English text in the module. The site passes its current language to the entry (`lang`), `i18n/index.ts` provides it, and a part reads its texts with `useMessages({ en, es, pt })`. The site's own `en.ts`/`es.ts`/`pt.ts` only hold the Tools card. Its styles are its own CSS (`ui/willy-maker.css`), using the site's tokens; the root carries `.stage-tokens`, so the IDE stays dark in both themes.

## Layers

### `engine/`: the rules, shared by play mode and the ROM

Pure TypeScript with no DOM, tested on its own. It holds:

- the world: the collision grid and tags, objects, breakable state;
- the player physics, with the prototype's numbers (`rom/src/main.c`):
  - gravity 6/16 px per frame², jump −7 px per frame (about 64 px high);
  - push-climb up to 32 px;
  - ladders at 1.5 px per frame;
  - drop through `oneway` with down + jump;
  - the double-tap run;
- the controls: jump, fire with the automatic knife, special, run;
- enemies, civilians, pickups, camera locks, checkpoints and the camera rule (forward only, a small backtrack margin);
- a fixed 60 Hz step, so the browser and the ROM step the same way.

The ROM's data-driven engine (Phase 2) implements the same rules on the 68000. The engine's tests double as the specification both must pass. A shared table of test levels and expected positions keeps them in step.

### `editor/`: the project and its changes

- The project model lives in `model/`, matching [file-format.md](file-format.md): cell layers are run-length encoded text (`rle:0*120,1*4,…`), `migrateProject` checks and upgrades a parsed file (unknown fields are kept).
- `editor/store.ts` holds the open project. Every change is a **command** with apply and revert: `cellsCommand` (the cells of one or more layers, so a pencil stroke and its auto art are one step) and `editLevel`/`editProject` (a before/after snapshot of a level or the project). Undo/redo (200 steps), autosave and edits made in play mode all go through it.
- `editor/ops.ts`: pencil, eraser and fill strokes (`Stroke`: cells change at once, `end()` records the stroke), object stamps (`placePart`; a crate is 2 × 2 `crate` cells plus a `crate` object with `hp` and `contents`), moves and property changes, deleting, and `applyPlayEdit` for the pieces dropped while playing.
- `editor/autoArt.ts`: painting collision tags also paints the matching starter tiles on the play layer (street top or body, platform with or without a support, ladder, the right quarter of a crate…), replacing only tiles it could have painted itself, so hand-placed art stays.
- `editor/validate/`: validation level 1 (see [validation.md](validation.md)). `index.ts` (`reviewProject`, `applyFix`, `mergeReview`, `checkText`), `art.ts` (tile grids, pivots, heights, sprite wrap, program size), `pictures.ts` (the rules that read pixels, run a moment after each change in short steps by `useReview`, which says `checking` until they finish), `extra.ts`/`game.ts` (the Game and Menus tabs' rules).
- `editor/reach.ts`: a flood from the player starts over the places a 44 px hero can stand, with the prototype's moves (walk, fall, jump up to 64 px within a few cells, ladders, dropping through one-way ledges and breakable floors; crates and breakable walls can be shot away). Ledges it never reaches (with how far above the floor they are) and the exit, civilians, pickups and checkpoints it cannot get to become warnings on the canvas and in the Warnings panel. `routes()` reuses the same moves (`moves()`) for the places nobody can leave toward the exit (`level.trap`), the forward-only camera of `engine/game.ts` (`level.camera`) and the walk to the exit in frames (`level.timer`). The Buenos Aires template passes it with no warnings (a test keeps it so).

### `board/`: platform profiles

Each board is a profile object. Adding a board means adding a profile:

```ts
interface BoardProfile {
  id: "cps1";                         // more later
  screen: { w: 384; h: 224; fps: 60 };
  layouts: SetLayout[];               // slammast (4×3), captcomm (4×2)
  layers: LayerSpec[];                // far 32 px, play 16 px, text 8 px
  colors: { bits: 12; snap(rgb): rgb; deltaE(a, b): number };
  palettes: { sprite: 32; play: 32; far: 32; colorsPer: 15 };
  rom: { graphicsBytes: 6 * 1024 * 1024; programBytes: 2 * 1024 * 1024 };
  sprites: { perScreen: 256; tile: 16 };
  meters(project): Meter[];           // what the top bar shows
  convert: { tiles(), sprites(), palettes() }; // to the board's format (Phase 2)
}
```

`cps1.ts` takes its numbers from [hardware.md](../rom/hardware.md) and [art-spec.md](../rom/art-spec.md).

### `io/`

- **Storage** (`io/storage.ts`, `io/assets.ts`): each project's JSON in `localStorage` under `go-link.wm.p.<id>`, plus an index `go-link.wm.index` for the list; pictures in IndexedDB (`go-link-willy-maker`, store `assets`) by SHA-256. Every access is wrapped: when storage is blocked or full the top bar says "not saved" and the work stays in memory (pictures too). Autosave runs 0.7 s after the last change and when the page is hidden. Deleting a game also deletes the pictures no other saved game uses.
- **Project `.zip`** (`io/zip.ts`, `io/projectZip.ts`): a small zip writer and reader of our own, using the browser's `CompressionStream("deflate-raw")` (no library, no WebAssembly needed, no network); the reader checks every CRC and refuses archives over the size limits. Import checks the format, each picture against its hash and lists missing pictures before anything is saved; a game with the same id asks: replace, or keep both.
- **Bad files** (`model/inputError.ts`): every reader (zip, project, Tiled, sprite sheets in `sprites/sheetInput.ts`) throws an `InputError` with a code; the UI shows the module's sentence for it (`inputErrors` in `i18n/core.*.ts`), never a raw exception. Sprite sheets are checked by size from their header before the browser decodes them. When `localStorage` or IndexedDB is full, the editor shows an alert and keeps the last good save.
- **AI pack build check** (`io/packCheck.ts`): validation level 2 for the pack, run by `buildAiPack` on its own zip before the download.
- **Tiled import** (`io/tiled.ts`): `.tmj`/`.json`, or `.tmx` with CSV data, on a 16 px grid: the `collision` layer's tile types (or their order) become tags, the `objects` layer's typed objects become objects. Tiled export comes with the AI pack.
- **Starter pictures** (`io/starter.ts`): a game made from a template fetches the starter tilesets once and stores them by hash like any other picture.
- **AI pack**: the Tiled maps, the PNG assets, the project JSON, our ROM docs and the generated prompt (next step).

### `ui/`: atomic design

- **Atoms** (`atoms.tsx`): capsule button, icon button with its tooltip, meter, tag and object swatch, field, segmented choice, card.
- **Molecules** (`molecules.tsx`): part button, tag chip, layer row (eye, lock, name renamed with a double click, its board layer, order), property row.
- **Organisms** (`organisms/`): `Home` (the games list and `Wizard`), `Ide` (top bar, tabs and the Build screen), `LevelCanvas`, `Panels` (project tree, parts, inspector, layers, warnings, board limits, minimap), `ExportView`; the Characters tab and play mode come from `sprites/` and `play/` through their entries, lazily.
- **Template**: `WillyMakerApp.tsx` (the home screen or one game's IDE, inside an error boundary).

The canvas is drawn with Canvas 2D (`ui/render.ts`): only the visible cells of each layer, tags as tinted cells with a top line, objects as labelled boxes, the grid with a stronger line every screen width, sections, reachability warnings and the 384 × 224 screen frame; pixels are never smoothed and colors come from the tokens. The play view draws at 384 × 224 and scales by whole numbers.

## Shared code with `rom/`: `@go-link/cps1`

The CPS-1 conversion code is one TypeScript package, [`frontend/packages/cps1`](../../frontend/packages/cps1) (`@go-link/cps1`), with no DOM and no Node APIs (pictures and ROM files are plain `Uint8Array`s) and its own tests. `rom/tools` imports it by path (Node runs TypeScript since 22.18) and Willy Maker imports it as a workspace package:

| Module | What it is | Use in Willy Maker |
|---|---|---|
| `color.ts` | OKLab, every CPS-1 color with its palette word, the 4096 full-brightness colors (`toBoardColor`), k-means | color snapping, palette zones, the color meters |
| `sprites.ts` | dominant-color downscale, per-tile palettes, `renderFrame` | the sprite importer (downscale); Phase 2: converting characters |
| `gfx.ts` | the board's graphics format (`GfxRegion`, ROM file split) | Phase 2: converting to ROM files |
| `kabuki.ts` | the sound CPU's encryption | Phase 2: Create ROM on `slammast` |
| `font.ts` | go-link's 8 × 8 font for the text layer (`rom/tools/font.mjs` re-exports it), glyph checks | the Menus tab's previews and fit checks, play mode's Game over screen |

`level.mjs` (the prototype level) stays in `rom/tools` until the "Prototype street" template needs it, and `png.mjs` is not needed in the browser (the browser decodes images). The move changed no byte of the prototype's set: the 28 files of `slammast.zip` were compared one by one before and after.

### `sprites/`: the Characters screen

- `detect.ts`: background keying (flood fill from the border, magenta everywhere, strokes removed), figure and grid detection, reading order, feet pivots. Pure, tested on synthetic sheets.
- `convert.ts`: the character's one scale, the downscale (`@go-link/cps1`), the 16 px palette zones with their meters and reductions, the delta E figures, the 1:1 atlas packing.
- `character.ts`: the importer's draft, and saving it into the project (character, zone palettes, `source`) or removing it.
- `image.ts`: the only browser part (decode a picture, encode a PNG through a canvas), replaced in the tests.
- `ui/`: `SheetView` (the sheet and its editable boxes), `AnimationPanel`, `BoardPanel` (preview and zones); `CharactersScreen.tsx` puts them together and is the entry the shell mounts: `<CharactersScreen project onChange characterId? />`.

## Why this shape

- **Movable**: one entry, its own folders, assets and CSS, and only two dependencies (`@go-link/shared`, `src/controllers`). It can become its own app or package.
- **One set of rules**: play mode and the ROM run the same physics and object rules, tested once.
- **Boards as data**: profiles keep the editor board-agnostic for Phase 3.
- **Nothing on a server**: like the rest of Tools, all work stays in the browser until the user exports it or, in Phase 2, sends it to their own go-link device.
