// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package models

import "slices"

// PictureStyles are how the website can draw a game (docs/web.md,
// "Picture styles"): smooth (bilinear), sharp, crt and edges.
var PictureStyles = []string{"smooth", "sharp", "crt", "edges"}

// PictureBands are what the website draws beside the picture: black,
// ambient or frame.
var PictureBands = []string{"black", "ambient", "frame"}

// RoomPicture is the host's default picture for a room: what a guest's
// browser shows until its viewer picks a style of their own. The device
// never draws it; it only keeps it and sends it in room_state.
type RoomPicture struct {
	Style string `json:"style"`
	Bands string `json:"bands"`
}

// Valid reports whether both values are known ones.
func (p RoomPicture) Valid() bool {
	return slices.Contains(PictureStyles, p.Style) && slices.Contains(PictureBands, p.Bands)
}

// CleanPicture returns a copy of p when it is valid, else nil (unknown
// values are ignored: the room keeps the site's default).
func CleanPicture(p *RoomPicture) *RoomPicture {
	if p == nil || !p.Valid() {
		return nil
	}
	c := *p
	return &c
}
