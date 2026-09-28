// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"maps"
	"net"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"

	"github.com/lordbasex/go-link/backend-device/internal/models"
	"github.com/lordbasex/go-link/backend-device/pkg/encoder"
	"github.com/lordbasex/go-link/backend-device/pkg/input"
	"github.com/lordbasex/go-link/backend-device/pkg/signalclient"
	"github.com/lordbasex/go-link/backend-device/pkg/testpattern"
)

// RTCSignal is the application payload carried inside signalhub "signal"
// messages to negotiate WebRTC. signalhub never reads it.
type RTCSignal struct {
	Kind      string                   `json:"kind"` // "offer", "answer" or "candidate"
	SDP       string                   `json:"sdp,omitempty"`
	Candidate *webrtc.ICECandidateInit `json:"candidate,omitempty"`
}

// StreamConfig configures StreamService. Zero values get defaults.
type StreamConfig struct {
	Width, Height int // default 640x480 (4:3, like the test card)
	FPS           int // default 60, like arcade hardware
	BitrateKbps   int // default 2500
	// IncludeLoopback also gathers 127.0.0.1 candidates (tests on
	// machines without a network).
	IncludeLoopback bool
	// UDPPort, when set, carries every WebRTC connection on this single
	// UDP port (ICE UDP mux), so one port forward on a router is enough.
	UDPPort int
	// AnnounceIPs are extra addresses where browsers can reach UDPPort:
	// the WAN side of a router that forwards the port (for example the
	// 192.168.1.x of a second router at home, or the public IP). Each one
	// is sent as an additional host candidate.
	AnnounceIPs []string
	// API, when set, is a WebRTC API shared with other streams (the
	// device's rooms), so every room uses the same UDP port. The stream
	// then ignores IncludeLoopback; UDPPort must still be the shared port,
	// because the announced addresses point at it.
	API    *webrtc.API
	Logger *slog.Logger
}

// NewWebRTCAPI builds the WebRTC API streams share. udpPort > 0 carries
// every connection on that single UDP port (ICE UDP mux).
func NewWebRTCAPI(udpPort int, includeLoopback bool) (*webrtc.API, error) {
	se := webrtc.SettingEngine{}
	se.SetIncludeLoopbackCandidate(includeLoopback)
	if udpPort > 0 {
		conn, err := net.ListenUDP("udp4", &net.UDPAddr{Port: udpPort})
		if err != nil {
			return nil, fmt.Errorf("stream: UDP port %d: %w", udpPort, err)
		}
		se.SetICEUDPMux(webrtc.NewICEUDPMux(nil, conn))
		se.SetNetworkTypes([]webrtc.NetworkType{webrtc.NetworkTypeUDP4})
	}
	return webrtc.NewAPI(webrtc.WithSettingEngine(se)), nil
}

// PeerKind says what a peer connection carries.
type PeerKind int

const (
	// KindViewer gets video plus the control and input channels.
	KindViewer PeerKind = iota
	// KindLink is a browser linked with the pairing code: control channel
	// only, used for device status and latency.
	KindLink
)

type viewer struct {
	id      string
	kind    PeerKind
	pc      *webrtc.PeerConnection
	control *webrtc.DataChannel
	// voice[i] carries the voice of the player at port i+1 to this viewer.
	voice [4]*webrtc.TrackLocalStaticRTP

	mu        sync.Mutex
	remoteSet bool
	pending   []webrtc.ICECandidateInit
	input     input.Tracker
}

// StreamService sends the video to every viewer. There is one encoder and
// one shared track: each frame is encoded once and Pion fans the packets
// out to all peer connections. Each viewer also gets two DataChannels:
// "control" (reliable, JSON) and "input" (unordered, no retransmits).
type StreamService struct {
	cfg   StreamConfig
	log   *slog.Logger
	ice   *ICEStore
	api   *webrtc.API
	track *webrtc.TrackLocalStaticSample
	audio *webrtc.TrackLocalStaticSample

	keyframe atomic.Bool

	// Owned by the source goroutine (Run): encoders and pacing.
	vp8        *encoder.VP8
	vp8W, vp8H int
	opus       *encoder.Opus
	pcm        []int16
	sent       int
	window     time.Time

	mu           sync.Mutex
	sender       Sender
	viewers      map[string]*viewer
	pads         map[string][input.MaxLocalPlayers]input.Pad
	sentFPS      float64
	sentBytes    int // encoded video in the current one-second window
	videoKbps    float64
	aspect       float64
	source       MediaSource
	stopSource   func()
	onSourceErr  func(error)
	voiceOff     bool
	pings        map[uint64]time.Time
	addrs        map[string]PeerAddr // how each browser reached the device
	pingSeq      uint64
	onLatency    func(peerID string, ms int)
	room         RoomHooks
	onLinkMsg    func(peerID string, data []byte)
	linkGate     func(peerID string) bool // nil: every linked browser is trusted
	onLinkFile   func(peerID string, isString bool, data []byte)
	onLinkClosed func(peerID string)
}

