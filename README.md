# go-link

Play classic arcade games online with friends, straight from the browser.

A **host** runs the go-link app (the **device**) on their own computer, with **their own ROMs**. Friends join from a web browser **without needing the ROM**: they get the game's video and sound over WebRTC and send their controls back, peer to peer.

- Website: [go-link.org](https://go-link.org)
- Up to **4 players** per room. Everyone else waits **in the queue**, like at an arcade, and can watch and chat meanwhile.
- Based on MAME: the engine is [mame2003-plus](https://github.com/libretro/mame2003-plus-libretro) (MAME 0.78 sets) through libretro.

## Features

- **Host streaming:** only the host has the games. ROMs never leave the host's disk and never touch any server.
- **Private rooms:** each room has an invitation (link, QR or 9-digit code), and each invited person gets their own single-use 6-digit PIN.
- **A small game server:** several games running at once, pause, save slots, automatic save and resume, favorites, trash and a game history.
- **Arcade play:** seats P1 to P4, an arcade-style queue, spectators, Start 1P-4P, swap controllers, gamepads (several per browser), keyboard and a touch gamepad on phones.
- **Voice and chat:** voice between seated players (forwarded by the device, with per-player volume), and chat with a typing indicator.
- **ROM validation without running the game:** each set is checked against the core's game list with the MAME 0.78 loader rules.
- **Native app:** a window and tray icon on macOS, Windows and Linux; headless mode with a local web panel for a Raspberry Pi, a server or Docker; and a full CLI.
- **Your own infrastructure if you want:** the signaling server is open source, and the website can switch to another one.
- **Website in English, Spanish and Portuguese**, dark and light themes.

## How it works

```
 browser (players)  ◄──── WebRTC: video, audio, voice, controls, chat ────►  device (host)
        │                                                                      │
        └──────────── wss ────►  signalhub + coturn  ◄──── wss ────────────────┘
                          (pairing, invitations, STUN/TURN)
```

1. The host installs go-link, opens it and types the 9-digit code shown in its window at [go-link.org/device](https://go-link.org/device).
2. The host downloads the emulator core (one click) and points go-link at their ROM folder.
3. The host starts a game and invites friends with a link, a QR or a code, plus a PIN for each person.
4. Friends open the invitation, type the PIN and play.

## Repository

| Directory | What it is |
|---|---|
| [`backend-device/`](backend-device/) | The device: Go + cgo, libretro, Pion WebRTC, Fyne GUI |
| [`frontend/`](frontend/) | The website: React + TypeScript |
| [`e2e/`](e2e/) | End-to-end tests (Playwright) |
| [`cores/mame2003-plus/`](cores/mame2003-plus/) | Optional save state patches for the emulator core |
| [`docs/`](docs/) | The documentation |

The signaling server is a separate project: [lordbasex/signalhub](https://github.com/lordbasex/signalhub).

## Quick start (development)

Requirements: Go, Node.js, `pkg-config`, libvpx and Opus (`brew install libvpx opus pkg-config` on macOS; see [building](docs/building.md#requirements)).

```bash
# The device (uses the public signaling server)
cd backend-device
go run ./cmd/device --web-url http://localhost:5180

# The website
cd frontend
npm install
npm run dev            # http://localhost:5180
```

Open `http://localhost:5180/device` and type the code shown in the device window.

## Deploying

| Piece | How |
|---|---|
| **Signaling server** | Deploy [signalhub](https://github.com/lordbasex/signalhub) on any Linux server with Docker (its README lists the ports and variables). Allow your website's origin and the `go-link` app. |
| **Website** | `SIGNAL_URL=wss://your-signal-domain/ws make web-build`, then upload `frontend/apps/web/dist` to any static host, serving `index.html` for every route and adding the [security headers](docs/security.md#http-headers-for-the-website). `make web-deploy` runs your own upload from the gitignored `deploy/local/hosting.mk` ([example](deploy/hosting.example.mk)). |
| **Device** | `VERSION=x.y.z make release` builds the macOS `.dmg`, Windows `.zip`, Linux archives and a Docker image, and publishes a GitHub release. |

Details in [docs/deploy.md](docs/deploy.md).

## Documentation

Start at [docs/README.md](docs/README.md): architecture, flows, the device protocol, the device app, the emulator, the website, networking, security, building and deploying.

## ROMs and licenses

- go-link does **not** include, host or download ROMs or thumbnails. Hosts must use only sets they have the right to use, such as backups of arcade boards they own.
- go-link's code is [MIT](LICENSE).
- MAME and the libretro cores have their own licenses. **mame2003-plus is for non-commercial use only.**
- go-link is not affiliated with MAME or libretro.
