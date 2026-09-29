# The device (host app)

`backend-device/` is the program the host runs on their own computer. It runs MAME through libretro, streams over WebRTC, manages the rooms, and shows the pairing code in a **native window** (Fyne) with a tray icon. With a window it opens no port at all. Without one (a server, a Raspberry Pi, Docker) it serves a local web panel on the LAN.

## Running it

```bash
cd backend-device
go build -o bin/device ./cmd/device                  # with the window (Fyne)
go build -tags headless -o bin/device ./cmd/device   # no GUI: servers, Raspberry Pi
./bin/device                                         # window + tray icon
./bin/device --headless                              # no window: log, CLI and the LAN panel
```

On macOS the release is `go-link.app`: open it like any app. From a terminal, use the binary inside it: `go-link.app/Contents/MacOS/go-link-device`.

| Flag | Description |
|---|---|
| `--config <path>` | Another `device.json` (useful to run several test devices) |
| `--server-signaling <url>` | Signaling server for this run (`wss://…/ws`) |
| `--headless` | No window or tray icon. Automatic on Linux without a display and in `-tags headless` builds. Opens the local web panel |
| `--panel <addr>` | Address of the local web panel when headless (default `:7373`, every LAN interface) |
| `--no-panel` | Do not open the web panel when headless |
| `--web-url <url>` | Website the window shows for linking, for this run (default `web_url` in `device.json`, else `https://go-link.org`) |
| `--game <set>` | Start the test room with this game, for example `--game robby` |
| `--core <path>` | libretro core to use (default `~/go-link/cores/mame2003_plus_libretro.<ext>`) |
| `--udp-port <port>` | Carry every WebRTC connection on this UDP port (see [networking.md](networking.md#direct-connections-one-udp-port)) |
| `--announce <ips>` | Comma-separated addresses where browsers reach `--udp-port` through a forwarding router |
| `--test-room=false` | Do not open the test pattern room |
| `--test-room-pause` | Let the host pause the test pattern room (the card holds and the tone stops), to try the pause and its requests without a game |
| `--debug` | Verbose logs |

Flags take one or two dashes (`-headless` or `--headless`).

### Which signaling server it uses

In this order:

1. `--server-signaling`, for this run only.
2. `signal_url` in `device.json`, permanently. The right choice for a host without a terminal who runs their own server.
3. The project's public server, built in: `wss://signal.go-link.org/ws`.

The URL must be `ws://` or `wss://`. With `ws://` (unencrypted) to anything but the local machine, the device warns in the log. **STUN and TURN are never configured on the device**: signalhub sends them in its first message (`hello`), and they live only in memory.

### How the pairing code stays valid

- On connecting, the device asks for a code (`register`).
- When a browser redeems it (`paired`), the code is spent, so it asks for a new one at once.
- Every 9 minutes it renews the code before it expires (after 10).
- If the connection drops, it hides the code and retries with exponential backoff and jitter (1 s, 2 s, 4 s… up to 30 s), so a thousand devices do not all reconnect at the same instant after a server restart.

## Command line

Everything the website does can also be done from a terminal, for a device without a screen (`device help` lists the commands):

```bash
device                                   # run the device
device core download                     # download the emulator core and its game list
device roms dir [PATH]                   # show or change the ROM folder
device roms check [--dir D] [--json]     # check which ROM sets the core can run
device roms saves [--json]               # test which games can resume from a save
device thumbnails check [--json]         # count the thumbnails of the ROM sets
device thumbnails dir [PATH|default]     # show or change the thumbnails folder
device thumbnails kind [boxart|title|snap]   # which thumbnail is shown
device panel token [--new]               # show (or replace) the web panel token
device rec list [--json]                 # list the recordings of game rooms
device rec rm ID...|--all                # delete recordings
device reset --yes                       # factory reset (with the device stopped)
```

Every subcommand accepts `--config PATH`. Settings changed from the CLI are saved in `device.json`; a running device picks them up on its next start.

## Configuration: `device.json`

Created on the first run with mode `0600`:

| System | Location |
|---|---|
| macOS | `~/Library/Application Support/go-link/device.json` |
| Windows | `%AppData%\go-link\device.json` |
| Linux | `~/.config/go-link/device.json` |

| Key | Meaning |
|---|---|
| `device_id` | Permanent UUID of this computer |
| `device_secret` | Random secret that binds `device_id` on signalhub. Never share it |
| `signal_url` | Signaling server (empty = the public one) |
| `web_url` | Website the window shows for linking (empty = `https://go-link.org`) |
| `roms_dir` | ROM folder (empty = `~/go-link/roms`) |
| `thumbnails` | `dir`, `kind` (`boxart`, `title`, `snap`) and `size` (list size in the window) |
| `udp_port`, `announce_ips` | Fixed WebRTC UDP port and the addresses to announce for it |
| `max_rooms` | Game rooms running at once (default 4, counting paused ones) |
| `rooms` | The saved game rooms and their state |
| `links` | Linked browsers: `id`, `token_hash` (SHA-256 of the token, never the token), `created_at`, `last_seen`, and the terms of use version accepted (`terms`, `terms_at`) |
| `panel_token` | UUID token of the local web panel (headless only) |
| `language` | Language of the window: `en`, `es` or `pt` (empty follows the computer) |

- It is saved atomically (temporary file + rename), so a power cut never leaves it half written.
- STUN and TURN are **not** stored here.
- Other files live in `~/go-link/`: `cores/` (emulator core and game list), `roms/` (default ROM folder), `thumbnails/MAME/`, `saves/<room>/` (save states), `rec/<room>/` (recordings, 0600, see [Recordings](protocol.md#recordings)), `history.json` (0600) and `logs/device.log`.

### Factory reset

From My device on the website (`factory_reset`) or, with the device stopped, `device reset --yes`. It deletes what the host made on this device:

- every room (running ones stop without saving) and every saved game (`saves/`),
- the history of games and every recording (`history.json`, `rec/`),
- the linked browsers (they must link again with a new pairing code),
- the settings: ROM folder (back to `~/go-link/roms`), thumbnails, `max_rooms`, `web_url` and `language`.

It keeps what makes the device itself and reachable, so it can be linked again right away: `device_id`, `device_secret`, `signal_url`, `udp_port`, `announce_ips` and `panel_token`. It never deletes the host's own files: ROMs, thumbnails, the emulator core and the logs stay.

### Single instance

The device locks `device.lock` next to `device.json` (`flock` on macOS and Linux, `LockFileEx` on Windows). If another device holds it, the second one says so and exits. The system releases the lock when the process ends, even after a crash.

## Native window (Fyne)

`internal/gui` builds the window and the menu bar panel. **There is no web server behind it**: the window calls the same services (`StatusService`, `LibraryService`, `RoomsService`…) that the website reaches over WebRTC and the CLI calls directly.

- **Before any browser is linked**, the window shows only the pairing code and the website where to type it.
- **After that**, a sidebar with:

| Section | Content |
|---|---|
| **Overview** | The app's logo and what the device is doing: rooms (live, paused), people playing, linked browsers, CPU, memory, network, streaming, players, latency; a notice with a download button when a newer go-link is released; **Open go-link** (the rooms on the website), **Link another browser**, **Unlink all**; and **This computer**: system, processor, memory, device ID, version and website |
| **Emulators › MAME › ROMs** | Folder management only: emulator status and download, the ROM folder (choose, open), a drop zone (and a file picker) that copies `.zip` sets into it, and counters: sets, runs, will not run, added from the window, folder size and free space. Every game, its check and Play are on the website |
| **Emulators › MAME › Thumbnails** | How many sets have Boxart, Title and Snap, the list per game, how to name images. Dropping images saves them; dropping a folder with `Named_Boxarts`, `Named_Titles` and `Named_Snaps` saves each in its kind |
| **Settings** | **General**: the window's language (Automatic, English, Español, Português; kept in `device.json` as `language`). **Thumbnails**: which picture is shown and the folder. **Rooms** and **Network**: `max_rooms`, where saves go, the signaling server and the STUN/TURN received |

- **Menu bar panel:** a click on the tray icon opens a small panel with status, CPU, memory, network, streaming, players and browsers (and the code while nothing is linked). Right click opens the menu. On macOS the panel appears under the icon and closes when clicking outside (`panel_darwin.m`).
- Closing the window hides it; the device keeps running in the tray. **Quit** in the tray stops it.
- The UI repaints on every status change (`StatusService.OnChange`), always on the UI thread (`fyne.Do`). Fyne runs on the main goroutine, as macOS requires.
- The app and tray icon is the website's logo, drawn in code by `pkg/trayicon`.
- **Optional at build time:** `cmd/device/ui_gui.go` and `cmd/device/ui_headless.go` pick the UI. `-tags headless` links neither Fyne nor OpenGL.

## Local web panel (headless devices)

A device **without a window** (Raspberry Pi, server, Docker, or `--headless`) opens a **web panel** on the LAN: the same "My device" website, served by the device at `http://<device IP>:7373`. A device with a window opens no port.

- **Business logic stays 100% WebRTC, no REST API.** The port serves only the website files (embedded from `backend-device/web/panel/dist`, built with `make panel`) and a WebSocket at `/ws` that carries **only the WebRTC negotiation**, with signalhub-like messages (`hello`, `paired`, `signal`). Everything else travels afterwards over the WebRTC data channel, exactly as for a browser linked with a code. Any other HTTP method gets 405.
- **Panel token:** a UUID v4 created on the first run and kept in `device.json` (`panel_token`). `device panel token` shows it (never the log); `--new` replaces it (with the device stopped). The token **never travels over the network**: the browser asks for a challenge (`{"type":"panel"}` → `{"type":"panel_nonce","nonce":"…"}`) and answers `{"type":"panel","proof":"…"}`, an HMAC-SHA256 of the nonce with the token. Each nonce allows one try. The browser remembers the token (`go-link.panel-token`, never in the URL).
- The WebSocket only accepts pages of the same panel (`Origin` header), and 5 wrong proofs in a minute block that IP for 5 minutes.
- **The website knows it is the panel** because the device adds `<meta name="go-link-panel">` when serving `index.html`. The link with the device then goes over the local WebSocket, so it works on a LAN without internet.
- **Playing from the panel:** the public signaling server does not accept the panel's origin, so panel rooms also go through the device's WebSocket. The website opens a second socket in room mode (`{"type":"panel","mode":"room"}`, no data channel) and sends `join` with a `room_id`, `invite` or `code`, as on signalhub. Guests from the internet still join through the official website with their invitation.
- On the panel, `/` opens My device until a browser is linked, then the rooms. The landing page is not shown.

## Updates

A few seconds after starting, and every 6 hours, the device reads go-link's public releases list on GitHub. When a newer version than its own is out, the window's Overview and the linked website show it with a link to the release page. Nothing is downloaded or installed by itself, and development builds (without a version tag) never check.

## Players, names and pausing

Each room's **Room Manager** (`internal/services/room_manager.go`) is an actor: one goroutine owns the seats, the queue, the chat and the requests for a pause, and timers post back to it (a request for a pause expires after 30 s inside that goroutine). It enforces the rules itself, never trusting a browser:

- **Names:** `CleanName` keeps letters, digits and single spaces (NFC first), cuts to 20 characters and falls back to the generated `Guest XXXX` below 2; the guest learns the name in use from `room_state.you.name` ([protocol](protocol.md#player-names)).
- **Pausing:** only the host pauses. The PIN gate reports which guests came in with the owner key (`PinResult.Owner`), and the linked browser itself is trusted too; `TestRoomService` marks both with `MarkOwner`. Others ask with `pause_request`; the host answers in the room or from a linked browser (`RoomsService.AnswerPause`, `pause_answer`). `host_online` comes from the owners in the room plus `SetHostLinked`, which `cmd/device` updates whenever a proven linked browser's control channel opens or closes (`StreamService.HasLink`, `LinkService.OnChange`). Linked browsers hear about requests through `RoomsConfig.OnPauseAsk` (`pause_asked`, `pause_ask_gone`) and see them in `device_status` ([protocol](protocol.md#pausing-is-the-hosts)).

## Metrics

Every 2 seconds the device measures CPU and RAM of the machine and of go-link itself, including its emulator processes (`pkg/sysinfo`, gopsutil), plus machine-wide network traffic. The data lives in `StatusService`, which the window reads and linked browsers receive over WebRTC. It also measures peer-to-peer latency to each linked browser with a ping over the data channel.

## Docker

The `go-link-device` image (`backend-device/build/docker.Dockerfile`, `make device-docker`) is the headless binary with the panel on port 7373. Each release publishes it for amd64 and arm64 on the GitHub Container Registry as `ghcr.io/lordbasex/go-link-device:vX.Y.Z` and `:latest` (`.github/workflows/docker.yml`, on every published release or by hand with a tag), so `docker run … ghcr.io/lordbasex/go-link-device:latest` is enough; the release also carries it as an OCI archive for machines without internet (`docker load`, it loads as `go-link-device:vX.Y.Z`). Everything it keeps lives in the `/data` volume (configuration, core, saves, history). The core downloads on first use and is never in the image.

ROMs and thumbnails are **volumes you mount from outside**:

| Inside the container | What goes there | Example |
|---|---|---|
| `/data/go-link/roms` | MAME 2003-Plus (0.78) sets | `-v ~/roms:/data/go-link/roms` (add `:ro` to block uploads from the website) |
| `/data/go-link/thumbnails/MAME` | Thumbnails in the libretro layout (`Named_Boxarts`, `Named_Titles`, `Named_Snaps`) | `-v ~/thumbnails/MAME:/data/go-link/thumbnails/MAME:ro` |

The image creates those folders owned by the device user (`golink`, uid 1000), so a new volume is not owned by root. Host folders mounted without `:ro` must be writable by uid 1000.

```bash
cd backend-device && docker compose up -d --build     # the example docker-compose.yml
docker compose exec device go-link-device panel token --config /data/device.json
```

- **Network:** WebRTC needs direct UDP to the players. On Linux the simple way is `network_mode: host`.
- **Without host networking** (Docker Desktop): publish the panel and a fixed UDP port, and announce your LAN address: `docker run -p 7373:7373 -p 50000:50000/udp -v go-link:/data go-link-device --udp-port 50000 --announce 192.168.1.20`.
- **One-off commands:** the `ENTRYPOINT` already runs the device (`--headless --config /data/device.json`), so override it: `docker run --rm --entrypoint go-link-device -v go-link:/data go-link-device core download --config /data/device.json`. With the container running, `docker compose exec device go-link-device …` is enough.

## Logs

Started without a terminal (the macOS app from the Finder, the Windows `.exe`, which opens no console), the log goes to `~/go-link/logs/device.log` (0600; at 5 MB it starts over and keeps the previous one as `.1`). From a terminal it prints there.

## Tests

```bash
go test -race ./...
go test -race -run TestName ./internal/services/
```

On macOS the linker may print `ld: warning: ... malformed LC_DYSYMTAB`. It comes from cgo and is harmless.