// OnLinkFiles receives the "files" channel of linked browsers (ROM
// uploads), and OnLinkClosed tells when a linked browser goes away.
func (s *StreamService) OnLinkFiles(onData func(peerID string, isString bool, data []byte), onClosed func(peerID string)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onLinkFile, s.onLinkClosed = onData, onClosed
}

// OnLinkMessage receives control messages from linked browsers (the
// owner), other than pongs.
func (s *StreamService) OnLinkMessage(fn func(peerID string, data []byte)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onLinkMsg = fn
}

// RoomHooks connect room guests (KindViewer) to the Room Manager.
type RoomHooks struct {
	// Opened runs when a guest's control channel opens.
	Opened func(peerID string)
	// Message runs for every control message that is not a pong.
	Message func(peerID string, data []byte)
	// Closed runs when a guest's connection is removed.
	Closed func(peerID string)
	// PortOf maps a guest's local player to its seat (1-4). Input from
	// players without a seat is ignored.
	PortOf func(peerID string, local uint8) (int, bool)
	// SpectatorsHearVoice lets guests without a seat hear the players.
	SpectatorsHearVoice bool
}

// SetRoomHooks wires the Room Manager.
func (s *StreamService) SetRoomHooks(h RoomHooks) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.room = h
}

func (s *StreamService) hooks() RoomHooks {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.room
}

// announcedCandidates copies a host candidate for each announced address:
// same port and transport, another address and foundation, and a slightly
// lower priority than the real host candidate.
func announcedCandidates(host webrtc.ICECandidateInit, ips []string) []webrtc.ICECandidateInit {
	fields := strings.Fields(host.Candidate)
	// candidate:<foundation> <component> <transport> <priority> <address> <port> typ host ...
	if len(fields) < 8 || !strings.HasPrefix(fields[0], "candidate:") || fields[6] != "typ" {
		return nil
	}
	prio, err := strconv.ParseUint(fields[3], 10, 32)
	if err != nil {
		return nil
	}
	var out []webrtc.ICECandidateInit
	for i, ip := range ips {
		if net.ParseIP(ip) == nil || ip == fields[4] {
			continue
		}
		f := slices.Clone(fields)
		f[0] = fmt.Sprintf("candidate:%d", 4000000000+i)
		f[3] = strconv.FormatUint(prio-uint64(i+1)*256, 10)
		f[4] = ip
		c := host
		c.Candidate = strings.Join(f, " ")
		out = append(out, c)
	}
	return out
}

// PeerAddr is how a browser reached the device: its IP address (empty
// when it came through its own relay, which hides it) and the path,
// "direct" or "relay".
type PeerAddr struct {
	IP   string
	Path string
}

// maxPendingCandidates bounds the ICE candidates kept while an answer is
// on its way: a browser sends a handful, never hundreds.
const maxPendingCandidates = 50

// maxPeerAddrs bounds the addresses a room remembers for its history.
const maxPeerAddrs = 256

// PeerAddr returns how a browser reached the device, once it connected.
// It is kept after the browser leaves, for the history of games.
func (s *StreamService) PeerAddr(peerID string) (PeerAddr, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.addrs[peerID]
	return a, ok
}

// logPath records how a browser reached the device: directly (host,
// srflx, prflx) or through the TURN relay, which adds the round trip to
// the relay server.
func (s *StreamService) logPath(peerID string, pc *webrtc.PeerConnection) {
	sctp := pc.SCTP()
	if sctp == nil {
		return
	}
	pair, err := sctp.Transport().ICETransport().GetSelectedCandidatePair()
	if err != nil || pair == nil {
		return
	}
	path := "direct"
	if pair.Local.Typ == webrtc.ICECandidateTypeRelay || pair.Remote.Typ == webrtc.ICECandidateTypeRelay {
		path = "relay"
	}
	addr := PeerAddr{Path: path}
	// Through the browser's own relay the address is the TURN server's,
	// not the player's.
	if pair.Remote.Typ != webrtc.ICECandidateTypeRelay && net.ParseIP(pair.Remote.Address) != nil {
		addr.IP = pair.Remote.Address
	}
	s.mu.Lock()
	if len(s.addrs) < maxPeerAddrs {
		s.addrs[peerID] = addr
	}
	s.mu.Unlock()
	s.log.Info("viewer path", "peer_id", peerID, "path", path,
		"local", fmt.Sprintf("%s %s:%d", pair.Local.Typ, pair.Local.Address, pair.Local.Port),
		"remote", fmt.Sprintf("%s %s:%d", pair.Remote.Typ, pair.Remote.Address, pair.Remote.Port))
}

