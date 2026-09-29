<!-- Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> -->
# go-link Player for iOS

The native iPhone and iPad app for joining a go-link game as a player: the iOS counterpart of [the Android app](../android/README.md). SwiftUI, iOS 17 or newer, bundle id `org.golink.player`. It speaks the same signalhub and WebRTC protocol as the website ([docs/mobile.md](../../docs/mobile.md), [docs/protocol.md](../../docs/protocol.md)). It only joins rooms; hosting stays on the device app.

It is not distributed yet (no App Store or TestFlight build): build it with Xcode and install it on your own iPhone as explained below.

## Layout

| Path | What it is |
|---|---|
| `GoLinkCore/` | A Swift package with the portable logic, a port of the Android `:core` module: the signalhub envelope and `SignalClient` (jittered backoff, FIFO requests, ICE servers from `hello` in memory only), invitation parsing, the signaling URL rules, the 12-byte `input` packet (byte for byte the web's `encodeInput`), the touch pad and controller mapping, `room_state` / `chat` / `typing` / `stream_stats`, the PIN gate, the return tokens (`RoomPasses`), the microphone choices (`AudioDevices`) and `RoomClient`, which runs one room visit. No UIKit and no WebRTC: `swift test` runs it on the Mac. |
| `GoLinkPlayer/` | The app: SwiftUI screens, `URLSessionWebSocketTask`, `IOSRtcPeer` (libwebrtc), its own audio device (`GoLinkAudioDevice`), the audio route, GameController controllers, the QR scanner (AVFoundation), UserDefaults. |
| `GoLinkPlayerUITests/` | XCUITest: screenshots of the main screens, the on-screen pad across rotations, and a live join when given an invitation. |
| `project.yml` | The [XcodeGen](https://github.com/yonaskolb/XcodeGen) spec. `GoLinkPlayer.xcodeproj` is generated and not committed. |
| `Config/` | Build settings; your Apple team goes in the gitignored `Local.xcconfig`. |

Dependencies are Swift packages only: [stasel/WebRTC](https://github.com/stasel/WebRTC) (a prebuilt libwebrtc, pinned in `project.yml`) and the local `GoLinkCore`. No CocoaPods.

## Build and run

Needs Xcode 26 (the project targets iOS 17) and XcodeGen (`brew install xcodegen`).

```bash
cd mobile/ios
make project        # writes GoLinkPlayer.xcodeproj
make test-core      # GoLinkCore unit tests (swift test)
make build-sim      # Simulator build, no signing (SIM="iPhone 17" by default)
open GoLinkPlayer.xcodeproj
```

In Xcode pick the **GoLinkPlayer** scheme and a Simulator, then Run. The Simulator has no camera: the scanner explains the permission and then offers to type the code.

UI tests (`make test-ui`, or with `xcodebuild test`). Values reach the test runner as `TEST_RUNNER_`-prefixed environment variables:

```bash
TEST_RUNNER_GL_LANG=es TEST_RUNNER_GL_SHOTS=/tmp/shots \
  xcodebuild test -project GoLinkPlayer.xcodeproj -scheme GoLinkPlayer \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:GoLinkPlayerUITests/PlayerUITests/testScreens

# A live join (a test pattern room invitation and its PIN from the website):
TEST_RUNNER_GL_INVITE=https://go-link.org/g/<invite> TEST_RUNNER_GL_PIN=<pin> \
  xcodebuild test ... -only-testing:GoLinkPlayerUITests/PlayerUITests/testLiveJoin
```

`testLiveJoin` types the PIN, accepts the terms, joins, checks that no system prompt appears for just listening, presses Coin, 1P, a button and the D-pad, sends a chat line and waits for it to come back, opens Players, You and Volume and voice, turns the microphone on (the app's explanation, then the system's prompt) and turns the phone sideways.

### Debug-only helpers

Debug builds (never release builds) accept:

- `-invite https://go-link.org/g/<invite>` as a launch argument: opens the PIN screen for that invitation, through the same strict parser as Universal Links (only the invitation is read). Universal Links need the published association file and a signed app, so this is how the Simulator opens an invitation: `xcrun simctl launch booted org.golink.player -invite https://go-link.org/g/<invite>`.
- `-signal ws://127.0.0.1:8090/ws`: a signaling server; debug builds also accept `ws://` to `localhost` and `127.0.0.1` in Settings, for a local signalhub.
- `-silentOutput`: computes the level of the sound it would play (for the probe) but plays silence, for automated runs on a desk.
- `-padLab`: opens a pad lab instead of the app: the room's console layouts with the on-screen pad and no room, listing every held-buttons value sent (`testPadAcrossRotations` rotates it and presses the pad).
- `-resetState`: forgets the accepted terms, the name, the custom server and the return tokens.
- `-aliasLab`: opens the name step alone (`testAliasValidation` uses it); `-padLab` also takes `-labStats` (the stats box with sample values) and `-labGhost` (the see-through pad with a sample controller chip).
- `-noIntro`: no startup intro (the UI tests pass it); `-introSlow <factor>` plays the intro that many times slower, to take screenshots of its frames.
- The **probe**: the room's events and libwebrtc's counters (inbound RTP per track, outbound microphone RTP, data channel messages, the candidate pair, the played level, whether the microphone is open) as one JSON line per second in the unified log. It never logs a PIN or a token:

  ```bash
  xcrun simctl spawn booted log stream --level info \
    --predicate 'subsystem == "org.golink.player" AND category == "e2e"'
  ```

## Startup intro

On a cold start (never when coming back from the background) the app plays a short intro over its first screen, like the website's loading screen: the go-link mark pops in, "go-link" rises, then "INSERT COIN" (pixel lettering drawn in code, `GoLinkCore.PixelText`) rises with a coin sound and blinks; about two seconds, and a tap skips it. With Reduce Motion it only fades. The static launch screen has the intro's first color. The coin (`GoLinkPlayer/Resources/coin.wav`) is an original sound made by `scripts/coin-sound.mjs` (MIT like the rest of the project); it plays with the **ambient** audio session, so the silent switch mutes it and other apps' audio keeps playing. Settings › **Startup sound** turns it off.

The room code field shows the code grouped while you type (`915 355 636`, `GoLinkCore.CodeInput`); it also takes a pasted invitation link, left as it is.

## Name, pause, stats and controllers

- After the PIN the app asks **What's your name?** (2 to 20 letters, digits and spaces, no symbols or emoji; `GoLinkCore.PlayerName`, the device's rules) and remembers it; the You tab and Settings use the same field.
- Only the host pauses: the dock's pause button **asks for a pause** (`pause_request`) and can cancel it; it explains when the host is away or the game cannot pause.
- The round **stats** button at the top left of the picture shows fps, resolution and codec, ping, direct or relay, loss and audio, read from libwebrtc's statistics once a second (`Rtc/LiveStatsReader.swift`, `GoLinkCore.LiveStatsMeter`).
- With a real controller connected, the gamepad button shows the on-screen pad **see-through and display only**, lighting what you press on the controller. **Test controller** on Home checks a controller offline, with the input latency (to the next `CADisplayLink` frame).

Details: [docs/mobile.md](../../docs/mobile.md#your-name).

## Version

Home and Settings show **go-link Player v*X.Y.Z* (build *N*)** (" · debug" in debug builds; a long press copies it). `CFBundleShortVersionString` and `CFBundleVersion` come from the build settings `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` (defaults 0.1.0 and 1 in `Config/Base.xcconfig`). A release passes the version: `make device-build VERSION=0.1.5` (also `build-sim` and `test-ui`) computes build 105 with the Android rule (major × 10000 + minor × 100 + patch), or give both to `xcodebuild` (`MARKETING_VERSION=0.1.5 CURRENT_PROJECT_VERSION=105`).

## Sound and the microphone

libwebrtc's built-in iOS audio device opens the microphone as soon as there is sound to play. The app plugs in its own (`GoLinkAudioDevice`, through `RTCAudioDevice`): while you only listen it plays through a plain output unit with the **playback** session (full quality, speaker, wired headphones or AirPods over A2DP); only while your microphone is on it switches to the voice processing unit (echo cancellation) with **play and record**, `voiceChat`, `defaultToSpeaker` and Bluetooth HFP + A2DP. So the microphone permission is asked when you first turn the microphone on, never just for joining, and sound never goes to the earpiece.

The **Volume and voice** sheet (drawer › You) has the game and voices volumes (0 to 300 %), the microphone (Automatic, the iPhone's, or a headset's, with `setPreferredInput`) and the output through the system's route picker (`AVRoutePickerView`: speaker, headphones, AirPods, AirPlay), plus a test chime.

## Sign and install on your iPhone

Nothing about signing is committed. Put your team in a local file:

```bash
cp Config/Local.xcconfig.example Config/Local.xcconfig
# edit it: DEVELOPMENT_TEAM = <your 10-character Team ID>
make project
```

Find the Team ID in Xcode › Settings › Accounts (select your Apple ID and the team), or on developer.apple.com › Membership.

- **Free Apple ID** (a "Personal Team"): works for your own devices. Apps expire after **7 days** (run from Xcode again to renew), and a personal team cannot use Associated Domains: uncomment `GOLINK_ENTITLEMENTS =` in `Local.xcconfig` to build without Universal Links (invitation links then open the website; scan the QR code or type the code in the app instead).
- **Paid developer account**: builds last a year and Universal Links work once the association file is published (below).

Then:

1. Connect the iPhone with a cable (or pair it over Wi-Fi in Xcode › Window › Devices and Simulators) and trust the computer.
2. On the iPhone turn on **Developer Mode**: Settings › Privacy & Security › Developer Mode, restart and confirm (it appears after the phone has been connected to Xcode once).
3. In Xcode pick your iPhone as the destination and Run (or `make device-build`). Xcode creates the provisioning profile (Automatic signing).
4. With a free Apple ID, the first launch is blocked until you trust the developer: Settings › General › VPN & Device Management › your Apple ID › Trust.

## Universal Links

The app claims `https://go-link.org/g/*` (`applinks:go-link.org` in `GoLinkPlayer/GoLinkPlayer.entitlements`, generated from `project.yml`). Only the invitation is read from the link, never a PIN or a signaling server.

The website publishes `frontend/apps/web/public/.well-known/apple-app-site-association` (JSON, no extension). Its `appIDs` holds a placeholder, `TEAMID00000.org.golink.player`: replace `TEAMID00000` with the Team ID that signs the app before deploying the website. The CDN must serve the file at `https://go-link.org/.well-known/apple-app-site-association` with `Content-Type: application/json`, without redirects. Apple's CDN caches it; while developing, `applinks:go-link.org?mode=developer` in the entitlements (with the device's Developer Mode on) makes the phone fetch it directly.

## What it does

Home (Scan QR code, Type the room code, Paste the invitation link), the QR scanner, the PIN screen with the terms (`Terms.version` equals `TERMS_VERSION` in `frontend/apps/web/src/legal.ts`, a test checks it), Settings (your name, your own signaling server: `wss://` only, tested for `hello` before saving, a notice and **Back to the official server** while it is active), and the room: the game in portrait (Game Boy) and landscape (Switch) console layouts, the on-screen gamepad from `room_state.controls` with Coin and 1P…NP, MFi, Xbox, PlayStation and Switch Pro controllers (GameController, mapped by position like the website's standard layout; each one takes the next local player), and the drawer with **Chat** (typing indicator, unread badge), **Players** (seats, move, swap, silence, watch or queue) and **You** (name, Volume and voice, How to play, Leave), plus the name step, pause requests, the stats overlay, the see-through pad and **Test controller** (above). The rules are the Android app's: every new join asks for the PIN; the return token is only used to get back in after a drop during the same visit.
