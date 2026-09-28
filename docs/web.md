# The website

`frontend/` is React + TypeScript with npm workspaces. The build is a static folder that any static web host can serve.

| Package | What it is |
|---|---|
| `packages/shared` (`@go-link/shared`) | Protocol types, the signaling client, server selection, the WebRTC player, the 9-digit code, room metadata validation, SHA-256/HMAC and the design tokens (`tokens.css`) |
| `apps/web` (`@go-link/web`) | The website |

## Development

```bash
cd frontend
npm install
npm run dev          # http://localhost:5180
npm test             # every test (vitest)
npm run typecheck
npm run build        # apps/web/dist, ready for a static host
```

A single test:

```bash
npx vitest run apps/web/src/app.test.tsx -t "links a device"
```

Against a local signalhub:

```bash
LIVE_SIGNAL_URL=ws://127.0.0.1:8090/ws npx vitest run packages/shared/test/live.test.ts
```

A local signalhub must accept the dev server's origin in its `ALLOWED_ORIGINS`.

### Configuration (`apps/web/.env.local`)

Template: [`apps/web/.env.example`](../frontend/apps/web/.env.example).

| Variable | Description |
|---|---|
| `VITE_SIGNAL_URL` | Default signaling server. Local: `ws://127.0.0.1:8090/ws`. Production: `wss://signal.go-link.org/ws` |
| `VITE_DEMO_DATA` | `true` shows sample data (rooms, players, chat) instead of real data |

STUN and TURN are **not** configured: they arrive in signalhub's `hello` and live only in memory.

## Routes