// SetLinkGate filters linked browsers: status and files only reach or come
// from the ones gate accepts (a remembered browser proves its token
// first).
func (s *StreamService) SetLinkGate(gate func(peerID string) bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.linkGate = gate
}

func (s *StreamService) linkAllowed(peerID string) bool {
	s.mu.Lock()
	gate := s.linkGate
	s.mu.Unlock()
	return gate == nil || gate(peerID)
}

// SendControl sends a JSON message on one peer's control channel.
func (s *StreamService) SendControl(peerID string, msg []byte) bool {
	s.mu.Lock()
	v := s.viewers[peerID]
	s.mu.Unlock()
	if v == nil || v.control == nil || v.control.ReadyState() != webrtc.DataChannelStateOpen {
		return false
	}
	return v.control.SendText(string(msg)) == nil
}

// OnLatency registers a callback for measured round trips.
func (s *StreamService) OnLatency(fn func(peerID string, ms int)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onLatency = fn
}

// NewStreamService builds the service. Call Run to start encoding.
func NewStreamService(cfg StreamConfig, ice *ICEStore) (*StreamService, error) {
	if cfg.Width <= 0 || cfg.Height <= 0 {
		cfg.Width, cfg.Height = 640, 480
	}
	if cfg.FPS <= 0 {
		cfg.FPS = 60
	}
	if cfg.BitrateKbps <= 0 {
		cfg.BitrateKbps = 2500
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	api := cfg.API
	if api == nil {
		var err error
		if api, err = NewWebRTCAPI(cfg.UDPPort, cfg.IncludeLoopback); err != nil {
			return nil, err
		}
	}
	track, err := webrtc.NewTrackLocalStaticSample(webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeVP8, ClockRate: 90000}, "video", "go-link")
	if err != nil {
		return nil, err
	}
	audio, err := webrtc.NewTrackLocalStaticSample(webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2}, "audio", "go-link")
	if err != nil {
		return nil, err
	}
	return &StreamService{
		cfg:     cfg,
		log:     cfg.Logger,
		ice:     ice,
		api:     api,
		track:   track,
		audio:   audio,
		viewers: make(map[string]*viewer),
		pads:    make(map[string][input.MaxLocalPlayers]input.Pad),
		pings:   make(map[uint64]time.Time),
		addrs:   make(map[string]PeerAddr),
	}, nil
}

// SetSender wires the signaling client.
func (s *StreamService) SetSender(sender Sender) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sender = sender
}

// MediaSink receives raw media from a MediaSource.
type MediaSink interface {
	// VideoFrame takes a packed I420 frame of w x h shown for dur.
	VideoFrame(i420 []byte, w, h int, dur time.Duration)
	// AudioSamples takes interleaved stereo 16-bit samples at 48 kHz.
	AudioSamples(pcm []int16)
	// SetAspect sets the display aspect ratio (e.g. 4/3) of the picture.
	SetAspect(aspect float64)
	// Controls merges the seated players' input (for the test card).
	Controls() testpattern.Controls
	// PortPad returns the controller of the player at port (1-4).
	PortPad(port int) input.Pad
}

// MediaSource produces the picture and sound: the test card, or a game.
type MediaSource interface {
	Run(ctx context.Context, sink MediaSink) error
}

// SetSource picks what Run streams. The default is the test card. While
// Run is going, the current source is stopped (a core is closed before the
// next one opens) and the new one starts.
func (s *StreamService) SetSource(src MediaSource) {
	s.mu.Lock()
	s.source = src
	stop := s.stopSource
	s.mu.Unlock()
	if stop != nil {
		stop()
	}
}

// OnSourceError is called when a source fails (for example, a ROM the
// core cannot load). The stream then falls back to the test card.
func (s *StreamService) OnSourceError(fn func(error)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onSourceErr = fn
}

func (s *StreamService) testCard() MediaSource {
	return &TestCardSource{Width: s.cfg.Width, Height: s.cfg.Height, FPS: s.cfg.FPS}
}

