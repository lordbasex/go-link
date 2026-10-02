# Willy Maker: file format

The project file, the `.zip` that carries it between browsers, and the AI pack. Overview: [README.md](README.md). Architecture: [architecture.md](architecture.md).

## The project file (`project.json`)

Versioned JSON; the current `format` is 3. Unknown fields are kept on import (a newer version's data is not lost), and an older `format` is migrated on load.

| Format | What changed | Migration from the one before |
|---|---|---|
| 1 | the first format | — |
| 2 | `settings.actionLabels`, `runTapMs`, `playerSlots`, `credits`; every menu screen's `texts`, `background`, `music`, `credits` | the new fields get their defaults (labels empty, 250 ms, Willy and three recruits, `(C) 2026 go-link`, each screen's default background and music); blocks and unknown fields are kept |
| 3 | `genre`: the game's genre, one of the ids of [genres.md](genres.md) (`platform-shooter`, `platformer`, `beat-em-up`, `light-gun`, `horizontal-shooter`, `vertical-shooter`, `top-down-shooter`, `maze`, `versus-fighting`, `puzzle`, `quiz-party`, `sports`, `racing`) | older projects become `platform-shooter`, the only genre with an engine; an unknown genre is read as `platform-shooter` too |

```jsonc
{
  "format": 3,
  "id": "a7f3…",                       // random, made on creation
  "title": "Dead Air",
  "author": "",
  "createdAt": "2026-10-01T12:00:00Z",
  "updatedAt": "2026-10-01T12:30:00Z",

  "board": {
    "id": "cps1",
    "layout": "slammast"               // or "captcomm"
  },

  "genre": "platform-shooter",         // genres.md; the only one with an engine today

  "settings": {
    "players": 4,                      // 1-4
    "buttons": {                       // per the layout's button count
      "b1": "jump",
      "b2": "fire",                    // the automatic knife when an enemy is adjacent
      "b3": "special",                 // "b1+b2" on a 2-button layout
      "run": "double-tap"
    },
    "actionLabels": { "jump": "Hop" },  // optional labels; missing = the action's default name
    "runTapMs": 250,                   // the double-tap window for running, 100-400
    "playerSlots": [                   // players 1-4: a character id or "builtin:willy", and a shirt
      { "character": "builtin:willy", "variant": 0 },   // 0 own colors, 1-3 recruit shirts
      { "character": "builtin:willy", "variant": 1 },
      { "character": "vera", "variant": 0 },
      { "character": "builtin:willy", "variant": 3 }
    ],
    "credits": "(C) 2026 go-link",     // the credits line the menu screens show
    "dip": { "difficulty": "normal", "lives": 3, "freePlay": false, "demoSound": true },
    "rules": { "enemyHp": 3, "touchHurts": true },  // optional: only what the Rules card changed (engine.md)
    "menus": {                         // each screen: text fields, background, music slot, credits line, blocks
      "title": {
        "texts": { "title": "DEAD AIR", "prompt": "PUSH START" },   // missing = the field's default
        "background": { "kind": "level", "level": "level-1" },     // "" = the first level
        "music": "title", "credits": true, "blocks": []
      },
      "attract": { "demoLevel": "level-1", "panels": [], "texts": {}, "background": { "kind": "level", "level": "" }, "music": "none", "credits": true },
      "select": { "characters": ["willy", "vera", "glitch9", "jitter"], "texts": {}, "background": { "kind": "solid", "color": "#000000" }, "music": "select", "credits": false },
      "hud": { "texts": { "join": "PRESS START", "ammo": "AMMO" }, "background": { "kind": "level", "level": "" }, "music": "stage", "credits": false },
      "continue": { "texts": {} }, "gameOver": { "texts": { "heading": "GAME OVER" } }, "highScores": { "texts": {} }
    },
    "levels": ["level-1"]              // play order
  },

  "palettes": [                        // shared palettes, by layer group
    { "id": "pal-willy-head", "group": "sprite", "colors": ["#000000", "#FFCC99", "…"] }
  ],

  "characters": [
    {
      "id": "willy",
      "name": "Willy",
      "role": "hero",                  // hero | enemy | civilian | boss
      "height": 44,
      "sheet": "sha256:9c1e…",         // the 1:1 atlas in assets/ (board colors, transparent)
      "frames": [
        { "id": "idle_0", "x": 0, "y": 0, "w": 48, "h": 48, "px": 24, "py": 47,
          "zones": ["pal-willy-head", "pal-willy-torso", "pal-willy-legs"],
          "muzzle": null, "hand": null }
      ],
      "anims": { "idle": { "frames": ["idle_0", "idle_1"], "fps": 6, "loop": true } },
      "swapColors": ["#223344", "#334455"],  // the shirt: players 2-4 change only these
      "source": {                      // optional: what the importer needs to edit it again
        "sheet": "sha256:51ab…", "file": "willy.png", "mode": "figures", "tolerance": 18,
        "grid": { "w": 48, "h": 48 },
        "frames": [ { "id": "idle_0", "x": 412, "y": 63, "w": 69, "h": 115, "px": 35, "py": 114 } ]
      }
    }
  ],

  "tilesets": [
    { "id": "ts-city", "tile": 16, "image": "sha256:…", "palettes": ["pal-brick", "pal-glass"] }
  ],

  "levels": [
    {
      "id": "level-1",
      "name": "Puerto Madero docks",
      "size": { "w": 8192, "h": 672 },
      "camera": { "forwardOnly": true, "backtrack": 48 },
      "layers": [
        { "id": "far", "kind": "tiles", "grid": 32, "tileset": "ts-sky", "data": "rle:…",
          "name": "Sky and skyline", "visible": true, "locked": false },
        { "id": "mid", "kind": "tiles", "grid": 32, "tileset": "ts-skyline", "data": "rle:…" },
        { "id": "play", "kind": "tiles", "grid": 16, "tileset": "ts-city", "data": "rle:…" },
        { "id": "collision", "kind": "tags", "grid": 16, "data": "rle:…",
          "props": { "120,38": { "hp": 3 } } },
        { "id": "objects", "kind": "objects", "items": [
          { "name": "p1_start", "type": "player_start", "x": 64, "y": 608, "player": 1 },
          { "name": "crate_dock_3", "type": "crate", "x": 512, "y": 576,
            "size": 32, "hp": 2, "contents": "bazooka" },
          { "name": "lock_lobby", "type": "camera_lock", "x": 3200, "y": 448, "w": 384, "h": 224 }
        ]},
        { "id": "text", "kind": "tiles", "grid": 8, "data": "rle:…" }
      ],
      "sections": [ { "name": "Docks", "x0": 0, "x1": 1536 } ]
    }
  ]
}
```

