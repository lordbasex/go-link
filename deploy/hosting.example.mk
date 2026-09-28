# Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
#
# Example website hosting targets. Copy this file to deploy/local/hosting.mk
# (gitignored) and adapt it: the root Makefile includes that file when it
# exists. This example uploads the static site to a web server over SSH.
#
#   make web-deploy WEB_SERVER=user@host WEB_ROOT=/var/www/go-link

WEB_SERVER ?=
WEB_ROOT   ?=

HOSTING_TARGETS = 1

.PHONY: hosting-help

web-deploy: web-build
	@test -n "$(WEB_SERVER)" -a -n "$(WEB_ROOT)" || { echo "Set WEB_SERVER and WEB_ROOT"; exit 1; }
	rsync -az --delete $(WEB_DIST)/ $(WEB_SERVER):$(WEB_ROOT)/
	@echo "$(GREEN)✓ Website deployed to $(WEB_SERVER):$(WEB_ROOT)$(NC)"

hosting-help:
	@echo "$(YELLOW)Hosting (deploy/local/hosting.mk):$(NC)"
	@echo "  make web-deploy              build and upload to $(WEB_SERVER):$(WEB_ROOT)"