| Route | Page |
|---|---|
| `/` | How it works: the landing page |
| `/rooms` | Rooms: the host's own games, or the "Join a game" form in guest mode |
| `/create` | New game (`/create?rom=<set>` preselects a game) |
| `/g/:invite` | A room by invitation (a link or QR token, or a 9-digit code) |
| `/g` | Guest join form (code + PIN) |
| `/r/:roomId` | A room by id (the owner's own rooms) |
| `/device` | My device: linking with the code, then the live dashboard |
| `/device/roms`, `/device/history` | My device tabs |
| `/docs`, `/docs/:page` | The user guide ([below](#user-guide)) |
| `/terms`, `/privacy` | Terms of use and privacy policy ([docs/legal.md](legal.md) in three languages) |

On a headless device's local panel, `/` goes to `/device` (not linked yet) or `/rooms`, and there is no landing page.

## Languages

All visible text lives in `apps/web/src/i18n/`: `en.ts` (English, default and reference), `es.ts` (Spanish) and `pt.ts` (Brazilian Portuguese), with exactly the same keys (the `Messages` type checks it at build time). The EN · ES · PT switch in the header changes the language live, without reloading, so a running game is not interrupted. The choice is kept in `go-link.lang` and reflected in `<html lang>`. To add a language: another file with the same shape and an entry in `LANGS` (`i18n/index.ts`).

## Pages

- **Downloads:** My device shows "No go-link yet?" (`components/DownloadCard.tsx`) with the download for the visitor's system, the other systems with their sizes (Windows and Linux ARM, Docker, Raspberry Pi), the release page, the checksums and the walkthrough in a dialog. Versions and sizes come from `src/release.json`, which `scripts/release-info.sh` writes when a release is cut (`release.sh` runs it; commit it with the cask).
- **Header:** logo and tabs How it works · Rooms · My device, the language switch, the signaling server button and the light/dark theme switch. It is rendered once in `App.tsx`, outside the routes, so it never remounts.
- **How it works (landing):** a quick **Join a game** button (the same `JoinForm` as the guest page), an SVG pixel fight (`components/landing/FightScene.tsx`, no real game art or names), the **how it works walkthrough** (`components/landing/Wizard.tsx`: four animated steps, download, link, add ROMs and play, share, that play like a video every 7 s with a progress bar per step, pause and previous/next; step 1 preselects the visitor's system and offers its download, or the Docker command; on a phone it offers to share the download link; animations respect reduced motion), features, animated controllers (`ControllersShowcase`), how the game travels, and the legal note. An original chiptune loop made with Web Audio (`components/landing/chiptune.ts`) plays only on the landing, with a mute button that is remembered.
- **Rooms:** the linked device's rooms as cards or a table, with search and filters (All, Live, Paused, Favorites, Archived, Trash). Each room has icon actions and a ⋯ menu (`components/device/RoomControls.tsx`): open, pause/resume, save, invite, archive, delete, restore, favorite. Turning a room on asks: continue, start fresh or a saved slot. Guests only see the join form.
- **New game:** pick a game (`GamePicker`: search, arrows, Enter, Escape; any library size), a name, voice and chat, with a preview of the game's thumbnail.
- **Room:** the video with a floating **players capsule** (seat colors, speaking glow, muted mic, free seats) on the left and a **dock** on the right: Start 1P-4P, voice (mic, level, game and voice volumes), pause, controls, sound and full screen. The owner also gets Invite (dialog with QR, link, code and a new PIN per person), Close game, and the chat switch. Chat with bubbles and a "typing…" indicator. A "How to play" dialog (`components/HelpDialog.tsx`) explains seats, keyboard, gamepads, touch, full screen, sound and voice.
- **My device:** shows the device's version, and a notice with a download link when a newer go-link is released. Without a device, the linking view with the 9-digit code. With a device, a live dashboard (`components/device/DeviceDashboard.tsx`): system CPU, go-link CPU, memory, latency, players, CPU chart (1, 2 or 5 min), network, disk space used by ROMs, thumbnails and saves, library, connection path; tabs **ROMs** (cards or list, search, sort, status chips, Play, drop zone for zips and pictures, ROM folder, and the game pictures settings: which picture everyone sees and the device's pictures folder) and **History** (every game that ran, with players and their connection path).

## User guide

`/docs` is the user documentation for hosts and players: getting started (install, link, emulator and ROMs, first game), playing (invitations, controls, voice and chat, rooms), the go-link app (window, pictures, headless panel, command line, Docker), network (connection, own signaling server) and troubleshooting. Its content is data in `src/i18n/docs-{en,es,pt}.ts` (typed by `docs-types.ts`: paragraphs, headings, lists, steps, code, tables and notes, with `code`, **bold** and [links](/path) inline), rendered by `pages/DocsPage.tsx` with a searchable sidebar, an "On this page" list and previous/next links. The three languages must keep the same pages and blocks (a test checks it). Keep it in sync when a user-facing feature changes.

## Terms of use

Linking a device (with the code or on the local panel) requires ticking "I have read and accept the Terms of use and the Privacy policy" (`components/legal/TermsCheck.tsx`); a guest ticks it once before joining (join form or PIN prompt). The accepted version (`TERMS_VERSION` in `src/legal.ts`, the date of `docs/legal.md`) is kept in `go-link.terms`, and a new version asks again. The website also sends it in the control channel's `auth` (`terms`), and the device keeps it with that browser's link in `device.json`. The landing and legal pages end with the site footer (`components/legal/SiteFooter.tsx`): product links, source code, releases, licenses, the legal pages and the MAME trademark notice. The header has a GitHub link.

## Mobile, tablets and full screen

- **Touch gamepad:** on touch screens the see-through gamepad (`components/TouchPad.tsx`) is on by default (the controller button over the video turns it off, and the choice is remembered): D-pad on the left, action buttons on the right, Coin and Start 1P-4P. Several fingers work at once, and sliding the thumb between buttons works like an arcade panel. The action buttons come from the game (`room_state.controls`); a 4-way joystick game only sends the dominant direction.
- **Console mode:** while a game streams with the touch gamepad, the room becomes a handheld console that fills the screen (`.video-stage.is-console`): held upright it is a Game Boy (the picture on top, the pad below, Coin and Start under it like Select and Start); held sideways it is a Switch (the picture in the middle, one half of the pad on each side). The header and the room's title are not shown; chat, players, queue, How to play and Leave live in a drawer opened from a tab on the right edge, which counts new messages. The first touch puts the whole page in full screen where the browser allows it (Android), without locking the rotation.
- **Controls over the video:** the players capsule, the dock and the chips are see-through and fade out after 3 seconds without a mouse movement or a tap, as in video players (desktop too). A movement or a tap brings them back, a tap on the bare picture hides them, and playing on the gamepad never wakes them.
- **Full screen:** the Fullscreen API on the video stage (Android also tries to lock landscape), or on the whole page in console mode so the drawer and dialogs stay visible. iPhone Safari does not allow full screen on elements, so the stage fills the window with CSS (`useFullscreen`).
- **Other pages on phones (up to 700 px):** a one-row header with the logo, the Guest or device badge and a "…" button that opens the tools (language, signaling server, theme, GitHub); the sections (How it works, Rooms, My device, Docs) are a tab bar at the bottom of the screen, hidden inside rooms, in dialogs and while typing. Titles are smaller and the 9 digit code fits one row.

## Recordings and MP4

The host records a game from the room's dock; everyone sees REC and a chat notice. When a recording ends, the host's browser offers to download it: the WebM comes from the device in 60 KB parts over the `files` DataChannel (progress, cancel, SHA-256 check), and then **the browser** turns it into an MP4 that chat apps and phones play ("Preparing the MP4 video…"). The device takes no part in the conversion:

- `frontend/wasm/mp4` is a small Go program compiled to WebAssembly (`make -C frontend/wasm/mp4 build`, run by `make web-build`; output in `apps/web/public/mp4/`, not committed). It reads the WebM (frame positions only, nothing copied) and writes a progressive MP4 with the index first. Tests run on the computer (`go test ./...`, one of them muxes a real ffmpeg stream and decodes it back).
- `apps/web/src/components/toMp4.ts` uses WebCodecs: VP8 is decoded, enlarged by whole steps without smoothing (up to 900 px high) and encoded to H.264; the Opus tracks are decoded, mixed five seconds at a time and encoded to AAC. When someone spoke there are three sound tracks, alternatives of one another (a player plays one): 1 the game and the voices mixed (the default, what phones and chat apps play), 2 the game alone, 3 the voices alone. When the recording has voices (its `tracks` list `voice-pN`), the saved dialog offers "Preview and export" and, once downloaded, shows a preview before converting (a recording without voices is converted right away, there is nothing to mix): the <video> plays the picture and the game, the voices are decoded a few seconds ahead and played with Web Audio, and a Game and a Voices volume (0-300 %) plus a clipping meter set the mix; a soft limiter keeps peaks from crackling (`RecordingPreview.tsx`).
- Browsers without WebCodecs or without an H.264/AAC encoder save the original WebM instead, and say so. The CSP allows `'wasm-unsafe-eval'` for this.

Screenshots are browser only: the camera button draws the `<video>` into a canvas and saves a PNG.

## Your own signaling server

The **Signaling server** button in the header lets a user switch servers without rebuilding anything. See [networking.md](networking.md#your-own-signaling-server).

## Design system

- **Capsule UI:** every button is a 36 px capsule; icon-only buttons are 36 px circles with a tooltip (`data-tip`). Inputs, selects and segmented controls are capsules too. Touch devices get an invisible 44 px hit area. Square buttons are never mixed with capsules.
- **Tokens:** colors exist only as tokens in `packages/shared/src/tokens.css`: `:root` is the dark theme (default) and `:root[data-theme="light"]` the light one. Never hardcode a color: add a token with both values. The video stage (`.video-stage`) keeps the dark tokens in light mode.
- **Theme before paint:** `public/theme.js` applies the saved theme (`go-link.theme`) before the page paints. It is a separate file because the CSP forbids inline scripts.
- **Shared pieces:** `PageHero`, `Chip`, `HeroTile`, dashboard cards, `GamePicker`, `ControllerArt`, the ROM and room tables.
- **Loading:** a splash logo (`#splash` in `index.html`, `public/splash.css`) stays at least 3 s and until the first screen has real data (`useSplash` in `App.tsx`, max 8 s). After that, views show skeletons (`components/ui/Skeleton.tsx`), never an empty list that fills later. Long lists page with `useInfiniteList`.
- **Fonts:** Chakra Petch, IBM Plex Sans and JetBrains Mono (SIL Open Font License) are bundled with the site (`@fontsource`), never loaded from a font service, so no third party receives visitors' IP addresses.
- **Icons:** `public/favicon.svg` is the header logo. The PNG icons come from `backend-device/pkg/trayicon.Render`, the same drawing the device uses for its app and tray icon.
- **Accessibility:** real `<button>` and `<a>`, `<label>` on inputs, `aria-label` on icon-only buttons, one `<main>` per page. The end-to-end tests run axe on every page.

## Security

- A strict CSP in the production build (`connect-src 'self' wss:` to allow your own signaling servers). It does not apply in development, because Vite needs inline scripts.
- Anything written by other users (room metadata, names, chat) is always rendered as text.
- See [security.md](security.md).
