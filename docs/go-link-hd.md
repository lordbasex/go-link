# go-link HD: the engine's base (specification)

go-link HD is step 3 of Willy Maker's [board ladder](willy-maker/vision.md#the-board-ladder): go-link's own 2D engine, a "virtual board" with modern console-class quality. Its games play in a go-link room like any MAME set does. This page lists, before anything is built, **what the engine supports and what could be done with it**. It is the base for the roadmap ([status.md](status.md)); nothing here exists yet except the streaming path, which the [HD experiment](experiments/hd-streaming.md) proved.

Every item is marked:

- **Base:** the first version must have it.
- **Later:** planned, after the base.
- **Idea:** possible and worth keeping in mind; not committed.

## Decisions taken (2026-10-06)

| Question | Decision | Why |
|---|---|---|
| What it is | A **libretro core of our own** (`golink_hd_libretro`) that runs a game package | The device already runs libretro cores in a worker process per room: rooms, voice, controllers, recordings, invitations, saves and phones keep working unchanged |
| Look | **Pixel art on a 640 × 360 screen**, scaled ×3 to 1080p (×6 to 4K); real HD art (1920 × 1080) supported too | Pixel art is quicker to draw and to make with an image AI, and fits the arcade look; HD art stays possible for who has it |
| Language | **Go**, built twice: a native core for the device (`-buildmode=c-shared`) and WebAssembly for Willy Maker's play mode | One engine, two builds: play mode is the same game by construction (Willy Maker's [principle 6](willy-maker/vision.md#principles)). The device is Go already and the repository builds Go to WebAssembly (`frontend/wasm/mp4`) |
| First genre | **Platformer** (then the beat 'em up) | Both have engines and level-checked rules on the CPS-1, so the HD version can be compared with them |
| License | MIT, like go-link | Our own code: no MAME license (non-commercial) limits |

## How it fits go-link

```
Willy Maker project ──export──► game package (.glhd)
                                     │
             ┌───────────────────────┴───────────────────────┐
             ▼                                               ▼
  browser: engine in WebAssembly                 device: golink_hd_libretro core
  (play mode, power-on test)                     (game room worker, like MAME)
                                                             │
                                          HD path: H.264 or VP8, size per host
                                          and per guest (video tiers)
                                                             ▼
                                                 guests (web, iOS, Android)
```

- **One simulation, two renderers of the same pixels:** the engine renders in software into a frame buffer, in both builds, so the browser and the device show the same pixels. A 640 × 360 frame is small enough for software rendering, and the HD experiment drew a 1080p scene in under 1 ms. The scaling to the output size is done after that.
- **The host does all the work:** guests only receive the stream, as with MAME. A phone never runs the engine, except in Willy Maker's play mode.

## 1. Simulation

| Feature | Level | Notes |
|---|---|---|
| Fixed step of 60 Hz, independent of the output's frame rate | Base | One `Run()` per libretro frame |
| **Deterministic**: the same inputs give the same frames on every computer and in the browser | Base | Integer and fixed-point math for positions, speeds and collisions; no `float` in game logic (Go may fuse float operations differently on arm64 and amd64); one seeded random generator in the state |
| Whole state in one serializable struct | Base | Save states are exact by design: no pointers to code, no hidden timers. That avoids the problems [the MAME patches](../cores/mame2003-plus/README.md) fight |
| Input log replays (start state + inputs) | Base | For bug reports, regression tests, the AI playtester ([row 12](status.md)) and attract-mode demos |
| Rewind (a ring of recent states) | Idea | Cheap with a small state; useful in Willy Maker's play mode |
| Entities with components (position, sprite, body, behaviour, health…) | Base | Data-driven, as Willy Maker's engines are today |
| State machines per entity (idle, walk, jump, hurt…) | Base | The genres' rules are written this way already |
| Timers and events (on hit, on enter zone, on clear) | Base | |

## 2. Picture

### Screen

| Feature | Level | Notes |
|---|---|---|
| Logical screen 640 × 360, 16:9 | Base | The default |
| Other logical sizes: 320 × 180, 480 × 270, 960 × 540, 1920 × 1080 | Base | Per game; all 16:9 so 1080p and 4K scale exactly |
| Integer scaling to the output (×3 → 1080p, ×6 → 4K), nearest neighbour | Base | Done by the device before encoding; guests get the size from the [video tiers](experiments/hd-streaming.md#chosen-per-viewer-2026-10-03) |
| 4:3 and vertical (9:16) games | Later | Vertical needs the rooms to show a portrait picture well |
| 30 fps games | Idea | Half the encoder's work for slow genres (quiz, puzzle) |

### Color

| Feature | Level | Notes |
|---|---|---|
| 32-bit color (RGBA 8888), no palette limits | Base | The opposite of the CPS-1's 15 colors per tile |
| Alpha (half transparency) on sprites and layers | Base | |
| Palette swap for players 2 to 4 (shirt colors) | Base | A color table per sprite, as Willy Maker recolors players today |
| Blend modes: normal, add, multiply, screen | Base | Add for fire and lights, multiply for shadows |
| Tint and flash (an entity turns white when hit) | Base | |
| Fades and color grading with a lookup table (night, sepia, underwater) | Later | |

### Layers

| Feature | Level | Notes |
|---|---|---|
| Up to 8 tile layers with their own tile size (8, 16, 32 px) | Base | Background, play layer, front layer, HUD |
| Parallax: each layer scrolls at its own speed | Base | |
| Per-line scroll (raster effects: waves, heat, water) | Base | Like the CPS-1's row scroll, without its limits |
| Animated tiles (water, lava, lights) | Base | |
| Big picture layers (a full painted background instead of tiles) | Base | For HD art |
| Layer rotation and scaling ("Mode 7": floors seen in perspective) | Later | Racing seen from behind and flying stages |
| Per-line scaling (pseudo 3D roads) | Later | The classic arcade road |

### Sprites

| Feature | Level | Notes |
|---|---|---|
| At least 1024 sprites on screen, any size | Base | No sprites-per-line limit |
| Flip, rotation, scaling | Base | |
| Sprite sheets and animations with their own speed per animation | Base | Willy Maker's characters already work this way |
| Sorting by depth (beat 'em up) and by layer | Base | |
| Outline and shadow generated by the engine | Later | |
| **Skeletal animation**: bones, attached parts, interpolated keys | Later | Smooth big characters with few drawings; the editor needs a bone tool |
| Mesh deformation (cloth, flags) | Idea | |

### Effects

| Feature | Level | Notes |
|---|---|---|
| Camera shake, hit stop (the freeze on a strong hit) | Base | |
| **Particles**: emitters with rate, life, speed, gravity, color over time, blend mode | Base | Sparks, dust, explosions, rain, snow |
| 2D lights: point lights and a darkness level | Later | Caves, night stages |
| Normal-map lighting on sprites | Idea | Needs a second picture per frame |
| Post effects: bloom, blur, distortion waves, pixelate transition | Later | In software: each costs CPU per frame, so each gets a measured budget |
| Shaders written by the user | Idea | Hard to keep identical between WebAssembly and the device; would need a small own shader language |
| CRT and scanline looks | Not in the engine | The rooms already offer them in the guest's picture settings |

### Text

| Feature | Level | Notes |
|---|---|---|
| Bitmap fonts (pixel fonts) and scaled fonts | Base | |
| UTF-8, the game's texts in English, Spanish and Portuguese | Base | The player picks the language in the game's menu |
| Dialog boxes with typing effect, portraits | Later | |

## 3. Camera

| Feature | Level | Notes |
|---|---|---|
| Follow one or up to 4 players, keeping all of them on screen | Base | Today's rule in Willy Maker |
| Locks (the camera stops until a wave is cleared) and zones | Base | |
| Forward only, or free in both axes | Base | Per level, as today |
| Zoom in and out (players far apart, bosses) | Later | |
| Split screen for 2 to 4 players | Idea | Racing; costs drawing each view |

## 4. Sound

| Feature | Level | Notes |
|---|---|---|
| Mixer at 48 kHz stereo (the stream's Opus rate) | Base | |
| 32 channels of effects with volume, pitch and pan | Base | |
| Music as a stream (OGG or Opus) with a loop point | Base | |
| Music crossfade between stages and when a boss appears | Base | |
| Effects: low pass (underwater), echo | Later | |
| Tracker music (MOD/XM) | Idea | Small files, chiptune style |
| Positional sound (left or right by where the source is on screen) | Later | |

Voice chat between players stays go-link's; the engine only makes the game's sound.

## 5. Controls

| Feature | Level | Notes |
|---|---|---|
| 4 players | Base | Ports P1-P4 of the room |
| D-pad, 6 buttons, Start, Coin per player | Base | What go-link's `input` packet carries ([protocol](protocol.md#input-channel)) |
| Analog sticks | Base | The packet already has left and right stick X and Y |
| L2, R2, L3, R3 | Later | The packet has the bits; MAME games never get them (`retroButton` in `game_core.go`), our engine can |
| Up to 8 players | Idea | Needs more ports in the room |
| Rumble | Idea | Needs a channel from the device to the guest |
| On-screen controls per game | Base | The room's touch pad takes its buttons from the game package (as `room_state.controls` does for MAME) |

## 6. Game rules

| Feature | Level | Notes |
|---|---|---|
| Tile collision with tags (solid, one-way, ladder, hazard, water…) | Base | Willy Maker's tags |
| Slopes | Base | The CPS-1 engines have none |
| Moving and falling platforms | Base | |
| Simple physics: gravity, friction, bounce, push | Base | |
| Hit and hurt boxes per animation frame | Base | Fighting and beat 'em up |
| Grid pathfinding (A*) for enemies | Later | Maze and top-down genres |
| Rigid bodies (crates that tumble, ragdolls) | Idea | |
| **The 13 genres of Willy Maker** as modules of the same engine | Base: platformer, then beat 'em up. Later: the others | [genres.md](willy-maker/genres.md) |
| Behaviours built from blocks, Scratch style (when / if / do) | Later | So a game can do something no genre module has |
| A scripting language | Idea | Only if blocks are not enough; must stay deterministic and safe |

## 7. Saves and progress

| Feature | Level | Notes |
|---|---|---|
| Save states (libretro serialize) | Base | Exact by design (section 1); the room's save slots and automatic save work at once |
| Persistent data per game: high scores, unlocked stages, options | Base | Like MAME's NVRAM, kept by the device per room |
| Checkpoints and continue | Base | |
| Achievements | Idea | |

## 8. Game package

| Feature | Level | Notes |
|---|---|---|
| One `.glhd` file (a zip): manifest, levels, characters, rules, pictures (PNG), sound, fonts | Base | Built by Willy Maker's export; never compiled |
| Manifest: title, version, engine version, logical size, players, controls, languages, box art | Base | The device shows title, art and controls from it, as it does for go-link's own sets |
| Identified by its SHA-256 | Base | As go-link's own CPS-1 sets are today |
| Format and engine versions, with old games running on newer engines | Base | |
| Size limit (proposed 256 MB) | Base | |
| Import from Aseprite and from sprite sheets | Later | The sheet detection exists in Willy Maker |
| Signed packages | Idea | Only matters if packages are shared publicly |

## 9. In go-link

| Feature | Level | Notes |
|---|---|---|
| The device runs the core like MAME: `device emulate --core golink_hd_libretro`, one worker per room | Base | |
| The core is downloaded from go-link's releases with its SHA-256 | Base | A new source next to the libretro buildbot for MAME |
| The HD room path for game rooms: H.264 or VP8, size per host (`hdprobe`), size per guest (tiers) | Base | Today only the HD test room uses it |
| Recordings in H.264 | Base | Today they are VP8 in WebM; H.264 needs MP4 or Matroska |
| ROM library: `.glhd` files next to the zips, validated by the engine | Base | `romcheck` only knows MAME sets |
| Game picture as thumbnail and box art from the package | Base | |
| Raspberry Pi hosts | Later | 640 × 360 surely; 1080p depends on the Pi's encoder, to be measured |

## 10. In Willy Maker

| Feature | Level | Notes |
|---|---|---|
| **go-link HD** as a board next to the CPS-1 | Base | A board profile: its limits, its checks, its export |
| Play mode runs the engine in WebAssembly | Base | The same game as the room |
| Art without the 15-color and 16 px zone rules | Base | The pixel editor keeps its tools; the board's limits come from the profile, as they already do |
| Moving a CPS-1 project to go-link HD | Base | The other way can be lossy and is checked by the validator |
| Power-on test in the browser and on the linked device | Base | Validation levels 3 and 4 ([validation.md](willy-maker/validation.md)) |
| Debug view: hit boxes, collision tags, entity inspector, frame step | Base | |
| Performance meter: milliseconds per frame, sprites, particles | Base | |
| Bone and particle editors | Later | |

## 11. Budgets (proposed, to be measured)

| Item | Budget |
|---|---|
| Engine time per frame on the host | ≤ 4 ms at 640 × 360 (the encoder takes the most) |
| Sprites on screen | 1024 |
| Tile layers | 8 |
| Particles alive | 4096 |
| Sound channels | 32 effects + 2 music streams |
| Graphics in memory | 512 MB uncompressed |
| Save state | ≤ 2 MB |
| Package | ≤ 256 MB |

## 12. Not in scope

- **3D.** go-link HD is a 2D engine; 3D-looking effects come from layers (Mode 7, roads).
- **Netplay or online code in the game.** go-link streams from the host; the engine never talks to the network.
- **A store or paid games.**
- **Running MAME sets.** MAME stays the core for arcade games.

## Phases (when it is built)

| Phase | What | Rough size |
|---|---|---|
| 1 | The core with the base picture, sound, controls and save states; a platformer demo playable in a room | 3-4 sessions |
| 2 | Game rooms on the HD path; H.264 recordings | 2 sessions |
| 3 | Willy Maker's go-link HD board: export, play mode in WebAssembly, validation | 3-4 sessions |
| 4 | Later items: skeletal animation, lights, post effects, Mode 7, more genres | by parts |
| 5 | Distribution: the core built in CI for macOS, Linux and Windows, published in the releases | 1-2 sessions |

## Open questions

1. Whether Willy Maker's play mode should render with WebGL instead of software when the game is HD art at 1080p (faster in the browser, but pixels may differ from the device).
2. How the bone editor fits Willy Maker's pixel editor.
3. Whether a game can mix pixel art and HD art layers (a pixel art hero on a painted background).
4. The Raspberry Pi as a host for HD games.
