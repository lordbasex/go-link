# Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
# go-link Player for iOS. `make help` lists the targets.

SIM ?= iPhone 17
DEST ?= platform=iOS Simulator,name=$(SIM)
# VERSION=0.1.5 sets the app's version (MARKETING_VERSION) and its build
# number (CURRENT_PROJECT_VERSION) with the Android app's version code rule:
# major*10000 + minor*100 + patch (0.1.5 -> 105). Without it, the latest
# release tag (v0.1.9 -> 0.1.9), else Config/Base.xcconfig.
VERSION ?= $(shell git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null | sed 's/^v//')
ifneq ($(VERSION),)
VERSION_CODE := $(shell echo '$(VERSION)' | awk -F. '{print $$1*10000 + $$2*100 + $$3}')
VERSION_FLAGS := MARKETING_VERSION=$(VERSION) CURRENT_PROJECT_VERSION=$(VERSION_CODE)
endif
XCB = xcodebuild -project GoLinkPlayer.xcodeproj -scheme GoLinkPlayer -clonedSourcePackagesDirPath build/spm -derivedDataPath build/dd $(VERSION_FLAGS)

.PHONY: help project test-core build-sim test-ui device-build clean

help: ## This list
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-13s %s\n", $$1, $$2}'

project: ## Generate GoLinkPlayer.xcodeproj from project.yml (needs xcodegen)
	xcodegen generate

test-core: ## GoLinkCore unit tests on the Mac
	cd GoLinkCore && swift test

build-sim: project ## Debug build for the iOS Simulator (no signing)
	$(XCB) -destination '$(DEST)' CODE_SIGNING_ALLOWED=NO build

test-ui: project ## UI tests in the Simulator (screenshots with TEST_RUNNER_GL_SHOTS=dir)
	$(XCB) -destination '$(DEST)' test

device-build: project ## Signed build for a connected iPhone (team in Config/Local.xcconfig)
	$(XCB) -destination 'generic/platform=iOS' -allowProvisioningUpdates build

clean: ## Remove build output and the generated project
	rm -rf build GoLinkPlayer.xcodeproj
