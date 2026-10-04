# Willy Maker: game genres

The genres Willy Maker plans, as a roadmap. Today there is **one engine, the platform shooter**, and the **platformer** runs on it with its own rules (below): the rules of `frontend/apps/web/src/willy-maker/engine/` (the same as the ROM prototype's `rom/src/main.c`). The new game wizard lists every genre below, in this order; only the platform shooter can be chosen, the others show "Coming soon" with a one-line description. Overview: [README.md](README.md). The project stores its genre in `genre` ([file-format.md](file-format.md), format 3).

The order is by **how much of today's engine a genre reuses**: the first ones keep the side view, the scrolling camera, the collision grid, the objects and the 4-player join; the last ones need a new engine and new editors. Sizes are rough: **S** (days, mostly rules and parts), **M** (a few weeks: new movement or camera), **L** (a new engine on the same editor), **XL** (a new engine and new editors).

The board is the same for all of them: Capcom CPS-1 laid out as the `slammast` set ([hardware.md](../rom/hardware.md)). What matters for every genre:

- **Screen** 384 × 224 at 60 Hz, **horizontal**: the `slammast` set is a horizontal game, so the monitor cannot be turned for a vertical genre.
- **Layers**: scroll1 (8 px tiles, text and HUD), scroll2 (16 px, the play layer, with **row scroll**: each line can scroll on its own) and scroll3 (32 px, the far layer). No rotation or scaling in hardware.
- **Sprites**: 256 table entries of 16 × 16 tiles (big objects are blocks of tiles), 32 palettes of 15 colors plus transparency.
- **ROM**: 6 MB of graphics and 2 MB of program; a 68000 at about 10 MHz.
- **Controls**: 4 players, each with an 8-way stick, 3 buttons, Start and Coin (the "4 × 3" layout; `captcomm` has 2 buttons and makes the third with both). go-link maps RetroPad B, A, Y to buttons 1, 2, 3.

## 1. Platform shooter (available)

- **The player:** runs and guns through a level seen from the side: jumps, climbs, pushes crates, knifes up close, picks up weapons and rescues civilians, with up to 4 players at once.
- **Engine:** what exists: gravity and jumps on a 16 px collision grid, one-way ledges, ladders, push-climb, a forward-only camera with locks, enemies that patrol, chase and shoot, crates and breakable walls, pickups (the bazooka), civilians, the exit.
- **Editor parts:** all of today's. Still "coming soon" (the badge in the editor, `part.soon` in the review): the flamethrower, spread gun, grenades and health, the page, a civilian inside a crate, bosses, checkpoints, water; every enemy kind shares one behaviour.
- **CPS-1 limits:** the sprite count with 4 players, their shots and a crowd of enemies; palettes for 4 player shirts.
- **Controls (4 × 3):** stick moves and climbs, B1 jump, B2 fire (knife when an enemy is adjacent), B3 special; double tap to run.
- **Size:** done; finishing the coming-soon parts is **S** each.

## 2. Platformer (available, first version)

**Built** (task T-22 of [experiment 1's verdict](../experiments/verdict.md)): the platform shooter's engine with the rules `weapons` off and `stomp` on (play mode and the ROM alike: landing on an enemy's head takes it down and bounces, touching one hurts), **coins** (pickup `coin`: 100 points, a `COINS n/m` counter in the HUD) and **springs** (pickup `spring`: standing on one throws the player up, about 165 px). The wizard offers it, and a new platformer starts with those rules in its Rules card. **Moving platforms** followed (object `platform`: width, across or up and down, distance, speed; there and back from the frame count, so play mode and the ROM put it in the same place every frame; one-way from below, players ride it; checked on the real core, `rom/tools/lab/runs/platforms-ride.json`). **Falling platforms** too (a platform's **Falls**: it shakes once stood on, falls with its rider and comes back 3 seconds later; `platforms-fall.json`). **Tall levels** complete the free camera (2026-10-03): the camera already followed the players up and down, and the ROM now streams a level's rows as well as its columns, so a level can be as tall as the editor allows (8192 px, within the engine's 24 576 cells) for towers and climbs. Going back is the level's setting (Inspector: **Only moves forward** and **Margin back**): the ROM always honored it, and play mode does too since 2026-10-04 (it had kept a fixed 48 px margin), so with Only moves forward off the camera goes back the whole level in both; `rom/tools/lab/runs/free-camera.json` matches the real core at tolerance 0 and play mode on every frame.

- **The player:** jumps, times moving platforms and avoids hazards, with no guns; the level is the challenge. Stomps or simple enemies, collectibles, a goal.
- **Engine:** today's movement and camera without the weapons; new: moving and falling platforms, springs, stomping enemies, collectibles and a counter, a free camera (up and down as well as forward).
- **Editor parts:** reused: terrain tags, ladders, hazards, starts, checkpoints (they become essential), exit. New: moving platform (path, speed), spring, collectible, stomp enemy.
- **CPS-1 limits:** none new; moving platforms are sprites, so they count against the 256 entries.
- **Controls (4 × 3):** stick moves, B1 jump, B2 run or action, B3 unused or a second jump.
- **Size:** S.

## 3. Beat 'em up

**Phase 1 built** (2026-10-03): the rule `depth` (the Rules card's **Walking in depth**, on in a new beat 'em up with no guns, enemies that come for the players and an exit after every enemy is down) and each level's **walkable band** (`walk`: the feet y range, 64 px over the floor by default, edited in the level's Inspector and drawn on the level): left and right as anywhere (solid cells stop them), up and down a pixel a frame inside the band, B2 hops and lands at the same depth, players join and come back inside the band, and players, enemies and civilians are drawn by depth (the one nearer the screen in front). Play mode and the ROM alike (`wm_data` version 10); `rom/tools/lab/runs/street-walk.json` matches the real core at tolerance 0 on every frame and play mode on every frame. **Phase 2 built** (2026-10-03): B1 punches, again within 18 frames chains a second punch and a kick that knocks down (B1 in the air is a flying kick that knocks down too), each blow hitting enemies in front within its reach and 8 px of depth; enemies walk to stand beside the nearest player on their own side, spread out in depth, wind up and hit, rest, and get up a second after a knock-down; a new beat 'em up's enemies take 6 hits and a hit player blinks in place; the HUD shows the health of the enemy last hit for two seconds. `street-fight.json` matches the real core at tolerance 0 and play mode on every frame, players and every enemy alike. **Phase 3 built** (2026-10-03): camera locks in the ROM for every genre (each lock is a wave: the camera stops at its right end until every enemy inside it is down; enemies off screen wait for it), grabs and throws (walking into a walking or attacking enemy within 18 px and 8 px of depth holds it: B1 knees it, B1 with the stick away throws it 40 px behind the player for two hits and a fall, it slips free after 90 frames), the **Pipe** pickup (a blow reaches 10 px further and hits once more, 12 blows that land), enemies that never walk through solid cells or back away from a player, and Willy's own punch (his guard and stab frames without the blade). `street-wave.json` (a grab, two knees, a throw, the pipe, then a two-enemy wave at a lock) matches the real core at tolerance 0 on all 2220 frames and play mode on every frame. **Phase 4 built** (2026-10-03): blows break crates and breakable walls (a blow that meets no enemy hits the cell in front of the feet; what a crate holds lies where it stood, inside the band), the **Knife** pickup (B1 throws it along the lane at 4 px a frame; the first enemy within 10 px and 8 px of depth takes 3 hits and falls; walls end it), and the **Brawler** boss (Parts › Enemies: 30 hits unless set, never grabbed, rests 25 frames between blows instead of 50, the android in red and orange, its health in orange marks of 3 hits). `street-brawl.json` (a crate, the knife thrown, the brawler behind a camera lock) matches the real core at tolerance 0 on all 2020 frames and play mode on every frame. Next: the genres after it.

- **The player:** walks a street in depth (up and down move toward and away from the screen), punches, combos, grabs and throws enemies that come in waves, picks up food and weapons, and fights a boss at the end of each stage.
- **Engine:** reuses the side-scrolling camera, the camera locks (each lock becomes a wave), the enemies and bosses, the 4-player join and pickups. New: a walking band with depth (a y position on the floor, with sorting of sprites by depth), melee hit boxes and combos, grabs and throws, knock-down and get-up, health bars, enemies that surround the players instead of shooting.
- **Editor parts:** reused: starts, exit, camera locks (as waves, with the enemies listed per wave), enemies, bosses, health pickups, crates. New: the walkable band of a level (top and bottom of the floor), weapon pickups (pipe, knife), breakable props, wave triggers.
- **CPS-1 limits:** big characters (often 80-100 px) with 4 players and 6-8 enemies use many sprite tiles; depth sorting every frame on the 68000.
- **Controls (4 × 3):** stick walks in 8 directions, B1 attack (repeated for combos, toward an enemy to grab), B2 jump, B3 special (a costly clear-around move).
- **Size:** L.

## 4. Light gun / target shooter (available, phase 1)

**Phase 1 built** (2026-10-04): the rule `crosshair` (the Rules card's **Crosshairs**, on in a new light gun game with targets that take one hit and shoot back, and no exit to walk to). Each player is a crosshair (one color each) moved 3 px a frame by the stick; B1 shoots where it points (6 shots), B2 reloads (40 frames); a shot hits the first target within 10 px of its x and 40 px over its feet, else a hostage (a civilian: the shooter is hurt), else a crate or breakable cell. Nobody walks: the camera moves along the level a pixel every 2 frames, holds at a camera lock until its targets are down and the level clears where the route ends. A target on the screen waits, aims for a second and shoots the first player in (the rule Enemies shoot), then rests 2 seconds; a hit interrupts its aim. Play mode and the ROM alike (`wm_data` version 13); `rom/tools/lab/runs/gun-range.json` (a bot's inputs from play mode: targets along the route, a reload, a scene held at a lock, the clear) matches the real core at tolerance 0 on all its frames and play mode on every frame. Next: target timing (when a target appears and for how long), a camera route with stops, special (a bomb on B3).

- **The player:** aims a crosshair on screen and shoots targets that pop up while the camera moves along a route or holds on each scene; reloads, rescues hostages by not shooting them.
- **Engine:** reuses levels as backgrounds, the camera (now on a script: move, stop, move), camera locks (a scene ends when its targets are down) and enemies (as targets with pop-up timings). New: a crosshair per player moved by the stick, hits at the crosshair instead of shots that fly, reload, hostages.
- **Editor parts:** reused: levels, camera locks, enemies (target, with when they appear and for how long), civilians (hostages). New: camera route, target timing.
- **CPS-1 limits:** the board has no light gun input; the crosshair moves with the stick (a browser pointer can drive the stick's direction in go-link); four crosshairs are four sprites.
- **Controls (4 × 3):** stick moves the crosshair, B1 shoot, B2 reload, B3 special (a bomb).
- **Size:** M.

## 5. Horizontal shooter

- **The player:** flies a ship through a level that scrolls by itself, shoots waves of enemies, collects power-ups that change the weapon, and fights a boss.
- **Engine:** reuses the scrolling camera (now automatic), the collision grid (walls of caves and bases), enemies, bosses, pickups and the 4-player join. New: free flight with no gravity, enemy formations on paths, many bullets, weapon levels and options, bombs.
- **Editor parts:** reused: terrain (solid walls), enemies, bosses, pickups (power-ups now have an effect), camera locks (boss fights). New: auto-scroll speed per section, enemy paths and formations, spawn triggers.
- **CPS-1 limits:** bullets are sprites: the 256 entries are the main budget; scroll3 and row scroll give parallax.
- **Controls (4 × 3):** stick flies in 8 directions, B1 shoot (hold for auto), B2 bomb, B3 speed or option formation.
- **Size:** M.

## 6. Vertical shooter

- **The player:** the same as the horizontal shooter, scrolling upwards with waves from the top of the screen.
- **Engine:** the horizontal shooter's, with the camera moving up; levels are tall instead of wide.
- **Editor parts:** the horizontal shooter's; tall levels (up to the board map's height).
- **CPS-1 limits:** the `slammast` set is a horizontal game, so the play area is 384 × 224 lying wide; a narrow play field with side panels (score, lives) is the usual answer. Tall levels are streamed row by row like wide ones (up to 24 576 cells of 16 px).
- **Controls (4 × 3):** as the horizontal shooter.
- **Size:** M (S after the horizontal shooter).

## 7. Top-down run and gun

- **The player:** seen from above, walks and shoots in 8 directions, throws grenades, enters and drives vehicles, frees prisoners.
- **Engine:** reuses enemies, pickups, civilians (prisoners), camera locks and the 4-player join. New: a top-down view with no gravity, 8-direction aiming (or a rotary stick feel with the 8-way stick), vehicles players enter and leave, a camera that scrolls in any direction.
- **Editor parts:** reused: enemies, pickups, civilians, camera locks, exit. New: top-down collision (walls, water, cover), vehicles, a level map that scrolls both ways.
- **CPS-1 limits:** a level map in both directions within the board map size; 8-direction sprites for every character multiply the graphics.
- **Controls (4 × 3):** stick moves and aims, B1 shoot, B2 grenade, B3 enter or leave a vehicle (or hold to strafe).
- **Size:** L.

## 8. Maze action

- **The player:** clears a maze of dots or treasures while chasers hunt them; a power-up turns the chasers into prey for a few seconds. A maze per screen, faster each round.
- **Engine:** new movement on a grid (move cell to cell, turn at corners), chaser behaviours (follow, ambush, wander), power-up timer, round progression. Reuses the collision grid (walls), pickups and the menus.
- **Editor parts:** reused: solid tags (walls), pickups (dots, power-ups, bonus), starts. New: chaser spawns and their behaviour, tunnels that wrap around.
- **CPS-1 limits:** one screen per maze (384 × 224 is 24 × 14 cells of 16 px); none hard.
- **Controls (4 × 3):** stick moves; B1 unused or a dash; up to 4 players as rivals or a team.
- **Size:** M.

## 9. Versus fighting

- **The player:** one on one with special moves (stick motions plus buttons), blocking, health bars, a timer and rounds; a character select and a ladder of opponents.
- **Engine:** new: frame data per move (startup, active, recovery), hit and hurt boxes per frame, stick motion reading (quarter circles, charges), blocking, juggles, rounds and timer, a CPU opponent. Reuses only the sprite pipeline (Characters), the menus and the board budget.
- **Editor parts:** new: a move editor per character (frames, boxes, damage, motion input), stages (one screen wide or a little more), the roster and select screen.
- **CPS-1 limits:** large characters (100+ px) take many sprite tiles and graphics ROM per frame; the 6 MB of graphics bound the roster.
- **Controls (4 × 3):** stick moves, jumps, crouches and makes motions; B1 punch, B2 kick, B3 strong or special. 4 players play in turns (winner stays).
- **Size:** XL.

## 10. Puzzle

- **The player:** pieces fall or are shot into a well (blocks or bubbles); matching them clears them and sends garbage to the rival in versus mode.
- **Engine:** new: the well's grid and its rules (fall, rotate, match, chain), speed levels, versus garbage, a CPU rival. Reuses the menus and the scroll1 text layer.
- **Editor parts:** new: the piece set and match rules, the well's size, level speeds; backgrounds per stage reuse tilesets.
- **CPS-1 limits:** none hard; the well can be tiles on scroll1 or scroll2 instead of sprites.
- **Controls (4 × 3):** stick moves and drops, B1 rotate, B2 rotate back, B3 hold or swap. 2 wells side by side for versus; 4 players in pairs.
- **Size:** M.

## 11. Quiz and party

- **The player:** answers questions against the clock and plays short minigames (mash buttons, timing, memory) for points, up to 4 players at once.
- **Engine:** new: question flow with answers on the buttons, timers, scoring, a minigame framework of small rule sets. Reuses the menus and text in the board's 8 × 8 font.
- **Editor parts:** new: a question bank (text with 3 answers, so they fit the 3 buttons), minigame picks and their settings, the show's screens.
- **CPS-1 limits:** text must fit the 8 × 8 font's glyphs and the 48 × 28 text grid; questions are data in the 2 MB program ROM.
- **Controls (4 × 3):** B1 B2 B3 answer A B C; stick for minigames.
- **Size:** M.

## 12. Sports

- **The player:** wrestling, football or basketball with simple arcade rules: a match against the clock, passes and shots, or grapples and pins.
- **Engine:** new per sport: a field with its own camera, a ball or grapple physics, team AI, match rules and scoring. Little of today's engine applies beyond the 4-player join, sprites and menus.
- **Editor parts:** new: field or ring, team rosters, rule settings (time, score to win).
- **CPS-1 limits:** many players on screen (a team of 5 per side) with a ball and shadows in the sprite budget.
- **Controls (4 × 3):** stick moves, B1 pass or grab, B2 shoot or strike, B3 sprint or special.
- **Size:** XL.

## 13. Racing

- **The player:** races from above or behind the car on a road in pseudo 3D, against the clock or rivals, with checkpoints extending the time.
- **Engine:** new: car physics, a track and its laps, rivals that follow a line; for the view behind the car a road drawn line by line (row scroll on scroll2 bends the road, scaled roadside objects are pre-drawn sizes because the board has no sprite scaling).
- **Editor parts:** new: track editor (curves, hills, roadside objects), car stats, checkpoint times. Checkpoints are reused as time gates.
- **CPS-1 limits:** no rotation or scaling: every size of a roadside object or rival car is its own graphic, which eats the 6 MB; row scroll is the only per-line effect.
- **Controls (4 × 3):** stick steers, B1 accelerate, B2 brake, B3 gear or boost.
- **Size:** XL.