// Run streams the source until ctx ends and pings viewers every 2 s.
func (s *StreamService) Run(ctx context.Context) error {
	opus, err := encoder.NewOpus(2, 96000)
	if err != nil {
		return err
	}
	s.opus = opus
	defer func() {
		opus.Close()
		if s.vp8 != nil {
			s.vp8.Close()
		}
	}()
	go func() {
		t := time.NewTicker(2 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.pingAll()
				s.sendStreamStats()
			}
		}
	}()
	for {
		s.mu.Lock()
		src := s.source
		if src == nil {
			src = s.testCard()
		}
		srcCtx, stop := context.WithCancel(ctx)
		s.stopSource = stop
		s.mu.Unlock()

		err := src.Run(srcCtx, s)
		replaced := srcCtx.Err() != nil // stopped on purpose (new source or shutdown)
		stop()
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err != nil && !replaced {
			// The source failed on its own: report it and go back to
			// the test card, unless someone already picked another one.
			s.log.Error("media source failed", "err", err)
			s.mu.Lock()
			cb := s.onSourceErr
			if s.source == src {
				s.source = nil
			}
			s.mu.Unlock()
			if cb != nil {
				cb(err)
			}
		}
	}
}

// VideoFrame encodes and sends one frame. The encoder follows the frame
// size, so games with odd resolutions (e.g. 248x256) are sent natively
// and the browser scales them.
func (s *StreamService) VideoFrame(i420 []byte, w, h int, dur time.Duration) {
	if s.videoViewerCount() == 0 {
		s.sent, s.window = 0, time.Now()
		return
	}
	if elapsed := time.Since(s.window); elapsed >= time.Second {
		s.mu.Lock()
		s.sentFPS = float64(s.sent) / elapsed.Seconds()
		s.videoKbps = float64(s.sentBytes) * 8 / 1000 / elapsed.Seconds()
		s.mu.Unlock()
		s.sent, s.sentBytes, s.window = 0, 0, time.Now()
	}
	if s.vp8 == nil || s.vp8W != w || s.vp8H != h {
		if s.vp8 != nil {
			s.vp8.Close()
		}
		fps := max(int(time.Second/dur), 1)
		enc, err := encoder.NewVP8(encoder.Config{Width: w, Height: h, FPS: fps, BitrateKbps: s.cfg.BitrateKbps})
		if err != nil {
			s.log.Error("video encoder", "err", err)
			s.vp8 = nil
			return
		}
		s.vp8, s.vp8W, s.vp8H = enc, w, h
		s.keyframe.Store(true)
	}
	data, _, err := s.vp8.Encode(i420, s.keyframe.Swap(false))
	if err != nil {
		s.log.Error("encode failed", "err", err)
		return
	}
	if len(data) == 0 {
		return
	}
	if err := s.track.WriteSample(media.Sample{Data: data, Duration: dur}); err != nil && !errors.Is(err, errClosedPipe) {
		s.log.Debug("write sample", "err", err)
	}
	s.sent++
	s.sentBytes += len(data)
}

// AudioSamples buffers audio and sends it in 20 ms Opus frames.
func (s *StreamService) AudioSamples(pcm []int16) {
	if s.videoViewerCount() == 0 || s.opus == nil {
		s.pcm = s.pcm[:0]
		return
	}
	s.pcm = append(s.pcm, pcm...)
	const frame = encoder.OpusFrameSamples * 2 // stereo
	for len(s.pcm) >= frame {
		pkt, err := s.opus.Encode(s.pcm[:frame])
		s.pcm = append(s.pcm[:0], s.pcm[frame:]...)
		if err != nil {
			s.log.Error("audio encode", "err", err)
			continue
		}
		_ = s.audio.WriteSample(media.Sample{Data: pkt, Duration: 20 * time.Millisecond})
	}
}

// SetAspect records the picture's display aspect ratio for the web.
func (s *StreamService) SetAspect(aspect float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.aspect = aspect
}

var errClosedPipe = errors.New("io: read/write on closed pipe")

func (s *StreamService) videoViewerCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	n := 0
	for _, v := range s.viewers {
		if v.kind == KindViewer {
			n++
		}
	}
	return n
}

// ViewerCount returns how many peer connections exist.
func (s *StreamService) ViewerCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.viewers)
}

// Pressed returns the buttons a viewer is holding, all local players
// together.
func (s *StreamService) Pressed(peerID string) input.State {
	s.mu.Lock()
	defer s.mu.Unlock()
	var all input.State
	for _, pad := range s.pads[peerID] {
		all |= pad.Buttons
	}
	return all
}

