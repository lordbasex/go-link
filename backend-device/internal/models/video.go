// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package models

// Video qualities the host chooses for game rooms (device.json
// video_quality). High and normal send the game's picture enlarged 2x, so
// every game pixel keeps its own color; saver sends it at the game's size
// with each 2x2 block's colors averaged, for slow computers or narrow
// uplinks.
const (
	VideoHigh   = "high"   // 2x at 3,500 kbps (the default)
	VideoNormal = "normal" // 2x at 2,500 kbps
	VideoSaver  = "saver"  // the game's size at 2,500 kbps
)

// VideoQualities are the choices, best first.
var VideoQualities = []string{VideoHigh, VideoNormal, VideoSaver}

// DefaultVideoQuality is used when device.json names none.
const DefaultVideoQuality = VideoHigh

// ValidVideoQuality reports whether q is one of VideoQualities.
func ValidVideoQuality(q string) bool {
	for _, v := range VideoQualities {
		if q == v {
			return true
		}
	}
	return false
}

// CleanVideoQuality returns q, or the default for an empty or unknown one
// (a hand-edited device.json).
func CleanVideoQuality(q string) string {
	if ValidVideoQuality(q) {
		return q
	}
	return DefaultVideoQuality
}

// Why a room sends less than the host's choice.
const (
	// VideoFallbackCPU: the 2x picture did not fit this computer's time
	// per frame, so the room went to saver.
	VideoFallbackCPU = "cpu"
)

// RoomVideo is the video a running room sends.
type RoomVideo struct {
	// Quality in use: the host's choice, or saver after a fallback.
	Quality string `json:"quality"`
	// Fallback says why Quality is lower than the host's choice
	// (VideoFallbackCPU), empty when it is the choice.
	Fallback string `json:"fallback,omitempty"`
	// Scale is 2 while the picture is sent enlarged 2x, else 1.
	Scale int `json:"scale"`
}
