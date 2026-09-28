# go-link

[![CI](https://github.com/lordbasex/go-link/actions/workflows/ci.yml/badge.svg)](https://github.com/lordbasex/go-link/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/lordbasex/go-link?include_prereleases)](https://github.com/lordbasex/go-link/releases)

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

## Download

Get the app from the [releases](https://github.com/lordbasex/go-link/releases):

| System | File | Notes |
|---|---|---|
| **macOS 12+** (Intel and Apple silicon) | `go-link-vX.Y.Z-macos-universal.dmg` | Drag go-link to Applications. Until the app is notarized, open it the first time with right click › Open. Or `brew install --cask go-link` from this repository's tap |
| **Windows 10/11** (x64 and ARM) | `go-link-vX.Y.Z-windows-amd64.zip` / `-arm64.zip` | Unzip and run `go-link-device.exe` |
| **Linux desktop** (x64 and ARM64) | `go-link-vX.Y.Z-linux-amd64.tar.gz` / `-arm64.tar.gz` | Window and tray icon |
| **Raspberry Pi and servers** | `go-link-vX.Y.Z-linux-arm64-headless.tar.gz` / `-amd64-headless.tar.gz` | No window: a web panel on port 7373 and a full CLI |
| **Docker** | `go-link-vX.Y.Z-docker.oci.tar.gz` | `docker load`, then see [docs/device.md](docs/device.md#docker) |

Every download is listed in `SHA256SUMS`. The emulator core is downloaded by the app on first use; ROMs are never included. Linking a device and joining a game ask you to accept the [terms of use](https://go-link.org/terms).

To see which version you run: the device shows it in its window (System) and with `go-link-device --help`, and the website in its footer (or `curl -s https://go-link.org/ | grep go-link-version`).

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
# or: make device-darwin-universal / make device-dmg (macOS), make help for the rest

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
| **Device** | `VERSION=x.y.z make release` builds the universal macOS `.dmg` (Intel + Apple silicon, macOS 12+), Windows `.zip`, Linux archives and a Docker image, and publishes a GitHub release. |

Details in [docs/deploy.md](docs/deploy.md).

## Documentation

Start at [docs/README.md](docs/README.md): architecture, flows, the device protocol, the device app, the emulator, the website, networking, security, building, deploying, the roadmap and the legal texts. Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## ROMs, Copyright and Legal Disclaimers

- **Zero-Content Policy:** `go-link` does **not** host, include, distribute, or download any ROMs, game images, artwork, or system BIOS files. It is strictly a software utility and a streaming engine.
- **User Responsibility:** The application operates under a completely decentralized, self-hosted architecture. Hosts must exclusively use legal backup sets of arcade boards or software they physically own. The creators of `go-link` are not liable for any unauthorized reproduction or streaming of copyrighted material by end-users.
- **Intellectual Property:** All corporate names, game titles, logos, and characters referenced or emulated are trademarks and property of their respective copyright holders (such as Nintendo, Capcom, SEGA, Bandai Namco, etc.). This project is completely independent, non-profit, and does not claim any affiliation with or endorsement by these entities.
- **Trademarks:** MAME® is a registered trademark of Gregory Ember. `go-link` is not affiliated with, endorsed by, or sponsored by MAMEdev or libretro; the name MAME is only used to describe compatibility, and the MAME logo is not used.
- **Licensing:** The source code of `go-link` is distributed under the open-source [MIT license](LICENSE), and the third-party components it includes keep their own licenses ([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)). However, MAME, libretro, and individual emulator cores carry their own restrictive licenses. The `mame2003-plus` core, which the device downloads at the host's request and never bundles, is strictly for **non-commercial use only**: any commercial distribution or monetization of `go-link` together with that core is prohibited under its upstream license terms.

Full terms of use, privacy policy and licenses: [docs/legal.md](docs/legal.md) (also at [go-link.org/terms](https://go-link.org/terms) and [go-link.org/privacy](https://go-link.org/privacy)).