// PortPad merges the controllers of whoever is seated at port (1-4).
// Without a Room Manager, local player N of every guest plays port N+1.
// The port's Start is also down while any seated player presses its panel
// start button (Start1 to Start4).
func (s *StreamService) PortPad(port int) input.Pad {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out input.Pad
	panelStart := input.StartOf(port)
	for peer, pads := range s.pads {
		for i, pad := range pads {
			p := i + 1
			if s.room.PortOf != nil {
				var ok bool
				if p, ok = s.room.PortOf(peer, uint8(i)); !ok {
					continue
				}
			}
			// Any seated player can press this port's start button.
			if panelStart != 0 && pad.Buttons.Pressed(panelStart) {
				out.Buttons |= input.State(input.Start)
			}
			if p != port {
				continue
			}
			out.Buttons |= pad.Buttons
			for a := range pad.Axes {
				if abs(int(pad.Axes[a])) > abs(int(out.Axes[a])) {
					out.Axes[a] = pad.Axes[a]
				}
			}
		}
	}
	return out
}

// Stats returns what is being streamed. With no viewer nothing is encoded.
func (s *StreamService) Stats() models.StreamStatus {
	viewers := s.videoViewerCount()
	s.mu.Lock()
	defer s.mu.Unlock()
	if viewers == 0 {
		return models.StreamStatus{}
	}
	return models.StreamStatus{FPS: s.sentFPS, Width: s.vp8W, Height: s.vp8H, VideoKbps: s.videoKbps, VideoViewers: viewers}
}

// SentFPS returns the frames per second sent over the last second.
func (s *StreamService) SentFPS() float64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sentFPS
}

