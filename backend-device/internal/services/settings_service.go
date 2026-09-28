// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"sync"

	"github.com/lordbasex/go-link/backend-device/internal/models"
	"github.com/lordbasex/go-link/backend-device/pkg/thumbnails"
)

// ErrBadSetting is a settings value the device cannot use.
var ErrBadSetting = errors.New("invalid setting")

// SettingsService holds the host's preferences (the window's Settings and
// the CLI), applies them to the services and saves them in device.json.
// It is meant to grow: each group of settings gets its own getter and
// setter.
type SettingsService struct {
	library    *LibraryService
	defaultDir string
	save       func(models.ThumbnailSettings) error

	mu         sync.Mutex
	thumbnails models.ThumbnailSettings
	onChange   []func()
}

// NewSettingsService applies the saved settings. defaultDir is the
// thumbnails folder used when none is set; save keeps changes in
// device.json.
func NewSettingsService(library *LibraryService, saved models.ThumbnailSettings, defaultDir string, save func(models.ThumbnailSettings) error) *SettingsService {
	s := &SettingsService{library: library, defaultDir: defaultDir, save: save, thumbnails: normalize(saved)}
	s.apply()
	return s
}

// normalize fills the defaults.
func normalize(t models.ThumbnailSettings) models.ThumbnailSettings {
	if !thumbnails.Kind(t.Kind).Valid() {
		t.Kind = string(thumbnails.Boxart)
	}
	if !slices.Contains(models.ThumbnailSizes, t.Size) {
		t.Size = models.ThumbnailSizes[0]
	}
	return t
}

// Thumbnails returns the thumbnail settings, with the defaults filled in.
func (s *SettingsService) Thumbnails() models.ThumbnailSettings {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.thumbnails
}

// ThumbnailsDir is the folder in use (the default when none is set).
func (s *SettingsService) ThumbnailsDir() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.thumbnails.Dir != "" {
		return s.thumbnails.Dir
	}
	return s.defaultDir
}

// SetThumbnails changes the thumbnail settings. A folder must be an
// absolute path to an existing directory ("" goes back to the default).
func (s *SettingsService) SetThumbnails(t models.ThumbnailSettings) error {
	if t.Dir != "" {
		if !filepath.IsAbs(t.Dir) {
			return ErrBadSetting
		}
		if fi, err := os.Stat(t.Dir); err != nil || !fi.IsDir() {
			return ErrBadSetting
		}
		t.Dir = filepath.Clean(t.Dir)
	}
	if t.Kind != "" && !thumbnails.Kind(t.Kind).Valid() {
		return ErrBadSetting
	}
	if t.Size != "" && !slices.Contains(models.ThumbnailSizes, t.Size) {
		return ErrBadSetting
	}
	t = normalize(t)
	s.mu.Lock()
	s.thumbnails = t
	listeners := slices.Clone(s.onChange)
	s.mu.Unlock()
	s.apply()
	if s.save != nil {
		if err := s.save(t); err != nil {
			return err
		}
	}
	for _, fn := range listeners {
		fn()
	}
	return nil
}

// OnChange is called after any setting changes (the window repaints).
func (s *SettingsService) OnChange(fn func()) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onChange = append(s.onChange, fn)
}

// apply pushes the settings into the services and rescans the library,
// so the new kind or folder shows everywhere.
func (s *SettingsService) apply() {
	if s.library == nil {
		return
	}
	t := s.Thumbnails()
	s.library.SetThumbnailsDir(s.ThumbnailsDir())
	s.library.SetThumbnailKind(thumbnails.Kind(t.Kind))
	s.library.Scan()
}
