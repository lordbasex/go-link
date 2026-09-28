// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/lordbasex/go-link/backend-device/internal/models"
)

func TestDeviceStatusCarriesStorageSizes(t *testing.T) {
	st := models.Status{
		DeviceID:   "d1",
		SavesBytes: 940_000,
		Library:    &models.Library{Roms: []models.RomInfo{}, ThumbnailsBytes: 1_400_000},
	}
	out, err := json.Marshal(NewDeviceStatusMessage(st))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"saves_bytes":940000`, `"thumbnails_bytes":1400000`} {
		if !strings.Contains(string(out), want) {
			t.Errorf("device_status lacks %s: %s", want, out)
		}
	}
}
