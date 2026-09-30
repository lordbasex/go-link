// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package models

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestRoomPictureAcceptsOnlyKnownValues(t *testing.T) {
	for _, style := range PictureStyles {
		for _, bands := range PictureBands {
			if !(RoomPicture{Style: style, Bands: bands}).Valid() {
				t.Errorf("%s/%s refused", style, bands)
			}
		}
	}
	for _, p := range []RoomPicture{{}, {Style: "crt"}, {Bands: "frame"}, {Style: "vaporwave", Bands: "black"}, {Style: "crt", Bands: "<script>"}, {Style: "CRT", Bands: "black"}} {
		if p.Valid() {
			t.Errorf("%+v accepted", p)
		}
		if CleanPicture(&p) != nil {
			t.Errorf("%+v kept", p)
		}
	}
	if CleanPicture(nil) != nil {
		t.Fatal("nil must stay nil")
	}
	in := &RoomPicture{Style: "crt", Bands: "ambient"}
	out := CleanPicture(in)
	if out == nil || *out != *in || out == in {
		t.Fatalf("clean copy %+v", out)
	}
}

func TestSavedRoomKeepsItsPictureInDeviceJSON(t *testing.T) {
	b, _ := json.Marshal(SavedRoom{ID: "a"})
	if strings.Contains(string(b), "picture") {
		t.Fatalf("no default picture must be left out: %s", b)
	}
	b, _ = json.Marshal(SavedRoom{ID: "a", Picture: &RoomPicture{Style: "sharp", Bands: "frame"}})
	var back SavedRoom
	if err := json.Unmarshal(b, &back); err != nil || back.Picture == nil || *back.Picture != (RoomPicture{Style: "sharp", Bands: "frame"}) {
		t.Fatalf("round trip %s -> %+v %v", b, back.Picture, err)
	}
	b, _ = json.Marshal(Config{TestRoomPicture: &RoomPicture{Style: "crt", Bands: "black"}})
	if !strings.Contains(string(b), `"test_room_picture":{"style":"crt","bands":"black"}`) {
		t.Fatalf("config %s", b)
	}
	if (Config{TestRoomPicture: &RoomPicture{Style: "crt", Bands: "black"}}).FactoryDefaults().TestRoomPicture != nil {
		t.Fatal("a factory reset forgets the test room's picture")
	}
}

func TestVideoQualityValues(t *testing.T) {
	for _, q := range VideoQualities {
		if !ValidVideoQuality(q) || CleanVideoQuality(q) != q {
			t.Fatalf("%q rejected", q)
		}
	}
	for _, q := range []string{"", "High", "ultra"} {
		if ValidVideoQuality(q) || CleanVideoQuality(q) != DefaultVideoQuality {
			t.Fatalf("%q accepted", q)
		}
	}
	if DefaultVideoQuality != VideoHigh {
		t.Fatal("the default is high")
	}
}
