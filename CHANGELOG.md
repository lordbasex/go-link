# Changelog

All notable changes to go-link. Newest first.

## [Unreleased]

### Changed (website)

- **The site's own dropdowns**: the Microphone and Output lists in the room's Volume and voice settings, "Plays as" and "Keyboard plays as" in the controls panel and the ROMs tab's Sort no longer open the browser's system-drawn list. A new `Select` (a capsule button with a listbox in the site's colors, in both themes) shows a check on the current choice, stays inside the window (opening upwards when needed, also inside the voice popover, the console drawer and dialogs) and works with the keyboard like a native select: arrows, Home and End, typing to jump, Enter or Space to pick, Escape to close without closing the popover around it. Touch screens get 44 px options.

## [0.1.5] - 2026-09-29

### Added (device and website)

- **Only the host pauses; players ask for a pause.** The device accepts `pause` only from the host (a browser in the room that came in with the owner key, or a linked browser with `room_action`); anyone else gets `error` `pause_owner_only`. Seated players send `pause_request` (withdraw with `cancel`), one per player, for 30 seconds. The host sees "NAME wants to pause" with **Pause** and **Keep playing** (over the video in the room, and as a notice on any page of the linked website, naming the room), answered with `pause_answer`; accepting pauses for everyone in the requester's name, declining tells only the requester. `room_state` gains `host_online`, `you.owner`, `you.pause_asks` (host only) and `you.pause_asked`; linked browsers get `pause_asked` / `pause_ask_gone`, and `device_status` rooms list `pause_asks`. The request lives in the Room Manager actor, with its expiry timer. On the website the dock's pause button becomes **Ask the host for a pause** (Cancel while it waits), off with a tooltip when the host is not connected or the room cannot pause. `--test-room-pause` lets the test pattern room pause, to try the flow without a game (used by the e2e).
- **Player names (alias)**: 2 to 20 characters of letters (any language, accents, ñ), digits and single spaces. The device cleans every `hello` name itself (removes symbols and emoji, joins spaces, cuts, falls back to the generated name) and tells the guest the name it uses in `room_state.you.name`. On the website, after the code and PIN let you in, **What's your name?** asks for it, prefilled with the last name used (`go-link.player-name`), with live checking (a red field and why, a counter); the name field in the room checks the same rule.
- **Test your controller** (`/test-controller`): the test pattern's controller drawn in the browser, lit by the keyboard, the on-screen gamepad and Bluetooth or USB gamepads, with each gamepad's name and the input-to-screen time. Linked from the guide's Controls page and the room's How to play.
- The phone console's **You** tab gives the host **Invite** and **Close game**.

### Fixed (website)

- **Light theme contrast**: the accent as text (links, eyebrows, codes), the voice color, the faint text and the player colors failed WCAG AA on light backgrounds. New `--color-accent-text` tokens and darker light-theme player colors fix every page; the accessibility tests now really switch the site to its light theme (they checked the dark one twice), and the room is checked in both themes.

### Added (website, iOS and Android apps)

- **Startup intro "INSERT COIN"**: on a dark arcade background the go-link icon pops in with a soft orange glow, "go-link" rises and **INSERT COIN** (pixel letters drawn in code, the same in every language) rises and blinks, with a **coin sound**: three quick square-wave notes, an original sound made in code (Web Audio on the website; the apps play the same synthesis rendered to a small WAV by `scripts/coin-sound.mjs`, MIT like the project). A tap skips it; reduced motion only fades it in. On the website it is the loading screen that already waited for the first real data (no longer than before, and dark in both themes); browsers allow sound only after a gesture, so the coin plays on your first tap or key while the intro shows or within the first seconds, never later. A **Startup sound** switch (on by default) is in the header's tools (a coin button; on phones under "…") and in the apps' Settings.
- **Room codes grouped while typing**: the code field shows `915 355 636` as you type, on the website's join form and in the apps. The spaces are only visual, the caret stays after the same digit, backspace after a space deletes the digit before it, and pasting with or without spaces works; a pasted invitation link is left as it is. Shared tests for the formatting on the three platforms.

### Added (iOS and Android apps)

- **Your name before entering**: after the code or QR and the PIN, the apps ask "What's your name?", prefilled with the saved name. Only letters (with accents and ñ, any script), numbers and spaces, 2 to 20 characters: a symbol or an emoji turns the field red and says why, with a counter. The name you change in the room follows the same rules. Shared `PlayerName` rules with the same tests in `:core` and GoLinkCore.
- **Ask for a pause**: only the host pauses now, so the apps' pause button asks the host for a pause (and can cancel it while it waits). It is dimmed and explains why when the host is not in the room or the game cannot pause; a declined request shows a notice.
- **Stats**: a small round button at the top left of the game shows or hides a see-through box with the frames per second, resolution and codec, the ping to the device, whether the connection is direct or relayed, packet loss and the game audio. Remembered.
- **See-through gamepad with a real controller**: with a controller connected (Xbox, DualSense/DualShock, Switch Pro, MFi, Bluetooth or USB), the gamepad button shows the on-screen pad see-through and display only, lighting what you press on the controller, with a "*controller* · display only" chip.
- **Test controller** on the home screen: an offline test card with a controller diagram that lights up for the on-screen pad and real controllers, the controller's name and connection, and the input latency (last, minimum, average).
- **Version** on the home screen and at the bottom of Settings ("go-link Player v0.1.5 (build 105)", " · debug" in debug builds). iOS takes it from `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` (`make ... VERSION=x.y.z`), Android from `-PversionName` / `-PversionCode`, with the same build number rule.

### Added (iOS app)

- **go-link Player for iPhone and iPad** (`mobile/ios/`, SwiftUI, iOS 17+), the iOS counterpart of the Android app, not distributed yet: scan the invitation's QR code, type the code or paste the link, then the PIN and the terms; the room in portrait (Game Boy) and landscape (Switch) with the on-screen gamepad from the game's controls, Coin and 1P…NP, MFi, Xbox, PlayStation and Switch Pro controllers, and a drawer with **Chat** (typing, unread badge), **Players** and **You** (name, Volume and voice, How to play, Leave). **Volume and voice** has game and voices volumes, the microphone choice and the system's output picker (speaker, headphones, AirPods), plus a test chime. The microphone is asked for only when it is first turned on (the app uses its own audio device so listening never opens it), and sound never goes to the earpiece. Settings has your name and your own signaling server (`wss://` only, tested before saving, back to the official one). Universal Links for `https://go-link.org/g/…` once the association file carries the signing team.
- `GoLinkCore`, a Swift package ported from the Android `:core` module with the same tests (invitation parsing, the 12-byte input packet, room state, the signaling URL rules, the PIN gate and return tokens, the room client), and an XCUITest target that takes screenshots and joins a real test pattern room.
- The website publishes `/.well-known/apple-app-site-association` (with a placeholder team id until the app is signed for distribution); CI builds the iOS app for the Simulator and runs the GoLinkCore tests on macOS.

### Fixed (iOS and Android apps)

- **On-screen gamepad after turning the phone**: after rotating between portrait (Game Boy) and landscape (Switch) the pad's buttons could stop answering or press the wrong button, and a button held while turning could stay pressed on the device. On iOS the old layout's buttons, going away after the new ones had registered, removed the new ones' hit areas; on both apps a finger held across the layout swap was never released. The buttons are now measured where they are at each touch (iOS) or registered per control (Android), every rotation lets go of all held buttons (the device gets 0), and the D-pad and a button still work together. A shared `TouchPadTracker` in `GoLinkCore` and the Android `:core` module has tests for it, and an XCUITest (`testPadAcrossRotations`, on the debug-only `-padLab` screen) rotates the Simulator and presses every pad control in each orientation.

### Added (website)

- **Choose your microphone and speakers** in the room: **Volume and voice** has a **Devices** block. Pick the microphone (it switches instantly, without reconnecting) and test it with a "Speak to test" meter; pick where the game and the voices play (speakers, headphones, AirPods…) and play a test tone there. Chrome and Edge list the outputs, Firefox adds "Choose another output". On iPhone and iPad, where the page cannot choose the output, a note explains how to do it from Control Center. The choices are remembered in the browser; if the chosen device disconnects, the sound goes back to the default and a notice says so. On phones the settings open as a sheet from the bottom.

### Added (Android app)

- A **Sound** sheet in the room (Players › Sound) picks the microphone (Automatic, the phone's, or a connected Bluetooth, wired or USB headset) and the output (Automatic, the loudspeaker, or a headset), with a Test sound chime. Automatic keeps the old route: headphones when connected, otherwise the loudspeaker, never the earpiece. The choice is remembered; a saved headset that is not connected yet is used as soon as it connects, and if the chosen device disconnects the app goes back to Automatic and says so. On Android 12+ each device is chosen exactly (`setCommunicationDevice`); on Android 8–11 by kind (Bluetooth SCO or speakerphone). The chosen microphone is also libwebrtc's preferred input.

### Changed (website)

- **Phone console drawer with tabs**: on phones and tablets playing with the on-screen gamepad, the side drawer is split into **Chat**, **Players** and **You**. The chat now fills the whole drawer (on an iPhone held sideways it showed only one or two lines), the Chat tab counts unread messages, Players holds the seats (swap, move, silence), the queue and the spectators, and You holds your name and big buttons for Volume and voice, Full screen, How to play and Leave room. Sideways the drawer takes about 40 % of the screen; the last tab is remembered while the page is open. The computer's room layout does not change.
- The rooms search hint no longer names real games ("Search your games…").
- The landing page shows **real screenshots** instead of drawings, in the page's language: the website (My device, its ROMs tab, a live test pattern room, the invitation with its QR code and PIN), the go-link window on the computer and the go-link Player app. Only the test pattern room and an invented ROM library appear: no real game, and nothing personal.
- New order: hero, then the guest's quick path ("Someone sent you a QR? Three taps": scan, type the PIN, play and talk, with the app's downloads and the browser as the other way in), the how it works walkthrough (now with screenshots of each step), the features (three columns), then the **Player app** section with Android's download (iPhone and iPad as coming soon) and a **gallery** whose pictures open large in an accessible dialog (Esc, arrow keys).

### Added (development)

- `cd e2e && npm run shots` makes the landing's screenshots again in English, Spanish and Portuguese: the device's window from Fyne's test driver (`TestShots`, `GOLINK_SHOTS`), the website on the e2e stack with an invented ROM library (`backend-device/cmd/shotseed`, `internal/shots`) and the Player app on an Android emulator. The computer's name, user name, local paths and addresses are masked, and a picture that still shows them fails.
- The Android end-to-end test covers more of the room: the 1P…NP start buttons (the device's input log and the test card's player lamps), the queue when the four seats are taken by browser guests (the app waits as #1, takes the freed seat, watches and comes back) and swapping seats with a browser guest asked from either side.
- `cd e2e && npm run test:android:camera` (opt-in): the app scans a QR code of a real invitation with the emulator's virtual camera (the poster on the virtual room's wall, the device moved in front of it over the emulator's gRPC), refuses a foreign one and joins with the PIN. It restarts the emulator with `-camera-back virtualscene` when needed and starts it again as it was.
- The Android harness closes system dialogs that a slow emulator shows over the app ("isn't responding": Wait; another app's crash: Close) and fails with the text when the app itself crashes; a release build on the device is replaced by the debug build. The weekly workflow waits for the launcher to settle before the test.

## [0.1.4] - 2026-09-29

### Added (Android app)

- **go-link Player**, a native Android app (Kotlin, Jetpack Compose, libwebrtc; `mobile/android/`) to join a game as a player: scan the invitation's QR code, type the 9-digit code or paste the link, then type the PIN and accept the terms. Every new join asks for the PIN; the device's return token only gets the app back in after a dropped connection.
- In the room: the game's video and sound, chat (notices in the reader's language), voice with the other players (the microphone line answered sendonly, per-player silence), the on-screen gamepad from the game's controls (portrait Game Boy, landscape Switch), Bluetooth and USB controllers as local players, start buttons 1P…NP, seats, queue, spectating, swapping controllers and pause.
- Headphones: sound and voice go to a Bluetooth, wired or USB headset when one is connected, otherwise to the loudspeaker. Camera, microphone and Bluetooth permissions are each asked when needed, after a short explanation.
- Invitation links (`https://go-link.org/g/…`) open the app on the PIN screen (Android App Links). QR codes are read strictly: only a go-link invitation link or a 9-digit code, never a server or a PIN.
- Settings: player name and your own signaling server (`wss://` only, tested before saving, with a way back to the official one).
- An end-to-end test of the app on an Android emulator (`cd e2e && npm run test:android`, also weekly in `.github/workflows/android-e2e.yml`): join by link and by code, wrong and used PINs, picture, gamepad, game sound, chat, voice both ways and coming back after the network drops. Debug builds log room events and WebRTC counters (`GoLinkE2E`) and accept `ws://` to the development machine; release builds do neither.
- Settings' "Test and save" saved no server at all (a server that answered was reported as silent); fixed.
- Releases publish the app signed with the release key as `go-link-vX.Y.Z-android.apk` (`make release` builds it; `ANDROID=0` skips it; the key stays outside the repository, `ANDROID_SIGNING`). The invitation page on Android downloads it directly, `/.well-known/assetlinks.json` carries the key's fingerprint so invitation links open the app, and the landing lists the app among the features.
- The portable protocol and room logic live in a plain Kotlin module (`:core`) with unit tests, as the base for an iOS version. `make android-debug` and `VERSION=x.y.z make android-apk` build it; CI runs its tests and a debug build.

### Added (website)

- On Android, an invitation page (`/g/…`) shows a card to get the go-link Player app from the latest release, next to playing in the browser.
- `/.well-known/assetlinks.json` for the app's App Links (the release key's fingerprint is still a placeholder, see `mobile/android/README.md`).
- The user guide has an "Android app" page (install, join, play, permissions).

## [0.1.3] - 2026-09-28

### Added (website)

- "How it works" is an animated walkthrough on the landing page and on My device: four steps (download, link, add ROMs and play, share) that play like a video, with a progress bar, pause and previous/next. Step 1 offers the download for your system (Windows, macOS, Linux, Docker, Raspberry Pi).
- My device shows the downloads of the latest release instead of "Downloads will be published soon": your system first, the others with their sizes, the release page and the checksums.
- My device, before linking, puts the code form first and shows the go-link window as it really looks (its texts in each language), with the downloads below.

- The Docker page of the user guide starts with a quick start (run, pairing code from the log, emulator, ROMs, panel key), explains host and bridge networking with one full command each, and lists the useful `docker exec` commands.

### Fixed (website and device)

- Room chat notices (took a seat, left, paused, swapped controllers…) and generated guest names ("Guest 9F3A") show in the reader's language: the device sends each notice as an event with its values (`event`, `args`).

### Fixed (device window)

- The countdown to a new pairing code is translated, and it no longer runs under the "Copy code" button.

### Changed (release)

- The device image is published on the GitHub Container Registry, `ghcr.io/lordbasex/go-link-device` (`:vX.Y.Z` and `:latest`, amd64 and arm64), by a workflow on every release; the website and the guide use it (`docker run … ghcr.io/lordbasex/go-link-device:latest`).
- The image is also on Docker Hub as `lordbasex/go-link-device`; the workflow copies each release there when the repository has Docker Hub secrets.
- The repository has a contributing guide, issue templates and a README that invites people to star, install and help.
- Releases include the Docker image by default (`DOCKER=0` skips it); v0.1.2 got its image afterwards. The Docker guide runs the image by its version tag (`go-link-device:vX.Y.Z`), which is how `docker load` names it.

## [0.1.2] - 2026-09-28

### Added (website)

- Recording in the room: the host's record button (red dot, then a square to stop) in the dock, with the time; everyone sees REC over the video and a notice in the chat; pausing a recorded game asks first.
- When a recording ends, the host is offered to download it; My device › History shows each game's recordings (download, delete), deletes a game from the history, and the space they take.
- Screenshots: a camera button saves a PNG of the game (crisp pixels, the game's shape), in the browser only.
- Factory reset on My device, with a confirmation.

### Changed (website)

- The landing page and the user guide describe recordings, MP4 export, screenshots and the phone console; a new guide page, "Recordings, screenshots and MP4". The guide no longer says voice is never recorded.
- Phones and tablets play in a full-screen console: upright like a Game Boy (picture on top, gamepad below), sideways like a Switch (picture in the middle, gamepad halves on the sides). The touch gamepad is on by default; chat, players and room actions open from a side tab.
- The controls over the video are see-through and hide after 3 seconds without moving the mouse or tapping, as in video players.
- On phones, a one-row header with a "…" tools menu, and the sections as a tab bar at the bottom of the screen.
- Recordings download as MP4 (H.264 + AAC, the picture enlarged with crisp pixels) ready for chat apps and phones: the browser converts them with WebCodecs and a small Go WebAssembly helper, the device takes no part. When someone spoke, a preview plays the recording first ("Preview and export"), with a Game and a Voices volume and a clipping meter, and "Export MP4" applies them; with voices the MP4 has three sound tracks (game and voices, the default; game alone; voices alone). Browsers that cannot convert save the original WebM.

### Added (device)

- Recording of game rooms for the host (`room_action` `record_start` / `record_stop`): a WebM file with the game's picture and sound and one track per player's voice, copied from the packets the room already sends (no encoding twice). It stops at 2 hours or 2 GB, when the game is paused and when the room stops; everyone in the room sees `room_state.recording` and a chat notice. Files in `~/go-link/rec/`, listed in the history of games (`get_recordings`, `delete_recording`, `delete_history`; clearing the history deletes them).
- Recordings download to the owner's browser over the `files` channel, pulled in 60 KB pieces with progress, cancel and a SHA-256 check at the end.
- Factory reset (`factory_reset`, `device reset --yes`): rooms, saved games, history, recordings, linked browsers and settings go; the device's identity and network settings, ROMs, thumbnails and the core stay.
- CLI: `device rec list`, `device rec rm`.

### Fixed

- The update notice reaches My device on the website (it only showed in the window).

## [0.1.1] - 2026-09-28

### Changed (device window)

- The window speaks English, Spanish or Portuguese (Settings › General, or automatic from the computer), live, without restarting.
- System is merged into Overview (the computer's details at the bottom, no usage shown twice); the Overview uses the app's logo, counts every live and paused room, and opens the rooms on the website.
- MAME › ROMs only manages the folder: drop zone and file picker, counters (sets, runs, will not run, added, folder size, free space); the game list lives on the website.

### Added

- The device checks go-link's releases on GitHub every 6 hours; the window and My device show a download notice when a newer version is out. My device also shows the device's version.
- My device › ROMs can choose which picture every browser shows and the device's pictures folder (`set_thumbnails`).
- Install page of the user guide with one tab per system (it opens on the visitor's own).

### Fixed

- The troubleshooting guide quotes the exact message the website shows for a used invitation.

## [0.1.0] - 2026-09-28

First public release (pre-release): universal macOS dmg, Windows, Linux, Raspberry Pi and Docker, with licenses in every file.

### Added

- User guide at `/docs` (English, Spanish and Portuguese): install, linking, ROMs, first game, invitations, controls, voice and chat, rooms, the app, pictures, headless panel, command line, Docker, network and troubleshooting. "Docs" in the menu and the footer.
- An arcade 404 page, and the website's version in the footer and in a `go-link-version` meta tag.

### Legal

- Terms of use and privacy policy (`docs/legal.md`, and `/terms` and `/privacy` on the website in English, Spanish and Portuguese), with the MAME trademark notice and the non-commercial license of mame2003-plus.
- Linking a device and joining a game require accepting the terms (a checkbox); the device keeps the accepted version with each linked browser.
- `THIRD_PARTY_NOTICES.md` (generated by `scripts/third-party-notices.sh`) ships with every release: inside the macOS app, the zip and tar.gz archives, the Docker image and as a release file.
- The website's fonts are bundled instead of loaded from Google Fonts, so no third party receives visitors' IP addresses.
- Site footer with licenses and legal links, and a GitHub link in the header.

### Documentation

- English documentation split into `docs/` (architecture, flows, device protocol, device, emulator, website, networking, security, building, deploying, status); the README is now a summary with quick start and deployment.
- This changelog, with the history of the private repository.

### Fixed

- A room of a game that cannot be saved failed to come back after a device restart: it was launched from its automatic save while the save check removed that file.

### Changed

- macOS: one universal app and `.dmg` (Intel + Apple silicon) for macOS 12 or later, built from any Mac; libvpx and Opus are built from source per architecture (`build/macos/static-libs.sh`) instead of Homebrew's copies, which required the build Mac's macOS version.
- Website hosting moved to a gitignored `deploy/local/hosting.mk`; `deploy/hosting.example.mk` shows a generic upload over SSH.
- Test fixtures use neutral values; fake test tokens are marked with `gitleaks:allow`.

## History before the public repository (2026-09-26 to 2026-09-28)

The project was built in a private repository first. These are its commits, grouped by day, newest first.

### 2026-09-28

- Deploy: signalhub is deployed from its own repository; go-link keeps only its CDN security headers, and the Makefile has no signalhub image targets
- Cores: document what is left for the mame2003-plus save state patches

### 2026-09-27

- Cores: mame2003-plus save state patches (Konami CPU, QSound, QSound Z80 bank) applied at build time by build.sh; the save probe also fails a game that freezes after loading
- Device: a game's save must hold the modules of its chips some cores leave out (Konami CPU, QSound), so a core that saves them resumes those games
- Web: a game that cannot be saved offers pausing (it stays in memory) before archiving or closing it
- Device: save probe per game and core (a save that leaves out a CPU or the sound, or that the core refuses, means the game always starts over), catalog marks Konami CPU and QSound games, 'device roms saves' tests the library
- Device: a thumbnail of the same game under another version is found (title without its parentheses); a game that cannot be saved drops its stale automatic save
- Device: games the emulator cannot save whole (a CPU without saved registers, like Konami's) never resume from a save; the web only offers a fresh start and no save
- Panel: no landing page; the local panel opens on the device until linked, then on its rooms
- Web: Spanish uses 'encender' instead of 'prender'
- Web: closing a game from its room goes back to the rooms instead of 'room not found'
- Gui: no Fyne call after the app loop ends (quitting from the menu panicked in GLFW)
- Device: L2, R2, L3 and R3 never reach the core (mame2003-plus: L3 turned the game sound off for everyone, R2 opens MAME's menu)
- Web: Escape closes dialogs and menus by key name too (not only the key code); the CPU headline has the peak's precision
- Web: history shows when each game ended; the go-link CPU share hides below 1% machine load
- Docker: ROM and thumbnail folders are volumes (image owns them, a new volume is not root); panel opens one link per page; device CPU counts its game processes; CPU peak keeps its decimal, share capped at 100; stats popover above the dock
- Signalhub moves to its own repository (next to this one): compose, e2e, CI and make docker take it from SIGNALING_DIR / SIGNAL_DIR; docs updated
- Web: the guest join page loads with the lobby (no ineffective dynamic import warning)
- Panel: rooms play through the device's own socket (signalhub refuses the panel's LAN origin): room-mode login, join by room/invite/code, every request answered; client handshake before open; tested with a real game in Docker
- A11y: axe WCAG 2.1 AA checks in e2e (every page, both themes, linked device and rooms); one main landmark, room tab list holds only tabs; landing music no longer fails when closed while resuming
- Test: device CLI commands (roms, thumbnails, panel token, help, log file)
- Web: parsers refuse non-object messages, ICE servers are validated, room lists and early ICE candidates are bounded, a broken thumbnail never stalls the queue
- Test: saved game files are 0600
- Go 1.26.8 everywhere (govulncheck clean); device: picture size cap, disk space guard on uploads, 20 saves per room, private saves, core hash checked before loading, guest control rate limit, ICE candidate cap, panel host check and bounded waiting sockets
- Docs: CDN security headers are applied
- E2e: Playwright tests of the whole story (landing, pairing, remembered link, test room video, single-use invitation, local panel); the join page's PIN error is shown
- Gitleaks: fingerprints of the test tokens after the history rewrite
- Gitleaks: fingerprints of the test tokens after the history rewrite
- Ci: GitHub Actions for signalhub, the device, the website and secrets
- Gitleaks: fingerprints of the test tokens after the history cleanup
- License: MIT; the kickoff brief stays local
- Device: x/image v0.43.0 and x/net v0.56.0 (govulncheck: no reachable vulnerabilities)
- Signalhub: device_secret is required on register
- Security: bind device_id to a device secret, the device proves itself before a browser's token, panel login by nonce proof, connection and message limits, hardened coturn, PIN lockout spares the host and guests, CDN security headers ready
- Docs: neutral Spanish in the signing example
- Release: MacDub-style release script (every platform, SHA256SUMS, Homebrew cask, GitHub pre-release), Developer ID signing and notarization ready
- Web: the landing is the home page and the rooms move to /rooms; Spanish copy without voseo
- MacOS: drag-to-Applications .dmg in the go-link style (make device-dmg)
- Device: keep Go 1.25 (x/term v0.40.0), as the build containers use
- MacOS: the device ships as go-link.app with its icon, so the Finder opens no Terminal; logs go to a file without a terminal
- Device: local web panel for headless devices (UUID token, WebRTC only), Docker image, and libvpx/Opus linked statically
- Landing: retro chiptune music with the fight's hits, and a mute button in the arcade screen
- Windows build: link winpthreads for libvpx and build Opus without run time CPU detection on ARM
- Landing: How it works page with a quick join, a retro fight animation, steps, controllers and the legal note; Linux build gets Wayland
- Tests: run the room passes test
- Invitations: one PIN per person, return tokens and an owner key; room: compact header, chat button, sound on by default
- My device: test pattern button and an invite to test with someone else
- History: who played at each port, their names and the address they came from
- Theme: light mode next to the default dark one, switched from the header
- Loading: wait for the device's status and room art before showing the page; skeletons instead of empty lists
- History: ask the device again once the data link is up
- My device: game history tab, skeletons while loading, infinite scroll for ROMs and a branded loading screen
- Icons: the brand mark as favicon, web app icons and the device's app and tray icon
- Rooms: no join-by-code for owners; ⋯ menus are never cut by the list or the cards
- Rooms: New game is a + circle at the right of the filters, no longer in the header
- Guest join page in the pairing page's layout: left-aligned fields with icons, a sample invitation and the steps
- Rooms and ROMs: more space between the filter chips and before the cards or list
- Header: signaling server and linked device as 36 px circles with tooltips
- Security: every room is private with an invitation and a PIN renewed on each start; guests get a code and PIN form, a Guest badge and the room details from the device
- Room: players on the left and the dock on the right at the same adaptive size; phone layouts that do not cover the game; gamepad buttons with depth
- Web: capsule buttons across the site (36 px, icon circles with tooltips), and a room with one dock over the video for start, voice and tools
- Room: the stream figures sit behind a fixed-size (i) button that opens the details
- Rooms: guest view without owner actions, room chat the host can turn off (enforced by the device), and players in a floating capsule over the video
- Input: keyboard maps saved before the start buttons move to 1-4 = 1P-4P, keeping custom keys
- Invitations: signalhub makes an invite link and a 9 digit code per room, private rooms admit only them; device shows them and renews them; web joins by /g link or code, with an Invite dialog and QR
- Web: pages other than the lobby load on demand, so no chunk is over 500 kB
- Chat: typing indicator relayed by the device, a chime for new messages, and a panel that can be hidden with an unread count
- Private rooms: a 6 digit PIN the device checks before streaming, with limited tries, a New PIN action and a lock in the lobby
- All pages share the My device look: PageHero, chips and cards; New game with a searchable game picker and a preview
- Room page in the style of My device: hero with the game's picture, chips and actions, and cards
- Controls panel: outline drawings of the detected gamepad (PlayStation, Switch Pro, Xbox or generic) whose parts light up
- Rooms: start buttons of players 1 to 4, swap controllers between seats, and a clear message for the games limit
- Rooms page: the list view is a table with columns, like the ROMs list
- My device: Space used card with ROMs, thumbnails and saved games instead of Current room
- Rooms page: search, count and cards or list view
- Home page is Rooms: public rooms of everyone plus the host's own with all states and actions; My device loses its Rooms tab
- Lobby: drop the side cards; How it works in the header opens the help dialog
- Lobby: the approved design, wide grid of cards with the room's thumbnail on the left
- ROMs tab: search box, and Play asks for name, public or private, voice and the lobby picture
- Device window: bigger by default, resizable with a minimum, remembers its size (and place on macOS)
- Device window: Settings section (thumbnail kind, size and folder, rooms, network) and thumbnails dir/kind CLI
- Docs: thumbnail kind from Settings, room action icons
- Web: show the thumbnail kind the host chose; room actions as icons with tooltips and a ⋯ menu
- Settings service for thumbnails (folder, kind, size); never start a new room twice
- Fix room actions being dropped (text id), goroutine dump on SIGUSR1, quieter input logs, clearer room errors
- Rotate vertical games in the core, and keep game workers out of the device's Ctrl-C so they are saved first
- Deploy: let a device keep several rooms open (one per game)
- Web: My device › Rooms to run several games, with favorites, pause, saves, archive and trash; Boxart in the lobby
- Game server: several rooms at once, each game in its own process, with pause, save states, archive, trash and favorites
- Thumbnails: the host's Boxart, Title and Snap in the device window (Emulators › MAME) and on the web

### 2026-09-26

- Remove the free ROM download: the app only says it is based on MAME and ROMs are found online
- My device: ROMs tab with cards and list views, Play opens create room with the game chosen
- My device: live dashboard with CPU, memory, network and ROM storage, and a new pairing view
- Switch Node in the same shell, not a subshell
- Build the website with the Node pinned in frontend/.nvmrc
- One persistent header for every page, rendered once outside the routes
- On-screen gamepad for phones and tablets, full screen, how to play dialog, one header everywhere
- Room state carries the game's controls from the mame2003-plus list
- Web in English, Spanish and Portuguese with a three-bubble language switch
- Remap keys and gamepad buttons, pick each pad's player, close the game
- One UDP port for WebRTC and announced addresses, for a direct path
- Show whether media flows directly or through the TURN relay
- Pause the game for everyone, and anti-spoofing DNS notes
- Website live on go-link.org: logo, CDN invalidation from a local file
- Makefile for web, device and signalhub builds and the website upload
- Deploy: Caddy always on in production, with automatic certificates
- Deploy: the production server builds signalhub from source
- Deploy: production compose for a small server, running on a small server
- Rename the project to go-link, on go-link.org
- Window: capsule Open in browser button on the pairing screen
- Window: keep the code countdown centered when Copy code changes
- Window: copy the pairing code from the pairing screen
- Window: roomier pairing screen with numbered steps
- Window: move by the top band, no dark frame, responsive cards
- Remember linked browsers, and a native window in MacDub's style
- Signalhub: reach, to come back to a linked device without a code
- Device: native window with Fyne, and no web server on the device
- Check ROM sets without running them, and manage the device from the CLI
- Emulator: answer every core option with its declared default
- Set the ROM folder and drop ROMs from the web over WebRTC
- Create game rooms from the web, and download the emulator core
- Docs: native device GUI planned with Fyne, replacing the local web panel
- Emulator: libretro frontend running mame2003-plus, playable in the browser
- Voice between players: separate tracks, SFU forwarding, volumes
- Free ROMs from mamedev.org, downloaded by the device on request
- Room Manager: seats P1-P4, arcade queue, spectators and chat
- Web: controls panel, keyboard player choice, and early offer fix
- Input v2 with gamepads and local players; test card draws a gamepad at 60 fps
- Test room: PM5544-style test card and 1 kHz reference tone
- Device status and P2P latency over WebRTC for linked browsers
- Phase 5 step 1: test pattern video over WebRTC and controller input
- Device: avoid a double period in the panel's next-code line
- Frontend: phase 4, shared package and web with the four design screens
- Docs: help message when a room is not found on the current server
- Docs: custom signaling server selectable from the web (localStorage)
- Device: --server-signaling flag and public default server
- Device: phase 3 skeleton, and deploy stack with coturn
- Docs: signalhub stays in-memory, drop metrics and Redis from roadmap
- Signaling: signalhub v0.2 rooms, directory, rate limit and TURN
- Signaling: signalhub v0.1 pairing and signal relay
- Docs: architecture, signaling protocol and UI prototype
