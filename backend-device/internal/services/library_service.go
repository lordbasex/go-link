// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/lordbasex/go-link/backend-device/internal/models"
	"github.com/lordbasex/go-link/backend-device/pkg/cores"
	"github.com/lordbasex/go-link/backend-device/pkg/romcheck"
	"github.com/lordbasex/go-link/backend-device/pkg/sysinfo"
	"github.com/lordbasex/go-link/backend-device/pkg/thumbnails"
)

// ErrDownloadRunning is returned when the core download is already running.
var ErrDownloadRunning = errors.New("a download is already running")

var romNameRE = regexp.MustCompile(`^[a-z0-9_]{1,16}$`)

// LibraryService manages the host's ROM folder: it lists and checks the
// sets the host put there, and installs the emulator core on request. ROMs
// never leave this folder.
type LibraryService struct {
	dirMu  sync.RWMutex
	dir    string // guarded by dirMu
	onDir  func(dir string)
	status *StatusService
	log    *slog.Logger

	mu         sync.Mutex
	core       models.CoreStatus
	coresDir   string
	coreURL    string
	gameList   *romcheck.Catalog // the core's game list, loaded lazily
	badList    time.Time         // mod time of a game list that failed to load
	datURL     string
	thumbsDir  string
	thumbKind  thumbnails.Kind
	thumbCache *thumbnails.Cache
}

// SetCore configures the libretro core: its folder and the buildbot URL
// for this machine (empty when there is no prebuilt core).
func (l *LibraryService) SetCore(dir, url string) {
	l.mu.Lock()
	l.coresDir, l.coreURL = dir, url
	l.core.Name = cores.DefaultCore
	l.mu.Unlock()
}

// CatalogPath is where the core's compact game list lives.
func (l *LibraryService) CatalogPath() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return filepath.Join(l.coresDir, romcheck.FileName)
}

// Catalog returns the core's game list, or nil when it is not installed.
func (l *LibraryService) Catalog() *romcheck.Catalog {
	l.mu.Lock()
	cat := l.gameList
	l.mu.Unlock()
	if cat != nil {
		return cat
	}
	path := l.CatalogPath()
	fi, err := os.Stat(path)
	if err != nil {
		return nil
	}
	l.mu.Lock()
	known := l.badList.Equal(fi.ModTime())
	l.mu.Unlock()
	if known {
		return nil // already reported; wait for a new download
	}
	cat, err = romcheck.Load(path)
	if err != nil {
		l.log.Warn("cannot read the core's game list", "err", err)
		l.mu.Lock()
		l.badList = fi.ModTime()
		l.mu.Unlock()
		return nil
	}
	l.mu.Lock()
	l.gameList = cat
	l.mu.Unlock()
	return cat
}

// RefreshCatalog downloads the core's game list again when the saved one
// has an older layout (for example, from before games carried their
// controls). A missing list is left alone: it comes with the core.
func (l *LibraryService) RefreshCatalog(ctx context.Context) {
	path := l.CatalogPath()
	if _, err := romcheck.Load(path); !errors.Is(err, romcheck.ErrOutdated) {
		return
	}
	l.mu.Lock()
	url := l.datURL
	l.mu.Unlock()
	if url == "" {
		url = romcheck.DatURL
	}
	cat, err := romcheck.Download(ctx, nil, url, path)
	if err != nil {
		l.log.Warn("cannot update the core's game list", "err", err)
		return
	}
	l.mu.Lock()
	l.gameList, l.badList = cat, time.Time{}
	l.mu.Unlock()
	l.log.Info("core game list updated", "games", len(cat.Games))
	l.Scan()
}

// CheckRom tells whether the core can run a set, without running it. ok
// is false when the core's game list is not installed.
func (l *LibraryService) CheckRom(name string) (res romcheck.Result, ok bool) {
	cat := l.Catalog()
	if cat == nil {
		return romcheck.Result{}, false
	}
	return romcheck.NewChecker(cat, l.Dir()).Check(name), true
}

// CorePath is where the core library lives.
func (l *LibraryService) CorePath() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return filepath.Join(l.coresDir, cores.FileName(cores.DefaultCore, runtime.GOOS))
}