// Controls merges the input of every seated player for the test card.
// The lamps show seats (ports), not local player numbers. Without a Room
// Manager every local player counts, by its own number.
func (s *StreamService) Controls() testpattern.Controls {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := testpattern.Controls{FPS: s.sentFPS}
	strongest := 0
	for peer, pads := range s.pads {
		for i, pad := range pads {
			port := i + 1
			if s.room.PortOf != nil {
				var ok bool
				if port, ok = s.room.PortOf(peer, uint8(i)); !ok {
					continue // not seated: watching or in the queue
				}
			}
			c.Buttons |= pad.Buttons
			move := 0
			for _, a := range pad.Axes {
				move += abs(int(a))
			}
			if (pad.Buttons != 0 || move != 0) && port >= 1 && port <= len(c.Players) {
				c.Players[port-1] = true
			}
			if move > strongest {
				strongest, c.Axes = move, pad.Axes
			}
		}
	}
	return c
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

// sendStreamStats tells viewers what the device is sending, so the web
// can compare sent and received frames.
func (s *StreamService) sendStreamStats() {
	s.mu.Lock()
	msg, _ := json.Marshal(map[string]any{"type": "stream_stats", "fps": s.sentFPS, "width": s.vp8W, "height": s.vp8H, "aspect": s.aspect})
	var targets []*webrtc.DataChannel
	for _, v := range s.viewers {
		if v.kind == KindViewer && v.control != nil && v.control.ReadyState() == webrtc.DataChannelStateOpen {
			targets = append(targets, v.control)
		}
	}
	s.mu.Unlock()
	for _, dc := range targets {
		_ = dc.SendText(string(msg))
	}
}

func (s *StreamService) sendSignal(to string, sig RTCSignal) {
	s.mu.Lock()
	sender := s.sender
	s.mu.Unlock()
	if sender == nil {
		return
	}
	payload, err := json.Marshal(sig)
	if err != nil {
		return
	}
	if err := sender.Send(signalclient.Envelope{Type: signalclient.TypeSignal, To: to, Payload: payload}); err != nil {
		s.log.Warn("signal not sent", "to", to, "kind", sig.Kind, "err", err)
	}
}

func (s *StreamService) iceServers() []webrtc.ICEServer {
	var out []webrtc.ICEServer
	for _, srv := range s.ice.Get() {
		out = append(out, webrtc.ICEServer{URLs: srv.URLs, Username: srv.Username, Credential: srv.Credential})
	}
	return out
}

// AddViewer opens a video peer connection to peerID and sends an offer.
func (s *StreamService) AddViewer(peerID string) error { return s.AddPeer(peerID, KindViewer) }

// AddLink opens a data-only peer connection to a linked browser.
func (s *StreamService) AddLink(peerID string) error { return s.AddPeer(peerID, KindLink) }

// AddPeer opens a peer connection of the given kind and sends an offer.
func (s *StreamService) AddPeer(peerID string, kind PeerKind) error {
	pc, err := s.api.NewPeerConnection(webrtc.Configuration{ICEServers: s.iceServers()})
	if err != nil {
		return err
	}
	v := &viewer{id: peerID, kind: kind, pc: pc}
	fail := func(err error) error {
		_ = pc.Close()
		return err
	}

	if kind == KindViewer {
		if err := s.addMedia(v); err != nil {
			return fail(err)
		}
	}

	ordered := true
	control, err := pc.CreateDataChannel("control", &webrtc.DataChannelInit{Ordered: &ordered})
	if err != nil {
		return fail(err)
	}
	v.control = control
	control.OnOpen(func() {
		if kind == KindViewer {
			_ = control.SendText(`{"type":"welcome","source":"test-pattern"}`)
			if h := s.hooks(); h.Opened != nil {
				h.Opened(peerID)
			}
		}
	})
	control.OnMessage(func(msg webrtc.DataChannelMessage) { s.handleControl(v, msg.Data) })

	if kind == KindLink {
		// ROM uploads from the owner: reliable and ordered, and separate
		// from control so a large file never delays other messages.
		files, err := pc.CreateDataChannel("files", &webrtc.DataChannelInit{Ordered: &ordered})
		if err != nil {
			return fail(err)
		}
		files.OnMessage(func(msg webrtc.DataChannelMessage) {
			s.mu.Lock()
			fn := s.onLinkFile
			s.mu.Unlock()
			if fn != nil && s.linkAllowed(peerID) {
				fn(peerID, msg.IsString, msg.Data)
			}
		})
	}

	if kind == KindViewer {
		unordered := false
		noRetransmits := uint16(0)
		inputDC, err := pc.CreateDataChannel("input", &webrtc.DataChannelInit{Ordered: &unordered, MaxRetransmits: &noRetransmits})
		if err != nil {
			return fail(err)
		}
		inputDC.OnMessage(func(msg webrtc.DataChannelMessage) { s.handleInput(v, msg.Data) })
	}
	return s.offer(v)
}

// addMedia adds, in this order: game video, game audio, one voice track
// per port (P1-P4) and a receive-only audio line for the guest's
// microphone. Every track exists from the first offer, so taking or
// losing a seat never renegotiates the connection.
func (s *StreamService) addMedia(v *viewer) error {
	pc := v.pc
	rtpSender, err := pc.AddTrack(s.track)
	if err != nil {
		return err
	}
	// Read RTCP: a Picture Loss Indication means the viewer cannot decode
	// and needs a keyframe.
	go func() {
		buf := make([]byte, 1500)
		for {
			n, _, err := rtpSender.Read(buf)
			if err != nil {
				return
			}
			pkts, err := rtcp.Unmarshal(buf[:n])
			if err != nil {
				continue
			}
			for _, p := range pkts {
				switch p.(type) {
				case *rtcp.PictureLossIndication, *rtcp.FullIntraRequest:
					s.keyframe.Store(true)
				}
			}
		}
	}()

	senders := []*webrtc.RTPSender{}
	audioSender, err := pc.AddTrack(s.audio)
	if err != nil {
		return err
	}
	senders = append(senders, audioSender)
	for i := range v.voice {
		id := fmt.Sprintf("voice-p%d", i+1)
		track, err := webrtc.NewTrackLocalStaticRTP(webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2}, id, id)
		if err != nil {
			return err
		}
		sender, err := pc.AddTrack(track)
		if err != nil {
			return err
		}
		v.voice[i] = track
		senders = append(senders, sender)
	}
	for _, sender := range senders {
		go func() { // drain RTCP so Pion's interceptors keep working
			buf := make([]byte, 1500)
			for {
				if _, _, err := sender.Read(buf); err != nil {
					return
				}
			}
		}()
	}

	// The guest's microphone.
	if _, err := pc.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio, webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly}); err != nil {
		return err
	}
	pc.OnTrack(func(track *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		if track.Kind() == webrtc.RTPCodecTypeAudio {
			s.forwardVoice(v.id, track)
		}
	})
	return nil
}

// forwardVoice relays a guest's microphone, packet by packet and without
// decoding, to the other players (SFU style). Audio from a guest without
// a seat is dropped here, on the device, whatever the web shows.
func (s *StreamService) forwardVoice(from string, track *webrtc.TrackRemote) {
	for {
		pkt, _, err := track.ReadRTP()
		if err != nil {
			return
		}
		port := s.seatOf(from)
		if port == 0 || s.voiceDisabled() {
			continue // not a player, or voice is off in this room
		}
		for _, out := range s.voiceTargets(from, port) {
			_ = out.WriteRTP(pkt)
		}
	}
}

