# Willy Maker: architecture

Willy Maker is a **self-contained module** of the website, built like the Destroy game (`src/destroy/`), so it can be moved out later (into its own package, app or repository) without untangling it from the site. Overview and features: [README.md](README.md).

## Where it lives

```
frontend/apps/web/src/willy-maker/
  index.ts          the one public entry: mountWillyMaker(options) and its types
  engine/           the game rules, pure TypeScript, no DOM
  editor/           the project model, commands, undo/redo, validation
  board/            board profiles: limits, meters, converters (cps1.ts first)
  io/               storage (localStorage + IndexedDB), project .zip, Tiled, AI pack
  ui/               atomic design: atoms/, molecules/, organisms/, WillyMakerApp.tsx
  messages.ts       the texts it needs, passed in from the site's i18n
frontend/apps/web/public/willy-maker/
  templates/, tiles/, characters/   ready-made templates and art
```

- The site only adds the route `/tools/willy-maker`, a card on `/tools`, and a lazy `import()` of the entry, the same way `destroyLauncher.ts` loads Destroy. The module is loaded only when the page opens.
- The module imports **only** `@go-link/shared` and `src/controllers` (the controller drawings and model recognition). It never imports from `pages/`, `components/` or landing code, and nothing outside imports its internals.
- Its texts come in through `messages`, from a `willyMaker` section of the site's `en.ts`, `es.ts` and `pt.ts`. Its styles are its own CSS, using the site's tokens.

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

- The project model, matching [file-format.md](file-format.md).
- Every change is a **command** (paint tiles, paint tags, add object, move layer…) with do and undo, so undo/redo, autosave and edit-while-playing all go through one path.
- Validation: budgets, colors, grid alignment, reachability (using `engine/` physics), required properties.

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

- **Storage**: the project JSON in `localStorage` (one key per project plus an index), binaries in IndexedDB by SHA-256. Every access is wrapped in try/catch; when storage fails, the editor keeps working and warns.
- **Project `.zip`** export and import (layout in [file-format.md](file-format.md)). The zip code is a small library or WebAssembly; no network.
- **Tiled** export and import of levels (`.tmj`, Tiled's JSON map format), so levels can also be edited in Tiled.
- **AI pack**: the Tiled maps, the PNG assets, the project JSON, our ROM docs and the generated prompt.

### `ui/`: atomic design

- **Atoms**: capsule button, icon button, meter, tag swatch, layer eye and lock, numeric field.
- **Molecules**: tool bar, layer row, tag palette, object stamp palette, animation slot, palette zone, controller legend.
- **Organisms**: project list, new project dialog, IDE frame (top bar, project tree, canvas, inspector, layers panel), sprite importer, play view, game settings, export panel.
- **Template**: `WillyMakerApp.tsx`.

The canvas is drawn with Canvas 2D: layers as offscreen canvases, tags as patterns, and only the visible screen redrawn. The play view draws at 384 × 224 and scales by whole numbers, never smoothed.

## Shared code with `rom/`

`rom/tools/` already has JavaScript that Willy Maker needs:

| `rom/tools` | Use in Willy Maker |
|---|---|
| `color.mjs` (OKLab, CPS-1 real colors, k-means) | color snapping, palette zones, the color meters |
| `sprites.mjs` (dominant-color downscale, per-tile palettes) | the sprite importer |
| `cps1gfx.mjs` (the board's graphics format) | Phase 2: converting to ROM files |
| `kabuki.mjs` (the sound CPU's encryption) | Phase 2: Create ROM on `slammast` |
| `level.mjs` (map, tiles, collision, objects of the prototype level) | the "Prototype street" template |
| `png.mjs` | not needed in the browser (the browser decodes images) |

To avoid two copies, these move into a shared package, for example `frontend/packages/cps1/` (TypeScript, no DOM, with tests), used by both `rom/tools` (through Node) and Willy Maker. Until that move, Willy Maker imports nothing from `rom/`, and the first milestone that needs one of these modules moves it.

## Why this shape

- **Movable**: one entry, its own folders, assets and CSS, and only two dependencies (`@go-link/shared`, `src/controllers`). It can become its own app or package.
- **One set of rules**: play mode and the ROM run the same physics and object rules, tested once.
- **Boards as data**: profiles keep the editor board-agnostic for Phase 3.
- **Nothing on a server**: like the rest of Tools, all work stays in the browser until the user exports it or, in Phase 2, sends it to their own go-link device.
