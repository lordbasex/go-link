// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Command device runs the go-link host: it links browsers through
// signalhub and serves the local panel. The emulator arrives in a later
// phase.
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/lordbasex/go-link/backend-device/internal/models"
	"github.com/lordbasex/go-link/backend-device/internal/panel"
	"github.com/lordbasex/go-link/backend-device/internal/services"
	"github.com/lordbasex/go-link/backend-device/pkg/instancelock"
	"github.com/lordbasex/go-link/backend-device/pkg/libretro"
	"github.com/lordbasex/go-link/backend-device/pkg/signalclient"
	"github.com/lordbasex/go-link/backend-device/pkg/thumbnails"
	"github.com/lordbasex/go-link/backend-device/web"
)

// version is replaced at build time with -ldflags "-X main.version=...".
var version = "0.1.0-dev"

func main() {
	// Subcommands (device roms check, device core download...) manage
	// the device from a terminal, with no graphical interface.
	if handled, err := runCommand(os.Args[1:]); handled {
		if err != nil {
			fmt.Fprintln(os.Stderr, "device:", err)
			os.Exit(1)
		}
		return
	}
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "device:", err)
		os.Exit(1)
	}
}

func run() error {
	dumpOnSignal()
	var (
		configPath = flag.String("config", "", "path to device.json (default: user config dir)")
		signalURL  = flag.String("server-signaling", "", "signaling server URL for this run, e.g. wss://signal.example.com/ws (default: signal_url in device.json, else "+models.DefaultSignalURL+")")
		headless   = flag.Bool("headless", false, "run without window or tray icon (servers, Raspberry Pi); the pairing code goes to the log")
		debug      = flag.Bool("debug", false, "verbose logs")
		testRoom   = flag.Bool("test-room", true, "open the test pattern room (or the game given with --game)")
		game       = flag.String("game", "", "ROM set to play in the room, e.g. robby (from the ROM folder); empty streams the test pattern")
		udpPort    = flag.Int("udp-port", 0, "carry every WebRTC connection on this UDP port, to forward it on a router (default: udp_port in device.json, else random ports)")
		announce   = flag.String("announce", "", "comma-separated addresses where browsers reach --udp-port through a forwarding router (default: announce_ips in device.json)")
		webURL     = flag.String("web-url", "", "website shown in the window for linking, for this run (default: web_url in device.json, else "+models.DefaultWebURL+")")
		corePath   = flag.String("core", "", "libretro core to run games (default: ~/go-link/cores/mame2003_plus_libretro)")
		panelAddr  = flag.String("panel", panel.DefaultAddr, "address of the local web panel, which a headless device opens on the LAN (token: `device panel token`)")
		noPanel    = flag.Bool("no-panel", false, "do not open the local web panel when running headless")
	)
	flag.Usage = usage
	flag.Parse()

	level := slog.LevelInfo
	if *debug {
		level = slog.LevelDebug
	}
	logOut, closeLog := logOutput()
	defer closeLog()
	logger := slog.New(slog.NewTextHandler(logOut, &slog.HandlerOptions{Level: level}))
	slog.SetDefault(logger)

	store, cfg, created, err := loadConfig(*configPath)
	if err != nil {
		return err
	}
	// One device per user: a locked file, since the device opens no port.
	lock, err := instancelock.Acquire(filepath.Join(filepath.Dir(store.Path()), "device.lock"))
	if err != nil {
		return fmt.Errorf("cannot start: %w", err)
	}
	defer lock.Release()
	target, err := resolveSignalURL(*signalURL, cfg)
	if err != nil {
		return err
	}
	logger.Info("device starting", "version", version, "device_id", cfg.DeviceID, "config", store.Path(), "first_run", created, "signaling", target)
	if encrypted, _ := signalclient.CheckURL(target); !encrypted && !isLoopback(target) {
		logger.Warn("signaling URL is not encrypted (ws://); use wss:// outside local development", "url", target)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	status, library, settings, base, err := openLibrary(store, &cfg, target, *corePath, logger)
	if err != nil {
		return err
	}
	go library.RefreshCatalog(ctx)
	if !guiBuilt && !*headless {
		*headless = true // a build without a window
	}
	if wantsHeadless() && !*headless {
		logger.Info("no desktop found, running headless")
		*headless = true
	}
	ice := services.NewICEStore()
	pairing := services.NewPairingService(services.PairingConfig{DeviceID: cfg.DeviceID, DeviceSecret: cfg.DeviceSecret, Logger: logger}, status, ice)
	// Rooms share one signaling connection; the opener gives each its own
	// room_id (it must see room_opened before anyone else).
	opener := services.NewRoomOpener()
	handlers := services.Dispatcher{opener, pairing}

	// WebRTC peers: linked browsers get a data link (status, latency);
	// room guests get the video.
	port, ips := cfg.UDPPort, cfg.AnnounceIPs
	if *udpPort > 0 {
		port = *udpPort
	}
	if *announce != "" {
		ips = strings.Split(*announce, ",")
	}
	if len(ips) > 0 && port == 0 {
		return errors.New("announced addresses need a fixed UDP port: set --udp-port or udp_port")
	}
	// One WebRTC API for the test room, the linked browsers and every game
	// room, so all of them use the same UDP port.
	api, err := services.NewWebRTCAPI(port, false)
	if err != nil {
		return err
	}
	streamCfg := services.StreamConfig{API: api, UDPPort: port, AnnounceIPs: ips, Logger: logger}
	stream, err := services.NewStreamService(streamCfg, ice)
	if err != nil {
		return err
	}
	stream.OnLatency(status.SetPeerLatency)
	pairing.SetLinks(stream)
	// Browsers linked before come back without a code; they must prove
	// their token before they get anything.
	links := services.NewLinkService(services.LinkConfig{
		DeviceID: cfg.DeviceID,
		Links:    cfg.Links,
		Save: func(l []models.Link) error {
			return updateConfig(store, &cfg, func(c *models.Config) { c.Links = l })
		},
		Logger: logger,
	}, status)
	links.SetTransport(stream.SendControl, stream.RemoveViewer)
	pairing.SetAuth(links)
	stream.SetLinkGate(links.Trusted)
	var room *services.TestRoomService
	if *testRoom {
		// The test pattern room is a permanent diagnostic, like an echo
		// test call in VoIP: it proves web, signalhub, WebRTC and device
		// work end to end.
		room = services.NewTestRoomService(status, stream, hostName(), logger)
		room.SetOpener(opener)
		// Private like every room: the owner opens it from My device and
		// may invite someone to test (a new PIN each run).
		room.Configure("Test pattern", "Test pattern", false)
		room.SetTrusted(links.Trusted)
		room.EnableInvites(nil)
		room.SetPrivate()
		manager := services.NewRoomManager(services.RoomManagerConfig{Logger: logger, OnSummary: room.OnSummary}, stream)
		room.SetManager(manager)
		manager.SetInfo(services.RoomInfo{Title: "Test pattern", Game: "Test pattern", Host: hostName()})
		stream.SetRoomHooks(services.RoomHooks{
			Opened:  manager.Join,
			Message: manager.HandleControl,
			Closed:  manager.Leave,
			PortOf:  manager.PortOf,
		})
		go manager.Run(ctx)
		handlers = append(handlers, room)
	}

	// Game rooms: each one is a game in its own process, and several can
	// run at once. The list lives in device.json.
	systemDir := filepath.Join(base, "system")
	history := services.NewHistoryService(filepath.Join(base, "history.json"))
	games := services.NewRoomsService(services.RoomsConfig{
		Library:  library,
		Status:   status,
		ICE:      ice,
		Stream:   streamCfg,
		Opener:   opener,
		HostName: hostName(),
		SavesDir: filepath.Join(base, "saves"),
		History:  history,
		MaxRooms: cfg.MaxRooms,
		Trusted:  links.Trusted,
		Rooms:    cfg.Rooms,
		Save: func(list []models.SavedRoom) error {
			return updateConfig(store, &cfg, func(c *models.Config) { c.Rooms = list })
		},
		ProbeSaves: saveProbes(library).SavesWork,
		NewSource: func(rom, state string, onReady func(libretro.AVInfo)) services.RoomSource {
			return services.NewWorkerSource(services.WorkerConfig{
				CorePath: library.CorePath(), RomPath: library.RomPath(rom), SystemDir: systemDir,
				StatePath: state, Logger: logger, OnReady: onReady,
			})
		},
		Logger: logger,
	})
	handlers = append(handlers, games)

	// ROM uploads from the owner, over WebRTC.
	uploads := services.NewUploadService(library, func(peerID string, r services.FileReply) {
		if b, err := json.Marshal(r); err == nil {
			stream.SendControl(peerID, b)
		}
	})
	stream.OnLinkFiles(uploads.Handle, uploads.Abort)

	// Requests from the owner (a browser linked with the pairing code).
	stream.OnLinkMessage(func(peerID string, data []byte) {
		// auth and unlink first; anything else only from trusted browsers.
		if links.HandleMessage(peerID, data) || !links.Trusted(peerID) {
			return
		}
		var msg struct {
			Type   string `json:"type"`
			Dir    string `json:"dir"`
			Set    string `json:"set"`
			Kind   string `json:"kind"`
			Size   string `json:"size"`
			ID     string `json:"id"`
			Action string `json:"action"`
			Name   string `json:"name"`
			From   string `json:"from"`
			Slot   int    `json:"slot"`
			services.GameRequest
		}
		if json.Unmarshal(data, &msg) != nil {
			return
		}
		reply := func(r services.GameReply) {
			if b, err := json.Marshal(r); err == nil {
				stream.SendControl(peerID, b)
			}
		}
		var err error
		switch msg.Type {
		case "download_core":
			err = library.DownloadCore(ctx)
		case "get_thumb":
			// A small JPEG of one of the host's thumbnails: "card" for the
			// ROM grid, "mini" for lists.
			w, h := 360, 480
			if msg.Size == "mini" {
				w, h = 96, 128
			}
			kind := thumbnails.Kind(msg.Kind)
			if kind == "" {
				kind = library.ThumbnailKind() // the one the host chose
			}
			res := map[string]any{"type": "thumb", "set": msg.Set, "kind": msg.Kind, "size": msg.Size}
			if b, err := library.Thumbnail(msg.Set, kind, w, h, 90_000); err == nil {
				res["data"] = base64.StdEncoding.EncodeToString(b)
			} else {
				res["missing"] = true
			}
			if b, err := json.Marshal(res); err == nil {
				stream.SendControl(peerID, b)
			}
			return
		case "set_roms_dir":
			res := map[string]any{"type": "roms_dir_result", "dir": msg.Dir, "ok": true}
			if err := library.SetDir(msg.Dir); err != nil {
				res["ok"], res["error"] = false, err.Error()
			}
			if b, err := json.Marshal(res); err == nil {
				stream.SendControl(peerID, b)
			}
			return
		case "get_history", "clear_history":
			// The history of games, only to the owner's linked browsers.
			if msg.Type == "clear_history" {
				if err := history.Clear(); err != nil {
					logger.Warn("cannot clear the history", "err", err)
				}
			}
			if b, err := json.Marshal(map[string]any{"type": "history", "items": history.List()}); err == nil {
				stream.SendControl(peerID, b)
			}
			return
		case "create_room":
			err = games.Create(msg.GameRequest, reply)
		case "room_start":
			err = games.Start(msg.ID, msg.From, msg.Slot, reply)
		case "invite":
			// A new invitation: a PIN good for one person, only for the
			// host's own browsers (this is the linked control channel).
			var pass services.Pass
			if msg.ID == services.TestRoomID && room != nil {
				pass = room.IssuePass()
			} else {
				pass, err = games.Invite(msg.ID)
			}
			res := map[string]any{"type": "invite_pass", "id": msg.ID}
			if err != nil {
				res["error"] = err.Error()
			} else {
				res["pin"], res["expires_at"] = pass.Pin, pass.ExpiresAt
			}
			if b, jerr := json.Marshal(res); jerr == nil {
				stream.SendControl(peerID, b)
			}
			return
		case "room_action", "close_room":
			action := msg.Action
			if msg.Type == "close_room" {
				action = "archive"
			}
			if msg.Type == "close_room" && msg.ID == "" {
				games.Close(reply)
				return
			}
			// The test pattern room ("test"): only a new link.
			if msg.ID == services.TestRoomID && room != nil {
				ok := action == "new_link"
				if ok {
					room.NewInvite()
				}
				if b, err := json.Marshal(map[string]any{"type": "room_result", "id": msg.ID, "action": action, "ok": ok}); err == nil {
					stream.SendControl(peerID, b)
				}
				return
			}
			// Saving and archiving wait for the game: answer off the
			// message loop.
			go func() {
				slot, err := games.Action(ctx, msg.ID, action, msg.Name)
				res := map[string]any{"type": "room_result", "id": msg.ID, "action": action, "ok": err == nil}
				if err != nil {
					res["error"] = err.Error()
					if code, limit := services.ErrorCode(err); code != "" {
						res["code"], res["limit"] = code, limit
					}
				}
				if slot > 0 {
					res["slot"] = slot
				}
				if b, err := json.Marshal(res); err == nil {
					stream.SendControl(peerID, b)
				}
			}()
			return
		default:
			return
		}
		if err != nil {
			logger.Warn("owner request failed", "type", msg.Type, "err", err)
			code, limit := services.ErrorCode(err)
			reply(services.GameReply{Type: "room_error", ID: msg.ID, Rom: msg.Rom, Error: err.Error(), Code: code, Limit: limit})
		}
	})

	if *game != "" && games.Current() == "" {
		if err := games.Create(services.GameRequest{Rom: *game, Public: true, Voice: true}, func(r services.GameReply) {
			logger.Info("game room", "type", r.Type, "room_id", r.RoomID, "error", r.Error)
		}); err != nil {
			return fmt.Errorf("--game %s: %w", *game, err)
		}
	}

	client := signalclient.New(signalclient.Config{URL: target, Logger: logger}, handlers)
	pairing.SetSender(client)
	// The device's data links go through signalhub, or through the local
	// panel's own connection for the panel's browsers.
	router := services.NewRoutingSender()
	router.SetBase(client)
	stream.SetSender(router)
	opener.SetSender(client)
	// Rooms answer the panel's players through the panel's own sockets.
	games.SetSender(router)
	if room != nil {
		room.SetSender(router)
	}
	go games.Run(ctx)
	go func() {
		if err := stream.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
			logger.Error("stream stopped", "err", err)
		}
	}()
	metrics := services.NewMetricsService(ctx, status, 2*time.Second, func(st models.Status) {
		stream.SendToLinks(services.NewDeviceStatusMessage(st))
	})
	go metrics.Run(ctx)
	// What is being streamed, for the window (once a second).
	go func() {
		t := time.NewTicker(time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				status.SetStream(stream.Stats())
			}
		}
	}()

	// Without a window, the device opens its web panel on the LAN.
	if *headless && !*noPanel {
		// Make the token the first time; the panel reads it from cfg.
		if _, err := panelToken(store, &cfg, false); err != nil {
			return err
		}
		srv := panel.New(panel.Config{
			Addr: *panelAddr, Files: web.Panel(), Logger: logger,
			Token: func() string {
				configMu.Lock()
				defer configMu.Unlock()
				return cfg.PanelToken
			},
			Links: links, Streams: stream, Router: router, Status: status,
			Rooms: panelRooms(room, games),
		})
		// The token itself stays out of the log (logs get shared and stored):
		// the panel asks for it and `device panel token` shows it.
		logger.Info("web panel ready: it asks for the panel token, which `device panel token` shows")
		go func() {
			if err := srv.Run(ctx); err != nil {
				logger.Error("web panel stopped", "addr", *panelAddr, "err", err)
			}
		}()
	}

	go func() {
		if err := client.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
			logger.Error("signal client stopped", "err", err)
			cancel()
		}
	}()

	// The window (or, headless, nothing) runs on the main goroutine until
	// the device stops.
	web := cfg.EffectiveWebURL()
	if *webURL != "" {
		web = *webURL
	}
	if !links.Linked() {
		logger.Info("not linked yet: open the website and type the pairing code", "url", strings.TrimRight(web, "/")+"/device")
	}
	runUI(uiOptions{
		ctx:      ctx,
		settings: settings,
		links:    links,
		webURL:   web,
		quit:     cancel,
		headless: *headless,
		status:   status,
		library:  library,
		games:    games,
		logger:   logger,
	})
	logger.Info("shutting down")
	// Save every running game so its room comes back where it was (the
	// games run apart from ctx, so they are still up here).
	shutdownCtx, stop := context.WithTimeout(context.Background(), 15*time.Second)
	defer stop()
	games.Shutdown(shutdownCtx)
	cancel()
	return nil
}

// resolveSignalURL picks the signaling server, in order of precedence:
// the --server-signaling flag (this run only), signal_url in device.json
// (permanent), and finally the project's public server.
func resolveSignalURL(flagValue string, cfg models.Config) (string, error) {
	target := cfg.EffectiveSignalURL()
	source := "signal_url in device.json"
	if flagValue != "" {
		target = flagValue
		source = "--server-signaling"
	}
	if _, err := signalclient.CheckURL(target); err != nil {
		return "", fmt.Errorf("invalid %s: %w", source, err)
	}
	return target, nil
}

// isLoopback reports whether the URL points at this machine.
func isLoopback(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	host := u.Hostname()
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// hostName is the short machine name shown in the lobby.
func hostName() string {
	name, err := os.Hostname()
	if err != nil || name == "" {
		return "device"
	}
	if i := strings.IndexByte(name, '.'); i > 0 {
		name = name[:i]
	}
	return name
}