// SetVoiceEnabled turns voice between players on or off for the room.
func (s *StreamService) SetVoiceEnabled(on bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.voiceOff = !on
}

func (s *StreamService) voiceDisabled() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.voiceOff
}

// seatOf returns the first port held by any local player of peerID, or 0.
func (s *StreamService) seatOf(peerID string) int {
	s.mu.Lock()
	portOf := s.room.PortOf
	s.mu.Unlock()
	if portOf == nil {
		return 0
	}
	for local := uint8(0); local < input.MaxLocalPlayers; local++ {
		if port, ok := portOf(peerID, local); ok {
			return port
		}
	}
	return 0
}

// voiceTargets lists the tracks that carry the voice of port to everyone
// allowed to hear it: other players, plus spectators if the room says so.
// The speaker never gets their own voice back.
func (s *StreamService) voiceTargets(from string, port int) []*webrtc.TrackLocalStaticRTP {
	s.mu.Lock()
	hear := s.room.SpectatorsHearVoice
	viewers := make([]*viewer, 0, len(s.viewers))
	for _, v := range s.viewers {
		if v.kind == KindViewer && v.id != from {
			viewers = append(viewers, v)
		}
	}
	s.mu.Unlock()
	var out []*webrtc.TrackLocalStaticRTP
	for _, v := range viewers {
		if (hear || s.seatOf(v.id) != 0) && v.voice[port-1] != nil {
			out = append(out, v.voice[port-1])
		}
	}
	return out
}

func (s *StreamService) offer(v *viewer) error {
	pc, peerID := v.pc, v.id
	fail := func(err error) error {
		_ = pc.Close()
		return err
	}
	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c == nil {
			return // gathering finished
		}
		init := c.ToJSON()
		s.sendSignal(peerID, RTCSignal{Kind: "candidate", Candidate: &init})
		// The same port behind a forwarding router: announce it there too.
		if c.Typ == webrtc.ICECandidateTypeHost && s.cfg.UDPPort > 0 && int(c.Port) == s.cfg.UDPPort {
			for _, extra := range announcedCandidates(init, s.cfg.AnnounceIPs) {
				s.sendSignal(peerID, RTCSignal{Kind: "candidate", Candidate: &extra})
			}
		}
	})
	pc.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		s.log.Info("viewer connection", "peer_id", peerID, "state", state.String())
		switch state {
		case webrtc.PeerConnectionStateConnected:
			s.keyframe.Store(true)
			go s.logPath(peerID, pc)
		case webrtc.PeerConnectionStateFailed:
			go s.RemoveViewer(peerID) // not from inside Pion's callback
		}
	})

	offer, err := pc.CreateOffer(nil)
	if err != nil {
		return fail(err)
	}
	if err := pc.SetLocalDescription(offer); err != nil {
		return fail(err)
	}

	s.mu.Lock()
	old := s.viewers[peerID]
	s.viewers[peerID] = v
	s.mu.Unlock()
	if old != nil {
		_ = old.pc.Close()
	}
	if v.kind == KindViewer {
		s.keyframe.Store(true)
	}
	s.sendSignal(peerID, RTCSignal{Kind: "offer", SDP: offer.SDP})
	return nil
}

// controlMessage is the envelope of every JSON message on "control".
// controlMessage is the part of a control message the stream reads. The
// id stays raw: a pong carries a number, but other messages (room actions)
// carry a text id, and they must not be dropped for it.
type controlMessage struct {
	Type string          `json:"type"`
	ID   json.RawMessage `json:"id,omitempty"`
}

func (s *StreamService) handleControl(v *viewer, data []byte) {
	var msg controlMessage
	if json.Unmarshal(data, &msg) != nil {
		return
	}
	if msg.Type != "pong" {
		s.mu.Lock()
		h, linkMsg := s.room, s.onLinkMsg
		s.mu.Unlock()
		switch {
		case v.kind == KindViewer && h.Message != nil:
			h.Message(v.id, data)
		case v.kind == KindLink && linkMsg != nil:
			linkMsg(v.id, data)
		}
		return
	}
	var id uint64
	if json.Unmarshal(msg.ID, &id) != nil {
		return
	}
	s.mu.Lock()
	sent, ok := s.pings[id]
	delete(s.pings, id)
	cb := s.onLatency
	s.mu.Unlock()
	if ok && cb != nil {
		cb(v.id, int(time.Since(sent).Milliseconds()))
	}
}

