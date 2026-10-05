// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

//go:build !headless

package gui

import (
	"context"
	"image"
	"image/png"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/test"

	"github.com/lordbasex/go-link/backend-device/internal/models"
	"github.com/lordbasex/go-link/backend-device/internal/services"
	"github.com/lordbasex/go-link/backend-device/internal/shots"
	"github.com/lordbasex/go-link/backend-device/pkg/sysinfo"
)

// TestShots renders the real window with made-up data (an invented game
// library, a neutral computer) in every language and saves PNGs for the
// landing page: GOLINK_SHOTS=<dir> go test ./internal/gui -run TestShots.
// Without GOLINK_SHOTS it is skipped.
func TestShots(t *testing.T) {
	out := os.Getenv("GOLINK_SHOTS")
	if out == "" {
		t.Skip("set GOLINK_SHOTS=<dir> to render the window screenshots")
	}
	for _, lang := range []string{"en", "es", "pt"} {
		dir := filepath.Join(out, lang)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		// The pairing view a new host sees right after installing.
		u, _ := shotUI(t, lang, true)
		u.win.Resize(fyne.NewSize(1120, 700))
		capture(t, u, filepath.Join(dir, "win-pairing.png"))

		u, _ = shotUI(t, lang, false)
		u.show(pageOverview)
		capture(t, u, filepath.Join(dir, "win-overview.png"))
		u.showRoms()
		capture(t, u, filepath.Join(dir, "win-roms.png"))
	}
	setLanguage("en")
}

// shotUI builds the window over an invented library. pairing leaves no
// browser linked, so the window shows only the code.
func shotUI(t *testing.T, lang string, pairing bool) (*ui, *services.StatusService) {
	t.Helper()
	a := test.NewTempApp(t)
	a.Settings().SetTheme(arcadeTheme{})
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	base := filepath.Join(t.TempDir(), "go-link")
	if err := shots.Seed(base, true); err != nil {
		t.Fatal(err)
	}
	const id = "3c9f2a71-5d4e-4b8a-9f10-2e7d6c5b4a39"
	status := services.NewStatusService(id, "v0.1.4", "wss://signal.go-link.org/ws", filepath.Join(base, "roms"))
	lib := services.NewLibraryService(filepath.Join(base, "roms"), status, logger)
	lib.SetCore(filepath.Join(base, "cores"), "")
	settings := services.NewSettingsService(lib, models.ThumbnailSettings{}, filepath.Join(base, "thumbnails", "MAME"), func(models.ThumbnailSettings) error { return nil })
	lib.Scan()

	now := time.Now()
	status.SetConnected("device-1", nil)
	status.SetCode("482 913 067", now, now.Add(9*time.Minute+42*time.Second))
	status.SetSystem(models.SystemStatus{
		Hardware: sysinfo.Hardware{Hostname: "arcade-pc", OS: "darwin", Arch: "arm64", Platform: "macOS 15.6", CPUModel: "Apple M1", Cores: 8, MemTotal: 16 << 30},
		Usage:    sysinfo.Usage{CPUPercent: 23, ProcessCPUPercent: 61, MemUsed: 9 << 30, ProcessRSS: 180 << 20, NetSentBps: 412_000, NetRecvBps: 38_000},
	})
	opts := Options{Ctx: context.Background(), Status: status, Library: lib, Settings: settings, Version: "v0.1.4", Language: lang, Logger: logger, WebURL: "https://play.go-link.org"}
	if pairing {
		opts.Links = services.NewLinkService(services.LinkConfig{DeviceID: id, Logger: logger}, status)
	} else {
		status.SetRoom("test", 2)
		status.SetRoomDetails(models.RoomStatus{RoomID: "test", Viewers: 2, Title: "Test pattern", Players: 2, MaxPlayers: 4, Spectators: 1})
		status.SetStream(models.StreamStatus{FPS: 60, Width: 640, Height: 480, VideoKbps: 1450, VideoViewers: 2})
		status.AddPeer("browser-1", "s1", now.Add(-12*time.Minute))
		status.SetPeerLatency("browser-1", 18)
		status.SetSavedLinks(2)
	}
	u := newUI(a, opts)
	u.settings.background = func(f func()) { f() }
	u.render(status.Snapshot())
	// The real folder is a temporary one: show the default path instead.
	u.roms.dir.SetText("~/go-link/roms")
	u.win.Resize(fyne.NewSize(1240, 800))
	return u, status
}

// capture saves the window at twice its size (a sharp picture on Retina
// screens), then puts the scale back.
func capture(t *testing.T, u *ui, path string) {
	t.Helper()
	c := u.win.Canvas()
	if sc, ok := c.(interface{ SetScale(float32) }); ok {
		sc.SetScale(2)
		defer sc.SetScale(1)
	}
	img := c.Capture()
	writeImage(t, path, img)
}

func writeImage(t *testing.T, path string, img image.Image) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		t.Fatal(err)
	}
}
