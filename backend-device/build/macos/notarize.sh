#!/usr/bin/env bash
# Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
#
# Sends the signed disk image to Apple's notary service, staples the ticket
# and checks that Gatekeeper accepts it. The app inside must be signed with
# a Developer ID and the hardened runtime (make ... CODESIGN_IDENTITY=...).
#
# One time, before the first release:
#   1. Apple Developer Program membership.
#   2. The "Developer ID Application: Your Name (TEAMID)" certificate in the
#      login keychain.
#   3. An app-specific password stored for notarytool:
#        xcrun notarytool store-credentials "go-link-notary" \
#          --apple-id you@example.com --team-id TEAMID --password <app-specific-password>
#
# Usage: NOTARY_PROFILE=go-link-notary build/macos/notarize.sh go-link.dmg
set -euo pipefail

DMG="${1:?usage: notarize.sh DMG}"
: "${NOTARY_PROFILE:?Set NOTARY_PROFILE to the notarytool keychain profile name}"

echo "▶ Submitting $(basename "$DMG") to Apple's notary service (a few minutes)"
xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait

echo "▶ Stapling the ticket"
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG"
shasum -a 256 "$DMG" > "$DMG.sha256"
echo "✔ Notarized: $DMG"