// HasCore reports whether the core is installed.
func (l *LibraryService) HasCore() bool {
	_, err := os.Stat(l.CorePath())
	return err == nil
}

// HasRom reports whether a ROM set is in the folder.
func (l *LibraryService) HasRom(name string) bool {
	if !romNameRE.MatchString(name) {
		return false
	}
	_, err := os.Stat(filepath.Join(l.Dir(), name+".zip"))
	return err == nil
}

// RomPath returns the file of a ROM set.
func (l *LibraryService) RomPath(name string) string { return filepath.Join(l.Dir(), name+".zip") }

// Title returns the catalog title of a set, or its short name.
func (l *LibraryService) Title(name string) string {
	if lib := l.status.Snapshot().Library; lib != nil {
		for _, r := range lib.Roms {
			if r.Name == name && r.Title != "" {
				return r.Title
			}
		}
	}
	return name
}

// DownloadCore installs the emulator core from the libretro buildbot and
// the core's game list (to check ROMs), whichever is missing, in the
// background.
func (l *LibraryService) DownloadCore(ctx context.Context) error {
	if err := l.startCoreDownload(); err != nil {
		return err
	}
	go l.installCore(ctx)
	return nil
}

// InstallCore is DownloadCore, waiting until it ends (for the CLI).
func (l *LibraryService) InstallCore(ctx context.Context) error {
	if err := l.startCoreDownload(); err != nil {
		return err
	}
	return l.installCore(ctx)
}

func (l *LibraryService) startCoreDownload() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.core.Downloading {
		return ErrDownloadRunning
	}
	l.core.Downloading, l.core.Error = true, ""
	return nil
}

func (l *LibraryService) installCore(ctx context.Context) error {
	l.Scan()
	var errs []error
	if !l.HasCore() {
		l.mu.Lock()
		url, dir := l.coreURL, l.coresDir
		l.mu.Unlock()
		if url == "" {
			errs = append(errs, errors.New("no prebuilt emulator core for this system"))
		} else if _, err := cores.Download(ctx, nil, url, cores.FileName(cores.DefaultCore, runtime.GOOS), dir); err != nil {
			errs = append(errs, err)
		} else {
			l.log.Info("emulator core installed", "core", cores.DefaultCore)
		}
	}
	if l.Catalog() == nil {
		l.mu.Lock()
		url := l.datURL
		l.mu.Unlock()
		if url == "" {
			url = romcheck.DatURL
		}
		if cat, err := romcheck.Download(ctx, nil, url, l.CatalogPath()); err != nil {
			errs = append(errs, fmt.Errorf("core game list: %w", err))
		} else {
			l.mu.Lock()
			l.gameList = cat
			l.mu.Unlock()
			l.log.Info("core game list installed", "games", len(cat.Games))
		}
	}
	err := errors.Join(errs...)
	l.mu.Lock()
	l.core.Downloading = false
	if err != nil {
		l.core.Error = err.Error()
		l.log.Warn("core download failed", "err", err)
	}
	l.mu.Unlock()
	l.Scan()
	return err
}

// NewLibraryService builds the service for dir.
func NewLibraryService(dir string, status *StatusService, logger *slog.Logger) *LibraryService {
	if logger == nil {
		logger = slog.Default()
	}
	return &LibraryService{dir: dir, status: status, log: logger, thumbCache: thumbnails.NewCache(512)}
}

// Dir returns the ROM folder.
func (l *LibraryService) Dir() string {
	l.dirMu.RLock()
	defer l.dirMu.RUnlock()
	return l.dir
}

// OnDirChange registers a callback that persists a new folder.
func (l *LibraryService) OnDirChange(fn func(dir string)) { l.onDir = fn }

// Errors returned when choosing a folder or importing ROMs.
var (
	ErrBadFolder = errors.New("the folder must be an absolute path to an existing directory")
	ErrBadRom    = errors.New("only MAME ROM sets (.zip files with a short name, e.g. robby.zip) can be added")
	ErrDiskFull  = errors.New("not enough free space on the device's disk for this ROM")
)

// MinFreeSpace is what an import always leaves free on the disk, so a
// drop never fills it (the device, its saves and the system need room).
const MinFreeSpace = 1 << 30

