# Willy Maker: file format

The project file, the `.zip` that carries it between browsers, and the AI pack. Overview: [README.md](README.md). Architecture: [architecture.md](architecture.md).

## The project file (`project.json`)

Versioned JSON; `format` starts at 1. Unknown fields are kept on import (a newer version's data is not lost), and an older `format` is migrated on load.

```jsonc
{
  "format": 1,
  "id": "a7f3…",                       // random, made on creation
  "title": "Dead Air",
  "author": "",
  "createdAt": "2026-10-01T12:00:00Z",
  "updatedAt": "2026-10-01T12:30:00Z",

  "board": {
    "id": "cps1",
    "layout": "slammast"               // or "captcomm"
  },

  "settings": {
    "players": 4,                      // 1-4
    "buttons": {                       // per the layout's button count
      "b1": "jump",
      "b2": "fire",                    // the automatic knife when an enemy is adjacent
      "b3": "special",                 // "b1+b2" on a 2-button layout
      "run": "double-tap"
    },
    "dip": { "difficulty": "normal", "lives": 3, "freePlay": false, "demoSound": true },
    "menus": {                         // each a screen made of text and sprite blocks
      "title": { "blocks": [] },
      "attract": { "demoLevel": "level-1", "panels": [] },
      "select": { "characters": ["willy", "vera", "glitch9", "jitter"] },
      "hud": { "blocks": [] },
      "continue": {}, "gameOver": {}, "highScores": {}
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
      "sheet": "sha256:9c1e…",         // a picture in assets/
      "frames": [
        { "id": "idle_0", "x": 0, "y": 0, "w": 48, "h": 48, "px": 24, "py": 47,
          "zones": ["pal-willy-head", "pal-willy-torso", "pal-willy-legs"],
          "muzzle": null, "hand": null }
      ],
      "anims": { "idle": { "frames": ["idle_0", "idle_1"], "fps": 6, "loop": true } },
      "swapColors": ["#223344", "#334455"]   // the shirt: players 2-4 change only these
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

- **Tile layers** store tile indices per cell (`0` = empty), run-length encoded as a string, in row order. **Tag layers** store the tag number per cell: 0 air, 1 solid, 2 oneway, 3 ladder, 4 crate, 5 breakable, 6 hazard, 7 water. Per-cell properties live in `props`, keyed `"col,row"`.
- **Colors** are `#RRGGBB` with every channel a multiple of 17 (the CPS-1's 12-bit colors). A palette has at most 15 colors; transparency is implicit.
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

A second export for producing the ROM with an AI (or a person) and the tools in `rom/`:

```
my-game.ai-pack.zip
  PROMPT.md               the generated brief (below)
  project.json            the same project file
  levels/
    level-1.tmj           Tiled maps: play, collision and objects layers
    level-1/far.png       each layer as a full picture
    level-1/play.png
    level-1/collision.png the tag colors of art-spec.md, on the 16 px grid
  characters/
    willy/<anim>.png      one strip per animation, magenta background
    willy/sheet.json      frames, fps, loop, pivots, muzzle and hand points
  docs/
    rom-README.md, art-spec.md, hardware.md, story.md, journal.md
```

### The generated prompt (`PROMPT.md`)

Filled in from the project:

```text
You are building an arcade game ROM for go-link with the tools in the go-link repository
(rom/). Target board: {{board.name}} ({{screen}}, {{layout}}: {{players}} players ×
{{buttonCount}} buttons), run by the mame2003-plus core. Every byte must be original.
Follow docs/rom-README.md, docs/art-spec.md and docs/hardware.md (included). The rules the
game must keep (jump about 64 px, push-climb 32 px, one-way ledges, ladders, double-tap run,
automatic knife) are the ones Willy Maker's play mode used, listed in project.json.

Game: "{{title}}" by {{author}}. Levels, in order: {{levels}}.
Characters: {{characters with roles and heights}}.
Buttons: {{button actions}}. Menus: {{menus}}. DIP switches: {{dip}}.

Each level is in levels/<id>.tmj (layers play, collision, objects) with its pictures;
collision tags: solid, oneway, ladder, crate, breakable, hazard, water. Objects have unique
names and properties as in art-spec.md section 4.

Willy Maker's checks at export: {{validation summary: budgets, warnings}}.

Task: produce the ROM set ({{layout}}.zip) with rom/tools/build.mjs extended to read this
pack, keep within the budgets above, test it with framelab and in a go-link room
(rom/tools/room-test.mjs), and report what you changed and anything that needs a decision.
```
