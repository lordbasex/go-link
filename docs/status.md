# Status and roadmap

## Done

| Area | State |
|---|---|
| Signaling | signalhub in production, in its own repository: pairing, rooms, invitations, TURN credentials, rate limits, device secrets |
| Linking | 9-digit code, remembered browsers, device proves itself first, unlink |
| WebRTC | VP8 video (game rooms at 2x for per-pixel color, with High/Normal/Saver qualities and an automatic CPU fallback), Opus game audio, `control`, `input` and `files` channels, trickle ICE, fixed UDP port with announced addresses |
| Emulator | mame2003-plus through libretro, one process per game room, core download per platform |
| ROMs | Validation without running (MAME 0.78 loader rules), drag and drop, CLI |
| Game server | Several rooms at once, live/paused/archived/trash, favorites, save slots, automatic save, resume after restart, history |
| Save detection | Per-game and per-core save probe; games that cannot be saved always start fresh |
| Rooms | Private only: invitation link, QR and code, one PIN per person, return tokens, owner key |
| Playing | Seats P1-P4, arcade queue, spectators, Start 1P-4P, swap controllers, host-only pause with players asking for one, player names (2-20 letters, digits, spaces; cleaned by the device), gamepads, several local players, remap, touch gamepad |
| Voice and chat | SFU-style voice between seated players, per-player volume and silence; chat with typing indicator, switchable per room |
| Recordings | Host-only recording to WebM without re-encoding (2 h / 2 GB caps, stops on pause), REC notice for everyone, chunked download with SHA-256, in-browser MP4 export (WebCodecs + Go WebAssembly) with a preview to set the game and voices volumes and three sound tracks, screenshots, factory reset |
| Device app | Native window and tray panel (Fyne), headless mode with a LAN web panel, full CLI, Docker image |
| Website | Landing, rooms, new game, room, My device dashboard, ROMs, history; EN/ES/PT; dark and light themes; phones and tablets play in a full-screen console (Game Boy upright, Switch sideways), auto-hiding see-through controls, one-row phone header with a bottom tab bar |
| Security | Device secret, HMAC challenges, PIN gate with lockout, strict CSP and headers, limits everywhere |
| Builds | macOS app and dmg (Intel and Apple silicon), Linux (window and headless, amd64/arm64), Windows (amd64/arm64), static libvpx and Opus, release script, Homebrew cask |
| Willy Maker | Visual maker of CPS-1 games in Tools: wizard (genre list, only the platform shooter today) and Buenos Aires template, level editor (collision tags, objects, layers, undo, autosave, project `.zip`), characters from a sprite sheet, play while building with the ROM's rules, game and menu screens with the Rules card, AI pack with `PROMPT.md`, Create ROM (the game packed next to a prebuilt engine, powered on at once), phones and tablets; parts with no effect yet marked "Coming soon" |
| ROM validation | Four levels: live editor rules, the AI pack's self-check, a power-on test in the browser (Musashi 68000 + a CPS-1 board model in WebAssembly) and on the linked device with the exact core (`rom_test`, `device romtest`) |
| Own games | A CPS-1 ROM prototype of *Willy Gorklingo: The Lag Protocol* (4 players x 3 buttons) on the stock core; the device recognizes go-link's own sets by the SHA-256 of their files and shows their title, art and controls |
| Tests | Go (`-race`), vitest, Playwright end to end with axe, CI with gitleaks and vulnerability checks |

## Next

1. **First public release:** CI on GitHub for this repository, then `make release`.
2. **Apple Developer ID:** sign and notarize the macOS app so it opens without warnings.
3. **Real phone tests:** touch gamepad, full screen and voice on iOS and Android.
4. **End-to-end tests with real games** and four players.
5. **Emulator core patches** (see [cores/mame2003-plus](../cores/mame2003-plus/README.md#pending)): propose them upstream, then The Simpsons driver banking, CPS2 sound after loading, and other games that cannot be saved.
6. **Release 0.1.8** with Willy Maker, the ROM validator and go-link's own sets (the website already has them; the device app needs the release).
7. **Willy Maker stage 2:** Create ROM in the browser from a data-driven engine is built ([engine.md](willy-maker/engine.md)); own enemies and civilians in the ROM followed, and **Play on my go-link** opens the created game's own room on the linked go-link in one click (2026-10-04, device 0.1.9: `@maker`, `tests/maker-room.spec.ts` with `E2E_CORE_DIR`).
8. **The ROM's next stage:** ladder climbing animation, a camera for players on distant floors, QSound music and effects, and the remaining levels of the [game bible](rom/story.md).
9. **Willy Maker after experiment 1:** every task of the [verdict](experiments/verdict.md#tasks) is done (T-01 to T-31, 2026-10-03): the camera, ladder and join rules, every rule in the AI pack, screen text, the clear's freeze and tally, the measured jump, the headless rebuild, difficulty, recorded sessions, a lighter AI pack that states its limits, taller heroes, QSound sound, parallax bands, own enemies, the platformer genre (with sound in play mode and moving platforms since) and the go-link HD streaming experiment ([hd-streaming.md](experiments/hd-streaming.md): 1080p60 works with today's VP8). Still on the roadmap: the vertical shooter's locks and boss (phase 1 is done: the climbing camera, ships firing up, drones coming down) and the genres after it (the horizontal shooter's three phases are done: ships, shots, bombs, walls, drones on the scrolling route, power-ups, paths and the gunship boss), the light gun's camera route (phases 1 and 2 are done) and the genres after them (the beat 'em up's four phases are done) (genres.md), falling platforms and the free camera, go-link HD's own 2D engine (the HD room already streams 4K60 from the M1 with H.264 and picks the size per host and per guest).
10. **Willy Maker's AI playtester:** a small player trained on each game in the browser (emulator in WebAssembly, network on WebGPU) that reports clear rates, deaths and stuck spots ([vision](willy-maker/vision.md#the-ai-playtester)).