// diskFree reports the free bytes on the disk of path (tests replace it).
var diskFree = func(path string) (uint64, bool) {
	d, ok := sysinfo.DiskOf(path)
	return d.Free, ok
}

// SetDir switches to another ROM folder (for example the host's own
// collection) and rescans. Nothing is copied or moved.
func (l *LibraryService) SetDir(dir string) error {
	dir = filepath.Clean(strings.TrimSpace(dir))
	if !filepath.IsAbs(dir) {
		return ErrBadFolder
	}
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return ErrBadFolder
	}
	l.dirMu.Lock()
	l.dir = dir
	l.dirMu.Unlock()
	if l.onDir != nil {
		l.onDir(dir)
	}
	l.log.Info("ROM folder changed", "dir", dir)
	l.Scan()
	return nil
}

// MaxImportSize bounds one imported ROM set.
const MaxImportSize = 512 << 20

// CheckImportName validates a dropped file name and returns the set name.
func (l *LibraryService) CheckImportName(fileName string) (string, error) {
	if isImage(fileName) {
		if filepath.Base(fileName) != fileName {
			return "", thumbnails.ErrNotImage
		}
		return fileName, nil // a thumbnail (Boxart), see Import
	}
	base := strings.ToLower(filepath.Base(fileName))
	name, ok := strings.CutSuffix(base, ".zip")
	if !ok || !romNameRE.MatchString(name) {
		return "", ErrBadRom
	}
	if l.HasRom(name) {
		return "", fmt.Errorf("%s.zip is already in the folder", name)
	}
	return name, nil
}

// Import copies one ROM set into the current folder (drag and drop). The
// data is streamed to a temporary file, so large sets do not sit in
// memory. It never overwrites an existing set.
func (l *LibraryService) Import(fileName string, r io.Reader) error {
	// Images dropped with the ROMs are the host's Boxart thumbnails.
	if isImage(fileName) {
		return l.ImportThumbnail(thumbnails.Boxart, fileName, r)
	}
	name, err := l.CheckImportName(fileName)
	if err != nil {
		return err
	}
	dir := l.Dir()
	// Never fill the disk: at most what leaves MinFreeSpace free.
	limit := int64(MaxImportSize)
	if free, ok := diskFree(dir); ok {
		if free <= MinFreeSpace {
			return ErrDiskFull
		}
		limit = min(limit, int64(free-MinFreeSpace))
	}
	tmp, err := os.CreateTemp(dir, ".import-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	head := make([]byte, 4)
	if _, err := io.ReadFull(r, head); err != nil || !bytes.Equal(head, []byte("PK\x03\x04")) {
		tmp.Close()
		return ErrBadRom
	}
	n, err := io.Copy(tmp, io.MultiReader(bytes.NewReader(head), io.LimitReader(r, limit)))
	if err == nil && n > limit {
		err = ErrBadRom
		if limit < MaxImportSize {
			err = ErrDiskFull
		}
	}
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), 0o644); err != nil {
		return err
	}
	if err := placeNoOverwrite(tmp.Name(), filepath.Join(dir, name+".zip")); err != nil {
		return err
	}
	l.log.Info("ROM imported", "rom", name)
	l.Scan()
	return nil
}

// placeNoOverwrite moves src to dst and fails if dst already exists. A hard
// link is atomic and refuses an existing target; filesystems without links
// (exFAT, some network shares) fall back to a checked rename.
func placeNoOverwrite(src, dst string) error {
	err := os.Link(src, dst)
	if err == nil {
		return os.Remove(src)
	}
	if errors.Is(err, fs.ErrExist) {
		return fmt.Errorf("%s is already in the folder", filepath.Base(dst))
	}
	if _, serr := os.Stat(dst); serr == nil {
		return fmt.Errorf("%s is already in the folder", filepath.Base(dst))
	}
	return os.Rename(src, dst)
}

