# Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

# Homebrew cask for the go-link device on macOS. Install from this repo's tap:
#   brew tap lordbasex/go-link https://github.com/lordbasex/go-link
#   brew trust --cask lordbasex/go-link/go-link   (newer Homebrew asks to trust third-party taps once)
#   brew install --cask go-link
# One universal app (Intel + Apple silicon). scripts/release.sh rewrites
# version and sha256 on every release.
cask "go-link" do
  version "0.1.5"
  sha256 "bc138a36cd132497ac67b8f5e81f6c67f9d61c0ea8a54191bd649c54f5cb5d54"

  url "https://github.com/lordbasex/go-link/releases/download/v#{version}/go-link-v#{version}-macos-universal.dmg"
  name "go-link"
  desc "Retro arcade that streams live from your computer to your friends' browsers"
  homepage "https://go-link.org"

  depends_on macos: :monterey

  app "go-link.app"
  binary "#{appdir}/go-link.app/Contents/MacOS/go-link-device", target: "go-link-device"

  # Only the device's settings and log; ~/go-link also holds the host's own
  # ROMs and saved games, which are never removed.
  zap trash: [
    "~/Library/Application Support/go-link",
    "~/go-link/logs",
  ]
end
