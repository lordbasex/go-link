# Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
#
# go-link builds and deploys.
#
#   make all          web + device for every platform
#   make web-build    build the website (frontend/apps/web/dist)
#   make web-deploy   build and upload the website (deploy/local/hosting.mk)
#   make help         everything else

.PHONY: all e2e release legal panel device-dmg device-darwin-universal FORCE device-docker device-docker-oci help info web-build web-deploy hosting-help \
	device device-windows device-windows-amd64 device-windows-arm64 clean

# The darwin and linux device targets are pattern rules (device-darwin-%,
# device-linux-%): make does not apply pattern rules to .PHONY targets, so
# they are not listed above.

# Project
PROJECT_NAME   = go-link
VERSION       ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
# macOS signature: "-" (ad hoc) is a development build that only runs on
# this Mac without warnings. With CODESIGN_IDENTITY="Developer ID
# Application: Name (TEAMID)" the app is signed with the hardened runtime,
# ready to notarize (scripts/release.sh with NOTARY_PROFILE).
CODESIGN_IDENTITY ?= -
# The x.y.z macOS shows for the app (the latest vX.Y.Z tag, else 0.1.0).
SHORT_VERSION ?= $(shell git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null | sed 's/^v//' || true)
SHORT_VERSION := $(or $(SHORT_VERSION),0.1.0)
DIST           = $(CURDIR)/dist

# Website hosting is specific to each deployment and stays out of the
# repository: put your own `web-deploy` target in deploy/local/hosting.mk
# (gitignored). See docs/deploy.md.
-include deploy/local/hosting.mk

SIGNAL_URL    ?= wss://signal.go-link.org/ws