// Scan lists the .zip sets and publishes them in the status.
func (l *LibraryService) Scan() {
	var roms []models.RomInfo
	files, _ := os.ReadDir(l.Dir())
	for _, f := range files {
		name, ok := strings.CutSuffix(f.Name(), ".zip")
		if !ok || f.IsDir() || !romNameRE.MatchString(name) {
			continue
		}
		info, err := f.Info()
		if err != nil {
			continue
		}
		roms = append(roms, models.RomInfo{Name: name, Size: info.Size()})
	}
	// Check each set against the core's game list, without running it.
	if cat := l.Catalog(); cat != nil {
		checker := romcheck.NewChecker(cat, l.Dir())
		for i := range roms {
			res := checker.Check(roms[i].Name)
			roms[i].Check = &res
			if g := cat.Game(roms[i].Name); g != nil {
				roms[i].Title, roms[i].Year, roms[i].Maker = g.Title, g.Year, g.Maker
			}
		}
	}
	// Thumbnails can be named after the set or the title, so look after
	// the titles are known.
	thumbsDir := l.ThumbnailsDir()
	for i := range roms {
		has := thumbnails.Has(thumbsDir, roms[i].Name, roms[i].Title)
		roms[i].Thumbs = models.Thumbs{Boxart: has[thumbnails.Boxart], Title: has[thumbnails.Title], Snap: has[thumbnails.Snap]}
	}
	slices.SortFunc(roms, func(a, b models.RomInfo) int { return strings.Compare(a.Name, b.Name) })
	if roms == nil {
		roms = []models.RomInfo{}
	}
	installed := l.HasCore()
	l.mu.Lock()
	core := l.core
	l.mu.Unlock()
	core.Installed = installed
	core.Catalog = l.Catalog() != nil
	lib := models.Library{Dir: l.Dir(), Roms: roms, Core: core, ThumbnailsDir: thumbsDir, ThumbKind: string(l.ThumbnailKind()), ThumbnailsBytes: thumbnails.Size(thumbsDir)}
	if d, ok := sysinfo.DiskOf(l.Dir()); ok {
		lib.Disk = &d
	}
	l.status.SetLibrary(lib)
}

// SetThumbnailsDir sets the folder of the host's own thumbnails (one
// sub-folder per kind, libretro style).
func (l *LibraryService) SetThumbnailsDir(dir string) {
	l.mu.Lock()
	l.thumbsDir = dir
	l.mu.Unlock()
}

// SetThumbnailKind picks which kind of thumbnail the device shows (and
// tells browsers to show); an unknown kind means Boxart.
func (l *LibraryService) SetThumbnailKind(kind thumbnails.Kind) {
	if !kind.Valid() {
		kind = thumbnails.Boxart
	}
	l.mu.Lock()
	l.thumbKind = kind
	l.mu.Unlock()
}

// ThumbnailKind returns the kind of thumbnail to show.
func (l *LibraryService) ThumbnailKind() thumbnails.Kind {
	l.mu.Lock()
	defer l.mu.Unlock()
	if !l.thumbKind.Valid() {
		return thumbnails.Boxart
	}
	return l.thumbKind
}

// ThumbnailsDir returns the thumbnails folder.
func (l *LibraryService) ThumbnailsDir() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.thumbsDir
}

// ThumbnailPath returns the image of a kind for a set, if the host has it.
func (l *LibraryService) ThumbnailPath(name string, kind thumbnails.Kind) (string, bool) {
	if !romNameRE.MatchString(name) || !kind.Valid() {
		return "", false
	}
	return thumbnails.Find(l.ThumbnailsDir(), kind, name, l.Title(name))
}

// Thumbnail returns a small JPEG of a set's thumbnail that fits in
// maxW x maxH (and in maxBytes when it is above 0).
func (l *LibraryService) Thumbnail(name string, kind thumbnails.Kind, maxW, maxH, maxBytes int) ([]byte, error) {
	p, ok := l.ThumbnailPath(name, kind)
	if !ok {
		return nil, os.ErrNotExist
	}
	return l.thumbCache.Small(p, maxW, maxH, maxBytes)
}

// ImportThumbnail saves an image the host dropped and rescans, so the
// library shows it.
func (l *LibraryService) ImportThumbnail(kind thumbnails.Kind, name string, r io.Reader) error {
	if _, err := thumbnails.Import(l.ThumbnailsDir(), kind, name, r); err != nil {
		return err
	}
	l.Scan()
	return nil
}

// isImage reports whether a dropped file is a PNG or JPEG picture.
func isImage(fileName string) bool {
	switch strings.ToLower(filepath.Ext(fileName)) {
	case ".png", ".jpg", ".jpeg":
		return true
	}
	return false
}
