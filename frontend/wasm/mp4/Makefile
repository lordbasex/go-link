# Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
# Builds the WebM -> MP4 container helper for the website (public/mp4).
GO ?= go
PUBLIC_DIR ?= ../../apps/web/public/mp4

.PHONY: build test clean

build:
	mkdir -p "$(PUBLIC_DIR)"
	GOOS=js GOARCH=wasm $(GO) build -trimpath -ldflags="-s -w" -o "$(PUBLIC_DIR)/mp4.wasm" .
	install -m 644 "$$($(GO) env GOROOT)/lib/wasm/wasm_exec.js" "$(PUBLIC_DIR)/wasm_exec.js"

test:
	$(GO) test -race ./...

clean:
	rm -f "$(PUBLIC_DIR)/mp4.wasm" "$(PUBLIC_DIR)/wasm_exec.js"