# Paths
WEB_DIR      = frontend
WEB_DIST     = $(WEB_DIR)/apps/web/dist
DEVICE_DIR   = backend-device
DEVICE_OUT   = $(DIST)/device
DOCKER_OUT   = $(DIST)/docker
HOST_ARCH    = $(shell uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')
HOST_OS      = $(shell uname -s | tr A-Z a-z)

# Output colors
GREEN  = \033[0;32m
YELLOW = \033[1;33m
RED    = \033[0;31m
NC     = \033[0m

.DEFAULT_GOAL := help

# ---------------------------------------------------------------------------
# Everything

all: web-build device
	@echo "$(GREEN)✓ go-link $(VERSION) built in $(DIST) and $(WEB_DIST)$(NC)"

info:
	@echo "$(GREEN)$(PROJECT_NAME) $(VERSION)$(NC)"
	@echo "Signaling:   $(SIGNAL_URL)"
	@echo "Host:        $(HOST_OS)/$(HOST_ARCH)"

# ---------------------------------------------------------------------------
# Website

# The Node version in frontend/.nvmrc: nvm switches to it (installing it
# once if needed) just for these commands; without nvm, the Node in PATH.
NODE_ENV_SETUP = if [ -s "$${NVM_DIR:-$$HOME/.nvm}/nvm.sh" ]; then \
	. "$${NVM_DIR:-$$HOME/.nvm}/nvm.sh" && { nvm use --silent || nvm install; } >/dev/null; fi; \
	echo "Node $$(node -v)"

web-build:
	@echo "$(YELLOW)Building the website for $(SIGNAL_URL)...$(NC)"
	rm -rf $(WEB_DIST)
	@cd $(WEB_DIR) && $(NODE_ENV_SETUP) && npm ci --no-audit --no-fund && \
		VITE_SIGNAL_URL=$(SIGNAL_URL) VITE_DEMO_DATA=false npm run build
	@find $(WEB_DIST) -name "*.map" -delete
	@echo "$(GREEN)✓ Website built in $(WEB_DIST)$(NC)"

ifndef HOSTING_TARGETS
# Without deploy/local/hosting.mk there is nowhere to upload to: the site is
# the static folder $(WEB_DIST), for any static host.
web-deploy: web-build
	@echo "$(YELLOW)The website is built in $(WEB_DIST). Upload it to your static host, or add a"
	@echo "web-deploy target to deploy/local/hosting.mk (see docs/deploy.md).$(NC)"

hosting-help:
	@echo "$(YELLOW)Hosting:$(NC) add deploy/local/hosting.mk (see docs/deploy.md)"
endif


# ---------------------------------------------------------------------------
# Device (cgo: libvpx, libopus and, with the window, OpenGL)

# End-to-end tests: a real Chromium against its own signaling server,
# headless device and website (e2e/). The first run downloads Chromium.
e2e:
	cd e2e && npm ci --no-audit --no-fund && npx playwright install chromium && npx playwright test

# A release of the device (like MacDub's): VERSION=0.1.0 make release
# builds every platform, packs them in dist/release/v<version>/ with
# SHA256SUMS, updates Casks/go-link.rb and creates the GitHub release with
# gh (a pre-release while the macOS app is not signed and notarized).
release:
	./scripts/release.sh

# macOS installer: the universal go-link.app in a drag-to-Applications disk
# image (dist/device/go-link-<version>-macos-universal.dmg), in the go-link
# style. With CODESIGN_IDENTITY="Developer ID Application: ..." the image
# is signed.
device-dmg: device-darwin-universal
	CODESIGN_IDENTITY="$(CODESIGN_IDENTITY)" $(DEVICE_DIR)/build/macos/make-dmg.sh $(DEVICE_OUT)/darwin-universal/go-link.app \
		$(DEVICE_OUT)/go-link-$(VERSION)-macos-universal.dmg

# The local web panel of headless devices: the website, built and copied
# into the device, which embeds it (backend-device/web). `make panel`
# refreshes it; the device builds make it when it is missing.
PANEL_DIST = $(DEVICE_DIR)/web/panel/dist

panel: web-build
	rm -rf $(PANEL_DIST) && mkdir -p $(PANEL_DIST) && cp -R $(WEB_DIST)/. $(PANEL_DIST)/
	@echo "$(GREEN)✓ Web panel copied into $(PANEL_DIST)$(NC)"

$(PANEL_DIST)/index.html:
	@$(MAKE) panel

device: $(if $(filter darwin,$(HOST_OS)),device-darwin-universal) \
	device-linux-amd64 device-linux-arm64 device-linux-amd64-headless device-linux-arm64-headless \
	device-windows-amd64 device-windows-arm64

# macOS ships as an app bundle (go-link.app): opened from the Finder it
# runs like any Mac app, without a Terminal window; from a terminal,
# go-link.app/Contents/MacOS/go-link-device takes the flags and
# subcommands. The release is one universal app (Intel + Apple silicon),
# made on either kind of Mac: clang builds both architectures, and
# build/macos/static-libs.sh builds libvpx and libopus from source for
# each one and for macOS $(MIN_MACOS), linked statically (Homebrew's copies
# only fit this Mac's CPU and macOS version). It is signed ad hoc
# (codesign -s -); to hand it to other people it needs a Developer ID
# signature and notarization. -Wl,-w hides the linker's notes about the
# assembler objects (no platform load command), which are harmless.
MIN_MACOS      = 12.0
MACOS_LIBS     = $(DIST)/.macos-libs
MACOS_CLANG    = $$(xcrun -f clang)
clang_arch     = $(if $(filter amd64,$(1)),x86_64,arm64)

# The device binary of one architecture: dist/device/darwin-<arch>/go-link-device.
$(DEVICE_OUT)/darwin-%/go-link-device: $(PANEL_DIST)/index.html FORCE
	@if [ "$(HOST_OS)" != "darwin" ]; then echo "$(RED)✗ macOS builds need a Mac$(NC)"; exit 1; fi
	@echo "$(YELLOW)Building the device for darwin/$* (macOS $(MIN_MACOS)+)...$(NC)"
	@$(DEVICE_DIR)/build/macos/static-libs.sh $* $(MACOS_LIBS)/$*
	@mkdir -p $(DEVICE_OUT)/darwin-$*
	cd $(DEVICE_DIR) && GOOS=darwin GOARCH=$* CGO_ENABLED=1 \
		CC="$(MACOS_CLANG) -arch $(call clang_arch,$*)" \
		MACOSX_DEPLOYMENT_TARGET=$(MIN_MACOS) SDKROOT="$$(xcrun --sdk macosx --show-sdk-path)" \
		PKG_CONFIG_LIBDIR=$(MACOS_LIBS)/$*/lib/pkgconfig \
		CGO_CFLAGS="-O2 -mmacosx-version-min=$(MIN_MACOS)" \
		CGO_LDFLAGS="-mmacosx-version-min=$(MIN_MACOS) -Wl,-w" \
		go build -trimpath -ldflags "-s -w -X main.version=$(VERSION)" \
		-o $(DEVICE_OUT)/darwin-$*/go-link-device ./cmd/device

# One architecture's app, for development: dist/device/darwin-<arch>/go-link.app.
device-darwin-%: $(DEVICE_OUT)/darwin-%/go-link-device
	@$(DEVICE_DIR)/build/macos/make-app.sh $(DEVICE_OUT)/darwin-$*/go-link-device \
		$(DEVICE_OUT)/darwin-$*/go-link.app $(VERSION) $(SHORT_VERSION) "$(CODESIGN_IDENTITY)"

# The release app: both architectures in one binary (lipo),
# dist/device/darwin-universal/go-link.app.
device-darwin-universal: $(DEVICE_OUT)/darwin-amd64/go-link-device $(DEVICE_OUT)/darwin-arm64/go-link-device
	@mkdir -p $(DEVICE_OUT)/darwin-universal
	lipo -create -output $(DEVICE_OUT)/darwin-universal/go-link-device $^
	@$(DEVICE_DIR)/build/macos/make-app.sh $(DEVICE_OUT)/darwin-universal/go-link-device \
		$(DEVICE_OUT)/darwin-universal/go-link.app $(VERSION) $(SHORT_VERSION) "$(CODESIGN_IDENTITY)"

FORCE:

# Linux builds in Docker (the other architecture through QEMU).
device-linux-%-headless: $(PANEL_DIST)/index.html
	@echo "$(YELLOW)Building the headless device for linux/$*...$(NC)"
	cd $(DEVICE_DIR) && docker buildx build --platform linux/$* --build-arg TAGS=headless --build-arg VERSION=$(VERSION) \
		-f build/linux.Dockerfile --output type=local,dest=$(DEVICE_OUT)/linux-$*-headless .
	@echo "$(GREEN)✓ $(DEVICE_OUT)/linux-$*-headless/go-link-device$(NC)"

device-linux-%: $(PANEL_DIST)/index.html
	@echo "$(YELLOW)Building the device for linux/$*...$(NC)"
	cd $(DEVICE_DIR) && docker buildx build --platform linux/$* --build-arg VERSION=$(VERSION) \
		-f build/linux.Dockerfile --output type=local,dest=$(DEVICE_OUT)/linux-$* .
	@echo "$(GREEN)✓ $(DEVICE_OUT)/linux-$*/go-link-device$(NC)"

# Windows cross-compiles in Docker with llvm-mingw and static libraries.
device-windows-amd64:
	@$(MAKE) device-windows MINGW_ARCH=x86_64 GO_ARCH=amd64

device-windows-arm64:
	@$(MAKE) device-windows MINGW_ARCH=aarch64 GO_ARCH=arm64

device-windows: $(PANEL_DIST)/index.html
	@echo "$(YELLOW)Building the device for windows/$(GO_ARCH)...$(NC)"
	cd $(DEVICE_DIR) && docker buildx build --build-arg ARCH=$(MINGW_ARCH) --build-arg GOARCH=$(GO_ARCH) \
		--build-arg VERSION=$(VERSION) -f build/windows.Dockerfile \
		--output type=local,dest=$(DEVICE_OUT)/windows-$(GO_ARCH) .
	@echo "$(GREEN)✓ $(DEVICE_OUT)/windows-$(GO_ARCH)/go-link-device.exe$(NC)"

# ---------------------------------------------------------------------------
# The licenses that travel with every binary and image.
LEGAL_DIR = $(DIST)/.legal
legal:
	@mkdir -p $(LEGAL_DIR) && cp LICENSE THIRD_PARTY_NOTICES.md $(LEGAL_DIR)/

# The device as a container (headless, web panel on 7373): loaded into the
# local Docker for this computer's CPU, and an OCI archive for amd64 and
# arm64 (Raspberry Pi). Not pushed to any registry.
device-docker: $(PANEL_DIST)/index.html legal
	@echo "$(YELLOW)Building the go-link-device image...$(NC)"
	cd $(DEVICE_DIR) && docker buildx build -f build/docker.Dockerfile --build-arg VERSION=$(VERSION) \
		--build-context legal=$(LEGAL_DIR) -t go-link-device:$(VERSION) -t go-link-device:latest --load .
	@echo "$(GREEN)✓ go-link-device:$(VERSION) (docker compose -f $(DEVICE_DIR)/docker-compose.yml up -d)$(NC)"

device-docker-oci: $(PANEL_DIST)/index.html legal
	mkdir -p $(DOCKER_OUT)
	cd $(DEVICE_DIR) && docker buildx build -f build/docker.Dockerfile --build-arg VERSION=$(VERSION) \
		--build-context legal=$(LEGAL_DIR) --platform linux/amd64,linux/arm64 -t go-link-device:$(VERSION) \
		--output type=oci,dest=$(DOCKER_OUT)/go-link-device-$(VERSION).oci.tar .
	@echo "$(GREEN)✓ $(DOCKER_OUT)/go-link-device-$(VERSION).oci.tar$(NC)"

# ---------------------------------------------------------------------------

clean:
	rm -rf $(DIST) $(WEB_DIST)
	@echo "$(GREEN)✓ Clean$(NC)"

help:
	@echo "$(GREEN)go-link $(VERSION)$(NC)"
	@echo ""
	@echo "$(YELLOW)Everything:$(NC)"
	@echo "  make all                     web + device (every platform)"
	@echo ""
	@echo "$(YELLOW)Website:$(NC)"
	@echo "  make web-build               build frontend/apps/web/dist"
	@echo "  make web-deploy              build and upload (deploy/local/hosting.mk)"
	@echo ""
	@echo "$(YELLOW)Device:$(NC)"
	@echo "  make device                  every platform into dist/device/"
	@echo "  make device-darwin-universal the macOS app for Intel + Apple silicon (macOS $(MIN_MACOS)+, on any Mac)"
	@echo "  make device-darwin-amd64     one architecture only (also -darwin-arm64), for development"
	@echo "  make device-linux-amd64      also: -linux-arm64, -linux-amd64-headless, -linux-arm64-headless (Docker)"
	@echo "  make device-windows-amd64    also: -windows-arm64 (Docker, llvm-mingw)"
	@echo "  make e2e                     end-to-end tests in a real browser (own signaling server, device, web)"
	@echo "  make device-dmg              the macOS app in a drag-to-Applications .dmg"
	@echo "  VERSION=0.1.0 make release   every platform packed in dist/release/ + GitHub release (gh)"
	@echo "  make panel                   rebuild the web panel that headless devices serve"
	@echo "  make device-docker           the device as a Docker image (headless, panel on :7373)"
	@echo "  make device-docker-oci       the image for amd64 + arm64, as an OCI archive"
	@echo ""
	@$(MAKE) --no-print-directory hosting-help
	@echo ""
	@echo "  make info | clean"
