# backend-device: the device

The go-link host app: runs MAME through libretro (mame2003-plus), streams over WebRTC (Pion, VP8 + Opus), manages the game rooms, and shows the pairing code in a native window (Fyne) with a tray icon. Headless builds serve a local web panel instead.

```bash
go build -o bin/device ./cmd/device                  # with the window
go build -tags headless -o bin/device ./cmd/device   # no GUI (Raspberry Pi, servers)
./bin/device help                                    # CLI commands
go test -race ./...
```

Building needs `pkg-config`, libvpx and Opus (cgo). See:

- [docs/device.md](../docs/device.md): flags, CLI, `device.json`, the window, the local web panel, Docker.
- [docs/emulator.md](../docs/emulator.md): libretro, ROM validation, thumbnails, save states.
- [docs/protocol.md](../docs/protocol.md): what the device and the website say over WebRTC.
- [docs/building.md](../docs/building.md): builds for every platform and releases.

| Path | What it holds |
|---|---|
| `cmd/device/` | Entry point, CLI subcommands, the `emulate` worker process |
| `internal/services/` | Rooms, room manager (actor), streaming, linking, PIN gate, library, save probe, history, metrics |
| `internal/gui/` | The Fyne window and tray panel |
| `internal/panel/` | The headless local web panel |
| `pkg/libretro/` | The libretro frontend (cgo) |
| `pkg/romcheck/` | ROM validation against the core's game list |
| `pkg/signalclient/` | The signalhub client |
| `build/` | Dockerfiles, macOS app bundle, dmg and notarization |
| `test/` | Integration tests |