Notes:

- **Rules** (`settings.rules`, optional, no format change): `enemyHp`, `enemyScore`, `rescueScore`, `crateScore`, `touchHurts`, `enemiesChase`, `enemiesShoot`, `exitNeedsEnemies`, `respawnOnHurt`, `hurtFrames`, `crateClimb` (`"jump"`, the default, or `"push"`), `extraPorts` (`"soon"`, the default, or `"ignore"`). A missing field is the default value (`engine/rules.ts` `DEFAULT_RULES`); out-of-range numbers are brought into range on read (`rulesWith`). Play mode and Create ROM read the same values ([engine.md](engine.md#rules-the-game-tab)). An enemy object's own `hp` wins over `enemyHp`; an exit object may have `w` and `h` (32 px and the level's height by default). A crate object may have `breakable: false` (shots stop on it; it still breaks when nothing holds it up).
- **Menu screens**: the text fields of each screen are `title` (title, subtitle, prompt), `attract` (caption, prompt), `select` (heading, prompt), `hud` (join, ammo, rescued, cleared), `continue` (heading, prompt), `gameOver` (heading, line) and `highScores` (heading, footer). Text is drawn with the board's 8 × 8 font, folded to uppercase, on the 48 × 28 character text layer; music ids are `none`, `title`, `select`, `stage`, `boss`, `continue`, `game-over` and `high-scores` (references only until Phase 2).
- **Tile layers** store tile indices per cell (`0` = empty), run-length encoded as a string, in row order. **Tag layers** store the tag number per cell: 0 air, 1 solid, 2 oneway, 3 ladder, 4 crate, 5 breakable, 6 hazard, 7 water. Per-cell properties live in `props`, keyed `"col,row"`.
- **Colors** are `#RRGGBB` with every channel a multiple of 17 (the CPS-1's 12-bit colors). A palette has at most 15 colors; transparency is implicit.
- **Characters**: `sheet` is the picture the game uses, at 1:1 on the board (the importer packs the frames into it, colors already fitted to the zone palettes), and `frames` are rectangles in it, so play mode, the AI pack and the ROM read it as it is. Each frame's `zones` lists its palettes top to bottom, one per 16 px row counted from the feet (a shorter frame lists only its lower rows). `source`, when present, holds the dropped sheet and the boxes drawn on it (sheet pixels, same frame ids), so the Characters screen can open the character again; a character without it (from a template or a hand-made project) still plays. Create ROM cuts a hero's frames the same way, from the feet up, one zone palette per 16 px tile row ([engine.md](engine.md#the-players-looks)); a player slot's `variant` applies to Willy only.
- **Tilesets** may carry `columns` (tiles across in the picture) and `count` (tiles in it); the board meters count graphics from them. Layers may carry `opacity` (0-1), used by the editor only. The starter tilesets are `ts-city` (16 px, the play layer) and `ts-sky` (32 px, the far layer), built from the ROM prototype's art.
- **Timer**: a level may carry `timer`, its time limit in seconds (missing or `0` = none). Play mode has no timer yet; the review compares it with the walk to the exit (`level.timer`) and the ROM keeps it.
- **Limits on load**: a file with more than 64 levels, or a level wider than 65536 px or taller than 8192 px, is refused; layers, objects, frames, animations, palettes and tilesets with missing or wrong fields are repaired with defaults (or dropped when they are not one at all), so a damaged file never breaks the editor.
- **Pictures** are referenced by `sha256:<hex>`. In the browser they live in IndexedDB under that hash; in a `.zip` they live in `assets/`.
- Object `type` and properties are the ones in [art-spec.md](../rom/art-spec.md#4-telling-the-build-what-every-object-is). Every object has a unique `name`.

## The project `.zip`

```
my-game.willy.zip
  project.json
  assets/
    9c1e…png            every picture, named by its SHA-256
  thumbnails/
    level-1.png         a small picture of each level, for the project list
  README.txt            what this file is and that Willy Maker opens it
```

Import checks `format`, every hash and every size before replacing anything. A project with the same `id` asks: replace it, or keep both (the import gets a new `id`).

## The AI pack

A second export for producing the ROM with an AI (or a person) and the tools in `rom/` (`io/aiPack.ts`). It is made only when the Export review has no errors.

```
my-game.ai-pack.zip
  PROMPT.md               the generated brief (below), always the first entry
  project.json            the same project file
  review.json             the Export review: ready, errors, warnings, every check with its English message
  levels/
    level-1.tmj           Tiled map: far (image layer), play, collision and objects layers
    level-1/far.png       the far layer, with the middle one merged in, as one picture
    level-1/play.png      the play layer as one picture
    level-1/text.png      the text layer, only when it has tiles
    level-1/collision.png the tag colors of art-spec.md, on the 16 px grid
  tilesets/
    ts-city.png           each tileset picture
    collision.png         the collision tileset: one 16 px tile per tag, typed (solid, oneway…)
  characters/
    willy/<anim>.png      one strip per animation, magenta background, feet on one line
    willy/sheet.json      frames (boxes in the strip), fps, loop, pivots, zones and their palettes, muzzle and hand points
  docs/
    rom-README.md, art-spec.md, hardware.md, story.md, journal.md
```

- Every picture is converted to board colors (each channel to the nearest multiple of 17; alpha is on or off). Layers and tilesets keep transparency; strips use magenta `#FF00FF`.
- The `.tmj` files point at `../tilesets/*.png` and `<level>/far.png`, so the pack opens in Tiled as it is. Willy Maker's Tiled import reads them back with the same collision and objects. Objects are points, except `camera_lock` and `boss`, which are rectangles.
- The docs are the repository's `docs/rom/*.md`, bundled with the website and loaded when the pack is made.
- **Deterministic**: the same project gives the same bytes. Entries have a fixed date (2026-01-01 00:00) and a fixed order (`PROMPT.md`, then the rest sorted by name), and PNGs are written without a canvas. Compression uses the browser's own deflate, so two browsers may still differ.
- A picture the browser no longer has (cleared site data) is left out, and `PROMPT.md` names it.

### The generated prompt (`PROMPT.md`)

Filled in from the project and the review, in English, with these sections:

1. **The brief**: build an arcade ROM for go-link with the tools in `rom/`; the target board (CPS-1, 384 × 224 at 60 Hz, 68000), the set layout (`slammast` 4 × 3 or `captcomm` 4 × 2) and the mame2003-plus core; every byte original; which docs to follow (`docs/` in the pack).
2. **The game**: title and author, the genre (its name and description; a genre with no engine yet says so and points to [genres.md](genres.md)), players, the levels in play order (id, size, camera, sections, map file), the characters (role, height, animations), the buttons and what each does (with 2 buttons, special is buttons 1 + 2), Start/Coin, the DIP switches and the menus.
3. **Rules the engine keeps**: a table of the numbers in `engine/rules.ts` with the game's Rules card applied: body, gravity, jump, fall, ladders, how crates are climbed, run tap, drop-through, camera, weapons, enemies (hits, chase, shoot, touch), crates, lives and blinking, score, the exit, ports past the players, opposite directions.
4. **Board limits**: palettes, colors, graphics and program ROM, sprite table, and what the game uses now (the meters).
5. **What is in this pack**: the tree above, the collision tags and the object rules.
6. **Willy Maker's checks at export**: every warning and note, then what passed.
7. **Build it**: the tools (`brew install m68k-elf-binutils m68k-elf-gcc z80asm`, Node 22.18 or newer), `node rom/tools/build.mjs` first to prove the toolchain, then extend it to read the pack, framelab with `-log` in the core, and `node rom/tools/room-test.mjs` in a go-link room.
8. **Task**: produce `<layout>.zip`, keep within the budgets, test it, and report changes and open decisions.

The Export screen previews its first paragraph and has **Copy prompt**.