// pingAll sends a ping to every open control channel. The browser echoes
// it, which measures the round trip over the peer-to-peer path.
func (s *StreamService) pingAll() {
	s.mu.Lock()
	now := time.Now()
	for id, t := range s.pings { // forget pings that never came back
		if now.Sub(t) > 10*time.Second {
			delete(s.pings, id)
		}
	}
	var targets []*webrtc.DataChannel
	var ids []uint64
	for _, v := range s.viewers {
		if v.control != nil && v.control.ReadyState() == webrtc.DataChannelStateOpen {
			s.pingSeq++
			s.pings[s.pingSeq] = now
			targets = append(targets, v.control)
			ids = append(ids, s.pingSeq)
		}
	}
	s.mu.Unlock()
	for i, dc := range targets {
		b, _ := json.Marshal(struct {
			Type string `json:"type"`
			ID   uint64 `json:"id"`
		}{"ping", ids[i]})
		_ = dc.SendText(string(b))
	}
}

// SendToLinks sends a JSON message to every linked browser. Viewers of a
// room never receive it: device details are only for the owner.
func (s *StreamService) SendToLinks(msg any) {
	b, err := json.Marshal(msg)
	if err != nil {
		return
	}
	s.mu.Lock()
	var targets []*webrtc.DataChannel
	gate := s.linkGate
	for _, v := range s.viewers {
		if v.kind == KindLink && v.control != nil && v.control.ReadyState() == webrtc.DataChannelStateOpen && (gate == nil || gate(v.id)) {
			targets = append(targets, v.control)
		}
	}
	s.mu.Unlock()
	for _, dc := range targets {
		_ = dc.SendText(string(b))
	}
}

// HandleSignal applies an answer or ICE candidate from a viewer.
func (s *StreamService) HandleSignal(from string, payload json.RawMessage) error {
	s.mu.Lock()
	v := s.viewers[from]
	s.mu.Unlock()
	if v == nil {
		return errors.New("stream: signal from unknown viewer")
	}
	var sig RTCSignal
	if err := json.Unmarshal(payload, &sig); err != nil {
		return err
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	switch sig.Kind {
	case "answer":
		if err := v.pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeAnswer, SDP: sig.SDP}); err != nil {
			return err
		}
		v.remoteSet = true
		for _, c := range v.pending {
			_ = v.pc.AddICECandidate(c)
		}
		v.pending = nil
	case "candidate":
		if sig.Candidate == nil {
			return nil
		}
		s.log.Debug("remote candidate", "peer_id", from, "candidate", sig.Candidate.Candidate)
		if !v.remoteSet {
			if len(v.pending) < maxPendingCandidates {
				v.pending = append(v.pending, *sig.Candidate) // arrived before the answer
			}
			return nil
		}
		return v.pc.AddICECandidate(*sig.Candidate)
	default:
		return errors.New("stream: unknown signal kind " + sig.Kind)
	}
	return nil
}

func (s *StreamService) handleInput(v *viewer, packet []byte) {
	v.mu.Lock()
	pkt, changed, err := v.input.Apply(packet)
	pads := v.input.Pads()
	v.mu.Unlock()
	if err != nil {
		return
	}
	s.mu.Lock()
	if _, ok := s.viewers[v.id]; ok {
		s.pads[v.id] = pads
	}
	s.mu.Unlock()
	if changed {
		s.log.Debug("input", "peer_id", v.id, "player", pkt.Player, "buttons", pkt.Pad.Buttons.String())
	}
}

// RemoveViewer closes the peer connection of peerID, if any.
func (s *StreamService) RemoveViewer(peerID string) {
	s.mu.Lock()
	v := s.viewers[peerID]
	delete(s.viewers, peerID)
	delete(s.pads, peerID)
	closed := s.room.Closed
	linkClosed := s.onLinkClosed
	s.mu.Unlock()
	if v != nil {
		_ = v.pc.Close()
		if v.kind == KindViewer && closed != nil {
			closed(peerID)
		}
		if v.kind == KindLink && linkClosed != nil {
			linkClosed(peerID)
		}
	}
}

// CloseAll drops every viewer (the signaling link was lost).
func (s *StreamService) CloseAll() {
	s.mu.Lock()
	ids := slices.Collect(maps.Keys(s.viewers))
	s.mu.Unlock()
	for _, id := range ids {
		s.RemoveViewer(id)
	}
}
