# Status and roadmap

## Done

| Area | State |
|---|---|
| Signaling | signalhub in production, in its own repository: pairing, rooms, invitations, TURN credentials, rate limits, device secrets |
| Linking | 9-digit code, remembered browsers, device proves itself first, unlink |
| WebRTC | VP8 video, Opus game audio, `control`, `input` and `files` channels, trickle ICE, fixed UDP port with announced addresses |
| Emulator | mame2003-plus through libretro, one process per game room, core download per platform |
| ROMs | Validation without running (MAME 0.78 loader rules), drag and drop, CLI |
| Game server | Several rooms at once, live/paused/archived/trash, favorites, save slots, automatic save, resume after restart, history |
| Save detection | Per-game and per-core save probe; games that cannot be saved always start fresh |
| Rooms | Private only: invitation link, QR and code, one PIN per person, return tokens, owner key |
| Playing | Seats P1-P4, arcade queue, spectators, Start 1P-4P, swap controllers, pause, gamepads, several local players, remap, touch gamepad |
| Voice and chat | SFU-style voice between seated players, per-player volume and silence; chat with typing indicator, switchable per room |
| Device app | Native window and tray panel (Fyne), headless mode with a LAN web panel, full CLI, Docker image |
| Website | Landing, rooms, new game, room, My device dashboard, ROMs, history; EN/ES/PT; dark and light themes; phones and tablets |
| Security | Device secret, HMAC challenges, PIN gate with lockout, strict CSP and headers, limits everywhere |
| Builds | macOS app and dmg (Intel and Apple silicon), Linux (window and headless, amd64/arm64), Windows (amd64/arm64), static libvpx and Opus, release script, Homebrew cask |
| Tests | Go (`-race`), vitest, Playwright end to end with axe, CI with gitleaks and vulnerability checks |

## Next

1. **First public release:** CI on GitHub for this repository, then `make release`.
2. **Apple Developer ID:** sign and notarize the macOS app so it opens without warnings.
3. **Real phone tests:** touch gamepad, full screen and voice on iOS and Android.
4. **End-to-end tests with real games** and four players.
5. **Emulator core patches** (see [cores/mame2003-plus](../cores/mame2003-plus/README.md#pending)): propose them upstream, then The Simpsons driver banking, CPS2 sound after loading, and other games that cannot be saved.
