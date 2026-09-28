// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package models

import (
	"time"

	"github.com/lordbasex/go-link/backend-device/pkg/romcheck"
	"github.com/lordbasex/go-link/backend-device/pkg/sysinfo"
)

// Signal connection states.
const (
	SignalConnecting   = "connecting"
	SignalConnected    = "connected"
	SignalDisconnected = "disconnected"
)

// Status is the device state shown by the window and, reduced, sent to
// linked browsers in device_status.
type Status struct {
	DeviceID string        `json:"device_id"`
	Version  string        `json:"version"`
	RomsDir  string        `json:"roms_dir"`
	Signal   SignalStatus  `json:"signal"`
	Pairing  PairingStatus `json:"pairing"`
	Peers    []LinkedPeer  `json:"peers"`
	// SavedLinks counts the browsers remembered in device.json. With none,
	// the window only shows the pairing code.
	SavedLinks int `json:"saved_links"`
	// Stream is only for the window: it is not sent to browsers.
	Stream StreamStatus `json:"-"`
	Room   *RoomStatus  `json:"room,omitempty"`
	// Rooms are the game rooms, besides the test pattern room.
	Rooms []ManagedRoom `json:"rooms"`
	// SavesBytes is the space the rooms' saved games take.
	SavesBytes int64         `json:"saves_bytes"`
	System     *SystemStatus `json:"system,omitempty"`
	Library    *Library      `json:"library,omitempty"`
	// Update is a newer go-link release, when there is one.
	Update *UpdateInfo `json:"update,omitempty"`
}

// UpdateInfo is a newer release of go-link than this build.
type UpdateInfo struct {
	Latest string `json:"latest"` // its version, e.g. v0.2.0
	URL    string `json:"url"`    // its release page, with the downloads
}

// Library is the host's ROM folder.
type Library struct {
	Dir  string        `json:"dir"`
	Roms []RomInfo     `json:"roms"`
	Core CoreStatus    `json:"core"`
	Disk *sysinfo.Disk `json:"disk,omitempty"` // the volume of Dir
	// ThumbnailsDir holds the host's thumbnails, one folder per kind.
	ThumbnailsDir string `json:"thumbnails_dir"`
	// ThumbKind is the kind of thumbnail the host chose to show (boxart,
	// title or snap); browsers show the same one.
	ThumbKind string `json:"thumb_kind"`
	// ThumbnailsBytes is the space the thumbnail images take.
	ThumbnailsBytes int64 `json:"thumbnails_bytes"`
}

// CoreStatus is the libretro emulator core on this machine.
type CoreStatus struct {
	Name        string `json:"name"`
	Installed   bool   `json:"installed"`
	Downloading bool   `json:"downloading"`
	// Catalog is the core's game list, used to check ROMs without
	// running them. It is downloaded with the core.
	Catalog bool   `json:"catalog"`
	Error   string `json:"error,omitempty"`
}

// RomInfo is one ROM set (a .zip) in the folder.
type RomInfo struct {
	Name  string `json:"name"`
	Size  int64  `json:"size"`
	Title string `json:"title,omitempty"`
	Year  string `json:"year,omitempty"`
	Maker string `json:"maker,omitempty"`
	// Thumbs tells which of the host's thumbnails exist for the set.
	Thumbs Thumbs `json:"thumbs"`
	// Check tells whether the core can run the set; nil until the core's
	// game list is downloaded.
	Check *romcheck.Result `json:"check,omitempty"`
}

// SystemStatus is the machine's hardware and live usage.
type SystemStatus struct {
	Hardware  sysinfo.Hardware `json:"hardware"`
	Usage     sysinfo.Usage    `json:"usage"`
	SampledAt time.Time        `json:"sampled_at"`
}

// RoomStatus is the room this device has open on signalhub.
type RoomStatus struct {
	RoomID     string `json:"room_id"`
	Viewers    int    `json:"viewers"`
	Title      string `json:"title,omitempty"`
	Game       string `json:"game,omitempty"`
	Public     bool   `json:"public"`
	Players    int    `json:"players"`
	MaxPlayers int    `json:"max_players"`
	Queue      int    `json:"queue"`
	Spectators int    `json:"spectators"`
	// The room's invitation, and the key the host's own browsers send
	// instead of a PIN (the owner's browsers only).
	Invite     string `json:"invite,omitempty"`
	InviteCode string `json:"invite_code,omitempty"`
	OwnerKey   string `json:"owner_key,omitempty"`
}

// StreamStatus is what the device is sending right now.
type StreamStatus struct {
	FPS          float64 `json:"fps"`
	Width        int     `json:"width"`
	Height       int     `json:"height"`
	VideoKbps    float64 `json:"video_kbps"` // encoded video, before each viewer's copy
	VideoViewers int     `json:"video_viewers"`
}

// SignalStatus describes the link with signalhub.
type SignalStatus struct {
	URL       string `json:"url"`
	State     string `json:"state"`
	PeerID    string `json:"peer_id,omitempty"`
	SessionID string `json:"session_id,omitempty"`
	Error     string `json:"error,omitempty"`
	// ICEURLs lists the STUN/TURN URLs received in hello. Credentials are
	// never exposed through the panel.
	ICEURLs []string `json:"ice_urls"`
}

// PairingStatus is the code shown to the user. The device replaces it
// before it expires and right after someone redeems it.
type PairingStatus struct {
	Code        string     `json:"code,omitempty"` // "113 134 323"
	IssuedAt    *time.Time `json:"issued_at,omitempty"`
	RefreshesAt *time.Time `json:"refreshes_at,omitempty"`
}

// LinkedPeer is a browser linked to this device's session.
type LinkedPeer struct {
	PeerID string    `json:"peer_id"`
	Since  time.Time `json:"since"`
	// LatencyMs is the round trip over the WebRTC DataChannel, when known.
	LatencyMs *int `json:"latency_ms,omitempty"`
}

// Thumbs tells which thumbnails a set has (Boxart, Title, Snap).
type Thumbs struct {
	Boxart bool `json:"boxart"`
	Title  bool `json:"title"`
	Snap   bool `json:"snap"`
}
