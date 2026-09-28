# Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

# Homebrew cask for the go-link device on macOS. Install from this repo's tap:
#   brew tap lordbasex/go-link https://github.com/lordbasex/go-link
#   brew install --cask go-link
# scripts/release.sh rewrites version and the sha256 values on every release.
cask "go-link" do
  arch arm: "arm64", intel: "amd64"

  version "0.1.0"
  sha256 arm:   "0000000000000000000000000000000000000000000000000000000000000000",
         intel: "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/lordbasex/go-link/releases/download/v#{version}/go-link-v#{version}-macos-#{arch}.dmg"
  name "go-link"
  desc "Retro arcade that streams live from your computer to your friends' browsers"
  homepage "https://go-link.org"

  depends_on macos: ">= :big_sur"

  app "go-link.app"
  binary "#{appdir}/go-link.app/Contents/MacOS/go-link-device", target: "go-link-device"

  # Only the device's settings and log; ~/go-link also holds the host's own
  # ROMs and saved games, which are never removed.
  zap trash: [
    "~/Library/Application Support/go-link",
    "~/go-link/logs",
  ]
end
